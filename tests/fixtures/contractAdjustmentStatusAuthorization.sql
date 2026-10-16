-- Synthetic in-memory fixture only. Never load into shared Staging/Production.
-- The runner loads the REAL repository division/job/read helpers and canonical
-- evaluator. Only template resolution/provenance and unrelated special authority
-- helpers are stubbed; this does not validate real template/override resolution.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
CREATE TABLE public.user_permissions(id serial PRIMARY KEY,clerk_user_id text,role text,
 business_role text,division text,is_active boolean,permission_overrides jsonb);
CREATE TABLE public.authorization_actions(action_id text PRIMARY KEY,is_active boolean DEFAULT true,
 special_authority text,base_authority text,minimum_business_role text,required_permission text,
 scope_rule text,action_key text,capability text);
CREATE TABLE public.jobs(id uuid PRIMARY KEY,division text,archived_at timestamptz,status text,job_type text);
CREATE TABLE public.job_sub_divisions(job_id uuid,division text);
CREATE TABLE public.job_user_assignments(job_id uuid,user_id text,assignment_role text,unassigned_at timestamptz);
CREATE TABLE public.change_orders(id uuid PRIMARY KEY,job_id uuid,status text,archived_at timestamptz,
 updated_at timestamptz,updated_by text,price_amount numeric,cost_amount numeric,internal_notes text,
 denied_at timestamptz,denied_by text,denial_reason text,decision_name text);
CREATE TABLE public.job_budget_lines(id uuid PRIMARY KEY,job_id uuid,is_protected_financial boolean);
CREATE TABLE public.change_order_allocations(change_order_id uuid,budget_line_id uuid);
CREATE TABLE public.change_order_financial_postings(change_order_id uuid);
CREATE TABLE public.change_logs(user_id text,user_name text,table_name text,record_id text,
 action text,before_data jsonb,after_data jsonb,note text);
CREATE TABLE public.test_delegated_calls(name text);
CREATE FUNCTION public.effective_permissions_for_user(text,text,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT $3$$;
CREATE FUNCTION public.current_permission_provenance(text) RETURNS jsonb LANGUAGE sql AS $$SELECT '{"source":"synthetic"}'::jsonb$$;
CREATE FUNCTION public.business_role_rank(text) RETURNS integer LANGUAGE sql AS $$
 SELECT CASE $1 WHEN 'Director' THEN 4 WHEN 'Manager' THEN 3 WHEN 'Supervisor' THEN 2 ELSE 1 END
$$;
CREATE FUNCTION public.current_user_is_primary() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION public.user_can_manage_developers(text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION public.can_review_material_stock(text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION public.change_order_actor() RETURNS text LANGUAGE sql AS $$SELECT auth.jwt()->>'sub'$$;
CREATE FUNCTION public.approve_job_change_order(uuid,text) RETURNS public.change_orders LANGUAGE plpgsql AS $$
DECLARE result public.change_orders;
BEGIN INSERT INTO public.test_delegated_calls VALUES ('approve'); SELECT * INTO result FROM public.change_orders WHERE id=$1; RETURN result; END
$$;
CREATE FUNCTION public.submit_job_change_order(uuid,text) RETURNS public.change_orders LANGUAGE plpgsql AS $$
DECLARE result public.change_orders;
BEGIN INSERT INTO public.test_delegated_calls VALUES ('submit'); SELECT * INTO result FROM public.change_orders WHERE id=$1; RETURN result; END
$$;
INSERT INTO public.user_permissions(clerk_user_id,role,business_role,division,is_active,permission_overrides) VALUES
 ('ordinary','User','User','Electrical',true,'{}'),
 ('financial','User','User','Electrical',true,'{"can_view_project_financials":true}'),
 ('manager','Manager','Manager','Electrical',true,'{"can_view_project_financials":true,"can_create_change_orders":true,"can_submit_change_orders":true,"can_approve_change_orders":true}'),
 ('explicit-deny','Manager','Manager','Electrical',true,'{"can_view_project_financials":true,"can_approve_change_orders":false}'),
 ('canonical-deny','Manager','User','Electrical',true,'{"can_view_project_financials":true,"can_approve_change_orders":true}'),
 ('protected-director','Manager','Director','Electrical',true,'{"can_view_project_financials":true,"can_view_protected_project_financials":true,"can_revise_change_orders":true,"can_approve_change_orders":true}');
INSERT INTO public.authorization_actions(action_id,special_authority,base_authority,minimum_business_role,required_permission,scope_rule) VALUES
 ('CFG-009','none','CAN_COMMIT','Manager','can_approve_change_orders','PROJECT_ACCESS'),
 ('CFG-007','none','CAN_SUBMIT','Supervisor','can_submit_change_orders','PROJECT_ACCESS'),
 ('V3-001','none','CAN_COMMIT','Manager','can_approve_change_orders','PROJECT_ACCESS'),
 ('AUD-021','none','CAN_EDIT','Supervisor','can_create_change_orders','PROJECT_ACCESS'),
 ('V3-005','none','CAN_COMMIT','Director',NULL,'PROJECT_ACCESS');
INSERT INTO public.jobs VALUES ('20000000-0000-0000-0000-000000000001','Electrical',NULL,'active','project');
INSERT INTO public.change_orders(id,job_id,status,updated_at,price_amount,cost_amount,internal_notes) VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','approved','2026-10-01',123,80,'synthetic private note');
INSERT INTO public.job_budget_lines VALUES ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',true);
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
