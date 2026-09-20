-- V5 permission foundation: bind the protected Primary account to a stable
-- authenticated subject. Runtime protection never depends on an email string.
-- The generic permission/template editors cannot grant can_manage_developers.

CREATE TABLE public.protected_account_bindings (
  account_key text PRIMARY KEY CHECK (account_key = 'primary'),
  user_id text NOT NULL UNIQUE,
  bound_at timestamptz NOT NULL DEFAULT now(),
  binding_note text NOT NULL
);

ALTER TABLE public.protected_account_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.protected_account_bindings FROM PUBLIC, anon, authenticated;
CREATE POLICY protected_account_bindings_deny_direct_access
  ON public.protected_account_bindings
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

INSERT INTO public.protected_account_bindings(account_key, user_id, binding_note)
VALUES (
  'primary',
  'user_3FUhnQjqCnefFEARvCslkbogRwT',
  'Protected Primary identity confirmed from the active CRNCMK account on 2026-09-20.'
);

CREATE FUNCTION public.is_protected_account(p_user_id text, p_account_key text DEFAULT 'primary')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.protected_account_bindings binding
    WHERE binding.account_key = p_account_key
      AND binding.user_id = p_user_id
  )
$function$;

CREATE FUNCTION public.current_user_is_primary()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT public.is_protected_account(auth.jwt()->>'sub', 'primary')
$function$;

CREATE FUNCTION public.user_can_manage_developers(p_user_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  -- Initial v5 policy: Primary alone. A later, separately reviewed milestone
  -- may add non-delegable grants without changing this call contract.
  SELECT public.is_protected_account(p_user_id, 'primary')
$function$;

CREATE FUNCTION public.protect_primary_permission_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  old_data jsonb := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  new_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  old_user_id text;
  new_user_id text;
BEGIN
  old_user_id := CASE
    WHEN TG_TABLE_NAME = 'user_permissions' THEN old_data->>'clerk_user_id'
    ELSE old_data->>'user_id'
  END;
  new_user_id := CASE
    WHEN TG_TABLE_NAME = 'user_permissions' THEN new_data->>'clerk_user_id'
    ELSE new_data->>'user_id'
  END;
  IF (public.is_protected_account(old_user_id, 'primary')
      OR public.is_protected_account(new_user_id, 'primary'))
     AND public.current_user_is_primary() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the protected Primary account may change Primary access' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$function$;

CREATE TRIGGER protect_primary_user_permission_state
  BEFORE UPDATE OF clerk_user_id, role, division, permission_overrides, is_active
    OR DELETE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.protect_primary_permission_state();

CREATE TRIGGER protect_primary_permission_overrides
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.protect_primary_permission_state();

CREATE TRIGGER protect_primary_template_assignment
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_permission_templates
  FOR EACH ROW EXECUTE FUNCTION public.protect_primary_permission_state();

CREATE FUNCTION public.protect_primary_template_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  old_data jsonb := to_jsonb(OLD);
  governing_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
BEGIN
  IF public.current_user_is_primary() IS TRUE THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.protected_account_bindings binding
    JOIN public.user_permissions primary_user ON primary_user.clerk_user_id = binding.user_id
    LEFT JOIN public.user_permission_templates assignment ON assignment.user_id = binding.user_id
    WHERE binding.account_key = 'primary'
      AND (
        assignment.template_id = (governing_data->>'id')::uuid
        OR (
          assignment.template_id IS NULL
          AND (
            (old_data->>'default_role' = primary_user.role AND old_data->>'default_division' = COALESCE(primary_user.division, 'Unassigned'))
            OR
            (governing_data->>'default_role' = primary_user.role AND governing_data->>'default_division' = COALESCE(primary_user.division, 'Unassigned'))
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Only the protected Primary account may change a template governing Primary access' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$function$;

CREATE TRIGGER protect_primary_permission_template_defaults
  BEFORE UPDATE OR DELETE ON public.permission_templates
  FOR EACH ROW EXECUTE FUNCTION public.protect_primary_template_defaults();

CREATE OR REPLACE FUNCTION public.permission_template_base_for_user(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE result jsonb;
BEGIN
  IF nullif(auth.jwt()->>'sub', '') IS NULL OR
     (p_user_id IS DISTINCT FROM (auth.jwt()->>'sub') AND NOT public.current_user_has_developer_access()) THEN
    RAISE EXCEPTION 'Permission scope denied' USING ERRCODE = '42501';
  END IF;
  SELECT public.permission_base_for_user(up.role, up.division, up.permission_overrides)
      || coalesce(t.permissions, '{}'::jsonb)
      || jsonb_build_object('can_manage_developers', public.user_can_manage_developers(up.clerk_user_id))
    INTO result
    FROM public.user_permissions up
    LEFT JOIN public.user_permission_templates assignment ON assignment.user_id = up.clerk_user_id
    LEFT JOIN public.permission_templates t ON t.id = assignment.template_id
    WHERE up.clerk_user_id = p_user_id AND up.is_active;
  RETURN coalesce(result, '{}'::jsonb);
END
$function$;

CREATE OR REPLACE FUNCTION public.effective_permissions_for_user(
  p_role text,
  p_division text,
  p_permission_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT public.permission_base_for_user(p_role, p_division, p_permission_overrides)
    || coalesce((
      SELECT template.permissions
      FROM public.user_permission_templates assignment
      JOIN public.permission_templates template ON template.id = assignment.template_id
      WHERE assignment.user_id = auth.jwt()->>'sub'
    ), '{}'::jsonb)
    || coalesce((
      SELECT jsonb_object_agg(active.permission_flag, active.granted)
      FROM (
        SELECT override.permission_flag, bool_and(override.granted) AS granted
        FROM public.user_permission_overrides override
        WHERE override.user_id = auth.jwt()->>'sub'
          AND override.is_active
          AND override.permission_flag <> 'can_access_developer'
        GROUP BY override.permission_flag
      ) active
    ), '{}'::jsonb)
    || jsonb_build_object(
      'can_manage_developers',
      public.user_can_manage_developers(auth.jwt()->>'sub')
    )
$function$;

REVOKE ALL ON FUNCTION public.is_protected_account(text,text),
  public.current_user_is_primary(), public.user_can_manage_developers(text),
  public.protect_primary_permission_state(), public.protect_primary_template_defaults()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_primary() TO authenticated;

NOTIFY pgrst, 'reload schema';
