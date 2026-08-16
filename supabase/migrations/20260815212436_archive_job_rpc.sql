CREATE OR REPLACE FUNCTION public.archive_job(
  p_job_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  target_job public.jobs%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
  reason_text TEXT := NULLIF(BTRIM(p_reason), '');
  archived_by_text TEXT;
BEGIN
  IF jwt_subject IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO target_job
  FROM public.jobs
  WHERE id = p_job_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found or already archived'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
    AND up.division = target_job.division
    AND COALESCE((
      public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
        ->> 'can_manage_jobs'
    )::BOOLEAN, FALSE) IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You do not have permission to archive this job'
      USING ERRCODE = '42501';
  END IF;

  archived_by_text := jwt_subject;

  UPDATE public.jobs
  SET archived_at = now_stamp,
      archived_by = archived_by_text,
      archive_reason = reason_text
  WHERE id = p_job_id;

  INSERT INTO public.change_logs (
    user_id,
    user_name,
    table_name,
    record_id,
    action,
    before_data,
    after_data,
    note,
    created_at
  )
  VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'jobs',
    p_job_id::TEXT,
    'archive',
    jsonb_strip_nulls(to_jsonb(target_job)),
    jsonb_strip_nulls(
      to_jsonb(target_job)
      || jsonb_build_object(
        'archived_at', now_stamp,
        'archived_by', archived_by_text,
        'archive_reason', reason_text
      )
    ),
    reason_text,
    now_stamp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_job(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_job(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_job(UUID, TEXT) TO authenticated;
