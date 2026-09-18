-- Remove the invalid job_revenue_lines.updated_by assignment from the
-- development Pay App deletion reconciliation RPC.

CREATE OR REPLACE FUNCTION public.developer_delete_job_pay_application(
  p_pay_app_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  app public.job_pay_applications%rowtype;
  actor text:=auth.jwt()->>'sub';
  actor_name text;
  reason text:=NULLIF(btrim(COALESCE(p_reason,'')), '');
  backup jsonb;
  revenue_before jsonb;
  revenue_after jsonb;
BEGIN
  SELECT * INTO app
  FROM public.job_pay_applications
  WHERE id=p_pay_app_id
  FOR UPDATE;

  IF app.id IS NULL OR actor IS NULL OR public.current_user_can_correct_job_billing_data(app.job_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer Data Correction permission is required' USING ERRCODE='42501';
  END IF;
  IF reason IS NULL OR length(reason)<3 THEN
    RAISE EXCEPTION 'Enter a deletion reason.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.job_pay_applications newer
    WHERE newer.job_id=app.job_id
      AND newer.pay_app_number>app.pay_app_number
  ) THEN
    RAISE EXCEPTION 'Delete newer Pay Apps first. Development corrections must be removed in reverse billing order.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.job_pay_applications linked
    WHERE linked.correction_of_id=app.id
  ) THEN
    RAISE EXCEPTION 'Delete the linked correction or reversal before deleting its source Pay App.' USING ERRCODE='23503';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb)
  INTO revenue_before
  FROM public.job_revenue_lines r
  WHERE r.job_id=app.job_id;

  SELECT to_jsonb(app)||jsonb_build_object(
    'lines',COALESCE((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)
      FROM public.job_pay_application_lines l
      WHERE l.pay_application_id=app.id
    ),'[]'::jsonb),
    'change_orders',COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
      FROM public.job_pay_application_change_orders c
      WHERE c.pay_application_id=app.id
    ),'[]'::jsonb),
    'job_revenue_lines_before',revenue_before,
    'operation','developer_pay_app_deletion'
  ) INTO backup;

  DELETE FROM public.job_pay_applications WHERE id=app.id;

  UPDATE public.job_revenue_lines revenue
  SET billed_to_date_amount=COALESCE(history.billed_amount,0),
      billing_locked_at=CASE WHEN history.has_billed_history THEN COALESCE(revenue.billing_locked_at,NOW()) ELSE NULL END,
      updated_at=NOW()
  FROM (
    SELECT source.id AS sov_line_id,
      COALESCE(sum(line.final_current_amount) FILTER (WHERE pay_app.status='billed'),0) AS billed_amount,
      COALESCE(bool_or(pay_app.status='billed'),false) AS has_billed_history
    FROM public.job_revenue_lines source
    LEFT JOIN public.job_pay_application_lines line ON line.sov_line_id=source.id
    LEFT JOIN public.job_pay_applications pay_app ON pay_app.id=line.pay_application_id
    WHERE source.job_id=app.job_id
    GROUP BY source.id
  ) history
  WHERE revenue.id=history.sov_line_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb)
  INTO revenue_after
  FROM public.job_revenue_lines r
  WHERE r.job_id=app.job_id;

  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor)
  INTO actor_name
  FROM public.user_permissions
  WHERE clerk_user_id=actor
  LIMIT 1;

  INSERT INTO public.change_logs(
    user_id,user_name,table_name,record_id,action,before_data,after_data,note
  ) VALUES (
    actor,actor_name,'job_pay_applications',app.id::text,'delete',backup,
    jsonb_build_object(
      'deleted',true,
      'deleted_status',app.status,
      'job_revenue_lines_after',revenue_after,
      'developer_data_correction',true
    ),
    reason
  );

  RETURN jsonb_build_object(
    'deleted',true,
    'id',app.id,
    'pay_app_number',app.pay_app_number,
    'deleted_status',app.status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.developer_delete_job_pay_application(uuid,text)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.developer_delete_job_pay_application(uuid,text)
TO authenticated;

NOTIFY pgrst,'reload schema';
