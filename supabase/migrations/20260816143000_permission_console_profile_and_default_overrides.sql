CREATE OR REPLACE FUNCTION public.default_permissions_for_role(p_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  base JSONB;
BEGIN
  CASE p_role
    WHEN 'Developer' THEN
      base := '{"can_access_developer":true,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Manager' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Supervisor' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Administrator' THEN
      base := '{"can_access_developer":false,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":false,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Project Manager' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":false,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Estimator' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":false,"can_view_all_divisions":false,"can_estimate":true,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
    WHEN 'Field Supervisor' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":false,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":true,"can_view_all_divisions":false,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
    ELSE
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":false,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":false,"can_view_all_divisions":false,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
  END CASE;

  RETURN base || jsonb_build_object(
    'can_express_checkout', COALESCE((base ->> 'can_inventory_transactions')::boolean, false),
    'can_approve_express_checkout', p_role IN ('Developer', 'Manager', 'Administrator'),
    'can_defer_completion', p_role = 'Developer'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.permission_base_for_user(
  p_role TEXT,
  p_division TEXT,
  p_permission_overrides JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.default_permissions_for_role(p_role)
    || CASE
         WHEN p_division = 'Admin' THEN '{"can_view_all_divisions":true}'::jsonb
         ELSE '{}'::jsonb
       END
    || CASE
         WHEN p_permission_overrides ? 'can_access_developer' THEN jsonb_build_object(
           'can_access_developer',
           COALESCE((p_permission_overrides ->> 'can_access_developer')::BOOLEAN, FALSE)
         )
         ELSE '{}'::jsonb
       END;
$$;

CREATE OR REPLACE FUNCTION public.read_developer_permission_console()
RETURNS TABLE (
  user_id TEXT,
  display_name TEXT,
  email TEXT,
  role TEXT,
  division TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  base_permissions JSONB,
  active_overrides JSONB,
  effective_permissions JSONB,
  custom_permission_count INTEGER,
  custom_permission_summary TEXT,
  next_review_at TIMESTAMPTZ,
  review_cadence TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required to read the permission console';
  END IF;

  RETURN QUERY
  WITH permission_users AS (
    SELECT
      up.clerk_user_id,
      up.display_name,
      up.email,
      up.role,
      up.division,
      up.is_active,
      up.created_at,
      up.updated_at,
      public.permission_base_for_user(up.role, up.division, up.permission_overrides) AS base_permissions
    FROM public.user_permissions up
    WHERE up.is_active = TRUE
  ),
  override_rollup AS (
    SELECT
      uo.user_id AS override_user_id,
      jsonb_object_agg(uo.permission_flag, to_jsonb(uo.granted) ORDER BY uo.permission_flag) AS override_permissions,
      jsonb_agg(
        jsonb_build_object(
          'id', uo.id,
          'permission_flag', uo.permission_flag,
          'granted', uo.granted,
          'granted_by_user_id', uo.granted_by_user_id,
          'granted_at', uo.granted_at,
          'reason', uo.reason,
          'review_cadence', uo.review_cadence,
          'review_acknowledged_at', uo.review_acknowledged_at,
          'review_acknowledged_by', uo.review_acknowledged_by,
          'review_note', uo.review_note
        )
        ORDER BY uo.granted_at DESC, uo.permission_flag
      ) AS active_overrides,
      COUNT(*)::INTEGER AS custom_permission_count,
      string_agg(
        concat(uo.permission_flag, CASE WHEN uo.granted THEN '=granted' ELSE '=revoked' END),
        ', '
        ORDER BY uo.permission_flag
      ) AS custom_permission_summary,
      MIN(
        CASE
          WHEN uo.review_cadence = 'long_term' THEN uo.granted_at + INTERVAL '180 days'
          ELSE uo.granted_at + INTERVAL '30 days'
        END
      ) AS next_review_at,
      CASE WHEN BOOL_OR(uo.review_cadence = 'standard') THEN 'standard' ELSE 'long_term' END AS review_cadence
    FROM public.user_permission_overrides uo
    WHERE uo.is_active = TRUE
    GROUP BY uo.user_id
  )
  SELECT
    pu.clerk_user_id,
    pu.display_name,
    pu.email,
    pu.role,
    pu.division,
    pu.is_active,
    pu.created_at,
    pu.updated_at,
    pu.base_permissions,
    COALESCE(oroll.active_overrides, '[]'::jsonb),
    pu.base_permissions || COALESCE(oroll.override_permissions, '{}'::jsonb),
    COALESCE(oroll.custom_permission_count, 0),
    COALESCE(oroll.custom_permission_summary, ''),
    oroll.next_review_at,
    COALESCE(oroll.review_cadence, 'none')
  FROM permission_users pu
  LEFT JOIN override_rollup oroll ON oroll.override_user_id = pu.clerk_user_id
  ORDER BY
    CASE pu.role
      WHEN 'Developer' THEN 1
      WHEN 'Manager' THEN 2
      WHEN 'Supervisor' THEN 3
      WHEN 'User' THEN 4
      ELSE 5
    END,
    pu.division NULLS LAST,
    pu.display_name NULLS LAST,
    pu.email NULLS LAST,
    pu.clerk_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_permission_override(
  p_user_id TEXT,
  p_permission_flag TEXT,
  p_granted BOOLEAN,
  p_reason TEXT
)
RETURNS TABLE (
  id UUID,
  user_id TEXT,
  permission_flag TEXT,
  granted BOOLEAN,
  granted_by_user_id TEXT,
  granted_at TIMESTAMPTZ,
  reason TEXT,
  is_active BOOLEAN,
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
  previous_role TEXT;
  previous_division TEXT;
  before_permissions JSONB;
  after_permissions JSONB;
  acting_user_name TEXT;
  previous_override JSONB := NULL;
  inserted_override public.user_permission_overrides%ROWTYPE;
  override_state RECORD;
  target_has_developer_access BOOLEAN := FALSE;
  canonical_flags TEXT[] := ARRAY[
    'can_access_developer',
    'can_manage_users',
    'can_view_reports',
    'can_edit_catalog',
    'can_manage_employees',
    'can_manage_vehicles',
    'can_manage_tools',
    'can_manage_inventory',
    'can_inventory_transactions',
    'can_view_all_divisions',
    'can_estimate',
    'can_approve_estimates',
    'can_create_jobs',
    'can_manage_jobs',
    'can_approve_budget',
    'can_view_financials',
    'can_field_access',
    'can_archive_records',
    'can_manage_change_orders',
    'can_express_checkout',
    'can_approve_express_checkout',
    'can_defer_completion'
  ];
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required to manage permission overrides';
  END IF;

  normalized_user_id := NULLIF(trim(COALESCE(p_user_id, '')), '');
  normalized_permission_flag := NULLIF(trim(COALESCE(p_permission_flag, '')), '');
  normalized_reason := NULLIF(trim(COALESCE(p_reason, '')), '');

  IF normalized_user_id IS NULL THEN
    RAISE EXCEPTION 'target user_id is required';
  END IF;

  IF normalized_permission_flag IS NULL THEN
    RAISE EXCEPTION 'permission_flag is required';
  END IF;

  IF p_granted IS NULL THEN
    RAISE EXCEPTION 'granted is required';
  END IF;

  IF normalized_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  IF length(normalized_reason) > 500 THEN
    RAISE EXCEPTION 'reason must be 500 characters or fewer';
  END IF;

  IF normalized_permission_flag <> ALL(canonical_flags) THEN
    RAISE EXCEPTION 'permission_flag must be a canonical permission';
  END IF;

  IF normalized_permission_flag = 'can_access_developer' THEN
    RAISE EXCEPTION 'can_access_developer is excluded from this override system';
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
  INTO target_user
  FROM public.user_permissions up
  WHERE up.clerk_user_id = normalized_user_id
    AND up.is_active = TRUE
  LIMIT 1
  FOR UPDATE;

  IF target_user.id IS NULL THEN
    RAISE EXCEPTION 'active target user_permissions record is required';
  END IF;

  target_has_developer_access := COALESCE(
    (public.permission_base_for_user(target_user.role, target_user.division, target_user.permission_overrides) ->> 'can_access_developer')::BOOLEAN,
    FALSE
  );

  IF target_has_developer_access IS TRUE THEN
    RAISE EXCEPTION 'Developer users cannot be targeted through this override system';
  END IF;

  previous_role := target_user.role;
  previous_division := target_user.division;
  before_permissions := public.permission_base_for_user(previous_role, previous_division, target_user.permission_overrides);

  FOR override_state IN
    SELECT
      uo.permission_flag,
      BOOL_OR(NOT uo.granted) AS has_revoke,
      BOOL_OR(uo.granted) AS has_grant
    FROM public.user_permission_overrides uo
    WHERE uo.user_id = normalized_user_id
      AND uo.is_active = TRUE
      AND uo.permission_flag = ANY(canonical_flags)
      AND uo.permission_flag <> 'can_access_developer'
    GROUP BY uo.permission_flag
  LOOP
    before_permissions := before_permissions || jsonb_build_object(
      override_state.permission_flag,
      CASE WHEN override_state.has_revoke THEN FALSE ELSE override_state.has_grant END
    );
  END LOOP;

  after_permissions := before_permissions || jsonb_build_object(normalized_permission_flag, p_granted);

  SELECT COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject)
  INTO acting_user_name;

  WITH deactivated AS (
    UPDATE public.user_permission_overrides AS existing_override
    SET is_active = FALSE
    WHERE existing_override.user_id = normalized_user_id
      AND existing_override.permission_flag = normalized_permission_flag
      AND existing_override.is_active = TRUE
    RETURNING existing_override.*
  )
  SELECT to_jsonb(deactivated.*)
  INTO previous_override
  FROM deactivated
  LIMIT 1;

  INSERT INTO public.user_permission_overrides (
    user_id,
    permission_flag,
    granted,
    granted_by_user_id,
    reason,
    is_active
  )
  VALUES (
    normalized_user_id,
    normalized_permission_flag,
    p_granted,
    jwt_subject,
    normalized_reason,
    TRUE
  )
  RETURNING *
  INTO inserted_override;

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
    inserted_override.id::TEXT,
    'permission_change',
    jsonb_build_object(
      'affected_user_id', normalized_user_id,
      'permission_flag', normalized_permission_flag,
      'direction', CASE WHEN p_granted THEN 'grant' ELSE 'revoke' END,
      'effective_permissions', before_permissions,
      'prior_active_override', previous_override
    ),
    jsonb_build_object(
      'affected_user_id', normalized_user_id,
      'permission_flag', normalized_permission_flag,
      'direction', CASE WHEN p_granted THEN 'grant' ELSE 'revoke' END,
      'effective_permissions', after_permissions,
      'new_active_override', jsonb_build_object(
        'id', inserted_override.id,
        'user_id', inserted_override.user_id,
        'permission_flag', inserted_override.permission_flag,
        'granted', inserted_override.granted,
        'granted_by_user_id', inserted_override.granted_by_user_id,
        'granted_at', inserted_override.granted_at,
        'reason', inserted_override.reason,
        'is_active', inserted_override.is_active
      )
    ),
    normalized_reason,
    inserted_override.granted_at
  );

  RETURN QUERY
  SELECT
    inserted_override.id,
    inserted_override.user_id,
    inserted_override.permission_flag,
    inserted_override.granted,
    inserted_override.granted_by_user_id,
    inserted_override.granted_at,
    inserted_override.reason,
    inserted_override.is_active,
    before_permissions,
    after_permissions;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_permission_override(
  p_user_id TEXT,
  p_permission_flag TEXT,
  p_reason TEXT
)
RETURNS TABLE (
  user_id TEXT,
  permission_flag TEXT,
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
  previous_role TEXT;
  previous_division TEXT;
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

  previous_role := target_user.role;
  previous_division := target_user.division;
  before_permissions := public.permission_base_for_user(previous_role, previous_division, target_user.permission_overrides);

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
    'permission_profile_update',
    jsonb_build_object(
      'affected_user_id', normalized_user_id,
      'role', previous_role,
      'division', previous_division,
      'effective_permissions', before_permissions
    ),
    jsonb_build_object(
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

REVOKE ALL ON FUNCTION public.permission_base_for_user(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.permission_base_for_user(TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.clear_permission_override(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_permission_override(TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_permission_override(TEXT, TEXT, TEXT) FROM anon;

REVOKE ALL ON FUNCTION public.update_user_permission_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_permission_profile(TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_user_permission_profile(TEXT, TEXT, TEXT, TEXT) FROM anon;

REVOKE EXECUTE ON FUNCTION public.read_developer_permission_console() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_permission_override(TEXT, TEXT, BOOLEAN, TEXT) FROM anon;
