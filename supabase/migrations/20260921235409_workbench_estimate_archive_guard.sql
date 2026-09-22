-- Allow authenticated soft-archive without weakening Workbench editing guards.
CREATE OR REPLACE FUNCTION public.guard_workbench_header()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.editor_version IS DISTINCT FROM OLD.editor_version THEN
    RAISE EXCEPTION 'Existing estimates cannot switch editors' USING ERRCODE = '22023';
  END IF;

  -- Only the authorized archive RPC establishes this item-specific context.
  -- It cannot be reused to edit contents, approval metadata or version lineage.
  IF TG_OP = 'UPDATE' AND NEW.editor_version = 2
     AND nullif(current_setting('northgate.workbench_archive', true), '') = OLD.id::text
     AND OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL
     AND NEW.status = 'archived'
     AND NEW.archived_by = auth.jwt()->>'sub'
     AND nullif(btrim(NEW.archive_reason), '') IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['archived_at','archived_by','archive_reason','status','updated_at'])
       IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['archived_at','archived_by','archive_reason','status','updated_at']) THEN
    RETURN NEW;
  END IF;

  IF NEW.editor_version = 2
     AND COALESCE(current_setting('northgate.workbench_save', true), '') <> 'yes'
     AND COALESCE(current_setting('northgate.workbench_approval', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'Use the authenticated Workbench draft or approval workflow' USING ERRCODE = '42501';
  END IF;

  IF NEW.editor_version = 2
     AND NEW.status <> 'draft'
     AND COALESCE(current_setting('northgate.workbench_approval', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'Use the Workbench approval workflow' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_workbench_header() FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.archive_estimate(
  p_estimate_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  target_estimate public.estimates%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
  reason_text TEXT := coalesce(nullif(btrim(p_reason), ''), 'Automatic audit: archive estimate.');
  archived_by_text TEXT;
  previous_archive_context text := current_setting('northgate.workbench_archive', true);
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF p_estimate_id IS NULL THEN
    RAISE EXCEPTION 'estimate id is required'
      USING ERRCODE = '22004';
  END IF;

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO target_estimate
  FROM public.estimates
  WHERE id = p_estimate_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimate not found or already archived'
      USING ERRCODE = 'P0002';
  END IF;

  IF public.current_user_can_edit_division(target_estimate.division, 'can_estimate') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to archive this estimate'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Active user permission record is required'
      USING ERRCODE = '42501';
  END IF;

  caller_permissions := public.effective_permissions_for_user(
    caller.role,
    caller.division,
    caller.permission_overrides
  );

  IF COALESCE((caller_permissions ->> 'can_archive_records')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'can_archive_records permission is required to archive an estimate'
      USING ERRCODE = '42501';
  END IF;

  archived_by_text := jwt_subject;

  PERFORM set_config('northgate.workbench_archive', p_estimate_id::text, true);

  UPDATE public.estimates
  SET archived_at = now_stamp,
      archived_by = archived_by_text,
      archive_reason = reason_text,
      status = 'archived'
  WHERE id = p_estimate_id;

  PERFORM set_config('northgate.workbench_archive', coalesce(previous_archive_context, ''), true);

  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at)
  VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'estimates',
    p_estimate_id::TEXT,
    'archive',
    jsonb_strip_nulls(to_jsonb(target_estimate)),
    jsonb_strip_nulls(to_jsonb(target_estimate) || jsonb_build_object(
      'archived_at', now_stamp,
      'archived_by', archived_by_text,
      'archive_reason', reason_text,
      'status', 'archived'
    )),
    reason_text,
    now_stamp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_estimate(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_estimate(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_estimate(UUID, TEXT) FROM anon;

COMMENT ON FUNCTION public.archive_estimate(UUID, TEXT) IS
  'Soft-archive an active estimate with automatic audit history. Requires estimate edit scope plus can_archive_records; preserves Workbench contents and approval snapshots.';

NOTIFY pgrst, 'reload schema';
