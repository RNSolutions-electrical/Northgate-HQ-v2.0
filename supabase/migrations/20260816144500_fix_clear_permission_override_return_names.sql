DROP FUNCTION IF EXISTS public.clear_permission_override(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.clear_permission_override(
  p_user_id TEXT,
  p_permission_flag TEXT,
  p_reason TEXT
)
RETURNS TABLE (
  affected_user_id TEXT,
  affected_permission_flag TEXT,
  previous_effective_permissions JSONB,
  new_effective_permissions JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
  normalized_user_id TEXT;
  normalized_permission_flag TEXT;
  normalized_reason TEXT;
  caller public.user_permissions%ROWTYPE;
  target_user public.user_permissions%ROWTYPE;
  before_permissions JSONB;
  after_permissions JSONB;
  acting_user_name TEXT;
  removed_override JSONB := NULL;
  override_state RECORD;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required to clear permission overrides';
  END IF;

  normalized_user_id := NULLIF(trim(COALESCE(p_user_id, '')), '');
  normalized_permission_flag := NULLIF(trim(COALESCE(p_permission_flag, '')), '');
  normalized_reason := NULLIF(trim(COALESCE(p_reason, '')), '');

  IF normalized_user_id IS NULL OR normalized_permission_flag IS NULL THEN
    RAISE EXCEPTION 'target user and permission flag are required';
  END IF;

  IF normalized_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  IF length(normalized_reason) > 500 THEN
    RAISE EXCEPTION 'reason must be 500 characters or fewer';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  SELECT *
  INTO target_user
  FROM public.user_permissions up
  WHERE up.clerk_user_id = normalized_user_id
    AND up.is_active = TRUE
  LIMIT 1
  FOR UPDATE;

  IF caller.id IS NULL OR target_user.id IS NULL THEN
    RAISE EXCEPTION 'active caller and target user permission records are required';
  END IF;

  IF COALESCE((public.permission_base_for_user(target_user.role, target_user.division, target_user.permission_overrides) ->> 'can_access_developer')::BOOLEAN, FALSE) IS TRUE THEN
    RAISE EXCEPTION 'Developer users cannot be targeted through this override system';
  END IF;

  before_permissions := public.permission_base_for_user(target_user.role, target_user.division, target_user.permission_overrides);

  FOR override_state IN
    SELECT uo.permission_flag, BOOL_OR(NOT uo.granted) AS has_revoke, BOOL_OR(uo.granted) AS has_grant
    FROM public.user_permission_overrides uo
    WHERE uo.user_id = normalized_user_id
      AND uo.is_active = TRUE
    GROUP BY uo.permission_flag
  LOOP
    before_permissions := before_permissions || jsonb_build_object(
      override_state.permission_flag,
      CASE WHEN override_state.has_revoke THEN FALSE ELSE override_state.has_grant END
    );
  END LOOP;

  WITH deactivated AS (
    UPDATE public.user_permission_overrides AS existing_override
    SET is_active = FALSE
    WHERE existing_override.user_id = normalized_user_id
      AND existing_override.permission_flag = normalized_permission_flag
      AND existing_override.is_active = TRUE
    RETURNING existing_override.*
  )
  SELECT to_jsonb(deactivated.*)
  INTO removed_override
  FROM deactivated
  LIMIT 1;

  after_permissions := public.permission_base_for_user(target_user.role, target_user.division, target_user.permission_overrides);

  FOR override_state IN
    SELECT uo.permission_flag, BOOL_OR(NOT uo.granted) AS has_revoke, BOOL_OR(uo.granted) AS has_grant
    FROM public.user_permission_overrides uo
    WHERE uo.user_id = normalized_user_id
      AND uo.is_active = TRUE
    GROUP BY uo.permission_flag
  LOOP
    after_permissions := after_permissions || jsonb_build_object(
      override_state.permission_flag,
      CASE WHEN override_state.has_revoke THEN FALSE ELSE override_state.has_grant END
    );
  END LOOP;

  SELECT COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject)
  INTO acting_user_name;

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
    acting_user_name,
    'user_permission_overrides',
    COALESCE(removed_override ->> 'id', normalized_user_id || ':' || normalized_permission_flag),
    'permission_default',
    jsonb_build_object(
      'affected_user_id', normalized_user_id,
      'permission_flag', normalized_permission_flag,
      'effective_permissions', before_permissions,
      'removed_active_override', removed_override
    ),
    jsonb_build_object(
      'affected_user_id', normalized_user_id,
      'permission_flag', normalized_permission_flag,
      'effective_permissions', after_permissions
    ),
    normalized_reason,
    NOW()
  );

  RETURN QUERY
  SELECT normalized_user_id, normalized_permission_flag, before_permissions, after_permissions;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_permission_override(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_permission_override(TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_permission_override(TEXT, TEXT, TEXT) FROM anon;
