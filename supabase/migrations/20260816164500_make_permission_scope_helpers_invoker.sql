CREATE OR REPLACE FUNCTION public.current_user_can_read_division(
  p_division TEXT,
  p_required_permission TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  required_ok BOOLEAN := TRUE;
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RETURN FALSE;
  END IF;

  caller_permissions := public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides);

  IF p_required_permission IS NOT NULL THEN
    required_ok := COALESCE((caller_permissions ->> p_required_permission)::BOOLEAN, FALSE);
  END IF;

  RETURN required_ok IS TRUE
    AND (
      COALESCE((caller_permissions ->> 'can_view_all_divisions')::BOOLEAN, FALSE) IS TRUE
      OR (p_division IS NOT NULL AND caller.division = p_division)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_edit_division(
  p_division TEXT,
  p_required_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RETURN FALSE;
  END IF;

  IF p_required_permission IS NULL OR length(trim(p_required_permission)) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RETURN FALSE;
  END IF;

  caller_permissions := public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides);

  RETURN COALESCE((caller_permissions ->> p_required_permission)::BOOLEAN, FALSE) IS TRUE
    AND (
      caller.role IN ('Developer', 'Manager')
      OR (p_division IS NOT NULL AND caller.division = p_division)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_can_read_division(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_can_read_division(TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_can_read_division(TEXT, TEXT) FROM anon;

REVOKE ALL ON FUNCTION public.current_user_can_edit_division(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_can_edit_division(TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_can_edit_division(TEXT, TEXT) FROM anon;
