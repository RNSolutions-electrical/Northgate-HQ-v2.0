-- HIGH RISK / REVIEW REQUIRED:
-- These authenticated SECURITY DEFINER RPCs mutate production vehicle custody
-- history and influence the server-derived vehicle snapshot used by cart-open.
-- Re-review permission checks, employee scope, concurrency, audit completeness,
-- and transfer/release behavior before widening vehicle workflows.

CREATE OR REPLACE FUNCTION public.assign_vehicle_to_user(
  p_vehicle_id UUID,
  p_user_id TEXT,
  p_reason TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  target_user public.user_permissions%ROWTYPE;
  target_vehicle public.vehicles%ROWTYPE;
  current_assignment public.vehicle_assignments%ROWTYPE;
  inserted_assignment public.vehicle_assignments%ROWTYPE;
  normalized_user_id TEXT := NULLIF(trim(COALESCE(p_user_id, '')), '');
  normalized_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  actor_label TEXT;
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '28000';
  END IF;

  IF p_vehicle_id IS NULL OR normalized_user_id IS NULL OR normalized_reason IS NULL THEN
    RAISE EXCEPTION 'vehicle, employee, and reason are required' USING ERRCODE = '22004';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501';
  END IF;

  caller_permissions := public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides);
  IF COALESCE((caller_permissions ->> 'can_manage_vehicles')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'can_manage_vehicles permission is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_user
  FROM public.user_permissions up
  WHERE up.clerk_user_id = normalized_user_id AND up.is_active = TRUE
  LIMIT 1;

  IF target_user.id IS NULL OR public.current_user_can_read_division(target_user.division) IS NOT TRUE THEN
    RAISE EXCEPTION 'employee is not available in your approved scope' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_vehicle
  FROM public.vehicles v
  WHERE v.id = p_vehicle_id AND v.is_active = TRUE
  LIMIT 1;

  IF target_vehicle.id IS NULL THEN
    RAISE EXCEPTION 'active vehicle not found' USING ERRCODE = 'P0002';
  END IF;

  actor_label := COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject);

  SELECT * INTO current_assignment
  FROM public.vehicle_assignments va
  WHERE va.user_id = normalized_user_id AND va.unassigned_at IS NULL
  ORDER BY va.assigned_at DESC, va.id DESC
  LIMIT 1
  FOR UPDATE;

  IF current_assignment.id IS NOT NULL AND current_assignment.vehicle_id = p_vehicle_id THEN
    RAISE EXCEPTION 'employee is already assigned to this vehicle' USING ERRCODE = '23505';
  END IF;

  IF current_assignment.id IS NOT NULL THEN
    UPDATE public.vehicle_assignments
    SET unassigned_at = NOW()
    WHERE id = current_assignment.id;

    INSERT INTO public.change_logs (
      user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at
    ) VALUES (
      jwt_subject,
      actor_label,
      'vehicle_assignments',
      current_assignment.id::TEXT,
      'update',
      to_jsonb(current_assignment),
      to_jsonb(current_assignment) || jsonb_build_object('unassigned_at', NOW()),
      'Transferred vehicle assignment: ' || normalized_reason,
      NOW()
    );
  END IF;

  INSERT INTO public.vehicle_assignments (user_id, vehicle_id, assigned_by, note)
  VALUES (normalized_user_id, p_vehicle_id, jwt_subject, normalized_reason)
  RETURNING * INTO inserted_assignment;

  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at
  ) VALUES (
    jwt_subject,
    actor_label,
    'vehicle_assignments',
    inserted_assignment.id::TEXT,
    'create',
    NULL,
    to_jsonb(inserted_assignment),
    normalized_reason,
    NOW()
  );

  RETURN inserted_assignment.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_vehicle_assignment(
  p_assignment_id BIGINT,
  p_reason TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  target_assignment public.vehicle_assignments%ROWTYPE;
  normalized_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  actor_label TEXT;
  released_at TIMESTAMPTZ := NOW();
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '28000';
  END IF;

  IF p_assignment_id IS NULL OR normalized_reason IS NULL THEN
    RAISE EXCEPTION 'active assignment and release reason are required' USING ERRCODE = '22004';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501';
  END IF;

  caller_permissions := public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides);
  IF COALESCE((caller_permissions ->> 'can_manage_vehicles')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'can_manage_vehicles permission is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_assignment
  FROM public.vehicle_assignments va
  WHERE va.id = p_assignment_id AND va.unassigned_at IS NULL
  FOR UPDATE;

  IF target_assignment.id IS NULL THEN
    RAISE EXCEPTION 'active vehicle assignment not found' USING ERRCODE = 'P0002';
  END IF;

  actor_label := COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject);

  UPDATE public.vehicle_assignments
  SET unassigned_at = released_at
  WHERE id = target_assignment.id;

  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at
  ) VALUES (
    jwt_subject,
    actor_label,
    'vehicle_assignments',
    target_assignment.id::TEXT,
    'update',
    to_jsonb(target_assignment),
    to_jsonb(target_assignment) || jsonb_build_object('unassigned_at', released_at),
    'Released vehicle assignment: ' || normalized_reason,
    released_at
  );

  RETURN target_assignment.id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_vehicle_to_user(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_vehicle_to_user(UUID, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_vehicle_to_user(UUID, TEXT, TEXT) FROM anon;

REVOKE ALL ON FUNCTION public.release_vehicle_assignment(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_vehicle_assignment(BIGINT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.release_vehicle_assignment(BIGINT, TEXT) FROM anon;

COMMENT ON FUNCTION public.assign_vehicle_to_user(UUID, TEXT, TEXT) IS
  'Assigns or transfers one active vehicle per user. Requires effective can_manage_vehicles, scoped employee visibility, a reason, and writes change_logs audit rows.';

COMMENT ON FUNCTION public.release_vehicle_assignment(BIGINT, TEXT) IS
  'Ends an active vehicle assignment. Requires effective can_manage_vehicles, a reason, and writes a change_logs audit row.';
