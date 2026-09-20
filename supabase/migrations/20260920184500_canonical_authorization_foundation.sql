-- V5 authorization foundation. This migration introduces technical assignments
-- and an action decision contract without routing existing business mutations
-- through it yet. Existing Developer access is backfilled before the resolver
-- changes, so this milestone does not remove current technical access.

ALTER TABLE public.user_permissions
  ADD COLUMN business_role text
  CHECK (business_role IN ('User', 'Supervisor', 'Manager', 'Director'));

UPDATE public.user_permissions
SET business_role = CASE WHEN role = 'Developer' THEN 'Director' ELSE role END
WHERE business_role IS NULL
  AND role IN ('User', 'Supervisor', 'Manager', 'Director', 'Developer');

COMMENT ON COLUMN public.user_permissions.business_role IS
  'Canonical v5 business rank. Developer is a separate technical assignment. Legacy Developer rows backfill to Director to preserve day-one business authority and can be explicitly adjusted later.';

CREATE TABLE public.user_technical_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.user_permissions(clerk_user_id),
  assignment_key text NOT NULL CHECK (assignment_key = 'developer'),
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  grant_reason text NOT NULL CHECK (length(btrim(grant_reason)) BETWEEN 1 AND 500),
  revoked_by text,
  revoked_at timestamptz,
  revoke_reason text CHECK (revoke_reason IS NULL OR length(btrim(revoke_reason)) BETWEEN 1 AND 500),
  is_active boolean NOT NULL DEFAULT true,
  CHECK (
    (is_active AND revoked_by IS NULL AND revoked_at IS NULL AND revoke_reason IS NULL)
    OR
    (NOT is_active AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX user_technical_assignments_one_active
  ON public.user_technical_assignments(user_id, assignment_key)
  WHERE is_active;

ALTER TABLE public.user_technical_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_technical_assignments FROM PUBLIC, anon, authenticated;
CREATE POLICY user_technical_assignments_deny_direct_access
  ON public.user_technical_assignments
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

INSERT INTO public.user_technical_assignments(
  user_id, assignment_key, granted_by, grant_reason
)
SELECT
  permission.clerk_user_id,
  'developer',
  (SELECT binding.user_id FROM public.protected_account_bindings binding WHERE binding.account_key = 'primary'),
  'Backfilled from the pre-v5 Developer access model.'
FROM public.user_permissions permission
WHERE permission.is_active
  AND (
    permission.role = 'Developer'
    OR COALESCE((permission.permission_overrides->>'can_access_developer')::boolean, false)
  )
ON CONFLICT (user_id, assignment_key) WHERE is_active DO NOTHING;

CREATE FUNCTION public.user_has_technical_assignment(
  p_user_id text,
  p_assignment_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions permission
    JOIN public.user_technical_assignments assignment
      ON assignment.user_id = permission.clerk_user_id
    WHERE permission.clerk_user_id = p_user_id
      AND permission.is_active
      AND assignment.assignment_key = p_assignment_key
      AND assignment.is_active
  )
$function$;

CREATE OR REPLACE FUNCTION public.current_user_has_developer_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT public.user_has_technical_assignment(auth.jwt()->>'sub', 'developer')
$function$;

CREATE TABLE public.authorization_actions (
  action_id text PRIMARY KEY,
  action_key text NOT NULL UNIQUE,
  module text NOT NULL,
  description text NOT NULL,
  minimum_business_role text CHECK (minimum_business_role IN ('User', 'Supervisor', 'Manager', 'Director')),
  required_permission text,
  special_authority text NOT NULL DEFAULT 'none'
    CHECK (special_authority IN ('none', 'primary', 'manage_developers')),
  capability text NOT NULL
    CHECK (capability IN ('CAN_NONE', 'CAN_VIEW', 'CAN_CONTRIBUTE', 'CAN_EDIT', 'CAN_COMMIT', 'CAN_SUBMIT', 'CAN_APPROVE', 'CAN_ADMIN')),
  scope_rule text NOT NULL DEFAULT 'NONE',
  state_guard text,
  specification_status text NOT NULL
    CHECK (specification_status IN ('CONFIRMED', 'PROPOSED', 'VERIFY_MAPPING')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.authorization_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.authorization_actions FROM PUBLIC, anon, authenticated;
CREATE POLICY authorization_actions_deny_direct_access
  ON public.authorization_actions
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

INSERT INTO public.authorization_actions(
  action_id, action_key, module, description, minimum_business_role,
  required_permission, special_authority, capability, scope_rule, specification_status
) VALUES
  ('AUD-053', 'permissions.template.change', 'Employees / Permissions', 'Change a permission template', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'PROPOSED'),
  ('AUD-069', 'permissions.override.change', 'Employees / Permissions', 'Change a user permission override', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'PROPOSED'),
  ('AUD-070', 'permissions.assignment.change', 'Employees / Permissions', 'Change a user permission template assignment', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'PROPOSED'),
  ('AUD-071', 'permissions.profile.change', 'Employees / Permissions', 'Change a user permission profile', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'PROPOSED'),
  ('AUD-072', 'permissions.profile.update', 'Employees / Permissions', 'Update a user permission profile', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'PROPOSED'),
  ('POL-006', 'permissions.grants.manage', 'Employees / Permissions', 'Manage module, project, and user grants', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'CONFIRMED'),
  ('CFG-027', 'employees.record.create', 'Employees / Permissions', 'Create an employee record', 'Manager', NULL, 'none', 'CAN_EDIT', 'NONE', 'CONFIRMED'),
  ('CFG-028', 'accounts.activate', 'Employees / Permissions', 'Activate a Northgate HQ account', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'CONFIRMED'),
  ('CFG-029', 'permissions.business_role.assign', 'Employees / Permissions', 'Assign or change a business rank', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'CONFIRMED'),
  ('POL-009', 'developers.governance', 'Admin / Audit', 'Primary and delegated Developer governance', NULL, NULL, 'primary', 'CAN_ADMIN', 'NONE', 'CONFIRMED'),
  ('V4-001', 'developers.manager.grant', 'Admin / Audit', 'Grant can_manage_developers', NULL, NULL, 'primary', 'CAN_ADMIN', 'NONE', 'CONFIRMED'),
  ('V4-002', 'developers.assignment.manage', 'Admin / Audit', 'Manage another user Developer assignment', NULL, NULL, 'manage_developers', 'CAN_ADMIN', 'NONE', 'CONFIRMED'),
  ('CFG-050', 'emergency.session.toggle', 'Admin / Audit', 'Enter or leave Primary Emergency Override Mode', NULL, NULL, 'primary', 'CAN_ADMIN', 'NONE', 'CONFIRMED'),
  ('V4-014', 'emergency.recovery.export', 'Admin / Audit', 'Export an Emergency Override recovery package', NULL, NULL, 'primary', 'CAN_ADMIN', 'NONE', 'CONFIRMED'),
  ('V4-015', 'emergency.recovery.apply', 'Admin / Audit', 'Review and apply emergency recovery', NULL, NULL, 'primary', 'CAN_ADMIN', 'NONE', 'CONFIRMED');

CREATE FUNCTION public.business_role_rank(p_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT CASE p_role
    WHEN 'User' THEN 1
    WHEN 'Supervisor' THEN 2
    WHEN 'Manager' THEN 3
    WHEN 'Director' THEN 4
    ELSE 0
  END
$function$;

CREATE FUNCTION public.current_authorization_decision(p_action_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  profile public.user_permissions%ROWTYPE;
  action public.authorization_actions%ROWTYPE;
  permissions jsonb;
  allowed boolean := false;
  source text := 'none';
  denial text;
BEGIN
  IF nullif(actor, '') IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', p_action_id, 'denial', 'authentication_required');
  END IF;
  SELECT * INTO profile
  FROM public.user_permissions
  WHERE clerk_user_id = actor AND is_active
  LIMIT 1;
  IF profile.id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', p_action_id, 'denial', 'active_profile_required');
  END IF;
  SELECT * INTO action
  FROM public.authorization_actions
  WHERE action_id = p_action_id AND is_active;
  IF action.action_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', p_action_id, 'denial', 'unknown_or_inactive_action');
  END IF;
  IF action.scope_rule <> 'NONE' THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', p_action_id, 'denial', 'scope_context_required');
  END IF;
  permissions := public.effective_permissions_for_user(profile.role, profile.division, profile.permission_overrides);
  IF action.special_authority = 'primary' THEN
    allowed := public.current_user_is_primary();
    source := 'protected_primary';
  ELSIF action.special_authority = 'manage_developers' THEN
    allowed := public.user_can_manage_developers(actor);
    source := 'can_manage_developers';
  ELSIF action.minimum_business_role IS NULL THEN
    allowed := false;
    source := 'action_mapping_required';
  ELSE
    allowed := public.business_role_rank(profile.business_role) >= public.business_role_rank(action.minimum_business_role);
    source := 'business_role';
    IF allowed AND action.required_permission IS NOT NULL THEN
      allowed := COALESCE((permissions->>action.required_permission)::boolean, false);
      source := 'business_role_and_permission';
    END IF;
  END IF;
  IF NOT allowed THEN denial := 'insufficient_authority'; END IF;
  RETURN jsonb_build_object(
    'allowed', allowed,
    'action_id', action.action_id,
    'action_key', action.action_key,
    'capability', action.capability,
    'scope_rule', action.scope_rule,
    'source', source,
    'business_role', profile.business_role,
    'denial', denial
  );
END
$function$;

CREATE FUNCTION public.require_current_authorization(p_action_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE decision jsonb;
BEGIN
  decision := public.current_authorization_decision(p_action_id);
  IF COALESCE((decision->>'allowed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Authorization denied for action %', p_action_id USING ERRCODE = '42501', DETAIL = decision::text;
  END IF;
  RETURN decision;
END
$function$;

CREATE FUNCTION public.set_user_developer_assignment(
  p_user_id text,
  p_enabled boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  target public.user_permissions%ROWTYPE;
  prior public.user_technical_assignments%ROWTYPE;
  saved public.user_technical_assignments%ROWTYPE;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM public.require_current_authorization('V4-002');
  IF p_enabled IS NULL OR reason IS NULL OR length(reason) > 500 THEN
    RAISE EXCEPTION 'Target state and a reason of 1 to 500 characters are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO target
  FROM public.user_permissions
  WHERE clerk_user_id = p_user_id AND is_active
  FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Active target user is required' USING ERRCODE = '22023'; END IF;
  IF public.is_protected_account(p_user_id, 'primary') THEN
    RAISE EXCEPTION 'Primary technical authority cannot be changed through Developer assignment management' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = actor THEN
    RAISE EXCEPTION 'Developer administrators cannot change their own technical assignment' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO prior
  FROM public.user_technical_assignments
  WHERE user_id = p_user_id AND assignment_key = 'developer' AND is_active
  FOR UPDATE;
  IF p_enabled THEN
    IF prior.id IS NOT NULL THEN RETURN to_jsonb(prior) || jsonb_build_object('idempotent', true); END IF;
    INSERT INTO public.user_technical_assignments(user_id, assignment_key, granted_by, grant_reason)
    VALUES(p_user_id, 'developer', actor, reason)
    RETURNING * INTO saved;
  ELSE
    IF prior.id IS NULL THEN RETURN jsonb_build_object('user_id', p_user_id, 'assignment_key', 'developer', 'is_active', false, 'idempotent', true); END IF;
    UPDATE public.user_technical_assignments
    SET is_active = false, revoked_by = actor, revoked_at = now(), revoke_reason = reason
    WHERE id = prior.id
    RETURNING * INTO saved;
  END IF;
  INSERT INTO public.change_logs(user_id, user_name, table_name, record_id, action, before_data, after_data, note)
  VALUES(
    actor,
    (SELECT coalesce(nullif(display_name,''), nullif(email,''), actor) FROM public.user_permissions WHERE clerk_user_id = actor),
    'user_technical_assignments', saved.id::text, 'permission_change', to_jsonb(prior), to_jsonb(saved), reason
  );
  RETURN to_jsonb(saved) || jsonb_build_object('idempotent', false);
END
$function$;

CREATE FUNCTION public.read_user_developer_assignment(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE result jsonb;
BEGIN
  PERFORM public.require_current_authorization('V4-002');
  SELECT jsonb_build_object(
    'user_id', permission.clerk_user_id,
    'is_primary', public.is_protected_account(permission.clerk_user_id, 'primary'),
    'is_developer', public.user_has_technical_assignment(permission.clerk_user_id, 'developer')
  )
  INTO result
  FROM public.user_permissions permission
  WHERE permission.clerk_user_id = p_user_id AND permission.is_active;
  IF result IS NULL THEN RAISE EXCEPTION 'Active target user is required' USING ERRCODE = '22023'; END IF;
  RETURN result;
END
$function$;

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
      || coalesce(template.permissions, '{}'::jsonb)
      || jsonb_build_object(
        'can_save_personal_work', true,
        'can_access_developer', public.user_has_technical_assignment(up.clerk_user_id, 'developer'),
        'can_manage_developers', public.user_can_manage_developers(up.clerk_user_id)
      )
    INTO result
    FROM public.user_permissions up
    LEFT JOIN public.user_permission_templates assignment ON assignment.user_id = up.clerk_user_id
    LEFT JOIN public.permission_templates template ON template.id = assignment.template_id
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
      'can_save_personal_work', true,
      'can_access_developer', public.user_has_technical_assignment(auth.jwt()->>'sub', 'developer'),
      'can_manage_developers', public.user_can_manage_developers(auth.jwt()->>'sub')
    )
$function$;

REVOKE ALL ON FUNCTION public.user_has_technical_assignment(text,text),
  public.business_role_rank(text), public.current_authorization_decision(text),
  public.require_current_authorization(text), public.set_user_developer_assignment(text,boolean,text),
  public.read_user_developer_assignment(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_authorization_decision(text),
  public.set_user_developer_assignment(text,boolean,text), public.read_user_developer_assignment(text)
TO authenticated;

NOTIFY pgrst, 'reload schema';
