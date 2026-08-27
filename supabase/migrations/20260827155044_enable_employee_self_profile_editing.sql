-- Employee self-service is deliberately limited to display name and phone.
-- Email remains Clerk-managed; role, department, title, and notes remain
-- management-controlled. Every mutation is recorded in the existing audit log.
CREATE OR REPLACE FUNCTION public.update_current_employee_profile(
  p_display_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  actor public.user_permissions%ROWTYPE;
  previous_profile public.employee_profiles%ROWTYPE;
  saved_profile public.employee_profiles%ROWTYPE;
  normalized_name TEXT := NULLIF(BTRIM(COALESCE(p_display_name, '')), '');
  normalized_phone TEXT := NULLIF(BTRIM(COALESCE(p_phone, '')), '');
  normalized_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
BEGIN
  IF actor_id IS NULL OR length(BTRIM(actor_id)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '42501';
  END IF;
  IF normalized_name IS NULL OR length(normalized_name) > 120 THEN
    RAISE EXCEPTION 'display name is required and must be 120 characters or fewer' USING ERRCODE = '22023';
  END IF;
  IF normalized_phone IS NOT NULL AND length(normalized_phone) > 60 THEN
    RAISE EXCEPTION 'phone must be 60 characters or fewer' USING ERRCODE = '22023';
  END IF;
  IF normalized_reason IS NULL OR length(normalized_reason) < 3 OR length(normalized_reason) > 500 THEN
    RAISE EXCEPTION 'a profile change reason between 3 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO actor
  FROM public.user_permissions up
  WHERE up.clerk_user_id = actor_id
    AND up.is_active = TRUE
  FOR UPDATE;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO previous_profile
  FROM public.employee_profiles ep
  WHERE ep.clerk_user_id = actor_id
    AND ep.archived_at IS NULL
  FOR UPDATE;

  UPDATE public.user_permissions
  SET display_name = normalized_name,
      updated_at = NOW()
  WHERE id = actor.id;

  IF previous_profile.id IS NULL THEN
    INSERT INTO public.employee_profiles (
      email, display_name, role, division, phone, clerk_user_id, linked_at, created_by
    ) VALUES (
      actor.email, normalized_name, actor.role, actor.division, normalized_phone, actor_id, NOW(), actor_id
    ) RETURNING * INTO saved_profile;
  ELSE
    UPDATE public.employee_profiles
    SET display_name = normalized_name,
        phone = normalized_phone,
        updated_at = NOW()
    WHERE id = previous_profile.id
    RETURNING * INTO saved_profile;
  END IF;

  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note
  ) VALUES (
    actor_id,
    COALESCE(NULLIF(normalized_name, ''), actor_id),
    'employee_profiles',
    saved_profile.id::TEXT,
    'update',
    CASE WHEN previous_profile.id IS NULL THEN NULL ELSE jsonb_build_object('display_name', previous_profile.display_name, 'phone', previous_profile.phone) END,
    jsonb_build_object('display_name', saved_profile.display_name, 'phone', saved_profile.phone),
    normalized_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.read_current_employee_vehicle_assignments(
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  assignment_id BIGINT,
  vehicle_label TEXT,
  assigned_at TIMESTAMPTZ,
  unassigned_at TIMESTAMPTZ,
  assigned_by_label TEXT,
  note TEXT,
  is_active BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  bounded_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250);
BEGIN
  IF actor_id IS NULL OR length(BTRIM(actor_id)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_permissions up
    WHERE up.clerk_user_id = actor_id AND up.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    va.id AS assignment_id,
    COALESCE(NULLIF(v.display_name, ''), NULLIF(v.vehicle_number, ''), NULLIF(v.name, ''), v.id::TEXT) AS vehicle_label,
    va.assigned_at,
    va.unassigned_at,
    COALESCE(NULLIF(assigner.display_name, ''), NULLIF(assigner.email, ''), va.assigned_by) AS assigned_by_label,
    va.note,
    va.unassigned_at IS NULL AS is_active
  FROM public.vehicle_assignments va
  JOIN public.vehicles v ON v.id = va.vehicle_id
  LEFT JOIN public.user_permissions assigner ON assigner.clerk_user_id = va.assigned_by
  WHERE va.user_id = actor_id
  ORDER BY va.unassigned_at IS NULL DESC, va.assigned_at DESC, va.id DESC
  LIMIT bounded_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.update_current_employee_profile(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.read_current_employee_vehicle_assignments(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_current_employee_profile(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_current_employee_vehicle_assignments(INTEGER) TO authenticated;
