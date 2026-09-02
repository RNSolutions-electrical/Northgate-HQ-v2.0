-- Keep role/department updates auditable with an action accepted by change_logs.
-- The detailed profile change remains in table_name, before_data, and after_data.
CREATE OR REPLACE FUNCTION public.update_user_permission_profile(
  p_user_id TEXT,
  p_role TEXT,
  p_division TEXT,
  p_reason TEXT
)
RETURNS TABLE (user_id TEXT, role TEXT, division TEXT, effective_permissions JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor TEXT := auth.jwt() ->> 'sub';
  target public.user_permissions%ROWTYPE;
  caller public.user_permissions%ROWTYPE;
  prior JSONB;
  next_permissions JSONB;
  actor_name TEXT;
  allowed_roles TEXT[] := ARRAY['User', 'Supervisor', 'Manager', 'Director', 'Developer'];
  allowed_departments TEXT[] := ARRAY['Electrical', 'Construction', 'Admin'];
BEGIN
  IF actor IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required to update permission profiles' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(BTRIM(p_user_id), '') IS NULL
    OR NULLIF(BTRIM(p_role), '') IS NULL
    OR NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'target user, role, and reason are required';
  END IF;

  IF p_role <> ALL(allowed_roles) THEN
    RAISE EXCEPTION 'role is not supported';
  END IF;

  IF p_division IS NOT NULL AND p_division <> ALL(allowed_departments) THEN
    RAISE EXCEPTION 'department is not supported';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions
  WHERE clerk_user_id = actor AND is_active
  LIMIT 1;

  SELECT * INTO target
  FROM public.user_permissions
  WHERE clerk_user_id = p_user_id AND is_active
  LIMIT 1
  FOR UPDATE;

  IF caller.id IS NULL OR target.id IS NULL THEN
    RAISE EXCEPTION 'active caller and target user permission records are required';
  END IF;

  prior := public.effective_permissions_for_user(target.role, target.division, target.permission_overrides);

  UPDATE public.user_permissions
  SET role = p_role,
      division = p_division,
      updated_at = NOW()
  WHERE clerk_user_id = p_user_id AND is_active
  RETURNING * INTO target;

  next_permissions := public.effective_permissions_for_user(target.role, target.division, target.permission_overrides);

  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(email, ''), actor)
  INTO actor_name
  FROM public.user_permissions
  WHERE clerk_user_id = actor
  LIMIT 1;

  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note
  ) VALUES (
    actor,
    actor_name,
    'user_permissions',
    target.id::TEXT,
    'update',
    jsonb_build_object('affected_user_id', p_user_id, 'effective_permissions', prior),
    jsonb_build_object(
      'affected_user_id', p_user_id,
      'role', p_role,
      'department', p_division,
      'effective_permissions', next_permissions
    ),
    BTRIM(p_reason)
  );

  RETURN QUERY SELECT p_user_id, target.role, target.division, next_permissions;
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_permission_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_permission_profile(TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_user_permission_profile(TEXT, TEXT, TEXT, TEXT) FROM anon;
