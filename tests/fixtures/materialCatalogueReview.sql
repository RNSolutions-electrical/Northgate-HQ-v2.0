-- Isolated contract fixture; no live database or real user identities.
CREATE SCHEMA auth; CREATE SCHEMA extensions;
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',nullif(current_setting('test.actor',true),''))$$;
CREATE TABLE public.user_permissions(id uuid DEFAULT gen_random_uuid(),clerk_user_id text PRIMARY KEY,display_name text,email text,role text,business_role text,division text,is_active boolean DEFAULT true,permission_overrides jsonb DEFAULT '{}');
CREATE TABLE public.user_permission_overrides(id uuid DEFAULT gen_random_uuid(),user_id text,permission_flag text CONSTRAINT user_permission_overrides_permission_flag_check CHECK(permission_flag IN ('can_edit_catalog')),granted boolean,is_active boolean DEFAULT true);
CREATE TABLE public.change_logs(id uuid DEFAULT gen_random_uuid(),user_id text,user_name text,table_name text,record_id text,action text,before_data jsonb,after_data jsonb,note text,created_at timestamptz DEFAULT now());
CREATE TABLE public.authorization_actions(action_id text PRIMARY KEY,action_key text,module text,description text,minimum_business_role text,required_permission text,capability text,scope_rule text,specification_status text,is_active boolean DEFAULT true);
INSERT INTO public.authorization_actions(action_id) VALUES('V3-006'),('V3-007');
CREATE FUNCTION public.default_permissions_for_role(text) RETURNS jsonb LANGUAGE sql AS $$SELECT '{"can_edit_catalog":false}'::jsonb$$;
CREATE FUNCTION public.effective_permissions_for_user(text,text,jsonb) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce((SELECT permission_overrides FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub'),'{}')$$;
CREATE FUNCTION public.current_user_has_developer_access() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active AND permission_overrides->>'can_access_developer'='true')$$;
CREATE FUNCTION public.current_user_can_edit_division(text,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active AND division=$1 AND permission_overrides->>$2='true')$$;
CREATE FUNCTION public.current_user_can_read_catalog(text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active AND division=$1)$$;
CREATE FUNCTION public.change_order_actor() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'sub'$$;
CREATE FUNCTION public.current_scoped_authorization_decision(p_action_id text,p_context jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
BEGIN
 RETURN jsonb_build_object('allowed',EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active));
END $$;
CREATE TABLE public.items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),material_code text,name text,division text,unit_of_measure text,price_per_unit numeric DEFAULT 0,price_confirmed boolean DEFAULT false,labor_rate_hrs numeric,labor_value_source text DEFAULT 'unverified',catalogue_draft boolean DEFAULT false,is_active boolean DEFAULT true,is_archived boolean DEFAULT false,updated_at timestamptz DEFAULT clock_timestamp(),created_at timestamptz DEFAULT now(),default_cost_code_id uuid);
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.estimates(id uuid PRIMARY KEY,division text,status text,archived_at timestamptz);
CREATE TABLE public.storage_units(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),unit_code text,division text,archived_at timestamptz);
CREATE TABLE public.shelves(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),unit_id uuid REFERENCES storage_units,shelf_code text,archived_at timestamptz);
CREATE TABLE public.bays(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),shelf_id uuid REFERENCES shelves,bay_code text,archived_at timestamptz);
CREATE TABLE public.bins(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bay_id uuid REFERENCES bays,bin_code text,archived_at timestamptz);
CREATE TABLE public.bin_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bin_id uuid REFERENCES bins,item_id uuid REFERENCES items,min_quantity numeric,archived_at timestamptz,UNIQUE(bin_id,item_id));
CREATE TABLE public.inventory_balances(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bin_item_id uuid UNIQUE REFERENCES bin_items,quantity numeric,last_rebuilt timestamptz DEFAULT now());
CREATE TABLE public.inventory_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transaction_type text,user_id text,performed_by_name text,source_vehicle_id uuid,notes text);
CREATE TABLE public.transaction_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transaction_id uuid REFERENCES inventory_transactions,bin_item_id uuid REFERENCES bin_items,item_id uuid REFERENCES items,quantity numeric,target_quantity numeric,unit_cost_at_time numeric,transaction_type text,destination_type text,destination_id uuid,cost_code_id uuid,status text,note text,occurred_at timestamptz,ledger_sequence bigint GENERATED ALWAYS AS IDENTITY);
CREATE TABLE public.assembly_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_id uuid,unit_cost_snapshot numeric);
INSERT INTO public.user_permissions(clerk_user_id,display_name,role,business_role,division,permission_overrides) VALUES
 ('editor','Editor','User','User','Electrical','{"can_edit_catalog":true}'),
 ('reviewer','Reviewer','User','User','Electrical','{"can_inventory_manager":true}'),
 ('administrator','Administrator','User','User','Electrical','{"can_inventory_administrator":true}'),
 ('other','Other Department','User','User','Construction','{"can_inventory_administrator":true}'),
 ('developer','Developer','User','User','Construction','{"can_access_developer":true}'),
 ('ordinary','Ordinary Manager','Manager','Manager','Electrical','{"can_manage_inventory":true}');
INSERT INTO storage_units(id,unit_code,division) VALUES('10000000-0000-0000-0000-000000000001','E','Electrical'),('10000000-0000-0000-0000-000000000002','C','Construction');
INSERT INTO shelves(id,unit_id,shelf_code) VALUES('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','S1'),('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','S2');
INSERT INTO bays(id,shelf_id,bay_code) VALUES('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','B1'),('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','B2');
INSERT INTO bins(id,bay_id,bin_code) VALUES('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','N1'),('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','N2');
