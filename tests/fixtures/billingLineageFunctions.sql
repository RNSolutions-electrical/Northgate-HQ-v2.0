CREATE OR REPLACE FUNCTION public.create_job_pay_application(p_job_id uuid, p_period_end date, p_template_key text, p_template_document_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE actor TEXT := auth.jwt()->>'sub'; app_id UUID; n INTEGER; contract_value NUMERIC(14,2); co_value NUMERIC(14,2);
BEGIN
  IF actor IS NULL OR NOT public.job_billing_can_manage(p_job_id) THEN RAISE EXCEPTION 'Billing management permission is required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_job_id::TEXT));
  IF EXISTS (SELECT 1 FROM public.job_pay_applications WHERE job_id=p_job_id AND status IN ('draft','approved')) THEN RAISE EXCEPTION 'This job already has an active Draft or Approved Pay App.'; END IF;
  SELECT COALESCE(sum(scheduled_value_amount),0) INTO contract_value FROM public.job_revenue_lines WHERE job_id=p_job_id AND archived_at IS NULL;
  IF contract_value<=0 THEN RAISE EXCEPTION 'Initialize and reconcile the SOV before creating a Pay App.'; END IF;
  SELECT COALESCE(sum(price_amount),0) INTO co_value FROM public.change_orders WHERE job_id=p_job_id AND status='approved' AND voided_at IS NULL AND archived_at IS NULL;
  SELECT COALESCE(max(pay_app_number),0)+1 INTO n FROM public.job_pay_applications WHERE job_id=p_job_id;
  INSERT INTO public.job_pay_applications(job_id,pay_app_number,billing_period_end,original_contract_value,approved_change_order_value,current_contract_value,remaining_contract_value,created_by,template_key,template_document_id)
  VALUES(p_job_id,n,COALESCE(p_period_end,CURRENT_DATE),contract_value,co_value,contract_value+co_value,contract_value+co_value,actor,p_template_key,p_template_document_id) RETURNING id INTO app_id;
  INSERT INTO public.job_pay_application_lines(pay_application_id,sov_line_id,source_budget_line_id,project_division_id,project_division_code,project_division_name,cost_code,description,original_budget_amount,allocated_fee_amount,scheduled_value_amount,previous_billed_amount,billed_to_date_amount,remaining_amount,snapshot)
  SELECT app_id,r.id,r.source_budget_line_id,r.source_project_division_id,d.code,d.name,r.sov_line,r.description,r.source_original_budget_amount,r.allocated_fee_amount,r.scheduled_value_amount,COALESCE(prior.amount,0),COALESCE(prior.amount,0),r.scheduled_value_amount-COALESCE(prior.amount,0),jsonb_build_object('sov_line',r.sov_line,'description',r.description)
  FROM public.job_revenue_lines r LEFT JOIN public.job_budget_divisions d ON d.id=r.source_project_division_id
  LEFT JOIN LATERAL (SELECT sum(l.final_current_amount) AS amount FROM public.job_pay_application_lines l JOIN public.job_pay_applications h ON h.id=l.pay_application_id WHERE h.job_id=p_job_id AND h.status='billed' AND l.sov_line_id=r.id) prior ON TRUE
  WHERE r.job_id=p_job_id AND r.archived_at IS NULL;
  INSERT INTO public.job_pay_application_change_orders(pay_application_id,change_order_id,co_number,description,approved_value,previous_billed_amount,billed_to_date_amount,remaining_amount,source_snapshot)
  SELECT app_id,c.id,c.co_number,c.title,c.price_amount,COALESCE(prior.amount,0),COALESCE(prior.amount,0),c.price_amount-COALESCE(prior.amount,0),jsonb_build_object('co_number',c.co_number,'title',c.title,'approved_value',c.price_amount)
  FROM public.change_orders c LEFT JOIN LATERAL (SELECT sum(x.final_current_amount) AS amount FROM public.job_pay_application_change_orders x JOIN public.job_pay_applications h ON h.id=x.pay_application_id WHERE h.job_id=p_job_id AND h.status='billed' AND x.change_order_id=c.id) prior ON TRUE
  WHERE c.job_id=p_job_id AND c.status='approved' AND c.voided_at IS NULL AND c.archived_at IS NULL;
  RETURN app_id;
END; $function$
;
CREATE OR REPLACE FUNCTION public.finalize_job_pay_application(p_pay_app_id uuid, p_finalization_key uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  app public.job_pay_applications%rowtype;
  saved public.job_pay_applications%rowtype;
  actor text:=auth.jwt()->>'sub';
  actor_name text;
  original_current numeric(14,2);
  co_current numeric(14,2);
  prior_total numeric(14,2);
BEGIN
  SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;
  IF app.id IS NULL THEN RAISE EXCEPTION 'Pay App not found'; END IF;
  IF actor IS NULL OR NOT public.job_billing_can_manage(app.job_id) THEN
    RAISE EXCEPTION 'Billing finalization permission is required' USING ERRCODE='42501';
  END IF;
  IF app.status='billed' AND app.finalization_key=p_finalization_key THEN
    RETURN jsonb_build_object('id',app.id,'status','billed','idempotent',true);
  END IF;
  IF app.status<>'approved' THEN RAISE EXCEPTION 'Only an Approved Pay App can be marked Billed.'; END IF;
  IF EXISTS(SELECT 1 FROM public.job_pay_application_lines WHERE pay_application_id=app.id AND (previous_billed_amount+final_current_amount<0 OR previous_billed_amount+final_current_amount>scheduled_value_amount)) THEN
    RAISE EXCEPTION 'A scheduled line exceeds its available range.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.job_pay_application_change_orders WHERE pay_application_id=app.id AND (previous_billed_amount+final_current_amount<LEAST(0,approved_value) OR previous_billed_amount+final_current_amount>GREATEST(0,approved_value))) THEN
    RAISE EXCEPTION 'A Change Order exceeds its approved range.';
  END IF;
  SELECT COALESCE(sum(final_current_amount),0) INTO original_current FROM public.job_pay_application_lines WHERE pay_application_id=app.id;
  SELECT COALESCE(sum(final_current_amount),0) INTO co_current FROM public.job_pay_application_change_orders WHERE pay_application_id=app.id;
  SELECT COALESCE(sum(total_current_billed),0) INTO prior_total FROM public.job_pay_applications WHERE job_id=app.job_id AND status='billed';
  UPDATE public.job_pay_application_lines SET billed_to_date_amount=previous_billed_amount+final_current_amount,remaining_amount=scheduled_value_amount-(previous_billed_amount+final_current_amount),resulting_percent=CASE WHEN scheduled_value_amount=0 THEN 0 ELSE round((previous_billed_amount+final_current_amount)*100/scheduled_value_amount,6) END WHERE pay_application_id=app.id;
  UPDATE public.job_pay_application_change_orders SET billed_to_date_amount=previous_billed_amount+final_current_amount,remaining_amount=approved_value-(previous_billed_amount+final_current_amount) WHERE pay_application_id=app.id;
  UPDATE public.job_revenue_lines r SET billed_to_date_amount=l.previous_billed_amount+l.final_current_amount,billing_locked_at=COALESCE(r.billing_locked_at,NOW())
  FROM public.job_pay_application_lines l WHERE l.pay_application_id=app.id AND l.sov_line_id=r.id;
  UPDATE public.job_pay_applications SET status='billed',finalization_key=p_finalization_key,billed_at=NOW(),billed_by=actor,billed_note=p_note,
    original_current_billed=original_current,change_order_current_billed=co_current,total_current_billed=original_current+co_current,
    original_previous_billed=(SELECT COALESCE(sum(original_current_billed),0) FROM public.job_pay_applications WHERE job_id=app.job_id AND status='billed'),
    change_order_previous_billed=(SELECT COALESCE(sum(change_order_current_billed),0) FROM public.job_pay_applications WHERE job_id=app.job_id AND status='billed'),
    total_previous_billed=prior_total,total_billed_to_date=prior_total+original_current+co_current,
    retainage_amount=round((original_current+co_current)*retainage_percent/100,2),remaining_contract_value=app.current_contract_value-(prior_total+original_current+co_current),updated_at=NOW(),updated_by=actor
  WHERE id=app.id RETURNING * INTO saved;
  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor) INTO actor_name
  FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,actor_name,'job_pay_applications',app.id::text,'update',to_jsonb(app),to_jsonb(saved),COALESCE(NULLIF(btrim(p_note),''),'Pay App marked Billed.'));
  RETURN jsonb_build_object('id',app.id,'status','billed','idempotent',false);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.save_job_pay_application_change_order(p_line_id uuid, p_additional_percent numeric, p_override_amount numeric DEFAULT NULL::numeric, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE line public.job_pay_application_change_orders%ROWTYPE; app public.job_pay_applications%ROWTYPE; target_amount NUMERIC(14,2); amount NUMERIC(14,2); effective_percent NUMERIC(12,6); reason TEXT; lower_bound NUMERIC(14,2); upper_bound NUMERIC(14,2);
BEGIN
  SELECT * INTO line FROM public.job_pay_application_change_orders WHERE id=p_line_id FOR UPDATE;
  SELECT * INTO app FROM public.job_pay_applications WHERE id=line.pay_application_id FOR UPDATE;
  IF app.id IS NULL OR NOT public.job_billing_can_manage(app.job_id) OR app.status<>'draft' OR app.pay_app_kind='reversal' THEN RAISE EXCEPTION 'Only authorized editable Draft Pay App change orders can be changed' USING ERRCODE='42501'; END IF;
  IF COALESCE(p_additional_percent,0)<0 OR COALESCE(p_additional_percent,0)>100 THEN RAISE EXCEPTION 'Percentage complete must be between zero and 100 percent.'; END IF;
  reason := NULLIF(BTRIM(COALESCE(p_reason,'')), '');
  target_amount := round(line.approved_value*COALESCE(p_additional_percent,0)/100,2);
  amount := COALESCE(p_override_amount,target_amount-line.previous_billed_amount);
  lower_bound := LEAST(0,line.approved_value); upper_bound := GREATEST(0,line.approved_value);
  IF line.previous_billed_amount+amount<lower_bound OR line.previous_billed_amount+amount>upper_bound THEN RAISE EXCEPTION 'Current billing exceeds the approved Change Order range.'; END IF;
  IF (p_override_amount IS NOT NULL OR app.pay_app_kind='correction') AND reason IS NULL THEN RAISE EXCEPTION 'A reason is required for an override or correction.'; END IF;
  effective_percent := CASE WHEN line.approved_value=0 THEN 0 ELSE round((line.previous_billed_amount+amount)*100/line.approved_value,6) END;
  UPDATE public.job_pay_application_change_orders SET additional_percent=effective_percent,calculated_current_amount=target_amount-line.previous_billed_amount,final_current_amount=amount,override_reason=CASE WHEN p_override_amount IS NULL AND app.pay_app_kind='standard' THEN NULL ELSE reason END,overridden_by=CASE WHEN p_override_amount IS NULL AND app.pay_app_kind='standard' THEN NULL ELSE auth.jwt()->>'sub' END,overridden_at=CASE WHEN p_override_amount IS NULL AND app.pay_app_kind='standard' THEN NULL ELSE NOW() END,updated_at=NOW() WHERE id=line.id;
END; $function$
;
CREATE OR REPLACE FUNCTION public.set_job_pay_application_status(p_pay_app_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  app public.job_pay_applications%rowtype;
  saved public.job_pay_applications%rowtype;
  actor text:=auth.jwt()->>'sub';
  actor_name text;
  note text:=NULLIF(btrim(COALESCE(p_note,'')),'');
BEGIN
  SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;
  IF app.id IS NULL OR actor IS NULL OR NOT public.job_billing_can_manage(app.job_id) THEN
    RAISE EXCEPTION 'Billing management permission is required' USING ERRCODE='42501';
  END IF;
  IF p_status='approved' AND app.status='draft' THEN
    UPDATE public.job_pay_applications
    SET status='approved',approved_at=NOW(),approved_by=actor,
      approval_note=COALESCE(note,'Pay App approved.'),updated_at=NOW(),updated_by=actor
    WHERE id=app.id RETURNING * INTO saved;
  ELSIF p_status='draft' AND app.status='approved' THEN
    UPDATE public.job_pay_applications
    SET status='draft',approved_at=NULL,approved_by=NULL,
      approval_note=COALESCE(note,'Pay App returned to Draft.'),updated_at=NOW(),updated_by=actor
    WHERE id=app.id RETURNING * INTO saved;
  ELSE
    RAISE EXCEPTION 'Invalid Pay App status transition.' USING ERRCODE='22023';
  END IF;
  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor) INTO actor_name
  FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,actor_name,'job_pay_applications',app.id::text,'update',to_jsonb(app),to_jsonb(saved),saved.approval_note);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.void_approved_job_change_order(p_change_order_id uuid, p_reason text, p_confirmation text)
 RETURNS change_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; target public.change_orders%ROWTYPE; saved public.change_orders%ROWTYPE; approval_count INTEGER; void_count INTEGER; unbalanced_count INTEGER; normalized_reason TEXT:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR NOT public.current_user_can_edit_division(target.division,'can_revise_change_orders') THEN RAISE EXCEPTION 'Change Order and can_revise_change_orders are required' USING ERRCODE='42501'; END IF;
  IF target.status='voided' THEN RETURN target; END IF;
  IF target.status<>'approved' THEN RAISE EXCEPTION 'only an approved Change Order may be voided'; END IF;
  IF normalized_reason IS NULL OR BTRIM(COALESCE(p_confirmation,''))<>target.co_number THEN RAISE EXCEPTION 'reason and exact Change Order number confirmation are required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.change_order_financial_postings(change_order_id,job_id,job_budget_line_id,division,cost_code,amount_delta,posted_by,posting_kind)
  SELECT change_order_id,job_id,job_budget_line_id,division,cost_code,-amount_delta,actor_id,'void'
  FROM public.change_order_financial_postings WHERE change_order_id=target.id AND posting_kind='approval'
  ON CONFLICT(change_order_id,job_budget_line_id,posting_kind) DO NOTHING;
  SELECT COUNT(*) FILTER(WHERE posting_kind='approval'),COUNT(*) FILTER(WHERE posting_kind='void') INTO approval_count,void_count
  FROM public.change_order_financial_postings WHERE change_order_id=target.id;
  SELECT COUNT(*) INTO unbalanced_count FROM (
    SELECT job_budget_line_id FROM public.change_order_financial_postings WHERE change_order_id=target.id GROUP BY job_budget_line_id HAVING SUM(amount_delta)<>0
  ) unbalanced;
  IF approval_count=0 OR void_count<>approval_count OR unbalanced_count<>0 THEN RAISE EXCEPTION 'void reversal did not reconcile; operation rolled back'; END IF;
  UPDATE public.change_orders SET status='voided',voided_at=NOW(),voided_by=actor_id,void_reason=normalized_reason,updated_by=actor_id,updated_at=NOW()
  WHERE id=target.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor_id,public.change_order_actor(),'change_orders',saved.id::TEXT,'update',to_jsonb(target),to_jsonb(saved),normalized_reason);
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor_id,public.change_order_actor(),'change_order_financial_postings',saved.id::TEXT,'create',NULL,jsonb_build_object('posting_kind','void','posting_count',void_count,'change_order_id',saved.id,'job_id',saved.job_id),'Immutable equal-and-opposite void postings created.');
  RETURN saved;
END $function$
;
