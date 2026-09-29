-- Newly provisioned profiles need a canonical business rank even before an
-- administrator edits them. Keep Developer technical access separate.
ALTER TABLE public.user_permissions
  ALTER COLUMN business_role SET DEFAULT 'User';

CREATE OR REPLACE FUNCTION public.update_user_permission_profile(
  p_user_id text, p_role text, p_division text, p_reason text
)
RETURNS TABLE(user_id text, role text, division text, effective_permissions jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt() ->> 'sub';
  target public.user_permissions%ROWTYPE;
  caller public.user_permissions%ROWTYPE;
  prior jsonb;
  before_profile jsonb;
  next_permissions jsonb;
  actor_name text;
  allowed_roles text[] := ARRAY['User', 'Supervisor', 'Manager', 'Director', 'Developer'];
  allowed_departments text[] := ARRAY['Electrical', 'Construction', 'Admin'];
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
  before_profile := jsonb_build_object(
    'affected_user_id', p_user_id,
    'role', target.role,
    'business_role', target.business_role,
    'department', target.division,
    'effective_permissions', prior
  );

  UPDATE public.user_permissions
  SET role = p_role,
      business_role = CASE
        WHEN p_role = 'Developer' THEN COALESCE(
          target.business_role,
          CASE WHEN target.role = 'Developer' THEN 'Director' ELSE target.role END
        )
        ELSE p_role
      END,
      division = p_division,
      updated_at = now()
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
    target.id::text,
    'update',
    before_profile,
    jsonb_build_object(
      'affected_user_id', p_user_id,
      'role', target.role,
      'business_role', target.business_role,
      'department', target.division,
      'effective_permissions', next_permissions
    ),
    BTRIM(p_reason)
  );

  RETURN QUERY SELECT p_user_id, target.role, target.division, next_permissions;
END;
$function$;
