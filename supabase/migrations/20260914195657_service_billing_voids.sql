-- Audited corrections only: preserve invoice/payment amounts and source history.
-- Filename aligned to the production migration version assigned by Supabase.
-- Existing billing authority, RLS and direct-write restrictions remain unchanged.
ALTER TABLE public.svc_invoices ADD COLUMN voided_at timestamptz, ADD COLUMN voided_by text, ADD COLUMN void_reason text;
ALTER TABLE public.svc_invoice_groups ADD COLUMN voided_at timestamptz, ADD COLUMN voided_by text, ADD COLUMN void_reason text;
ALTER TABLE public.svc_payments ADD COLUMN voided_at timestamptz, ADD COLUMN voided_by text, ADD COLUMN void_reason text;

CREATE OR REPLACE FUNCTION public.svc_save_commercial(p_job_id uuid, p_action text, p_data jsonb, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  IF (p_data->>'amount')::numeric>invoice.revenue_excluding_tax+invoice.sales_tax+invoice.credit_card_fee-coalesce((SELECT sum(amount) FROM public.svc_payments WHERE invoice_id=invoice.id AND voided_at IS NULL),0)
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
$function$
;
CREATE OR REPLACE VIEW public.svc_call_financials WITH (security_invoker=true) AS
 SELECT j.id AS job_id,
    j.job_number,
    j.service_call_number,
    j.name AS customer_name,
    concat_ws(', '::text, NULLIF(j.city, ''::text), NULLIF(j.state, ''::text)) AS location,
    j.description AS scope,
    j.status AS job_status,
    j.created_at,
    profile.classification,
    profile.billing_method,
    profile.call_kind,
    profile.completed_at,
    profile.financially_closed_at,
    COALESCE(labor.billable_labor, 0::numeric)::numeric(14,2) AS billable_labor,
    COALESCE(invoice.invoiced_revenue, 0::numeric)::numeric(14,2) AS invoiced_revenue,
    COALESCE(payment.collected, 0::numeric)::numeric(14,2) AS collected,
    COALESCE(cost.labor_hard_cost, 0::numeric)::numeric(14,2) AS labor_hard_cost,
    COALESCE(cost.material_hard_cost, 0::numeric)::numeric(14,2) AS material_hard_cost,
    COALESCE(cost.other_hard_cost, 0::numeric)::numeric(14,2) AS other_hard_cost,
    COALESCE(cost.total_hard_cost, 0::numeric)::numeric(14,2) AS total_hard_cost,
    (COALESCE(invoice.invoiced_revenue, 0::numeric) - COALESCE(cost.total_hard_cost, 0::numeric))::numeric(14,2) AS gross_profit,
        CASE
            WHEN COALESCE(invoice.invoiced_revenue, 0::numeric) = 0::numeric THEN NULL::numeric
            ELSE round((COALESCE(invoice.invoiced_revenue, 0::numeric) - COALESCE(cost.total_hard_cost, 0::numeric)) / invoice.invoiced_revenue * 100::numeric, 2)
        END AS gross_margin,
    (COALESCE(invoice.invoiced_revenue, 0::numeric) + COALESCE(invoice.sales_tax, 0::numeric) + COALESCE(invoice.credit_card_fee, 0::numeric) - COALESCE(payment.collected, 0::numeric))::numeric(14,2) AS outstanding,
    cost.cost_through,
    cost.reconciliation_status
   FROM jobs j
     LEFT JOIN svc_service_profiles profile ON profile.job_id = j.id
     LEFT JOIN LATERAL ( SELECT sum(svc_labor_lines.billable_amount) AS billable_labor
           FROM svc_labor_lines
          WHERE svc_labor_lines.job_id = j.id) labor ON true
     LEFT JOIN LATERAL ( SELECT sum(svc_invoices.revenue_excluding_tax) AS invoiced_revenue,
            sum(svc_invoices.sales_tax) AS sales_tax,
            sum(svc_invoices.credit_card_fee) AS credit_card_fee
           FROM svc_invoices
          WHERE svc_invoices.job_id = j.id AND svc_invoices.status = 'posted'::text) invoice ON true
     LEFT JOIN LATERAL ( SELECT sum(p.amount) AS collected
           FROM svc_payments p
             JOIN svc_invoices i ON i.id = p.invoice_id
          WHERE i.job_id = j.id AND i.status = 'posted'::text AND p.voided_at IS NULL) payment ON true
     LEFT JOIN LATERAL ( SELECT svc_cost_snapshots.id,
            svc_cost_snapshots.job_id,
            svc_cost_snapshots.source_type,
            svc_cost_snapshots.labor_hard_cost,
            svc_cost_snapshots.material_hard_cost,
            svc_cost_snapshots.other_hard_cost,
            svc_cost_snapshots.total_hard_cost,
            svc_cost_snapshots.cost_through,
            svc_cost_snapshots.reconciliation_status,
            svc_cost_snapshots.source_note,
            svc_cost_snapshots.source_document_id,
            svc_cost_snapshots.is_active,
            svc_cost_snapshots.activated_at,
            svc_cost_snapshots.activated_by,
            svc_cost_snapshots.created_by,
            svc_cost_snapshots.created_at
           FROM svc_cost_snapshots
          WHERE svc_cost_snapshots.job_id = j.id AND svc_cost_snapshots.is_active = true
         LIMIT 1) cost ON true
  WHERE j.job_type = 'service_call'::text AND j.archived_at IS NULL AND current_user_can_access_job(j.id, 'can_view_project_financials'::text);

CREATE OR REPLACE FUNCTION public.svc_void_billing(
 p_job_id uuid, p_kind text, p_record_id uuid, p_reason text, p_expected_updated_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
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
 UPDATE public.jobs SET updated_at=stamp WHERE id=ANY(affected_jobs);
 RETURN p_job_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.svc_void_billing(uuid,text,uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.svc_void_billing(uuid,text,uuid,text,timestamptz) TO authenticated;
