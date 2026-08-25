CREATE OR REPLACE FUNCTION public.read_pending_employee_profiles(p_limit INTEGER DEFAULT 200)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  email TEXT,
  role TEXT,
  division TEXT,
  job_title TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller public.user_permissions%ROWTYPE;
BEGIN
  SELECT * INTO caller
  FROM public.user_permissions AS up
  WHERE up.clerk_user_id = (auth.jwt() ->> 'sub')
    AND up.is_active
  LIMIT 1;

  IF NOT FOUND
    OR COALESCE(
      (public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides) ->> 'can_manage_employees')::BOOLEAN,
      FALSE
    ) IS NOT TRUE THEN
    RAISE EXCEPTION 'employee management permission is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ep.id,
    ep.display_name,
    ep.email,
    ep.role,
    ep.division,
    ep.job_title,
    ep.phone,
    ep.created_at
  FROM public.employee_profiles AS ep
  WHERE ep.clerk_user_id IS NULL
  ORDER BY ep.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
END;
$$;

REVOKE ALL ON FUNCTION public.read_pending_employee_profiles(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_pending_employee_profiles(INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.read_pending_employee_profiles(INTEGER) FROM anon;
