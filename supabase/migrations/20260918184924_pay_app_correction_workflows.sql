-- Practical Pay App corrections without weakening immutable billed history.

CREATE OR REPLACE FUNCTION public.current_user_can_correct_job_billing_data(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions u
    WHERE u.clerk_user_id=auth.jwt()->>'sub'
      AND u.is_active
      AND u.role='Developer'
  )
  AND public.current_user_has_developer_access() IS TRUE
  AND COALESCE((
    SELECT bool_and(o.granted)
    FROM public.user_permission_overrides o
    WHERE o.user_id=auth.jwt()->>'sub'
      AND o.permission_flag='can_developer_data_correction'
      AND o.is_active
  ),false)
  AND public.current_user_can_edit_job(p_job_id,'can_approve_budget') IS TRUE
$function$;

CREATE OR REPLACE FUNCTION public.set_job_pay_application_status(p_pay_app_id uuid,p_status text,p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
$function$;

CREATE OR REPLACE FUNCTION public.void_job_pay_application(p_pay_app_id uuid,p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  app public.job_pay_applications%rowtype;
  saved public.job_pay_applications%rowtype;
  actor text:=auth.jwt()->>'sub';
  actor_name text;
  reason text:=NULLIF(btrim(COALESCE(p_reason,'')),'');
BEGIN
  SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;
  IF app.id IS NULL OR actor IS NULL OR NOT public.job_billing_can_manage(app.job_id) OR app.status NOT IN('draft','approved') THEN
    RAISE EXCEPTION 'Only an authorized Draft or Approved Pay App can be voided' USING ERRCODE='42501';
  END IF;
  IF app.status='approved' AND reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to void an Approved Pay App.' USING ERRCODE='22023';
  END IF;
  reason:=COALESCE(reason,'Draft discarded before approval.');
  UPDATE public.job_pay_applications
  SET status='voided',voided_at=NOW(),voided_by=actor,void_reason=reason,updated_at=NOW(),updated_by=actor
  WHERE id=app.id RETURNING * INTO saved;
  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor) INTO actor_name
  FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,actor_name,'job_pay_applications',app.id::text,'update',to_jsonb(app),to_jsonb(saved),reason);
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_job_pay_application(p_pay_app_id uuid,p_finalization_key uuid,p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
$function$;

CREATE OR REPLACE FUNCTION public.finalize_historical_job_pay_application(
  p_pay_app_id uuid,p_billed_date date,p_reason text,p_certification text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  app public.job_pay_applications%rowtype;
  saved public.job_pay_applications%rowtype;
  actor text:=auth.jwt()->>'sub';
  actor_name text;
  reason text:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  result jsonb;
  historical_at timestamptz;
BEGIN
  SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;
  IF app.id IS NULL OR actor IS NULL OR public.current_user_can_correct_job_billing_data(app.job_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer Data Correction permission is required' USING ERRCODE='42501';
  END IF;
  IF app.status<>'draft' OR app.pay_app_kind<>'standard' THEN
    RAISE EXCEPTION 'Only a standard Draft Pay App can be recorded as historical billing.' USING ERRCODE='22023';
  END IF;
  IF p_billed_date IS NULL OR p_billed_date>CURRENT_DATE THEN
    RAISE EXCEPTION 'Enter the actual historical billing date.' USING ERRCODE='22023';
  END IF;
  IF p_billed_date<app.billing_period_end THEN
    RAISE EXCEPTION 'The billed date cannot precede the billing period end.' USING ERRCODE='22023';
  END IF;
  IF reason IS NULL OR length(reason)<3 THEN
    RAISE EXCEPTION 'Enter a reason for the historical billing correction.' USING ERRCODE='22023';
  END IF;
  IF lower(btrim(COALESCE(p_certification,'')))<>'i certify this matches the historical billing record' THEN
    RAISE EXCEPTION 'Enter the historical billing certification exactly.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.job_pay_applications h
    WHERE h.job_id=app.job_id AND h.status='billed' AND h.pay_app_number>app.pay_app_number
  ) THEN
    RAISE EXCEPTION 'Historical Pay Apps must be entered in billing order.' USING ERRCODE='22023';
  END IF;

  historical_at:=p_billed_date::timestamp+interval '12 hours';
  UPDATE public.job_pay_applications
  SET status='approved',approved_at=historical_at,approved_by=actor,
    approval_note=reason,updated_at=NOW(),updated_by=actor
  WHERE id=app.id;
  result:=public.finalize_job_pay_application(app.id,gen_random_uuid(),reason);
  UPDATE public.job_pay_applications
  SET approved_at=historical_at,billed_at=historical_at,updated_at=NOW(),updated_by=actor
  WHERE id=app.id RETURNING * INTO saved;

  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor) INTO actor_name
  FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,actor_name,'job_pay_applications',app.id::text,'update',to_jsonb(app),
    to_jsonb(saved)||jsonb_build_object('operation','historical_pay_app_finalization','certified',true),reason);
  RETURN result||jsonb_build_object('historical_billed_date',p_billed_date);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_unbilled_job_pay_application(p_pay_app_id uuid,p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  app public.job_pay_applications%rowtype;
  actor text:=auth.jwt()->>'sub';
  actor_name text;
  reason text:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  backup jsonb;
BEGIN
  SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;
  IF app.id IS NULL OR actor IS NULL OR public.current_user_can_correct_job_billing_data(app.job_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer Data Correction permission is required' USING ERRCODE='42501';
  END IF;
  IF app.status='billed' OR app.billed_at IS NOT NULL OR app.finalization_key IS NOT NULL THEN
    RAISE EXCEPTION 'Billed Pay Apps are immutable. Use a correction or reversal.' USING ERRCODE='22023';
  END IF;
  IF reason IS NULL OR length(reason)<3 THEN
    RAISE EXCEPTION 'Enter a deletion reason.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.job_pay_applications WHERE correction_of_id=app.id) THEN
    RAISE EXCEPTION 'This Pay App has linked correction history and cannot be deleted.' USING ERRCODE='23503';
  END IF;
  IF EXISTS(SELECT 1 FROM public.job_pay_applications WHERE job_id=app.job_id AND pay_app_number>app.pay_app_number) THEN
    RAISE EXCEPTION 'Delete newer unbilled Pay Apps first so numbering remains sequential.' USING ERRCODE='22023';
  END IF;
  SELECT to_jsonb(app)||jsonb_build_object(
    'lines',COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.job_pay_application_lines l WHERE l.pay_application_id=app.id),'[]'::jsonb),
    'change_orders',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.job_pay_application_change_orders c WHERE c.pay_application_id=app.id),'[]'::jsonb)
  ) INTO backup;
  DELETE FROM public.job_pay_applications WHERE id=app.id;
  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor) INTO actor_name
  FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,note)
  VALUES(actor,actor_name,'job_pay_applications',app.id::text,'delete',backup,reason);
  RETURN jsonb_build_object('deleted',true,'id',app.id,'pay_app_number',app.pay_app_number);
END;
$function$;

REVOKE ALL ON FUNCTION public.current_user_can_correct_job_billing_data(uuid),
  public.finalize_historical_job_pay_application(uuid,date,text,text),
  public.delete_unbilled_job_pay_application(uuid,text)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_correct_job_billing_data(uuid),
  public.finalize_historical_job_pay_application(uuid,date,text,text),
  public.delete_unbilled_job_pay_application(uuid,text)
TO authenticated;

REVOKE ALL ON FUNCTION public.set_job_pay_application_status(uuid,text,text),
  public.void_job_pay_application(uuid,text),
  public.finalize_job_pay_application(uuid,uuid,text)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_job_pay_application_status(uuid,text,text),
  public.void_job_pay_application(uuid,text),
  public.finalize_job_pay_application(uuid,uuid,text)
TO authenticated;

NOTIFY pgrst,'reload schema';
