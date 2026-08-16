CREATE OR REPLACE FUNCTION public.archive_job_schedule_item(
  p_schedule_item_id UUID,
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
  target_item public.job_schedule_items%ROWTYPE;
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
  INTO target_item
  FROM public.job_schedule_items
  WHERE id = p_schedule_item_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule item not found or already archived'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
    AND up.division = target_item.division
    AND COALESCE((
      public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
        ->> 'can_manage_jobs'
    )::BOOLEAN, FALSE) IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You do not have permission to archive this schedule item'
      USING ERRCODE = '42501';
  END IF;

  archived_by_text := jwt_subject;

  UPDATE public.job_schedule_items
  SET archived_at = now_stamp,
      archived_by = archived_by_text,
      archive_reason = reason_text
  WHERE id = p_schedule_item_id;

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
    'job_schedule_items',
    p_schedule_item_id::TEXT,
    'archive',
    jsonb_strip_nulls(to_jsonb(target_item)),
    jsonb_strip_nulls(
      to_jsonb(target_item)
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

REVOKE ALL ON FUNCTION public.archive_job_schedule_item(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_job_schedule_item(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_job_schedule_item(UUID, TEXT) TO authenticated;
