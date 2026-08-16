ALTER TABLE public.user_permission_overrides
  ADD COLUMN IF NOT EXISTS review_cadence TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS review_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_acknowledged_by TEXT,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_permission_overrides_review_cadence_check'
      AND conrelid = 'public.user_permission_overrides'::regclass
  ) THEN
    ALTER TABLE public.user_permission_overrides
      ADD CONSTRAINT user_permission_overrides_review_cadence_check
      CHECK (review_cadence IN ('standard', 'long_term'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.user_permission_overrides.review_cadence IS
  'Developer review cadence for active custom permission reminders.';
COMMENT ON COLUMN public.user_permission_overrides.review_note IS
  'Developer-authored explanation for long-term custom permission acknowledgement.';

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
      public.default_permissions_for_role(up.role)
        || CASE
             WHEN up.division = 'Admin' THEN '{"can_view_all_divisions":true}'::jsonb
             ELSE '{}'::jsonb
           END
        || CASE
             WHEN up.permission_overrides ? 'can_access_developer' THEN jsonb_build_object(
               'can_access_developer',
               COALESCE((up.permission_overrides ->> 'can_access_developer')::BOOLEAN, FALSE)
             )
             ELSE '{}'::jsonb
           END AS base_permissions
    FROM public.user_permissions up
    WHERE up.is_active = TRUE
  ),
  override_rollup AS (
    SELECT
      uo.user_id,
      jsonb_object_agg(
        uo.permission_flag,
        to_jsonb(uo.granted)
        ORDER BY uo.permission_flag
      ) AS override_permissions,
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
        concat(
          uo.permission_flag,
          CASE WHEN uo.granted THEN '=granted' ELSE '=revoked' END
        ),
        ', '
        ORDER BY uo.permission_flag
      ) AS custom_permission_summary,
      MIN(
        CASE
          WHEN uo.review_cadence = 'long_term' THEN uo.granted_at + INTERVAL '180 days'
          ELSE uo.granted_at + INTERVAL '30 days'
        END
      ) AS next_review_at,
      CASE
        WHEN BOOL_OR(uo.review_cadence = 'standard') THEN 'standard'
        ELSE 'long_term'
      END AS review_cadence
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
  LEFT JOIN override_rollup oroll ON oroll.user_id = pu.clerk_user_id
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
    'permission_review',
    jsonb_build_object(
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

REVOKE ALL ON FUNCTION public.read_developer_permission_console() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_developer_permission_console() TO authenticated;

REVOKE ALL ON FUNCTION public.mark_permission_override_long_term(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_permission_override_long_term(UUID, TEXT) TO authenticated;
