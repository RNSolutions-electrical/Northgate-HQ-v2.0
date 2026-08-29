-- Complete the Job > Billing Pay Application interface through an RPC-only
-- boundary. Direct table grants remain revoked and every function re-checks
-- the caller's job-scoped financial authority.

CREATE OR REPLACE FUNCTION public.job_billing_can_view(p_job_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT public.current_user_can_access_job(p_job_id, 'can_view_project_financials')
$$;

CREATE OR REPLACE FUNCTION public.get_job_pay_applications(p_job_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result JSONB;
BEGIN
  IF auth.jwt()->>'sub' IS NULL OR NOT public.job_billing_can_view(p_job_id) THEN
    RAISE EXCEPTION 'Project financial access is required' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    to_jsonb(h) || jsonb_build_object(
      'lines', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.project_division_code, l.cost_code, l.description) FROM public.job_pay_application_lines l WHERE l.pay_application_id=h.id),'[]'::jsonb),
      'change_orders', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.co_number) FROM public.job_pay_application_change_orders c WHERE c.pay_application_id=h.id),'[]'::jsonb)
    ) ORDER BY h.pay_app_number DESC
  ), '[]'::jsonb) INTO result
  FROM public.job_pay_applications h WHERE h.job_id=p_job_id;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.save_job_pay_application_header(
  p_pay_app_id UUID, p_period_start DATE, p_period_end DATE,
  p_retainage_percent NUMERIC, p_template_key TEXT, p_template_document_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE app public.job_pay_applications%ROWTYPE; normalized_template TEXT;
BEGIN
  SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;
  IF app.id IS NULL OR NOT public.job_billing_can_manage(app.job_id) OR app.status<>'draft' THEN
    RAISE EXCEPTION 'Only authorized Draft Pay Apps can be edited' USING ERRCODE='42501';
  END IF;
  IF p_period_end IS NULL OR (p_period_start IS NOT NULL AND p_period_start>p_period_end) THEN RAISE EXCEPTION 'Enter a valid billing period.'; END IF;
  IF COALESCE(p_retainage_percent,0)<0 OR COALESCE(p_retainage_percent,0)>100 THEN RAISE EXCEPTION 'Retainage must be between 0 and 100 percent.'; END IF;
  normalized_template := NULLIF(BTRIM(COALESCE(p_template_key,'')),'');
  IF normalized_template NOT IN ('aia_g702_g703','gmp','residential','commercial','custom') THEN RAISE EXCEPTION 'Select a supported Pay App form.'; END IF;
  UPDATE public.job_pay_applications SET billing_period_start=p_period_start,billing_period_end=p_period_end,
    retainage_percent=COALESCE(p_retainage_percent,0),template_key=normalized_template,
    template_document_id=p_template_document_id,updated_at=NOW(),updated_by=auth.jwt()->>'sub' WHERE id=app.id;
END; $$;

CREATE OR REPLACE FUNCTION public.save_job_pay_application_line(p_line_id UUID, p_additional_percent NUMERIC, p_override_amount NUMERIC DEFAULT NULL, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE line public.job_pay_application_lines%ROWTYPE; app public.job_pay_applications%ROWTYPE; amount NUMERIC(14,2); reason TEXT;
BEGIN
  SELECT * INTO line FROM public.job_pay_application_lines WHERE id=p_line_id FOR UPDATE;
  SELECT * INTO app FROM public.job_pay_applications WHERE id=line.pay_application_id FOR UPDATE;
  IF app.id IS NULL OR NOT public.job_billing_can_manage(app.job_id) OR app.status<>'draft' OR app.pay_app_kind='reversal' THEN
    RAISE EXCEPTION 'Only authorized editable Draft Pay App lines can be changed' USING ERRCODE='42501';
  END IF;
  reason := NULLIF(BTRIM(COALESCE(p_reason,'')),'');
  amount := COALESCE(p_override_amount, round(line.scheduled_value_amount*COALESCE(p_additional_percent,0)/100,2));
  IF line.previous_billed_amount+amount<0 OR line.previous_billed_amount+amount>line.scheduled_value_amount THEN RAISE EXCEPTION 'Current billing must leave the line between zero and its scheduled value.'; END IF;
  IF (p_override_amount IS NOT NULL OR app.pay_app_kind='correction') AND reason IS NULL THEN RAISE EXCEPTION 'A reason is required for an override or correction.'; END IF;
  UPDATE public.job_pay_application_lines SET additional_percent=COALESCE(p_additional_percent,0),
    calculated_current_amount=round(line.scheduled_value_amount*COALESCE(p_additional_percent,0)/100,2),final_current_amount=amount,
    override_reason=CASE WHEN p_override_amount IS NULL AND app.pay_app_kind='standard' THEN NULL ELSE reason END,
    overridden_by=CASE WHEN p_override_amount IS NULL AND app.pay_app_kind='standard' THEN NULL ELSE auth.jwt()->>'sub' END,
    overridden_at=CASE WHEN p_override_amount IS NULL AND app.pay_app_kind='standard' THEN NULL ELSE NOW() END,updated_at=NOW()
  WHERE id=line.id;
END; $$;

CREATE OR REPLACE FUNCTION public.save_job_pay_application_change_order(p_line_id UUID, p_additional_percent NUMERIC, p_override_amount NUMERIC DEFAULT NULL, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE line public.job_pay_application_change_orders%ROWTYPE; app public.job_pay_applications%ROWTYPE; amount NUMERIC(14,2); reason TEXT; lower_bound NUMERIC(14,2); upper_bound NUMERIC(14,2);
BEGIN
  SELECT * INTO line FROM public.job_pay_application_change_orders WHERE id=p_line_id FOR UPDATE;
  SELECT * INTO app FROM public.job_pay_applications WHERE id=line.pay_application_id FOR UPDATE;
  IF app.id IS NULL OR NOT public.job_billing_can_manage(app.job_id) OR app.status<>'draft' OR app.pay_app_kind='reversal' THEN
    RAISE EXCEPTION 'Only authorized editable Draft Pay App change orders can be changed' USING ERRCODE='42501';
  END IF;
  reason := NULLIF(BTRIM(COALESCE(p_reason,'')),'');
  amount := COALESCE(p_override_amount, round(line.approved_value*COALESCE(p_additional_percent,0)/100,2));
  lower_bound := LEAST(0,line.approved_value); upper_bound := GREATEST(0,line.approved_value);
  IF line.previous_billed_amount+amount<lower_bound OR line.previous_billed_amount+amount>upper_bound THEN RAISE EXCEPTION 'Current billing exceeds the approved Change Order range.'; END IF;
  IF (p_override_amount IS NOT NULL OR app.pay_app_kind='correction') AND reason IS NULL THEN RAISE EXCEPTION 'A reason is required for an override or correction.'; END IF;
  UPDATE public.job_pay_application_change_orders SET additional_percent=COALESCE(p_additional_percent,0),
    calculated_current_amount=round(line.approved_value*COALESCE(p_additional_percent,0)/100,2),final_current_amount=amount,
    override_reason=CASE WHEN p_override_amount IS NULL AND app.pay_app_kind='standard' THEN NULL ELSE reason END,
    overridden_by=CASE WHEN p_override_amount IS NULL AND app.pay_app_kind='standard' THEN NULL ELSE auth.jwt()->>'sub' END,
    overridden_at=CASE WHEN p_override_amount IS NULL AND app.pay_app_kind='standard' THEN NULL ELSE NOW() END,updated_at=NOW()
  WHERE id=line.id;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_job_pay_application_change_orders(p_pay_app_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE app public.job_pay_applications%ROWTYPE; written INTEGER;
BEGIN
  SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;
  IF app.id IS NULL OR NOT public.job_billing_can_manage(app.job_id) OR app.status<>'draft' THEN RAISE EXCEPTION 'Only an authorized Draft Pay App can sync Change Orders' USING ERRCODE='42501'; END IF;
  INSERT INTO public.job_pay_application_change_orders(pay_application_id,change_order_id,co_number,description,approved_value,previous_billed_amount,billed_to_date_amount,remaining_amount,source_snapshot)
  SELECT app.id,c.id,c.co_number,c.title,c.price_amount,COALESCE(prior.amount,0),COALESCE(prior.amount,0),c.price_amount-COALESCE(prior.amount,0),jsonb_build_object('co_number',c.co_number,'title',c.title,'approved_value',c.price_amount)
  FROM public.change_orders c LEFT JOIN LATERAL (SELECT sum(x.final_current_amount) amount FROM public.job_pay_application_change_orders x JOIN public.job_pay_applications h ON h.id=x.pay_application_id WHERE h.job_id=app.job_id AND h.status='billed' AND x.change_order_id=c.id) prior ON TRUE
  WHERE c.job_id=app.job_id AND c.status='approved' AND c.voided_at IS NULL AND c.archived_at IS NULL
  ON CONFLICT(pay_application_id,change_order_id) DO NOTHING;
  GET DIAGNOSTICS written=ROW_COUNT;
  UPDATE public.job_pay_applications SET approved_change_order_value=(SELECT COALESCE(sum(price_amount),0) FROM public.change_orders WHERE job_id=app.job_id AND status='approved' AND voided_at IS NULL AND archived_at IS NULL),
    current_contract_value=original_contract_value+(SELECT COALESCE(sum(price_amount),0) FROM public.change_orders WHERE job_id=app.job_id AND status='approved' AND voided_at IS NULL AND archived_at IS NULL),updated_at=NOW(),updated_by=auth.jwt()->>'sub' WHERE id=app.id;
  RETURN written;
END; $$;

CREATE OR REPLACE FUNCTION public.create_job_pay_application_correction(p_source_pay_app_id UUID, p_kind TEXT, p_reason TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE source public.job_pay_applications%ROWTYPE; app_id UUID; n INTEGER; actor TEXT:=auth.jwt()->>'sub'; reason TEXT;
BEGIN
  SELECT * INTO source FROM public.job_pay_applications WHERE id=p_source_pay_app_id AND status='billed' FOR UPDATE;
  reason:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
  IF source.id IS NULL THEN RAISE EXCEPTION 'Only a Billed Pay App can be corrected or reversed.'; END IF;
  IF actor IS NULL OR NOT public.job_billing_can_manage(source.job_id) THEN RAISE EXCEPTION 'Billing correction permission is required' USING ERRCODE='42501'; END IF;
  IF p_kind NOT IN ('correction','reversal') OR reason IS NULL THEN RAISE EXCEPTION 'Select correction or reversal and provide a reason.'; END IF;
  IF EXISTS(SELECT 1 FROM public.job_pay_applications WHERE job_id=source.job_id AND status IN('draft','approved')) THEN RAISE EXCEPTION 'Complete or void the active Pay App before starting a correction.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(source.job_id::TEXT));
  SELECT COALESCE(max(pay_app_number),0)+1 INTO n FROM public.job_pay_applications WHERE job_id=source.job_id;
  INSERT INTO public.job_pay_applications(job_id,pay_app_number,billing_period_end,status,original_contract_value,approved_change_order_value,current_contract_value,remaining_contract_value,created_by,pay_app_kind,correction_of_id,template_key,approval_note)
  VALUES(source.job_id,n,CURRENT_DATE,'draft',source.original_contract_value,source.approved_change_order_value,source.current_contract_value,source.remaining_contract_value,actor,p_kind,source.id,source.template_key,reason) RETURNING id INTO app_id;
  INSERT INTO public.job_pay_application_lines(pay_application_id,sov_line_id,source_budget_line_id,project_division_id,project_division_code,project_division_name,cost_code,description,original_budget_amount,allocated_fee_amount,scheduled_value_amount,previous_billed_amount,final_current_amount,billed_to_date_amount,remaining_amount,override_reason,overridden_by,overridden_at,snapshot)
  SELECT app_id,l.sov_line_id,l.source_budget_line_id,l.project_division_id,l.project_division_code,l.project_division_name,l.cost_code,l.description,l.original_budget_amount,l.allocated_fee_amount,l.scheduled_value_amount,
    COALESCE((SELECT sum(x.final_current_amount) FROM public.job_pay_application_lines x JOIN public.job_pay_applications h ON h.id=x.pay_application_id WHERE h.job_id=source.job_id AND h.status='billed' AND x.sov_line_id=l.sov_line_id),0),
    CASE WHEN p_kind='reversal' THEN -l.final_current_amount ELSE 0 END,0,0,reason,actor,NOW(),l.snapshot
  FROM public.job_pay_application_lines l WHERE l.pay_application_id=source.id;
  UPDATE public.job_pay_application_lines SET billed_to_date_amount=previous_billed_amount+final_current_amount,remaining_amount=scheduled_value_amount-(previous_billed_amount+final_current_amount) WHERE pay_application_id=app_id;
  INSERT INTO public.job_pay_application_change_orders(pay_application_id,change_order_id,co_number,description,approved_value,previous_billed_amount,final_current_amount,billed_to_date_amount,remaining_amount,override_reason,overridden_by,overridden_at,source_snapshot)
  SELECT app_id,l.change_order_id,l.co_number,l.description,l.approved_value,
    COALESCE((SELECT sum(x.final_current_amount) FROM public.job_pay_application_change_orders x JOIN public.job_pay_applications h ON h.id=x.pay_application_id WHERE h.job_id=source.job_id AND h.status='billed' AND x.change_order_id=l.change_order_id),0),
    CASE WHEN p_kind='reversal' THEN -l.final_current_amount ELSE 0 END,0,0,reason,actor,NOW(),l.source_snapshot
  FROM public.job_pay_application_change_orders l WHERE l.pay_application_id=source.id;
  UPDATE public.job_pay_application_change_orders SET billed_to_date_amount=previous_billed_amount+final_current_amount,remaining_amount=approved_value-(previous_billed_amount+final_current_amount) WHERE pay_application_id=app_id;
  RETURN app_id;
END; $$;

CREATE OR REPLACE FUNCTION public.void_job_pay_application(p_pay_app_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE app public.job_pay_applications%ROWTYPE; reason TEXT:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
BEGIN
  SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;
  IF app.id IS NULL OR NOT public.job_billing_can_manage(app.job_id) OR app.status NOT IN('draft','approved') THEN RAISE EXCEPTION 'Only an authorized Draft or Approved Pay App can be voided' USING ERRCODE='42501'; END IF;
  IF reason IS NULL THEN RAISE EXCEPTION 'A void reason is required.'; END IF;
  UPDATE public.job_pay_applications SET status='voided',voided_at=NOW(),voided_by=auth.jwt()->>'sub',void_reason=reason,updated_at=NOW(),updated_by=auth.jwt()->>'sub' WHERE id=app.id;
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_job_pay_application(p_pay_app_id UUID,p_finalization_key UUID,p_note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE app public.job_pay_applications%ROWTYPE; actor TEXT:=auth.jwt()->>'sub'; original_current NUMERIC(14,2); co_current NUMERIC(14,2); prior_total NUMERIC(14,2);
BEGIN
  SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;
  IF app.id IS NULL THEN RAISE EXCEPTION 'Pay App not found'; END IF;
  IF actor IS NULL OR NOT public.job_billing_can_manage(app.job_id) THEN RAISE EXCEPTION 'Billing finalization permission is required' USING ERRCODE='42501'; END IF;
  IF app.status='billed' AND app.finalization_key=p_finalization_key THEN RETURN jsonb_build_object('id',app.id,'status','billed','idempotent',true); END IF;
  IF app.status<>'approved' THEN RAISE EXCEPTION 'Only an Approved Pay App can be marked Billed.'; END IF;
  IF EXISTS(SELECT 1 FROM public.job_pay_application_lines WHERE pay_application_id=app.id AND (previous_billed_amount+final_current_amount<0 OR previous_billed_amount+final_current_amount>scheduled_value_amount)) THEN RAISE EXCEPTION 'A scheduled line exceeds its available range.'; END IF;
  IF EXISTS(SELECT 1 FROM public.job_pay_application_change_orders WHERE pay_application_id=app.id AND (previous_billed_amount+final_current_amount<LEAST(0,approved_value) OR previous_billed_amount+final_current_amount>GREATEST(0,approved_value))) THEN RAISE EXCEPTION 'A Change Order exceeds its approved range.'; END IF;
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
    retainage_amount=round((original_current+co_current)*retainage_percent/100,2),remaining_contract_value=app.current_contract_value-(prior_total+original_current+co_current),updated_at=NOW(),updated_by=actor WHERE id=app.id;
  RETURN jsonb_build_object('id',app.id,'status','billed','idempotent',false);
END; $$;

REVOKE ALL ON FUNCTION public.job_billing_can_view(UUID),public.get_job_pay_applications(UUID),
  public.save_job_pay_application_header(UUID,DATE,DATE,NUMERIC,TEXT,UUID),
  public.save_job_pay_application_line(UUID,NUMERIC,NUMERIC,TEXT),
  public.save_job_pay_application_change_order(UUID,NUMERIC,NUMERIC,TEXT),
  public.sync_job_pay_application_change_orders(UUID),
  public.create_job_pay_application_correction(UUID,TEXT,TEXT),public.void_job_pay_application(UUID,TEXT),
  public.finalize_job_pay_application(UUID,UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.job_billing_can_view(UUID),public.get_job_pay_applications(UUID),
  public.save_job_pay_application_header(UUID,DATE,DATE,NUMERIC,TEXT,UUID),
  public.save_job_pay_application_line(UUID,NUMERIC,NUMERIC,TEXT),
  public.save_job_pay_application_change_order(UUID,NUMERIC,NUMERIC,TEXT),
  public.sync_job_pay_application_change_orders(UUID),
  public.create_job_pay_application_correction(UUID,TEXT,TEXT),public.void_job_pay_application(UUID,TEXT),
  public.finalize_job_pay_application(UUID,UUID,TEXT) TO authenticated;
