-- Preserve the existing v5 authorization policy; disambiguate its local job ID
-- from job_user_assignments.job_id inside ASSIGNED_PM_OR_DIRECTOR.
CREATE OR REPLACE FUNCTION public.current_scoped_authorization_decision(p_action_id text, p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  profile public.user_permissions%ROWTYPE;
  action public.authorization_actions%ROWTYPE;
  permissions jsonb;
  scoped_job_id uuid;
  target_user_id text := nullif(p_context->>'target_user_id', '');
  authority_allowed boolean := false;
  scope_allowed boolean := false;
  authority_source text := 'none';
  scope_source text := 'none';
  permission_source jsonb;
  denial text;
BEGIN
  IF p_action_id = 'CAT-STOCK-REVIEW' THEN
    RETURN jsonb_build_object('allowed', public.can_review_material_stock(p_context->>'division') AND EXISTS(SELECT 1 FROM public.authorization_actions WHERE action_id=p_action_id AND is_active), 'action_id', p_action_id, 'scope_rule', 'CATALOGUE_STOCK_DEPARTMENT');
  END IF;
  IF nullif(actor, '') IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', p_action_id, 'denial', 'authentication_required');
  END IF;
  SELECT * INTO profile FROM public.user_permissions
  WHERE clerk_user_id = actor AND is_active LIMIT 1;
  IF profile.id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', p_action_id, 'denial', 'active_profile_required');
  END IF;
  SELECT * INTO action FROM public.authorization_actions
  WHERE action_id = p_action_id AND is_active;
  IF action.action_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', p_action_id, 'denial', 'unknown_or_inactive_action');
  END IF;
  IF action.special_authority = 'primary' THEN
    authority_allowed := public.current_user_is_primary();
    authority_source := 'protected_primary';
  ELSIF action.special_authority = 'manage_developers' THEN
    authority_allowed := public.user_can_manage_developers(actor);
    authority_source := 'can_manage_developers';
  ELSIF action.base_authority IN ('CUSTOM', 'SCOPED_ONLY', 'CAN_NONE')
        AND action.minimum_business_role IS NULL
        AND action.required_permission IS NULL THEN
    denial := 'action_mapping_required';
  ELSE
    authority_allowed := public.business_role_rank(profile.business_role) >= public.business_role_rank(action.minimum_business_role);
    authority_source := 'business_role';
    IF authority_allowed AND action.required_permission IS NOT NULL THEN
      permissions := public.effective_permissions_for_user(profile.role, profile.division, profile.permission_overrides);
      authority_allowed := COALESCE((permissions->>action.required_permission)::boolean, false);
      permission_source := public.current_permission_provenance(action.required_permission);
      authority_source := 'business_role_and_permission';
    END IF;
  END IF;
  IF denial IS NULL AND NOT authority_allowed THEN denial := 'insufficient_authority'; END IF;
  IF denial IS NOT NULL THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', action.action_id, 'action_key', action.action_key,
      'denial', denial, 'authority_source', authority_source, 'permission_source', permission_source,
      'business_role', profile.business_role, 'scope_rule', action.scope_rule);
  END IF;
  BEGIN
    scoped_job_id := nullif(p_context->>'job_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', action.action_id, 'denial', 'invalid_job_context');
  END;
  CASE action.scope_rule
    WHEN 'NONE' THEN
      scope_allowed := true; scope_source := 'global_action';
    WHEN 'PROJECT_ACCESS' THEN
      scope_allowed := scoped_job_id IS NOT NULL AND public.current_user_can_access_job(scoped_job_id);
      scope_source := 'project_access';
    WHEN 'PROJECT_ACCESS_IF_ATTACHED' THEN
      scope_allowed := scoped_job_id IS NULL OR public.current_user_can_access_job(scoped_job_id);
      scope_source := CASE WHEN scoped_job_id IS NULL THEN 'not_attached' ELSE 'project_access' END;
    WHEN 'ASSIGNED_PM_OR_DIRECTOR' THEN
      scope_allowed := scoped_job_id IS NOT NULL AND (
        (profile.business_role = 'Director' AND public.current_user_can_access_job(scoped_job_id))
        OR EXISTS (
          SELECT 1 FROM public.job_user_assignments assignment
          WHERE assignment.job_id = scoped_job_id AND assignment.user_id = actor
            AND assignment.assignment_role = 'project_manager' AND assignment.unassigned_at IS NULL
        )
      );
      scope_source := CASE WHEN profile.business_role = 'Director' THEN 'division_director' ELSE 'assigned_project_manager' END;
    WHEN 'SERVICE_CALL_ACCESS' THEN
      scope_allowed := scoped_job_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.jobs job WHERE job.id = scoped_job_id AND job.job_type = 'service_call' AND job.archived_at IS NULL)
        AND public.current_user_can_access_job(scoped_job_id);
      scope_source := 'service_call_access';
    WHEN 'SELF_OR_MANAGED_EMPLOYEE' THEN
      scope_allowed := target_user_id = actor OR EXISTS (
        SELECT 1 FROM public.user_permissions target
        WHERE target.clerk_user_id = target_user_id AND target.is_active
          AND public.business_role_rank(profile.business_role) >= public.business_role_rank('Manager')
          AND target.division IS NOT DISTINCT FROM profile.division
      );
      scope_source := CASE WHEN target_user_id = actor THEN 'self' ELSE 'managed_employee_department' END;
    WHEN 'PM_COMPANY_VIEW' THEN
      scope_allowed := public.business_role_rank(profile.business_role) >= public.business_role_rank('Manager');
      scope_source := 'manager_company_view';
    ELSE
      scope_allowed := false; scope_source := 'unimplemented_scope_rule';
  END CASE;
  IF NOT scope_allowed THEN denial := CASE WHEN scope_source = 'unimplemented_scope_rule' THEN 'scope_mapping_required' ELSE 'outside_authorized_scope' END; END IF;
  RETURN jsonb_build_object(
    'allowed', authority_allowed AND scope_allowed,
    'action_id', action.action_id,
    'action_key', action.action_key,
    'capability', action.capability,
    'business_role', profile.business_role,
    'authority_source', authority_source,
    'permission_source', permission_source,
    'scope_rule', action.scope_rule,
    'scope_source', scope_source,
    'denial', denial
  );
END
$function$;
