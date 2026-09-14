-- Service Calls extends canonical jobs and the existing svc_* ledger.
-- Filename aligned with the verified Supabase apply_migration version.
ALTER TABLE public.svc_service_profiles
 ADD COLUMN business_name text,
 ADD COLUMN first_name text,
 ADD COLUMN last_name text,
 ADD COLUMN contact_name text,
 ADD COLUMN phone text,
 ADD COLUMN billing_email text,
 ADD COLUMN service_date date,
 ADD COLUMN lead_name text,
 ADD COLUMN work_stage text NOT NULL DEFAULT 'upcoming'
   CHECK(work_stage IN ('pursuit','proposal_sent','upcoming','in_progress','complete','not_proceeding','void')),
 ADD COLUMN quote_amount numeric(14,2) CHECK(quote_amount >= 0),
 ADD COLUMN changes_amount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.svc_invoices ADD COLUMN due_date date;
ALTER TABLE public.svc_payments ADD COLUMN request_id uuid UNIQUE;
ALTER TABLE public.svc_service_profiles DROP CONSTRAINT svc_service_profiles_billing_method_check;
ALTER TABLE public.svc_service_profiles ADD CONSTRAINT svc_service_profiles_billing_method_check
 CHECK(billing_method IN ('time_and_materials','quoted','time_and_materials_plus_quote','warranty_no_charge'));
CREATE TABLE public.svc_invoice_groups (
 id uuid PRIMARY KEY,
 invoice_number text NOT NULL,
 invoice_date date NOT NULL,
 due_date date,
 total_revenue numeric(14,2) NOT NULL CHECK(total_revenue >= 0),
 total_tax numeric(14,2) NOT NULL CHECK(total_tax >= 0),
 request_payload jsonb NOT NULL,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.svc_invoices ADD COLUMN invoice_group_id uuid REFERENCES public.svc_invoice_groups(id);
CREATE INDEX svc_invoices_group_idx ON public.svc_invoices(invoice_group_id) WHERE invoice_group_id IS NOT NULL;
CREATE UNIQUE INDEX svc_invoice_groups_number_idx ON public.svc_invoice_groups(lower(btrim(invoice_number)));
CREATE UNIQUE INDEX svc_service_call_number_idx ON public.jobs(lower(btrim(service_call_number)))
 WHERE job_type='service_call' AND nullif(btrim(service_call_number),'') IS NOT NULL;
ALTER TABLE public.svc_invoice_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.svc_invoice_groups FROM PUBLIC,anon,authenticated;
CREATE POLICY svc_invoice_groups_rpc_only ON public.svc_invoice_groups FOR ALL TO authenticated USING(false) WITH CHECK(false);

-- Operational fields may be read without revealing commercial fields.
DROP POLICY svc_profiles_access ON public.svc_service_profiles;
CREATE POLICY svc_profiles_read ON public.svc_service_profiles FOR SELECT TO authenticated
 USING(public.current_user_can_access_job(job_id));
REVOKE ALL ON public.svc_service_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT(job_id,classification,billing_method,call_kind,related_job_id,completed_at,
 financially_closed_at,financially_closed_by,created_by,created_at,updated_at,
 business_name,first_name,last_name,contact_name,phone,billing_email,service_date,lead_name,work_stage)
 ON public.svc_service_profiles TO authenticated;

-- Main Service Calls uses existing job and project-financial permissions;
-- Scorecard navigation retains its independent add-on visibility control.
CREATE OR REPLACE FUNCTION public.current_user_can_access_service_job(p_job_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.jobs j WHERE j.id=p_job_id AND j.job_type='service_call'
  AND j.archived_at IS NULL AND public.current_user_can_access_job(j.id,'can_view_project_financials'));
$$;
REVOKE ALL ON FUNCTION public.current_user_can_access_service_job(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_service_job(uuid) TO authenticated;

-- Posted invoice/payment writes are controlled and audited by the RPC below.
REVOKE INSERT,UPDATE,DELETE ON public.svc_invoices,public.svc_payments FROM authenticated;
-- Existing visit/labor writes must not inherit financial read permission.
REVOKE INSERT,UPDATE,DELETE ON public.svc_visits,public.svc_labor_lines FROM authenticated;

-- Pure input validator, not a privileged data endpoint. Reject non-finite and
-- fractional-cent values before numeric typmods can silently round them.
CREATE FUNCTION public.svc_validate_money(p_value text,p_label text,p_optional boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE amount numeric;
BEGIN
 IF nullif(btrim(p_value),'') IS NULL THEN
  IF p_optional THEN RETURN; END IF;
  RAISE EXCEPTION '% is required',p_label USING ERRCODE='22023';
 END IF;
 IF btrim(p_value) !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$' THEN
  RAISE EXCEPTION '% must be a finite currency amount',p_label USING ERRCODE='22023'; END IF;
 amount:=p_value::numeric;
 IF amount<>round(amount,2) OR abs(amount)>999999999999.99 THEN
  RAISE EXCEPTION '% must be within range and rounded to cents',p_label USING ERRCODE='22023'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.svc_validate_money(text,text,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.svc_read_calls(p_archived boolean DEFAULT false,p_offset integer DEFAULT 0,p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(record ORDER BY record->>'service_call_number'),'[]'::jsonb) FROM (
 SELECT to_jsonb(j) || jsonb_build_object(
   'profile',coalesce(to_jsonb(p)-'quote_amount'-'changes_amount','{}'::jsonb),
   'can_manage',j.archived_at IS NULL AND public.current_user_can_edit_job(j.id,'can_manage_jobs'),
   'can_archive',j.archived_at IS NULL AND public.current_user_can_edit_job(j.id,'can_archive_records'),
   'can_bill',j.archived_at IS NULL AND public.current_user_can_edit_job(j.id,'can_approve_budget')
     AND public.current_user_can_access_job(j.id,'can_view_project_financials'),
   'financials',CASE WHEN public.current_user_can_access_job(j.id,'can_view_project_financials') THEN
     jsonb_build_object('quote_amount',p.quote_amount,'changes_amount',p.changes_amount,
       'invoices',coalesce((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('payments',
         coalesce((SELECT jsonb_agg(to_jsonb(pay)) FROM public.svc_payments pay WHERE pay.invoice_id=i.id),'[]'::jsonb)))
         FROM public.svc_invoices i WHERE i.job_id=j.id),'[]'::jsonb),
       'audit',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM (SELECT created_at,user_name,action,note,before_data,after_data
         FROM public.change_logs WHERE table_name='svc_service_profiles' AND record_id=j.id::text ORDER BY created_at DESC LIMIT 100) a),'[]'::jsonb),
       'costs',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC)
         FROM public.svc_cost_snapshots c WHERE c.job_id=j.id),'[]'::jsonb))
     ELSE NULL END
 ) AS record
 FROM public.jobs j LEFT JOIN public.svc_service_profiles p ON p.job_id=j.id
 WHERE j.job_type='service_call' AND (j.archived_at IS NOT NULL)=p_archived
  AND public.current_user_can_access_job(j.id)
 ORDER BY j.service_call_number,j.id
 LIMIT greatest(1,least(p_limit,500)) OFFSET greatest(p_offset,0)
 ) source;
$$;

CREATE FUNCTION public.svc_save_call(p_job_id uuid,p_data jsonb,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=auth.jwt()->>'sub'; j public.jobs; previous jsonb; profile public.svc_service_profiles;
 number text:=nullif(btrim(p_data->>'service_call_number'),''); stage text:=p_data->>'work_stage';
 parent_id uuid:=nullif(p_data->>'related_job_id','')::uuid;
 status_value text; is_new boolean:=p_job_id IS NULL;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF number IS NULL OR nullif(btrim(p_data->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Service call number and name are required' USING ERRCODE='22023'; END IF;
 IF stage IS NULL OR stage NOT IN ('pursuit','proposal_sent','upcoming','in_progress','complete','not_proceeding','void')
 THEN RAISE EXCEPTION 'Select a work stage' USING ERRCODE='22023'; END IF;
 status_value:=CASE WHEN stage='complete' THEN 'complete' WHEN stage IN ('not_proceeding','void') THEN 'cancelled' ELSE 'active' END;
 -- Serializes edits to links as well as number allocation; prevents link cycles
 -- introduced by simultaneous cross-links.
 PERFORM pg_advisory_xact_lock(hashtextextended('northgate-service-call-save',0));
 IF p_job_id IS NOT NULL THEN
  SELECT * INTO j FROM public.jobs WHERE id=p_job_id AND job_type='service_call' AND archived_at IS NULL FOR UPDATE;
  IF j.id IS NULL OR public.current_user_can_edit_job(j.id,'can_manage_jobs') IS NOT TRUE
   THEN RAISE EXCEPTION 'Service call management permission is required' USING ERRCODE='42501'; END IF;
  IF j.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'This call changed. Refresh before saving.' USING ERRCODE='40001'; END IF;
  SELECT * INTO profile FROM public.svc_service_profiles WHERE job_id=j.id;
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
  CASE WHEN stage='complete' THEN coalesce(profile.completed_at,now()) ELSE NULL END)
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
$$;

CREATE FUNCTION public.svc_save_commercial(p_job_id uuid,p_action text,p_data jsonb,p_expected_updated_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=auth.jwt()->>'sub'; j public.jobs; previous jsonb; saved jsonb;
 profile public.svc_service_profiles; snapshot_id uuid; invoice public.svc_invoices; payment_id uuid; existing_payment public.svc_payments;
BEGIN
 SELECT * INTO j FROM public.jobs WHERE id=p_job_id AND job_type='service_call' AND archived_at IS NULL FOR UPDATE;
 IF actor IS NULL OR j.id IS NULL OR public.current_user_can_edit_job(j.id,'can_approve_budget') IS NOT TRUE
   OR public.current_user_can_access_job(j.id,'can_view_project_financials') IS NOT TRUE
  THEN RAISE EXCEPTION 'Billing management permission is required' USING ERRCODE='42501'; END IF;
 IF p_action='payment' THEN
  IF nullif(p_data->>'request_id','') IS NULL THEN RAISE EXCEPTION 'A payment request identifier is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO existing_payment FROM public.svc_payments WHERE request_id=(p_data->>'request_id')::uuid;
  IF existing_payment.id IS NOT NULL THEN
   IF existing_payment.invoice_id IS DISTINCT FROM (p_data->>'invoice_id')::uuid
    OR existing_payment.amount IS DISTINCT FROM (p_data->>'amount')::numeric
    OR existing_payment.payment_date IS DISTINCT FROM (p_data->>'payment_date')::date
    OR existing_payment.reference IS DISTINCT FROM p_data->>'reference'
    OR existing_payment.note IS DISTINCT FROM p_data->>'note'
    OR NOT EXISTS(SELECT 1 FROM public.svc_invoices WHERE id=existing_payment.invoice_id AND job_id=j.id)
   THEN RAISE EXCEPTION 'Payment request was already used with different values' USING ERRCODE='22023'; END IF;
   RETURN j.id;
  END IF;
 END IF;
 IF j.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'This call changed. Refresh before saving.' USING ERRCODE='40001'; END IF;
 SELECT * INTO profile FROM public.svc_service_profiles WHERE job_id=j.id;
 IF profile.job_id IS NULL THEN RAISE EXCEPTION 'Save the service call details first' USING ERRCODE='22023'; END IF;
 IF p_action='quote' THEN
  PERFORM public.svc_validate_money(p_data->>'quote_amount','Estimate / quote',true);
  PERFORM public.svc_validate_money(p_data->>'changes_amount','Changes',true);
  previous:=jsonb_build_object('quote_amount',profile.quote_amount,'changes_amount',profile.changes_amount);
  UPDATE public.svc_service_profiles SET quote_amount=nullif(p_data->>'quote_amount','')::numeric,
    changes_amount=coalesce(nullif(p_data->>'changes_amount','')::numeric,0) WHERE job_id=j.id;
  saved:=jsonb_build_object('quote_amount',(SELECT quote_amount FROM public.svc_service_profiles WHERE job_id=j.id),
   'changes_amount',(SELECT changes_amount FROM public.svc_service_profiles WHERE job_id=j.id));
 ELSIF p_action='cost' THEN
  PERFORM public.svc_validate_money(p_data->>'labor_hard_cost','Labor cost');
  PERFORM public.svc_validate_money(p_data->>'material_hard_cost','Material cost');
  PERFORM public.svc_validate_money(p_data->>'other_hard_cost','Other cost');
  IF length(btrim(coalesce(p_data->>'source_note','')))<3 THEN RAISE EXCEPTION 'Describe the cost source' USING ERRCODE='22023'; END IF;
  previous:=(SELECT to_jsonb(c) FROM public.svc_cost_snapshots c WHERE job_id=j.id AND is_active);
  UPDATE public.svc_cost_snapshots SET is_active=false WHERE job_id=j.id AND is_active;
  INSERT INTO public.svc_cost_snapshots(job_id,source_type,labor_hard_cost,material_hard_cost,other_hard_cost,cost_through,
    source_note,reconciliation_status,is_active,activated_at,activated_by,created_by)
  VALUES(j.id,'manual',(p_data->>'labor_hard_cost')::numeric,(p_data->>'material_hard_cost')::numeric,(p_data->>'other_hard_cost')::numeric,
    (p_data->>'cost_through')::date,btrim(p_data->>'source_note'),p_data->>'reconciliation_status',true,now(),actor,actor)
  RETURNING id,to_jsonb(svc_cost_snapshots) INTO snapshot_id,saved;
 ELSIF p_action='payment' THEN
  PERFORM public.svc_validate_money(p_data->>'amount','Payment');
  SELECT * INTO invoice FROM public.svc_invoices WHERE id=(p_data->>'invoice_id')::uuid AND job_id=j.id AND status='posted' FOR UPDATE;
  IF invoice.id IS NULL THEN RAISE EXCEPTION 'Select a posted invoice for this call' USING ERRCODE='22023'; END IF;
  IF (p_data->>'amount')::numeric>invoice.revenue_excluding_tax+invoice.sales_tax-coalesce((SELECT sum(amount) FROM public.svc_payments WHERE invoice_id=invoice.id),0)
   THEN RAISE EXCEPTION 'Payment exceeds the outstanding balance for this call. Allocate only this call''s share.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.svc_payments(invoice_id,payment_date,amount,reference,note,created_by,request_id)
  VALUES(invoice.id,(p_data->>'payment_date')::date,(p_data->>'amount')::numeric,p_data->>'reference',p_data->>'note',actor,(p_data->>'request_id')::uuid)
  RETURNING id,to_jsonb(svc_payments) INTO payment_id,saved;
 ELSE RAISE EXCEPTION 'Unknown financial action' USING ERRCODE='22023';
 END IF;
 UPDATE public.jobs SET updated_at=now() WHERE id=j.id;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,coalesce((SELECT nullif(display_name,'') FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1),actor),'svc_service_profiles',j.id::text,'update',previous,saved,'Service call '||p_action||' recorded.');
 RETURN j.id;
END;
$$;

CREATE FUNCTION public.svc_post_invoice(p_request_id uuid,p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=auth.jwt()->>'sub'; group_row public.svc_invoice_groups; allocation jsonb; j public.jobs;
 amount numeric(14,2); total numeric(14,2):=(p_data->>'total_revenue')::numeric;
 tax numeric(14,2):=coalesce((p_data->>'sales_tax')::numeric,0); remaining_tax numeric(14,2);
 allocated numeric(14,2); share_tax numeric(14,2); n integer:=0; expected_count integer;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Sign in and provide an invoice request' USING ERRCODE='42501'; END IF;
 PERFORM public.svc_validate_money(p_data->>'total_revenue','Invoice total');
 PERFORM public.svc_validate_money(p_data->>'sales_tax','Sales tax');
 IF jsonb_typeof(p_data->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'allocations')=0
  THEN RAISE EXCEPTION 'Allocate the invoice to at least one call' USING ERRCODE='22023'; END IF;
 expected_count:=jsonb_array_length(p_data->'allocations');
 IF (SELECT count(DISTINCT value->>'job_id') FROM jsonb_array_elements(p_data->'allocations'))<>expected_count
  THEN RAISE EXCEPTION 'A call can appear only once in an invoice' USING ERRCODE='22023'; END IF;
 -- Stable job lock order prevents concurrent posting against stale reviewed values.
 FOR allocation IN SELECT value FROM jsonb_array_elements(p_data->'allocations') ORDER BY value->>'job_id' LOOP
  PERFORM public.svc_validate_money(allocation->>'amount','Invoice allocation');
  SELECT * INTO j FROM public.jobs WHERE id=(allocation->>'job_id')::uuid AND job_type='service_call' AND archived_at IS NULL FOR UPDATE;
  IF j.id IS NULL OR public.current_user_can_edit_job(j.id,'can_approve_budget') IS NOT TRUE
    OR public.current_user_can_access_job(j.id,'can_view_project_financials') IS NOT TRUE
   THEN RAISE EXCEPTION 'Billing permission is required for every allocated call' USING ERRCODE='42501'; END IF;
 END LOOP;
 SELECT * INTO group_row FROM public.svc_invoice_groups WHERE id=p_request_id;
 IF group_row.id IS NOT NULL THEN
  IF group_row.request_payload IS DISTINCT FROM p_data THEN RAISE EXCEPTION 'This request was already used with different invoice values' USING ERRCODE='22023'; END IF;
  RETURN group_row.id;
 END IF;
 SELECT sum((value->>'amount')::numeric) INTO allocated FROM jsonb_array_elements(p_data->'allocations');
 IF total IS NULL OR total<=0 OR tax<0 OR allocated IS DISTINCT FROM total THEN
  RAISE EXCEPTION 'Invoice allocations must equal the invoice total, to the cent' USING ERRCODE='22023';
 END IF;
 IF nullif(btrim(p_data->>'invoice_number'),'') IS NULL OR nullif(p_data->>'invoice_date','') IS NULL THEN
  RAISE EXCEPTION 'Invoice number and date are required' USING ERRCODE='22023'; END IF;
 IF nullif(p_data->>'due_date','')::date < (p_data->>'invoice_date')::date THEN
  RAISE EXCEPTION 'Due date cannot be before invoice date' USING ERRCODE='22023'; END IF;
 INSERT INTO public.svc_invoice_groups(id,invoice_number,invoice_date,due_date,total_revenue,total_tax,request_payload,created_by)
 VALUES(p_request_id,btrim(p_data->>'invoice_number'),(p_data->>'invoice_date')::date,nullif(p_data->>'due_date','')::date,total,tax,p_data,actor);
 remaining_tax:=tax;
 FOR allocation IN SELECT value FROM jsonb_array_elements(p_data->'allocations') ORDER BY value->>'job_id' LOOP
  SELECT * INTO j FROM public.jobs WHERE id=(allocation->>'job_id')::uuid;
  IF j.updated_at IS DISTINCT FROM (allocation->>'expected_updated_at')::timestamptz THEN
   RAISE EXCEPTION 'A selected call changed. Refresh and review the invoice allocations.' USING ERRCODE='40001'; END IF;
  IF j.status<>'complete' THEN RAISE EXCEPTION 'Complete the work before recording an invoice for %',j.service_call_number USING ERRCODE='22023'; END IF;
  amount:=(allocation->>'amount')::numeric;
  IF amount IS NULL OR amount<=0 OR amount<>(allocation->>'amount')::numeric THEN
   RAISE EXCEPTION 'Each allocation must be positive and rounded to cents' USING ERRCODE='22023'; END IF;
  n:=n+1;
  share_tax:=CASE WHEN n=expected_count THEN remaining_tax ELSE least(remaining_tax,round(tax*amount/total,2)) END;
  remaining_tax:=remaining_tax-share_tax;
  INSERT INTO public.svc_invoices(job_id,invoice_number,invoice_date,due_date,revenue_excluding_tax,sales_tax,status,note,created_by,invoice_group_id)
  VALUES(j.id,btrim(p_data->>'invoice_number'),(p_data->>'invoice_date')::date,nullif(p_data->>'due_date','')::date,
   amount,share_tax,'posted',p_data->>'note',actor,p_request_id);
  UPDATE public.jobs SET updated_at=now() WHERE id=j.id;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
  VALUES(actor,coalesce((SELECT nullif(display_name,'') FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1),actor),'svc_service_profiles',j.id::text,'update',jsonb_build_object('invoice_group_id',p_request_id,'invoice_number',p_data->>'invoice_number','revenue',amount,'tax',share_tax),
   'Invoice recorded with this service call''s allocated share.');
 END LOOP;
 RETURN p_request_id;
END;
$$;

CREATE FUNCTION public.svc_archive_call(p_job_id uuid,p_reason text,p_expected_updated_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.jobs; actor text:=auth.jwt()->>'sub';
BEGIN
 SELECT * INTO j FROM public.jobs WHERE id=p_job_id AND job_type='service_call' AND archived_at IS NULL FOR UPDATE;
 IF actor IS NULL OR j.id IS NULL OR public.current_user_can_edit_job(j.id,'can_archive_records') IS NOT TRUE
  OR public.current_user_can_edit_job(j.id,'can_manage_jobs') IS NOT TRUE
  THEN RAISE EXCEPTION 'Service call archive permission is required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'An archive reason is required' USING ERRCODE='22023'; END IF;
 IF j.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'This call changed. Refresh before archiving.' USING ERRCODE='40001'; END IF;
 UPDATE public.jobs SET archived_at=now(),archived_by=actor,archive_reason=btrim(p_reason) WHERE id=j.id;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,coalesce((SELECT nullif(display_name,'') FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1),actor),'jobs',j.id::text,'update',to_jsonb(j),(SELECT to_jsonb(x) FROM public.jobs x WHERE id=j.id),btrim(p_reason));
 RETURN j.id;
END;
$$;

-- Preserve legacy cost RPC behavior while requiring financial edit permission.
DO $guard$
DECLARE name text; definition text; needle text; replacement text;
BEGIN
 FOREACH name IN ARRAY ARRAY['svc_create_manual_cost_snapshot(uuid,numeric,numeric,numeric,date,text,text)','svc_activate_cost_snapshot(uuid,boolean)'] LOOP
  definition:=pg_get_functiondef(('public.'||name)::regprocedure);
  needle:=CASE WHEN name LIKE 'svc_create%' THEN 'public.current_user_can_access_service_job(p_job_id) IS NOT TRUE' ELSE 'public.current_user_can_access_service_job(target.job_id) IS NOT TRUE' END;
  replacement:=needle||CASE WHEN name LIKE 'svc_create%' THEN ' OR public.current_user_can_edit_job(p_job_id, ''can_approve_budget'') IS NOT TRUE' ELSE ' OR public.current_user_can_edit_job(target.job_id, ''can_approve_budget'') IS NOT TRUE' END;
  IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'Review existing service cost RPC before changing guards'; END IF;
  EXECUTE replace(definition,needle,replacement);
 END LOOP;
END;
$guard$;

REVOKE ALL ON FUNCTION public.svc_read_calls(boolean,integer,integer),public.svc_save_call(uuid,jsonb,timestamptz),
 public.svc_save_commercial(uuid,text,jsonb,timestamptz),public.svc_post_invoice(uuid,jsonb),public.svc_archive_call(uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.svc_read_calls(boolean,integer,integer),public.svc_save_call(uuid,jsonb,timestamptz),
 public.svc_save_commercial(uuid,text,jsonb,timestamptz),public.svc_post_invoice(uuid,jsonb),public.svc_archive_call(uuid,text,timestamptz) TO authenticated;

-- Sales tax is collectible but is not profit. Preserve the Scorecard view shape.
CREATE OR REPLACE VIEW public.svc_call_financials WITH (security_invoker = TRUE) AS
SELECT j.id AS job_id, j.job_number, j.service_call_number, j.name AS customer_name,
  CONCAT_WS(', ', NULLIF(j.city,''), NULLIF(j.state,'')) AS location,
  j.description AS scope, j.status AS job_status, j.created_at,
  profile.classification, profile.billing_method, profile.call_kind, profile.completed_at, profile.financially_closed_at,
  COALESCE(labor.billable_labor,0)::NUMERIC(14,2) AS billable_labor,
  COALESCE(invoice.invoiced_revenue,0)::NUMERIC(14,2) AS invoiced_revenue,
  COALESCE(payment.collected,0)::NUMERIC(14,2) AS collected,
  COALESCE(cost.labor_hard_cost,0)::NUMERIC(14,2) AS labor_hard_cost,
  COALESCE(cost.material_hard_cost,0)::NUMERIC(14,2) AS material_hard_cost,
  COALESCE(cost.other_hard_cost,0)::NUMERIC(14,2) AS other_hard_cost,
  COALESCE(cost.total_hard_cost,0)::NUMERIC(14,2) AS total_hard_cost,
  (COALESCE(invoice.invoiced_revenue,0)-COALESCE(cost.total_hard_cost,0))::NUMERIC(14,2) AS gross_profit,
  CASE WHEN COALESCE(invoice.invoiced_revenue,0)=0 THEN NULL ELSE
    ROUND(((COALESCE(invoice.invoiced_revenue,0)-COALESCE(cost.total_hard_cost,0))/invoice.invoiced_revenue)*100,2) END AS gross_margin,
  (COALESCE(invoice.invoiced_revenue,0)+COALESCE(invoice.sales_tax,0)-COALESCE(payment.collected,0))::NUMERIC(14,2) AS outstanding,
  cost.cost_through, cost.reconciliation_status
FROM public.jobs j
LEFT JOIN public.svc_service_profiles profile ON profile.job_id=j.id
LEFT JOIN LATERAL (SELECT SUM(billable_amount) billable_labor FROM public.svc_labor_lines WHERE job_id=j.id) labor ON TRUE
LEFT JOIN LATERAL (SELECT SUM(revenue_excluding_tax) invoiced_revenue, SUM(sales_tax) sales_tax FROM public.svc_invoices WHERE job_id=j.id AND status='posted') invoice ON TRUE
LEFT JOIN LATERAL (SELECT SUM(p.amount) collected FROM public.svc_payments p JOIN public.svc_invoices i ON i.id=p.invoice_id WHERE i.job_id=j.id AND i.status='posted') payment ON TRUE
LEFT JOIN LATERAL (SELECT * FROM public.svc_cost_snapshots WHERE job_id=j.id AND is_active=TRUE LIMIT 1) cost ON TRUE
WHERE j.job_type='service_call' AND j.archived_at IS NULL AND public.current_user_can_access_job(j.id,'can_view_project_financials');
