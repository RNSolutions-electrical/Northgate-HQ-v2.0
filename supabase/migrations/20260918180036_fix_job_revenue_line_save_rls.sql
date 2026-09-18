-- Route SOV line saves through one job-aware, permission-checked transaction.
-- Direct table RLS remains enabled and unchanged.

CREATE OR REPLACE FUNCTION public.save_job_revenue_line(
  p_job_id uuid,
  p_revenue_line_id uuid,
  p_sov_line text,
  p_description text,
  p_scheduled_value_amount numeric,
  p_approved_change_amount numeric,
  p_billed_to_date_amount numeric,
  p_note text,
  p_is_protected_financial boolean,
  p_change_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  actor_name text;
  target public.job_revenue_lines%rowtype;
  saved public.job_revenue_lines%rowtype;
  before_snapshot jsonb;
  action_name text;
  audit_note text;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authenticated Clerk JWT is required' USING ERRCODE='28000';
  END IF;
  IF NOT public.current_user_can_edit_job(p_job_id, 'can_approve_budget') THEN
    RAISE EXCEPTION 'Billing management permission is required' USING ERRCODE='42501';
  END IF;
  IF NULLIF(btrim(COALESCE(p_description,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Enter an SOV description before saving.' USING ERRCODE='22023';
  END IF;
  IF p_scheduled_value_amount IS NULL OR p_scheduled_value_amount < 0
    OR p_scheduled_value_amount IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    OR p_approved_change_amount IS NULL
    OR p_approved_change_amount IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    OR p_billed_to_date_amount IS NULL OR p_billed_to_date_amount < 0
    OR p_billed_to_date_amount IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) THEN
    RAISE EXCEPTION 'SOV amounts must contain valid financial values.' USING ERRCODE='22023';
  END IF;

  IF p_revenue_line_id IS NULL THEN
    action_name := 'create';
    INSERT INTO public.job_revenue_lines(
      job_id,division,sov_line,description,scheduled_value_amount,
      approved_change_amount,billed_to_date_amount,note,created_by,is_protected_financial
    )
    SELECT p_job_id,j.division,NULLIF(btrim(COALESCE(p_sov_line,'')),''),btrim(p_description),
      p_scheduled_value_amount,p_approved_change_amount,p_billed_to_date_amount,
      NULLIF(btrim(COALESCE(p_note,'')),''),actor,COALESCE(p_is_protected_financial,false)
    FROM public.jobs j
    WHERE j.id=p_job_id AND j.archived_at IS NULL
    RETURNING * INTO saved;
    IF saved.id IS NULL THEN
      RAISE EXCEPTION 'Active job not found' USING ERRCODE='P0002';
    END IF;
  ELSE
    action_name := 'update';
    SELECT * INTO target
    FROM public.job_revenue_lines
    WHERE id=p_revenue_line_id AND job_id=p_job_id AND archived_at IS NULL
    FOR UPDATE;
    IF target.id IS NULL THEN
      RAISE EXCEPTION 'Active SOV line not found' USING ERRCODE='P0002';
    END IF;
    before_snapshot := to_jsonb(target);
    UPDATE public.job_revenue_lines
    SET sov_line=NULLIF(btrim(COALESCE(p_sov_line,'')),''),
      description=btrim(p_description),
      scheduled_value_amount=p_scheduled_value_amount,
      approved_change_amount=p_approved_change_amount,
      billed_to_date_amount=p_billed_to_date_amount,
      note=NULLIF(btrim(COALESCE(p_note,'')),''),
      is_protected_financial=COALESCE(p_is_protected_financial,false)
    WHERE id=target.id
    RETURNING * INTO saved;
  END IF;

  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor)
  INTO actor_name FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1;
  audit_note := COALESCE(NULLIF(btrim(COALESCE(p_change_reason,'')),''),
    format('Revenue line %s %s.',saved.description,CASE WHEN action_name='create' THEN 'created' ELSE 'updated' END));
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,actor_name,'job_revenue_lines',saved.id::text,action_name,before_snapshot,to_jsonb(saved),audit_note);

  RETURN to_jsonb(saved);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_job_revenue_line(uuid,uuid,text,text,numeric,numeric,numeric,text,boolean,text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_job_revenue_line(uuid,uuid,text,text,numeric,numeric,numeric,text,boolean,text)
TO authenticated;
