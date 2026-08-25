CREATE TABLE IF NOT EXISTS public.job_user_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.user_permissions(clerk_user_id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ,
  assigned_by TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS job_user_assignments_one_active_per_job_user
  ON public.job_user_assignments(job_id, user_id)
  WHERE unassigned_at IS NULL;
CREATE INDEX IF NOT EXISTS job_user_assignments_active_user_idx
  ON public.job_user_assignments(user_id, assigned_at DESC)
  WHERE unassigned_at IS NULL;

ALTER TABLE public.job_user_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_user_assignments FROM anon;
GRANT SELECT ON public.job_user_assignments TO authenticated;

CREATE POLICY job_user_assignments_read_self_or_manager
  ON public.job_user_assignments
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.jwt() ->> 'sub')
    OR public.current_user_can_edit_job(job_id, 'can_manage_jobs')
  );

CREATE OR REPLACE FUNCTION public.read_job_assignment_directory(p_job_id UUID)
RETURNS TABLE (
  user_id TEXT,
  display_name TEXT,
  email TEXT,
  role TEXT,
  division TEXT,
  assignment_id UUID,
  assigned_at TIMESTAMPTZ,
  note TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_job_id IS NULL OR NOT public.current_user_can_edit_job(p_job_id, 'can_manage_jobs') THEN
    RAISE EXCEPTION 'job management permission is required to manage assignments' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    up.clerk_user_id,
    up.display_name,
    up.email,
    up.role,
    up.division,
    assignment.id,
    assignment.assigned_at,
    assignment.note
  FROM public.user_permissions up
  LEFT JOIN public.job_user_assignments assignment
    ON assignment.user_id = up.clerk_user_id
   AND assignment.job_id = p_job_id
   AND assignment.unassigned_at IS NULL
  WHERE up.is_active = TRUE
    AND (up.division IS NULL OR public.current_user_can_read_division(up.division))
  ORDER BY COALESCE(NULLIF(up.display_name, ''), NULLIF(up.email, ''), up.clerk_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_job_user_assignment(
  p_job_id UUID,
  p_user_id TEXT,
  p_is_assigned BOOLEAN,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  normalized_user_id TEXT := NULLIF(trim(COALESCE(p_user_id, '')), '');
  normalized_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  caller public.user_permissions%ROWTYPE;
  target public.user_permissions%ROWTYPE;
  active_assignment public.job_user_assignments%ROWTYPE;
BEGIN
  IF p_job_id IS NULL OR normalized_user_id IS NULL OR normalized_reason IS NULL THEN
    RAISE EXCEPTION 'job, user, and reason are required' USING ERRCODE = '22004';
  END IF;

  IF NOT public.current_user_can_edit_job(p_job_id, 'can_manage_jobs') THEN
    RAISE EXCEPTION 'job management permission is required to change assignments' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id = jwt_subject AND is_active = TRUE LIMIT 1;
  SELECT * INTO target FROM public.user_permissions WHERE clerk_user_id = normalized_user_id AND is_active = TRUE LIMIT 1;
  IF NOT FOUND OR (target.division IS NOT NULL AND NOT public.current_user_can_read_division(target.division)) THEN
    RAISE EXCEPTION 'user is not available in your approved scope' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO active_assignment
  FROM public.job_user_assignments
  WHERE job_id = p_job_id AND user_id = normalized_user_id AND unassigned_at IS NULL
  FOR UPDATE;

  IF p_is_assigned THEN
    IF active_assignment.id IS NULL THEN
      INSERT INTO public.job_user_assignments (job_id, user_id, assigned_by, note)
      VALUES (p_job_id, normalized_user_id, jwt_subject, normalized_reason)
      RETURNING * INTO active_assignment;

      INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, after_data, note)
      VALUES (jwt_subject, COALESCE(caller.display_name, caller.email, jwt_subject), 'job_user_assignments', active_assignment.id::TEXT, 'create', to_jsonb(active_assignment), normalized_reason);
    END IF;
  ELSIF active_assignment.id IS NOT NULL THEN
    UPDATE public.job_user_assignments
    SET unassigned_at = NOW(), updated_at = NOW(), note = normalized_reason
    WHERE id = active_assignment.id
    RETURNING * INTO active_assignment;

    INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note)
    VALUES (jwt_subject, COALESCE(caller.display_name, caller.email, jwt_subject), 'job_user_assignments', active_assignment.id::TEXT, 'archive', jsonb_build_object('assigned_at', active_assignment.assigned_at), to_jsonb(active_assignment), normalized_reason);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_my_vehicle_assignments(p_limit INTEGER DEFAULT 25)
RETURNS TABLE (
  assignment_id BIGINT,
  vehicle_id UUID,
  vehicle_label TEXT,
  assigned_at TIMESTAMPTZ,
  unassigned_at TIMESTAMPTZ,
  assigned_by_label TEXT,
  note TEXT,
  is_active BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    va.id,
    v.id,
    COALESCE(NULLIF(v.display_name, ''), NULLIF(v.vehicle_number, ''), NULLIF(v.name, ''), v.id::TEXT),
    va.assigned_at,
    va.unassigned_at,
    COALESCE(NULLIF(assigner.display_name, ''), NULLIF(assigner.email, ''), va.assigned_by),
    va.note,
    va.unassigned_at IS NULL
  FROM public.vehicle_assignments va
  JOIN public.vehicles v ON v.id = va.vehicle_id
  LEFT JOIN public.user_permissions assigner ON assigner.clerk_user_id = va.assigned_by
  WHERE va.user_id = (SELECT auth.jwt() ->> 'sub')
  ORDER BY va.unassigned_at IS NULL DESC, va.assigned_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));
$$;

REVOKE ALL ON FUNCTION public.read_job_assignment_directory(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_job_assignment_directory(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.read_job_assignment_directory(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.set_job_user_assignment(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_job_user_assignment(UUID, TEXT, BOOLEAN, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_job_user_assignment(UUID, TEXT, BOOLEAN, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.read_my_vehicle_assignments(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_my_vehicle_assignments(INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.read_my_vehicle_assignments(INTEGER) FROM anon;
