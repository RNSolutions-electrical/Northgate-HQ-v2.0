CREATE OR REPLACE FUNCTION get_or_create_user_permissions(
  p_clerk_user_id TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS TABLE (
  clerk_user_id TEXT,
  display_name TEXT,
  email TEXT,
  role TEXT,
  division TEXT,
  effective_permissions JSONB,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_subject TEXT;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_clerk_user_id IS NULL OR length(trim(p_clerk_user_id)) = 0 THEN
    RAISE EXCEPTION 'clerk_user_id is required';
  END IF;

  IF p_clerk_user_id <> jwt_subject THEN
    RAISE EXCEPTION 'permission lookup user mismatch';
  END IF;

  INSERT INTO public.user_permissions AS up_insert (
    clerk_user_id,
    display_name,
    email,
    role,
    division,
    permission_overrides,
    is_active
  )
  VALUES (
    p_clerk_user_id,
    p_display_name,
    p_email,
    'User',
    NULL,
    '{}'::jsonb,
    TRUE
  )
  ON CONFLICT ON CONSTRAINT user_permissions_clerk_user_id_key DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, up_insert.display_name),
        email = COALESCE(EXCLUDED.email, up_insert.email),
        updated_at = NOW();

  RETURN QUERY
  SELECT up.clerk_user_id,
         up.display_name,
         up.email,
         up.role,
         up.division,
         default_permissions_for_role(up.role) || up.permission_overrides AS effective_permissions,
         up.is_active
  FROM public.user_permissions up
  WHERE up.clerk_user_id = p_clerk_user_id
    AND up.is_active = TRUE;
END;
$$;

REVOKE ALL ON FUNCTION get_or_create_user_permissions(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_or_create_user_permissions(TEXT, TEXT, TEXT) TO anon, authenticated;
