-- A signed-in user may read only their own safe employee profile fields.
-- Directory and pre-hire records remain management-only workflows.
CREATE OR REPLACE FUNCTION public.read_current_employee_profile()
RETURNS TABLE (
  clerk_user_id TEXT,
  display_name TEXT,
  email TEXT,
  role TEXT,
  division TEXT,
  job_title TEXT,
  phone TEXT,
  current_vehicle TEXT,
  vehicle_assigned_at TIMESTAMPTZ,
  has_linked_employee_profile BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
BEGIN
  IF actor_id IS NULL OR length(BTRIM(actor_id)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = actor_id
      AND up.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    up.clerk_user_id,
    COALESCE(NULLIF(ep.display_name, ''), NULLIF(up.display_name, ''), NULLIF(up.email, ''), up.clerk_user_id) AS display_name,
    COALESCE(ep.email, up.email) AS email,
    up.role,
    COALESCE(ep.division, up.division) AS division,
    ep.job_title,
    ep.phone,
    vehicle.vehicle_label AS current_vehicle,
    vehicle.assigned_at AS vehicle_assigned_at,
    ep.id IS NOT NULL AS has_linked_employee_profile
  FROM public.user_permissions up
  LEFT JOIN public.employee_profiles ep
    ON ep.clerk_user_id = up.clerk_user_id
   AND ep.archived_at IS NULL
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(NULLIF(v.display_name, ''), NULLIF(v.vehicle_number, ''), NULLIF(v.name, ''), v.id::TEXT) AS vehicle_label,
      va.assigned_at
    FROM public.vehicle_assignments va
    JOIN public.vehicles v
      ON v.id = va.vehicle_id
     AND v.is_active = TRUE
    WHERE va.user_id = up.clerk_user_id
      AND va.unassigned_at IS NULL
    ORDER BY va.assigned_at DESC, va.id DESC
    LIMIT 1
  ) vehicle ON TRUE
  WHERE up.clerk_user_id = actor_id
    AND up.is_active = TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.read_current_employee_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_current_employee_profile() TO authenticated;
