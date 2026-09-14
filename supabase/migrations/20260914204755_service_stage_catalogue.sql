-- One shared stage catalogue. Existing work_stage values are preserved.
CREATE TABLE public.svc_stage_definitions (
 key text PRIMARY KEY CHECK(key ~ '^[a-z][a-z0-9_]{0,63}$'),
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 80),
 background_color text NOT NULL CHECK(background_color ~ '^#[0-9A-Fa-f]{6}$'),
 kind text NOT NULL CHECK(kind IN ('work','derived')),
 job_status text NOT NULL CHECK(job_status IN ('active','complete','cancelled')),
 strikethrough boolean NOT NULL DEFAULT false,
 sort_order integer NOT NULL DEFAULT 100,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX svc_stage_label_unique ON public.svc_stage_definitions(lower(btrim(label)));
INSERT INTO public.svc_stage_definitions(key,label,background_color,kind,job_status,strikethrough,sort_order) VALUES
('pursuit','Pursuit','#FFF9C4','work','active',false,0),
('proposal_sent','Proposal Sent','#FFEB3B','work','active',false,1),
('upcoming','Upcoming','#FFFFFF','work','active',false,2),
('in_progress','In progress','#FFFFFF','work','active',false,3),
('complete','Complete / ready to invoice','#FFE0B2','work','complete',false,4),
('not_proceeding','Not Proceeding','#E0E0E0','work','cancelled',true,5),
('void','Void','#000000','work','cancelled',true,6),
('warranty','Warranty Work','#D6ECFF','work','active',false,7),
('pro_bono','Pro-Bono / Donation','#78B4E8','work','active',false,8),
('invoice_sent','Invoice Sent','#D9EED5','derived','active',false,9),
('payment_received','Payment Received','#65E572','derived','active',false,10),
('archived','Archived','#FADADD','derived','active',false,11);
ALTER TABLE public.svc_stage_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY svc_stages_rpc_only ON public.svc_stage_definitions FOR ALL TO authenticated USING(false) WITH CHECK(false);
REVOKE ALL ON public.svc_stage_definitions FROM PUBLIC,anon,authenticated;
ALTER TABLE public.svc_service_profiles DROP CONSTRAINT svc_service_profiles_work_stage_check;
ALTER TABLE public.svc_service_profiles ADD CONSTRAINT svc_service_profiles_stage_fkey FOREIGN KEY(work_stage) REFERENCES public.svc_stage_definitions(key);
CREATE INDEX svc_service_profiles_work_stage_idx ON public.svc_service_profiles(work_stage);
ALTER TABLE public.svc_invoices ADD COLUMN is_no_charge_closeout boolean NOT NULL DEFAULT false;
ALTER TABLE public.svc_invoices ADD CONSTRAINT svc_invoice_no_charge_check CHECK(NOT is_no_charge_closeout OR (revenue_excluding_tax=0 AND sales_tax=0 AND credit_card_fee=0));

CREATE OR REPLACE FUNCTION public.svc_read_stages() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active) THEN
  RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY sort_order,label),'[]'::jsonb) FROM public.svc_stage_definitions s);
END; $f$;
REVOKE ALL ON FUNCTION public.svc_read_stages() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.svc_read_stages() TO authenticated;

CREATE OR REPLACE FUNCTION public.svc_save_stage(p_key text,p_label text,p_color text,p_reason text,p_expected_updated_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE actor text:=auth.jwt()->>'sub'; previous public.svc_stage_definitions; saved public.svc_stage_definitions; stage_key text:=p_key;
BEGIN
 IF actor IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN
  RAISE EXCEPTION 'Developer access required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_label,''))) NOT BETWEEN 1 AND 80 OR coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$'
  OR length(btrim(coalesce(p_reason,'')))<3 THEN
  RAISE EXCEPTION 'Enter a stage name, valid highlight color and audit reason (at least 3 characters)' USING ERRCODE='22023'; END IF;
 IF stage_key IS NULL THEN
  stage_key:='custom_'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.svc_stage_definitions(key,label,background_color,kind,job_status)
   VALUES(stage_key,btrim(p_label),upper(p_color),'work','active') RETURNING * INTO saved;
 ELSE
  SELECT * INTO previous FROM public.svc_stage_definitions WHERE key=stage_key FOR UPDATE;
  IF previous.key IS NULL THEN RAISE EXCEPTION 'Stage not found' USING ERRCODE='22023'; END IF;
  IF previous.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Stage changed. Refresh before saving.' USING ERRCODE='40001'; END IF;
  UPDATE public.svc_stage_definitions SET label=btrim(p_label),background_color=upper(p_color),updated_at=clock_timestamp()
   WHERE key=stage_key RETURNING * INTO saved;
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,coalesce((SELECT nullif(display_name,'') FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1),actor),
 'svc_stage_definitions',stage_key,CASE WHEN p_key IS NULL THEN 'create' ELSE 'update' END,to_jsonb(previous),to_jsonb(saved),btrim(p_reason));
 RETURN stage_key;
END; $f$;
REVOKE ALL ON FUNCTION public.svc_save_stage(text,text,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.svc_save_stage(text,text,text,text,timestamptz) TO authenticated;
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
$function$
;
CREATE OR REPLACE FUNCTION public.svc_post_invoice(p_request_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor text:=auth.jwt()->>'sub'; group_row public.svc_invoice_groups; allocation jsonb; j public.jobs;
 amount numeric(14,2); total numeric(14,2):=(p_data->>'total_revenue')::numeric;
 tax numeric(14,2):=coalesce((p_data->>'sales_tax')::numeric,0); remaining_tax numeric(14,2);
 allocated numeric(14,2); share_tax numeric(14,2); n integer:=0; expected_count integer;
 fee numeric(14,2):=0; remaining_fee numeric(14,2); share_fee numeric(14,2);
 tax_rate numeric; fee_rate numeric;
BEGIN
 IF actor IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Sign in and provide an invoice request' USING ERRCODE='42501'; END IF;
 PERFORM public.svc_validate_money(p_data->>'total_revenue','Invoice total');
 PERFORM public.svc_validate_money(p_data->>'sales_tax','Sales tax');
 -- Old clients retain amount-based tax with no fee; new clients must supply both rates.
 IF p_data ? 'sales_tax_percent' OR p_data ? 'credit_card_percent' OR p_data ? 'credit_card_fee' THEN
  IF coalesce(p_data->>'sales_tax_percent','') !~ '^[0-9]+([.][0-9]{1,2})?$'
   OR coalesce(p_data->>'credit_card_percent','') !~ '^[0-9]+([.][0-9]{1,2})?$'
   THEN RAISE EXCEPTION 'Enter tax and card percentages from 0 to 100 with at most two decimal places' USING ERRCODE='22023'; END IF;
  tax_rate:=(p_data->>'sales_tax_percent')::numeric;
  fee_rate:=(p_data->>'credit_card_percent')::numeric;
  IF tax_rate>100 OR fee_rate>100 THEN RAISE EXCEPTION 'Percentages must be between 0 and 100' USING ERRCODE='22023'; END IF;
  PERFORM public.svc_validate_money(p_data->>'credit_card_fee','Credit card fee');
  fee:=(p_data->>'credit_card_fee')::numeric;
  IF tax IS DISTINCT FROM round(total*tax_rate/100,2) OR fee IS DISTINCT FROM round((total+tax)*fee_rate/100,2)
   THEN RAISE EXCEPTION 'Invoice charges changed. Review subtotal, tax and credit card fee.' USING ERRCODE='22023'; END IF;
 END IF;
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
 IF total IS NULL OR total<0 OR tax<0 OR allocated IS DISTINCT FROM total THEN
  RAISE EXCEPTION 'Invoice allocations must equal the invoice total, to the cent' USING ERRCODE='22023';
 END IF;
 IF total=0 AND (expected_count<>1 OR tax<>0 OR fee<>0 OR (p_data->>'certify_complete') IS DISTINCT FROM 'true') THEN
  RAISE EXCEPTION 'A zero-dollar closeout must be for one Warranty or Pro-Bono call, with no charges and completion confirmed' USING ERRCODE='22023';
 END IF;
 IF nullif(btrim(p_data->>'invoice_number'),'') IS NULL OR nullif(p_data->>'invoice_date','') IS NULL THEN
  RAISE EXCEPTION 'Invoice number and date are required' USING ERRCODE='22023'; END IF;
 IF nullif(p_data->>'due_date','')::date < (p_data->>'invoice_date')::date THEN
  RAISE EXCEPTION 'Due date cannot be before invoice date' USING ERRCODE='22023'; END IF;
 INSERT INTO public.svc_invoice_groups(id,invoice_number,invoice_date,due_date,total_revenue,total_tax,request_payload,created_by,credit_card_fee,sales_tax_percent,credit_card_percent)
 VALUES(p_request_id,btrim(p_data->>'invoice_number'),(p_data->>'invoice_date')::date,nullif(p_data->>'due_date','')::date,total,tax,p_data,actor,fee,tax_rate,fee_rate);
 remaining_tax:=tax; remaining_fee:=fee;
 FOR allocation IN SELECT value FROM jsonb_array_elements(p_data->'allocations') ORDER BY value->>'job_id' LOOP
  SELECT * INTO j FROM public.jobs WHERE id=(allocation->>'job_id')::uuid;
  IF j.updated_at IS DISTINCT FROM (allocation->>'expected_updated_at')::timestamptz THEN
   RAISE EXCEPTION 'A selected call changed. Refresh and review the invoice allocations.' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM public.svc_invoices WHERE job_id=j.id AND status='posted' AND is_no_charge_closeout) THEN
   RAISE EXCEPTION 'Void the no-charge closeout before recording another invoice' USING ERRCODE='22023';
  END IF;
  IF total=0 THEN
   IF NOT EXISTS(SELECT 1 FROM public.svc_service_profiles WHERE job_id=j.id AND work_stage IN ('warranty','pro_bono'))
    OR EXISTS(SELECT 1 FROM public.svc_invoices WHERE job_id=j.id AND status='posted') THEN
    RAISE EXCEPTION 'Zero-dollar closeout requires Warranty Work or Pro-Bono / Donation with no existing posted invoices' USING ERRCODE='22023';
   END IF;
  END IF;
  IF total>0 AND j.status<>'complete' THEN RAISE EXCEPTION 'Complete the work before recording an invoice for %',j.service_call_number USING ERRCODE='22023'; END IF;
  amount:=(allocation->>'amount')::numeric;
  IF amount IS NULL OR amount<0 OR (total>0 AND amount=0) OR amount<>(allocation->>'amount')::numeric THEN
   RAISE EXCEPTION 'Each allocation must be positive and rounded to cents' USING ERRCODE='22023'; END IF;
  n:=n+1;
  share_tax:=CASE WHEN n=expected_count THEN remaining_tax ELSE least(remaining_tax,round(tax*amount/total,2)) END;
  remaining_tax:=remaining_tax-share_tax;
  share_fee:=CASE WHEN n=expected_count THEN remaining_fee ELSE least(remaining_fee,round(fee*amount/total,2)) END;
  remaining_fee:=remaining_fee-share_fee;
  INSERT INTO public.svc_invoices(job_id,invoice_number,invoice_date,due_date,revenue_excluding_tax,sales_tax,status,note,created_by,invoice_group_id,credit_card_fee,sales_tax_percent,credit_card_percent,is_no_charge_closeout)
  VALUES(j.id,btrim(p_data->>'invoice_number'),(p_data->>'invoice_date')::date,nullif(p_data->>'due_date','')::date,
   amount,share_tax,'posted',p_data->>'note',actor,p_request_id,share_fee,tax_rate,fee_rate,total=0);
  IF total=0 THEN
   UPDATE public.svc_service_profiles SET completed_at=coalesce(completed_at,now()),financially_closed_at=now(),financially_closed_by=actor WHERE job_id=j.id;
  END IF;
  UPDATE public.jobs SET updated_at=now(),status=CASE WHEN total=0 THEN 'complete' ELSE status END WHERE id=j.id;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
  VALUES(actor,coalesce((SELECT nullif(display_name,'') FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1),actor),'svc_service_profiles',j.id::text,'update',jsonb_build_object('invoice_group_id',p_request_id,'invoice_number',p_data->>'invoice_number','revenue',amount,'no_charge_closeout',total=0,'tax',share_tax,'credit_card_fee',share_fee,'sales_tax_percent',tax_rate,'credit_card_percent',fee_rate),
   'Invoice recorded with this service call''s allocated share.');
 END LOOP;
 RETURN p_request_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.svc_void_billing(p_job_id uuid, p_kind text, p_record_id uuid, p_reason text, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 actor text:=auth.jwt()->>'sub'; target public.svc_invoices; payment public.svc_payments;
 j public.jobs; affected_jobs uuid[]; affected_invoices uuid[]; previous jsonb; saved jsonb;
 selected_updated timestamptz; stamp timestamptz; item public.svc_invoices;
BEGIN
 IF actor IS NULL OR p_kind IS NULL OR p_kind NOT IN ('invoice','payment') THEN
  RAISE EXCEPTION 'Select an invoice or payment you can manage' USING ERRCODE='42501';
 END IF;
 IF p_kind='payment' THEN
  SELECT * INTO payment FROM public.svc_payments WHERE id=p_record_id;
  SELECT * INTO target FROM public.svc_invoices WHERE id=payment.invoice_id AND job_id=p_job_id;
 ELSE
  SELECT * INTO target FROM public.svc_invoices WHERE id=p_record_id AND job_id=p_job_id;
 END IF;
 IF target.id IS NULL THEN RAISE EXCEPTION 'Billing record is unavailable' USING ERRCODE='42501'; END IF;
 SELECT array_agg(i.id ORDER BY i.id),array_agg(DISTINCT i.job_id ORDER BY i.job_id)
 INTO affected_invoices,affected_jobs FROM public.svc_invoices i
 WHERE i.id=target.id OR (p_kind='invoice' AND target.invoice_group_id IS NOT NULL AND i.invoice_group_id=target.invoice_group_id);
 -- Same job -> invoice lock ordering as posting/payments; shared jobs sorted.
 FOR j IN SELECT * FROM public.jobs WHERE id=ANY(affected_jobs) ORDER BY id FOR UPDATE LOOP
  IF j.archived_at IS NOT NULL OR j.job_type<>'service_call'
   OR public.current_user_can_edit_job(j.id,'can_approve_budget') IS NOT TRUE
   OR public.current_user_can_access_job(j.id,'can_view_project_financials') IS NOT TRUE THEN
   RAISE EXCEPTION 'Billing management permission on every active linked call is required' USING ERRCODE='42501';
  END IF;
  IF j.id=p_job_id THEN selected_updated:=j.updated_at; END IF;
 END LOOP;
 PERFORM 1 FROM public.svc_invoices WHERE id=ANY(affected_invoices) ORDER BY id FOR UPDATE;
 IF p_kind='payment' THEN
  SELECT * INTO payment FROM public.svc_payments WHERE id=p_record_id FOR UPDATE;
  IF payment.voided_at IS NOT NULL THEN RETURN p_job_id; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.svc_invoices WHERE id=ANY(affected_invoices) AND status<>'void') THEN RETURN p_job_id; END IF;
 END IF;
 IF selected_updated IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'This call changed. Refresh before voiding.' USING ERRCODE='40001';
 END IF;
 IF length(btrim(coalesce(p_reason,'')))<3 THEN
  RAISE EXCEPTION 'Enter a reason of at least 3 characters for this correction' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM public.svc_invoices WHERE id=ANY(affected_invoices) AND status<>'posted') THEN
  RAISE EXCEPTION 'Only posted invoices can be corrected. Review mixed or already-voided invoice allocations.' USING ERRCODE='22023';
 END IF;
 stamp:=clock_timestamp();
 IF p_kind='payment' THEN
  previous:=to_jsonb(payment);
  UPDATE public.svc_payments SET voided_at=stamp,voided_by=actor,void_reason=btrim(p_reason)
   WHERE id=payment.id RETURNING to_jsonb(svc_payments) INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,coalesce((SELECT nullif(display_name,'') FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1),actor),
   'svc_service_profiles',p_job_id::text,'update',previous,saved,'Payment voided: '||btrim(p_reason));
 ELSE
  IF EXISTS(SELECT 1 FROM public.svc_payments WHERE invoice_id=ANY(affected_invoices) AND voided_at IS NULL) THEN
   RAISE EXCEPTION 'Void recorded payments on every linked call before voiding this invoice. No invoice was changed.' USING ERRCODE='22023';
  END IF;
  FOR item IN SELECT * FROM public.svc_invoices WHERE id=ANY(affected_invoices) ORDER BY id LOOP
   previous:=to_jsonb(item);
   UPDATE public.svc_invoices SET status='void',voided_at=stamp,voided_by=actor,void_reason=btrim(p_reason),updated_at=stamp
    WHERE id=item.id RETURNING to_jsonb(svc_invoices) INTO saved;
   INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
   VALUES(actor,coalesce((SELECT nullif(display_name,'') FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1),actor),
    'svc_service_profiles',item.job_id::text,'update',previous,saved,'Invoice voided: '||btrim(p_reason));
  END LOOP;
  UPDATE public.svc_invoice_groups SET voided_at=stamp,voided_by=actor,void_reason=btrim(p_reason) WHERE id=target.invoice_group_id;
 END IF;
 IF p_kind='invoice' AND target.is_no_charge_closeout THEN
  UPDATE public.svc_service_profiles SET completed_at=NULL,financially_closed_at=NULL,financially_closed_by=NULL WHERE job_id=p_job_id;
  UPDATE public.jobs SET status='active' WHERE id=p_job_id;
 END IF;
 UPDATE public.jobs SET updated_at=stamp WHERE id=ANY(affected_jobs);
 RETURN p_job_id;
END;
$function$
;
