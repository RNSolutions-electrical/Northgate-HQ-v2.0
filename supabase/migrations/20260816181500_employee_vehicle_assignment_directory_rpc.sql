CREATE OR REPLACE FUNCTION public.read_employee_vehicle_assignment_directory(
  p_user_id TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (
  assignment_id BIGINT,
  user_id TEXT,
  user_label TEXT,
  user_email TEXT,
  vehicle_id UUID,
  vehicle_label TEXT,
  assigned_at TIMESTAMPTZ,
  unassigned_at TIMESTAMPTZ,
  assigned_by TEXT,
  assigned_by_label TEXT,
  note TEXT,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  normalized_user_id TEXT;
  bounded_limit INTEGER;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required';
  END IF;

  caller_permissions := public.effective_permissions_for_user(
    caller.role,
    caller.division,
    caller.permission_overrides
  );

  IF COALESCE((caller_permissions ->> 'can_manage_employees')::BOOLEAN, FALSE) IS NOT TRUE
     AND COALESCE((caller_permissions ->> 'can_manage_vehicles')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'employee or vehicle management permission is required to read employee vehicle assignments';
  END IF;

  normalized_user_id := NULLIF(trim(COALESCE(p_user_id, '')), '');
  bounded_limit := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 1000);

  RETURN QUERY
  SELECT
    va.id AS assignment_id,
    va.user_id,
    COALESCE(NULLIF(assigned_user.display_name, ''), NULLIF(assigned_user.email, ''), va.user_id) AS user_label,
    assigned_user.email AS user_email,
    va.vehicle_id,
    COALESCE(NULLIF(v.display_name, ''), NULLIF(v.vehicle_number, ''), NULLIF(v.name, ''), v.id::TEXT) AS vehicle_label,
    va.assigned_at,
    va.unassigned_at,
    va.assigned_by,
    COALESCE(NULLIF(assigner.display_name, ''), NULLIF(assigner.email, ''), va.assigned_by) AS assigned_by_label,
    va.note,
    va.unassigned_at IS NULL AS is_active
  FROM public.vehicle_assignments va
  JOIN public.vehicles v
    ON v.id = va.vehicle_id
   AND v.is_active = TRUE
  LEFT JOIN public.user_permissions assigned_user
    ON assigned_user.clerk_user_id = va.user_id
   AND assigned_user.is_active = TRUE
  LEFT JOIN public.user_permissions assigner
    ON assigner.clerk_user_id = va.assigned_by
   AND assigner.is_active = TRUE
  WHERE (normalized_user_id IS NULL OR va.user_id = normalized_user_id)
    AND public.current_user_can_read_division(assigned_user.division)
  ORDER BY va.unassigned_at IS NULL DESC,
           va.assigned_at DESC,
           va.id DESC
  LIMIT bounded_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.read_employee_vehicle_assignment_directory(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_employee_vehicle_assignment_directory(TEXT, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.read_employee_vehicle_assignment_directory(TEXT, INTEGER) FROM anon;

COMMENT ON FUNCTION public.read_employee_vehicle_assignment_directory(TEXT, INTEGER) IS
  'Read-only employee-to-vehicle assignment directory for employee or vehicle managers. Results follow employee division visibility.';
