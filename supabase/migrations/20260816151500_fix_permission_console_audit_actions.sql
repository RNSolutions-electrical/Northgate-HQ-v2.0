CREATE OR REPLACE FUNCTION public.clear_permission_override(
  p_user_id TEXT,
  p_permission_flag TEXT,
  p_reason TEXT
)
RETURNS JSONB
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
  removed_override JSONB := NULL;
  acting_user_name TEXT;
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
    'permission_change',
    jsonb_build_object(
      'change_type', 'permission_default',
      'affected_user_id', normalized_user_id,
      'permission_flag', normalized_permission_flag,
      'removed_active_override', removed_override
    ),
    jsonb_build_object(
      'change_type', 'permission_default',
      'affected_user_id', normalized_user_id,
      'permission_flag', normalized_permission_flag,
      'override_state', 'default'
    ),
    normalized_reason,
    NOW()
  );

  RETURN jsonb_build_object(
    'affected_user_id', normalized_user_id,
    'permission_flag', normalized_permission_flag,
    'override_state', 'default'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_permission_profile(
  p_user_id TEXT,
  p_role TEXT,
  p_division TEXT,
  p_reason TEXT
)
RETURNS TABLE (
  user_id TEXT,
  role TEXT,
  division TEXT,
  effective_permissions JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
  normalized_user_id TEXT;
  normalized_role TEXT;
  normalized_division TEXT;
  normalized_reason TEXT;
  caller public.user_permissions%ROWTYPE;
  target_user public.user_permissions%ROWTYPE;
  previous_role TEXT;
  previous_division TEXT;
  before_permissions JSONB;
  after_permissions JSONB;
  acting_user_name TEXT;
  allowed_roles TEXT[] := ARRAY['User', 'Supervisor', 'Manager', 'Developer', 'Administrator', 'Project Manager', 'Estimator', 'Field Supervisor'];
  allowed_divisions TEXT[] := ARRAY['Electrical', 'Construction', 'Admin'];
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required to update permission profiles';
  END IF;

  normalized_user_id := NULLIF(trim(COALESCE(p_user_id, '')), '');
  normalized_role := NULLIF(trim(COALESCE(p_role, '')), '');
  normalized_division := NULLIF(trim(COALESCE(p_division, '')), '');
  normalized_reason := NULLIF(trim(COALESCE(p_reason, '')), '');

  IF normalized_user_id IS NULL OR normalized_role IS NULL THEN
    RAISE EXCEPTION 'target user and role are required';
  END IF;

  IF normalized_role <> ALL(allowed_roles) THEN
    RAISE EXCEPTION 'role is not supported';
  END IF;

  IF normalized_division IS NOT NULL AND normalized_division <> ALL(allowed_divisions) THEN
    RAISE EXCEPTION 'division is not supported';
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

  previous_role := target_user.role;
  previous_division := target_user.division;
  before_permissions := public.permission_base_for_user(previous_role, previous_division, target_user.permission_overrides);

  UPDATE public.user_permissions up
  SET role = normalized_role,
      division = normalized_division,
      updated_at = NOW()
  WHERE up.clerk_user_id = normalized_user_id
    AND up.is_active = TRUE
  RETURNING *
  INTO target_user;

  after_permissions := public.permission_base_for_user(target_user.role, target_user.division, target_user.permission_overrides);

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
    'user_permissions',
    target_user.id::TEXT,
    'permission_change',
    jsonb_build_object(
      'change_type', 'permission_profile_update',
      'affected_user_id', normalized_user_id,
      'role', previous_role,
      'division', previous_division,
      'effective_permissions', before_permissions
    ),
    jsonb_build_object(
      'change_type', 'permission_profile_update',
      'affected_user_id', normalized_user_id,
      'role', normalized_role,
      'division', normalized_division,
      'effective_permissions', after_permissions
    ),
    normalized_reason,
    NOW()
  );

  RETURN QUERY
  SELECT normalized_user_id, target_user.role, target_user.division, after_permissions;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_permission_override_long_term(
  p_override_id UUID,
  p_reason TEXT
)
RETURNS TABLE (
  id UUID,
  user_id TEXT,
  permission_flag TEXT,
  granted BOOLEAN,
  review_cadence TEXT,
  review_acknowledged_at TIMESTAMPTZ,
  review_acknowledged_by TEXT,
  review_note TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
  normalized_reason TEXT;
  caller public.user_permissions%ROWTYPE;
  target_override public.user_permission_overrides%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required to acknowledge custom permissions';
  END IF;

  IF p_override_id IS NULL THEN
    RAISE EXCEPTION 'override id is required';
  END IF;

  normalized_reason := NULLIF(trim(COALESCE(p_reason, '')), '');

  IF normalized_reason IS NULL THEN
    RAISE EXCEPTION 'long-term reason is required';
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

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'active caller user_permissions record is required';
  END IF;

  SELECT *
  INTO target_override
  FROM public.user_permission_overrides uo
  WHERE uo.id = p_override_id
    AND uo.is_active = TRUE
  FOR UPDATE;

  IF target_override.id IS NULL THEN
    RAISE EXCEPTION 'active permission override is required';
  END IF;

  UPDATE public.user_permission_overrides uo
  SET review_cadence = 'long_term',
      review_acknowledged_at = now_stamp,
      review_acknowledged_by = jwt_subject,
      review_note = normalized_reason
  WHERE uo.id = p_override_id;

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
    'user_permission_overrides',
    p_override_id::TEXT,
    'permission_change',
    jsonb_build_object(
      'change_type', 'permission_review',
      'id', target_override.id,
      'user_id', target_override.user_id,
      'permission_flag', target_override.permission_flag,
      'granted', target_override.granted,
      'review_cadence', target_override.review_cadence,
      'review_acknowledged_at', target_override.review_acknowledged_at,
      'review_acknowledged_by', target_override.review_acknowledged_by,
      'review_note', target_override.review_note
    ),
    jsonb_build_object(
      'change_type', 'permission_review',
      'id', target_override.id,
      'user_id', target_override.user_id,
      'permission_flag', target_override.permission_flag,
      'granted', target_override.granted,
      'review_cadence', 'long_term',
      'review_acknowledged_at', now_stamp,
      'review_acknowledged_by', jwt_subject,
      'review_note', normalized_reason
    ),
    normalized_reason,
    now_stamp
  );

  RETURN QUERY
  SELECT
    uo.id,
    uo.user_id,
    uo.permission_flag,
    uo.granted,
    uo.review_cadence,
    uo.review_acknowledged_at,
    uo.review_acknowledged_by,
    uo.review_note
  FROM public.user_permission_overrides uo
  WHERE uo.id = p_override_id;
END;
$$;
