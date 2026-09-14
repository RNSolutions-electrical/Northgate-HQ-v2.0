-- Pass-through charges never enter revenue/cost/profit. No historical amounts are changed.
-- Local CLI scaffold timestamp aligned with the verified production migration version.
ALTER TABLE public.svc_invoices
 ADD COLUMN credit_card_fee numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit_card_fee>=0),
 ADD COLUMN sales_tax_percent numeric(5,2) CHECK (sales_tax_percent BETWEEN 0 AND 100),
 ADD COLUMN credit_card_percent numeric(5,2) CHECK (credit_card_percent BETWEEN 0 AND 100);
ALTER TABLE public.svc_invoice_groups
 ADD COLUMN credit_card_fee numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit_card_fee>=0),
 ADD COLUMN sales_tax_percent numeric(5,2) CHECK (sales_tax_percent BETWEEN 0 AND 100),
 ADD COLUMN credit_card_percent numeric(5,2) CHECK (credit_card_percent BETWEEN 0 AND 100);
-- Existing RLS/column grants and RPC-only write boundary are preserved.
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
 IF total IS NULL OR total<=0 OR tax<0 OR allocated IS DISTINCT FROM total THEN
  RAISE EXCEPTION 'Invoice allocations must equal the invoice total, to the cent' USING ERRCODE='22023';
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
  IF j.status<>'complete' THEN RAISE EXCEPTION 'Complete the work before recording an invoice for %',j.service_call_number USING ERRCODE='22023'; END IF;
  amount:=(allocation->>'amount')::numeric;
  IF amount IS NULL OR amount<=0 OR amount<>(allocation->>'amount')::numeric THEN
   RAISE EXCEPTION 'Each allocation must be positive and rounded to cents' USING ERRCODE='22023'; END IF;
  n:=n+1;
  share_tax:=CASE WHEN n=expected_count THEN remaining_tax ELSE least(remaining_tax,round(tax*amount/total,2)) END;
  remaining_tax:=remaining_tax-share_tax;
  share_fee:=CASE WHEN n=expected_count THEN remaining_fee ELSE least(remaining_fee,round(fee*amount/total,2)) END;
  remaining_fee:=remaining_fee-share_fee;
  INSERT INTO public.svc_invoices(job_id,invoice_number,invoice_date,due_date,revenue_excluding_tax,sales_tax,status,note,created_by,invoice_group_id,credit_card_fee,sales_tax_percent,credit_card_percent)
  VALUES(j.id,btrim(p_data->>'invoice_number'),(p_data->>'invoice_date')::date,nullif(p_data->>'due_date','')::date,
   amount,share_tax,'posted',p_data->>'note',actor,p_request_id,share_fee,tax_rate,fee_rate);
  UPDATE public.jobs SET updated_at=now() WHERE id=j.id;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
  VALUES(actor,coalesce((SELECT nullif(display_name,'') FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1),actor),'svc_service_profiles',j.id::text,'update',jsonb_build_object('invoice_group_id',p_request_id,'invoice_number',p_data->>'invoice_number','revenue',amount,'tax',share_tax,'credit_card_fee',share_fee,'sales_tax_percent',tax_rate,'credit_card_percent',fee_rate),
   'Invoice recorded with this service call''s allocated share.');
 END LOOP;
 RETURN p_request_id;
END;
$function$
;
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
  IF (p_data->>'amount')::numeric>invoice.revenue_excluding_tax+invoice.sales_tax+invoice.credit_card_fee-coalesce((SELECT sum(amount) FROM public.svc_payments WHERE invoice_id=invoice.id),0)
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
          WHERE i.job_id = j.id AND i.status = 'posted'::text) payment ON true
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
REVOKE ALL ON FUNCTION public.svc_post_invoice(uuid,jsonb),public.svc_save_commercial(uuid,text,jsonb,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.svc_post_invoice(uuid,jsonb),public.svc_save_commercial(uuid,text,jsonb,timestamptz) TO authenticated;
