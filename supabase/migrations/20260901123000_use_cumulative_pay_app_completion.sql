-- The retained legacy column name additional_percent now records the cumulative
-- completion target for compatibility with existing RPC callers and snapshots.

CREATE OR REPLACE FUNCTION public.save_job_pay_application_line(p_line_id UUID, p_additional_percent NUMERIC, p_override_amount NUMERIC DEFAULT NULL, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE line public.job_pay_application_lines%ROWTYPE; app public.job_pay_applications%ROWTYPE; target_amount NUMERIC(14,2); amount NUMERIC(14,2); effective_percent NUMERIC(12,6); reason TEXT;
BEGIN
  SELECT * INTO line FROM public.job_pay_application_lines WHERE id=p_line_id FOR UPDATE;
  SELECT * INTO app FROM public.job_pay_applications WHERE id=line.pay_application_id FOR UPDATE;
  IF app.id IS NULL OR NOT public.job_billing_can_manage(app.job_id) OR app.status<>'draft' OR app.pay_app_kind='reversal' THEN RAISE EXCEPTION 'Only authorized editable Draft Pay App lines can be changed' USING ERRCODE='42501'; END IF;
  IF COALESCE(p_additional_percent,0)<0 OR COALESCE(p_additional_percent,0)>100 THEN RAISE EXCEPTION 'Percentage complete must be between zero and 100 percent.'; END IF;
  reason := NULLIF(BTRIM(COALESCE(p_reason,'')), '');
  target_amount := round(line.scheduled_value_amount*COALESCE(p_additional_percent,0)/100,2);
  amount := COALESCE(p_override_amount,target_amount-line.previous_billed_amount);
  IF line.previous_billed_amount+amount<0 OR line.previous_billed_amount+amount>line.scheduled_value_amount THEN RAISE EXCEPTION 'Current billing must leave the line between zero and its scheduled value.'; END IF;
  IF (p_override_amount IS NOT NULL OR app.pay_app_kind='correction') AND reason IS NULL THEN RAISE EXCEPTION 'A reason is required for an override or correction.'; END IF;
  effective_percent := CASE WHEN line.scheduled_value_amount=0 THEN 0 ELSE round((line.previous_billed_amount+amount)*100/line.scheduled_value_amount,6) END;
  UPDATE public.job_pay_application_lines SET additional_percent=effective_percent,calculated_current_amount=target_amount-line.previous_billed_amount,final_current_amount=amount,override_reason=CASE WHEN p_override_amount IS NULL AND app.pay_app_kind='standard' THEN NULL ELSE reason END,overridden_by=CASE WHEN p_override_amount IS NULL AND app.pay_app_kind='standard' THEN NULL ELSE auth.jwt()->>'sub' END,overridden_at=CASE WHEN p_override_amount IS NULL AND app.pay_app_kind='standard' THEN NULL ELSE NOW() END,updated_at=NOW() WHERE id=line.id;
END; $$;

CREATE OR REPLACE FUNCTION public.save_job_pay_application_change_order(p_line_id UUID, p_additional_percent NUMERIC, p_override_amount NUMERIC DEFAULT NULL, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
END; $$;

REVOKE ALL ON FUNCTION public.save_job_pay_application_line(UUID,NUMERIC,NUMERIC,TEXT), public.save_job_pay_application_change_order(UUID,NUMERIC,NUMERIC,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_job_pay_application_line(UUID,NUMERIC,NUMERIC,TEXT), public.save_job_pay_application_change_order(UUID,NUMERIC,NUMERIC,TEXT) TO authenticated;
