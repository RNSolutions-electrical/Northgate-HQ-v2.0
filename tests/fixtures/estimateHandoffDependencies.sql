-- Column definitions captured read-only from production on 2026-09-15.
-- Isolated dependency fixture; not a production migration.
DROP TABLE public.jobs,public.estimates,public.change_orders CASCADE;
DROP FUNCTION IF EXISTS public.svc_save_call(uuid,jsonb,timestamptz);
CREATE TABLE public.estimate_snapshots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),estimate_id uuid,pricing_total numeric,locked boolean DEFAULT true,approved_at timestamptz DEFAULT now());
CREATE TABLE public.change_order_lines (id uuid DEFAULT gen_random_uuid() NOT NULL, change_order_id uuid NOT NULL, job_budget_line_id uuid NOT NULL, division text NOT NULL, cost_code text, description text NOT NULL, vendor_name text, material_amount numeric DEFAULT 0 NOT NULL, labor_amount numeric DEFAULT 0 NOT NULL, equipment_amount numeric DEFAULT 0 NOT NULL, subcontract_amount numeric DEFAULT 0 NOT NULL, other_amount numeric DEFAULT 0 NOT NULL, markup_amount numeric DEFAULT 0 NOT NULL, line_total numeric GENERATED ALWAYS AS ((((((material_amount + labor_amount) + equipment_amount) + subcontract_amount) + other_amount) + markup_amount)) STORED, sort_order integer DEFAULT 0 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, created_by text, updated_by text);
CREATE TABLE public.change_orders (id uuid DEFAULT gen_random_uuid() NOT NULL, job_id uuid NOT NULL, division text NOT NULL, co_number text NOT NULL, title text NOT NULL, description text, price_amount numeric DEFAULT 0 NOT NULL, cost_amount numeric DEFAULT 0 NOT NULL, status text DEFAULT 'draft'::text NOT NULL, submitted_by text, approved_by text, approved_at timestamp with time zone, rejected_by text, rejected_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, archived_at timestamp with time zone, archived_by text, archive_reason text, project_division_id uuid, budget_line_id uuid, change_order_date date DEFAULT CURRENT_DATE NOT NULL, internal_notes text, created_by text, updated_by text, submitted_at timestamp with time zone, exported_at timestamp with time zone, exported_by text, verified_by text, verification_name text, verified_at timestamp with time zone, certification_state boolean DEFAULT false NOT NULL, signed_document_id uuid, revision_of_id uuid, revision_number integer DEFAULT 0 NOT NULL, voided_at timestamp with time zone, voided_by text, void_reason text, decision_name text, decision_certification_state boolean DEFAULT false NOT NULL, denied_by text, denied_at timestamp with time zone, denial_reason text);
CREATE TABLE public.estimate_workbenches (estimate_id uuid NOT NULL, revision integer DEFAULT 1 NOT NULL, document jsonb NOT NULL, updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL);
CREATE TABLE public.estimates (id uuid DEFAULT gen_random_uuid() NOT NULL, division text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, archived_at timestamp with time zone, archived_by text, archive_reason text, estimate_number text, title text NOT NULL, customer_name text, status text DEFAULT 'draft'::text NOT NULL, bid_due_at timestamp with time zone, submitted_at timestamp with time zone, estimator_id text, scope_summary text, notes text, created_by text, editor_version integer DEFAULT 1 NOT NULL, version_number integer DEFAULT 1 NOT NULL, revision_of uuid, revision_root_id uuid, source_snapshot_id uuid);
CREATE TABLE public.job_budget_lines (id uuid DEFAULT gen_random_uuid() NOT NULL, job_id uuid NOT NULL, division text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, archived_at timestamp with time zone, archived_by text, archive_reason text, category text NOT NULL, cost_code text, description text NOT NULL, budget_amount numeric DEFAULT 0 NOT NULL, note text, created_by text, sort_order numeric DEFAULT 0 NOT NULL, budget_change_amount numeric DEFAULT 0 NOT NULL, actual_cost_amount numeric DEFAULT 0 NOT NULL, committed_cost_amount numeric DEFAULT 0 NOT NULL, forecast_to_complete_amount numeric DEFAULT 0 NOT NULL, forecast_final_amount numeric DEFAULT 0 NOT NULL, project_division_id uuid, schedule_of_values_amount numeric DEFAULT 0 NOT NULL, is_protected_financial boolean DEFAULT false NOT NULL, current_budget_override_amount numeric);
CREATE TABLE public.jobs (id uuid DEFAULT gen_random_uuid() NOT NULL, division text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, archived_at timestamp with time zone, archived_by text, archive_reason text, job_number text, name text NOT NULL, status text DEFAULT 'active'::text NOT NULL, description text, notes text, address_line1 text, address_line2 text, city text, state text, postal_code text, job_type text DEFAULT 'job'::text NOT NULL, service_call_number text, created_by text);
CREATE TABLE public.svc_invoices (id uuid DEFAULT gen_random_uuid() NOT NULL, job_id uuid NOT NULL, invoice_number text, invoice_date date NOT NULL, revenue_excluding_tax numeric(14,2) NOT NULL, sales_tax numeric(14,2) DEFAULT 0 NOT NULL, status text DEFAULT 'posted'::text NOT NULL, note text, created_by text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, due_date date, invoice_group_id uuid, credit_card_fee numeric(14,2) DEFAULT 0 NOT NULL, sales_tax_percent numeric(5,2), credit_card_percent numeric(5,2), voided_at timestamp with time zone, voided_by text, void_reason text, is_no_charge_closeout boolean DEFAULT false NOT NULL);
CREATE TABLE public.svc_service_profiles (job_id uuid NOT NULL, classification text DEFAULT 'commercial'::text NOT NULL, billing_method text DEFAULT 'time_and_materials'::text NOT NULL, call_kind text DEFAULT 'original'::text NOT NULL, related_job_id uuid, completed_at timestamp with time zone, financially_closed_at timestamp with time zone, financially_closed_by text, created_by text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, business_name text, first_name text, last_name text, contact_name text, phone text, billing_email text, service_date date, lead_name text, work_stage text DEFAULT 'upcoming'::text NOT NULL, quote_amount numeric(14,2), changes_amount numeric(14,2) DEFAULT 0 NOT NULL);
CREATE TABLE public.svc_stage_definitions (key text NOT NULL, label text NOT NULL, background_color text NOT NULL, kind text NOT NULL, job_status text NOT NULL, strikethrough boolean DEFAULT false NOT NULL, sort_order integer DEFAULT 100 NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.change_order_lines ADD PRIMARY KEY (id);
ALTER TABLE public.change_orders ADD PRIMARY KEY (id);
ALTER TABLE public.estimate_workbenches ADD PRIMARY KEY (estimate_id);
ALTER TABLE public.estimates ADD PRIMARY KEY (id);
ALTER TABLE public.job_budget_lines ADD PRIMARY KEY (id);
ALTER TABLE public.jobs ADD PRIMARY KEY (id);
ALTER TABLE public.svc_invoices ADD PRIMARY KEY (id);
ALTER TABLE public.svc_service_profiles ADD PRIMARY KEY (job_id);
ALTER TABLE public.svc_stage_definitions ADD PRIMARY KEY (key);
CREATE OR REPLACE FUNCTION public.create_job(p_division text, p_job_number text, p_name text, p_status text, p_description text, p_notes text, p_address_line1 text, p_address_line2 text, p_city text, p_state text, p_postal_code text, p_job_type text, p_service_call_number text, p_created_by text)
 RETURNS jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE jwt_subject TEXT := auth.jwt() ->> 'sub'; caller public.user_permissions%ROWTYPE; caller_permissions JSONB; created_job public.jobs%ROWTYPE; BEGIN SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id=jwt_subject AND is_active=TRUE LIMIT 1; IF caller.id IS NULL THEN RAISE EXCEPTION 'An active user permission record is required' USING ERRCODE='42501'; END IF; caller_permissions:=public.effective_permissions_for_user(caller.role,caller.division,caller.permission_overrides); IF COALESCE((caller_permissions->>'can_create_jobs')::BOOLEAN,FALSE) IS NOT TRUE THEN RAISE EXCEPTION 'Job creation permission is required' USING ERRCODE='42501'; END IF; IF p_division NOT IN ('Construction','Electrical','Admin') OR NULLIF(BTRIM(p_name),'') IS NULL THEN RAISE EXCEPTION 'A valid division and job name are required'; END IF; INSERT INTO public.jobs(division,job_number,name,status,description,notes,address_line1,address_line2,city,state,postal_code,job_type,service_call_number,created_by) VALUES(p_division,NULLIF(BTRIM(p_job_number),''),BTRIM(p_name),COALESCE(p_status,'active'),NULLIF(BTRIM(p_description),''),NULLIF(BTRIM(p_notes),''),NULLIF(BTRIM(p_address_line1),''),NULLIF(BTRIM(p_address_line2),''),NULLIF(BTRIM(p_city),''),NULLIF(BTRIM(p_state),''),NULLIF(BTRIM(p_postal_code),''),COALESCE(p_job_type,'job'),NULLIF(BTRIM(p_service_call_number),''),COALESCE(NULLIF(BTRIM(p_created_by),''),caller.display_name,caller.email,jwt_subject)) RETURNING * INTO created_job; INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,note) VALUES(jwt_subject,COALESCE(caller.display_name,caller.email,jwt_subject),'jobs',created_job.id::TEXT,'create','Job '||COALESCE(created_job.job_number,created_job.name)||' created.'); RETURN created_job; END; $function$;

CREATE OR REPLACE FUNCTION public.current_user_can_access_job(p_job_id uuid, p_permission text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT EXISTS(SELECT 1 FROM public.jobs j WHERE j.id=p_job_id AND (public.current_user_can_read_division(j.division,p_permission) OR EXISTS(SELECT 1 FROM public.job_sub_divisions s WHERE s.job_id=j.id AND public.current_user_can_read_division(s.division,p_permission)))); $function$;

CREATE OR REPLACE FUNCTION public.current_user_can_edit_job(p_job_id uuid, p_required_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = p_job_id AND j.archived_at IS NULL AND (public.current_user_can_edit_division(j.division, p_required_permission) OR EXISTS (SELECT 1 FROM public.job_sub_divisions s WHERE s.job_id = j.id AND public.current_user_can_edit_division(s.division, p_required_permission)))); $function$;

CREATE OR REPLACE FUNCTION public.save_job_change_order_draft(p_change_order_id uuid, p_job_id uuid, p_division text, p_co_number text, p_title text, p_description text, p_change_order_date date, p_internal_notes text, p_lines jsonb, p_reason text)
 RETURNS change_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  actor_id TEXT := auth.jwt()->>'sub'; actor_name TEXT; target public.change_orders%ROWTYPE;
  saved public.change_orders%ROWTYPE; line JSONB; budget_line public.job_budget_lines%ROWTYPE;
  normalized_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason,'')),''); total NUMERIC := 0; before_lines JSONB := '[]'::JSONB;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE='28000'; END IF;
  IF p_job_id IS NULL OR NULLIF(BTRIM(p_co_number),'') IS NULL OR NULLIF(BTRIM(p_title),'') IS NULL THEN RAISE EXCEPTION 'project, number, and title are required'; END IF;
  IF jsonb_typeof(COALESCE(p_lines,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'lines must be an array'; END IF;
  actor_name := public.change_order_actor();
  IF p_change_order_id IS NULL THEN
    IF NOT public.current_user_can_edit_division(p_division,'can_create_change_orders') THEN RAISE EXCEPTION 'can_create_change_orders is required' USING ERRCODE='42501'; END IF;
    INSERT INTO public.change_orders(job_id,division,co_number,title,description,change_order_date,internal_notes,status,price_amount,cost_amount,created_by,updated_by)
    VALUES(p_job_id,p_division,BTRIM(p_co_number),BTRIM(p_title),NULLIF(BTRIM(COALESCE(p_description,'')),''),COALESCE(p_change_order_date,CURRENT_DATE),NULLIF(BTRIM(COALESCE(p_internal_notes,'')),''),'draft',0,0,actor_id,actor_id)
    RETURNING * INTO saved;
  ELSE
    SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
    IF target.id IS NULL OR target.job_id<>p_job_id OR target.division<>p_division THEN RAISE EXCEPTION 'change order not found'; END IF;
    IF target.status<>'draft' THEN RAISE EXCEPTION 'only draft change orders may be edited'; END IF;
    IF NOT public.current_user_can_edit_division(p_division,'can_create_change_orders') AND NOT (target.revision_of_id IS NOT NULL AND public.current_user_can_edit_division(p_division,'can_revise_change_orders')) THEN RAISE EXCEPTION 'can_create_change_orders or revision edit authority is required' USING ERRCODE='42501'; END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(col) ORDER BY col.sort_order,col.id),'[]'::JSONB) INTO before_lines FROM public.change_order_lines col WHERE col.change_order_id=target.id;
    UPDATE public.change_orders SET co_number=BTRIM(p_co_number),title=BTRIM(p_title),description=NULLIF(BTRIM(COALESCE(p_description,'')),''),change_order_date=COALESCE(p_change_order_date,CURRENT_DATE),internal_notes=NULLIF(BTRIM(COALESCE(p_internal_notes,'')),''),updated_by=actor_id,updated_at=NOW() WHERE id=target.id RETURNING * INTO saved;
    DELETE FROM public.change_order_lines WHERE change_order_id=target.id;
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines,'[]'::jsonb)) LOOP
    SELECT * INTO budget_line FROM public.job_budget_lines WHERE id=(line->>'job_budget_line_id')::UUID AND job_id=p_job_id AND archived_at IS NULL;
    IF budget_line.id IS NULL THEN RAISE EXCEPTION 'each line must reference an active project financial line'; END IF;
    IF NULLIF(BTRIM(line->>'description'),'') IS NULL THEN RAISE EXCEPTION 'each line requires a description'; END IF;
    -- Signed components are validated by finite-money table constraints.
    INSERT INTO public.change_order_lines(change_order_id,job_budget_line_id,division,cost_code,description,vendor_name,material_amount,labor_amount,equipment_amount,subcontract_amount,other_amount,markup_amount,sort_order,created_by,updated_by)
    VALUES(saved.id,budget_line.id,p_division,budget_line.cost_code,BTRIM(line->>'description'),NULLIF(BTRIM(COALESCE(line->>'vendor_name','')),''),COALESCE(NULLIF(line->>'material_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'labor_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'equipment_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'subcontract_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'other_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'markup_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'sort_order','')::INTEGER,0),actor_id,actor_id);
  END LOOP;
  SELECT COALESCE(SUM(line_total),0) INTO total FROM public.change_order_lines WHERE change_order_id=saved.id;
  UPDATE public.change_orders SET price_amount=total,cost_amount=total-COALESCE((SELECT SUM(markup_amount) FROM public.change_order_lines WHERE change_order_id=saved.id),0),updated_at=NOW() WHERE id=saved.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,actor_name,'change_orders',saved.id::TEXT,CASE WHEN target.id IS NULL THEN 'create' ELSE 'update' END,CASE WHEN target.id IS NULL THEN NULL ELSE to_jsonb(target)||jsonb_build_object('lines',before_lines) END,to_jsonb(saved)||jsonb_build_object('lines',p_lines),normalized_reason);
  RETURN saved;
END $function$;

CREATE OR REPLACE FUNCTION public.svc_save_call(p_job_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor text:=auth.jwt()->>'sub'; j public.jobs; previous jsonb; profile public.svc_service_profiles;
 number text:=nullif(btrim(p_data->>'service_call_number'),''); stage text:=p_data->>'work_stage';
 parent_id uuid:=nullif(p_data->>'related_job_id','')::uuid;
 status_value text; is_new boolean:=p_job_id IS NULL;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF number IS NULL OR nullif(btrim(p_data->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Service call number and name are required' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.svc_stage_definitions WHERE key=stage AND kind='work')
 THEN RAISE EXCEPTION 'Select a work stage' USING ERRCODE='22023'; END IF;
 SELECT job_status INTO status_value FROM public.svc_stage_definitions WHERE key=stage AND kind='work';
 -- Serializes edits to links as well as number allocation; prevents link cycles
 -- introduced by simultaneous cross-links.
 PERFORM pg_advisory_xact_lock(hashtextextended('northgate-service-call-save',0));
 IF p_job_id IS NOT NULL THEN
  SELECT * INTO j FROM public.jobs WHERE id=p_job_id AND job_type='service_call' AND archived_at IS NULL FOR UPDATE;
  IF j.id IS NULL OR public.current_user_can_edit_job(j.id,'can_manage_jobs') IS NOT TRUE
   THEN RAISE EXCEPTION 'Service call management permission is required' USING ERRCODE='42501'; END IF;
  IF j.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'This call changed. Refresh before saving.' USING ERRCODE='40001'; END IF;
  SELECT * INTO profile FROM public.svc_service_profiles WHERE job_id=j.id;
  IF EXISTS(SELECT 1 FROM public.svc_invoices WHERE job_id=j.id AND status='posted' AND is_no_charge_closeout) THEN
   IF stage IS DISTINCT FROM profile.work_stage THEN RAISE EXCEPTION 'Void the no-charge closeout before changing its work stage' USING ERRCODE='22023'; END IF;
   status_value:='complete';
  END IF;
  previous:=jsonb_build_object('job',to_jsonb(j),'profile',to_jsonb(profile)-'quote_amount'-'changes_amount');
 END IF;
 IF EXISTS(SELECT 1 FROM public.jobs x WHERE x.id IS DISTINCT FROM p_job_id
   AND (lower(btrim(x.service_call_number))=lower(number) OR lower(btrim(x.job_number))=lower(number)))
 THEN RAISE EXCEPTION 'That number is already assigned. Refresh the directory or choose another number.' USING ERRCODE='23505'; END IF;
 IF parent_id IS NOT NULL THEN
  IF parent_id=p_job_id OR NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=parent_id AND job_type='service_call' AND archived_at IS NULL)
   OR public.current_user_can_access_job(parent_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Choose an accessible related service call' USING ERRCODE='42501';
  END IF;
  IF EXISTS(WITH RECURSIVE chain(id) AS (
    SELECT parent_id UNION SELECT p.related_job_id FROM public.svc_service_profiles p JOIN chain c ON p.job_id=c.id WHERE p.related_job_id IS NOT NULL
   ) SELECT 1 FROM chain WHERE id=p_job_id) THEN RAISE EXCEPTION 'Related calls cannot form a circular link' USING ERRCODE='22023'; END IF;
 END IF;
 IF is_new THEN
  j:=public.create_job(p_data->>'division',number,p_data->>'name',status_value,
   p_data->>'description',p_data->>'notes',p_data->>'address_line1',NULL,p_data->>'city',p_data->>'state',p_data->>'postal_code',
   'service_call',number,actor);
 ELSE
  UPDATE public.jobs SET name=btrim(p_data->>'name'),job_number=number,service_call_number=number,status=status_value,
   description=p_data->>'description',notes=p_data->>'notes',address_line1=p_data->>'address_line1',
   city=p_data->>'city',state=p_data->>'state',postal_code=p_data->>'postal_code'
  WHERE id=j.id RETURNING * INTO j;
 END IF;
 INSERT INTO public.svc_service_profiles(job_id,billing_method,created_by,work_stage,business_name,first_name,last_name,contact_name,phone,billing_email,service_date,lead_name,related_job_id,completed_at)
 VALUES(j.id,p_data->>'billing_method',actor,stage,p_data->>'business_name',p_data->>'first_name',p_data->>'last_name',
  p_data->>'contact_name',p_data->>'phone',p_data->>'billing_email',nullif(p_data->>'service_date','')::date,p_data->>'lead_name',parent_id,
  CASE WHEN status_value='complete' THEN coalesce(profile.completed_at,now()) ELSE NULL END)
 ON CONFLICT(job_id) DO UPDATE SET billing_method=excluded.billing_method,work_stage=excluded.work_stage,
 business_name=excluded.business_name,first_name=excluded.first_name,last_name=excluded.last_name,contact_name=excluded.contact_name,
 phone=excluded.phone,billing_email=excluded.billing_email,service_date=excluded.service_date,lead_name=excluded.lead_name,
 related_job_id=excluded.related_job_id,completed_at=excluded.completed_at;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,coalesce((SELECT nullif(display_name,'') FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1),actor),'jobs',j.id::text,CASE WHEN is_new THEN 'create' ELSE 'update' END,previous,
  jsonb_build_object('job',to_jsonb(j),'profile',(SELECT to_jsonb(p)-'quote_amount'-'changes_amount' FROM public.svc_service_profiles p WHERE p.job_id=j.id)),
  'Service call details saved.');
 RETURN j.id;
END;
$function$;
