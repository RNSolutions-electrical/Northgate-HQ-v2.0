-- Public permission function definitions captured from the live schema on 2026-09-14.
-- Used only in the isolated local PostgreSQL harness; no account data is included.
CREATE OR REPLACE FUNCTION public.current_user_can_access_addon(p_addon_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    public.current_user_has_developer_access()
    OR EXISTS (
      SELECT 1
      FROM public.tool_addon_access access
      JOIN public.tool_addons addon ON addon.addon_key = access.addon_key
      JOIN public.user_permissions up ON up.clerk_user_id = access.clerk_user_id
      WHERE access.addon_key = p_addon_key
        AND access.clerk_user_id = auth.jwt() ->> 'sub'
        AND access.enabled = TRUE
        AND addon.is_active = TRUE
        AND up.is_active = TRUE
    ), FALSE
  );
$function$;
CREATE OR REPLACE FUNCTION public.current_user_can_access_job(p_job_id uuid, p_permission text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT EXISTS(SELECT 1 FROM public.jobs j WHERE j.id=p_job_id AND (public.current_user_can_read_division(j.division,p_permission) OR EXISTS(SELECT 1 FROM public.job_sub_divisions s WHERE s.job_id=j.id AND public.current_user_can_read_division(s.division,p_permission)))); $function$;
CREATE OR REPLACE FUNCTION public.current_user_can_edit_division(p_division text, p_required_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
BEGIN
  IF jwt_subject IS NULL OR NULLIF(BTRIM(p_required_permission), '') IS NULL THEN RETURN FALSE; END IF;
  SELECT * INTO caller FROM public.user_permissions up WHERE up.clerk_user_id=jwt_subject AND up.is_active LIMIT 1;
  IF caller.id IS NULL THEN RETURN FALSE; END IF;
  caller_permissions := public.effective_permissions_for_user(caller.role,caller.division,caller.permission_overrides);
  RETURN COALESCE((caller_permissions ->> p_required_permission)::BOOLEAN,FALSE)
    AND (caller.role IN ('Developer','Director','Manager') OR (p_division IS NOT NULL AND caller.division=p_division));
END;
$function$;
CREATE OR REPLACE FUNCTION public.current_user_can_edit_job(p_job_id uuid, p_required_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = p_job_id AND j.archived_at IS NULL AND (public.current_user_can_edit_division(j.division, p_required_permission) OR EXISTS (SELECT 1 FROM public.job_sub_divisions s WHERE s.job_id = j.id AND public.current_user_can_edit_division(s.division, p_required_permission)))); $function$;
CREATE OR REPLACE FUNCTION public.current_user_can_read_division(p_division text, p_required_permission text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  required_ok BOOLEAN := TRUE;
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RETURN FALSE;
  END IF;

  caller_permissions := public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides);

  IF p_required_permission IS NOT NULL THEN
    required_ok := COALESCE((caller_permissions ->> p_required_permission)::BOOLEAN, FALSE);
  END IF;

  RETURN required_ok IS TRUE
    AND (
      COALESCE((caller_permissions ->> 'can_view_all_divisions')::BOOLEAN, FALSE) IS TRUE
      OR (p_division IS NOT NULL AND caller.division = p_division)
    );
END;
$function$;
CREATE OR REPLACE FUNCTION public.default_permissions_for_role(p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE base JSONB; budget_approver BOOLEAN; full_project_financials BOOLEAN; BEGIN CASE p_role WHEN 'Developer' THEN base := '{"can_access_developer":true,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb; WHEN 'Director' THEN base := '{"can_access_developer":false,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb; WHEN 'Manager' THEN base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb; WHEN 'Supervisor' THEN base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":true}'::jsonb; ELSE base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":false,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":false,"can_view_all_divisions":false,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb; END CASE; budget_approver:=COALESCE((base->>'can_approve_budget')::BOOLEAN,FALSE); full_project_financials:=p_role IN ('Supervisor','Manager','Director','Developer'); RETURN base || jsonb_build_object('can_view_asset_financials',TRUE,'can_view_project_financials',p_role IN ('Supervisor','Manager','Director','Developer'),'can_view_protected_project_financials',full_project_financials,'can_express_checkout',COALESCE((base->>'can_inventory_transactions')::BOOLEAN,FALSE),'can_approve_express_checkout',p_role IN ('Developer','Manager','Director'),'can_defer_completion',p_role='Developer','can_create_change_orders',budget_approver,'can_submit_change_orders',budget_approver,'can_verify_change_orders',budget_approver,'can_approve_change_orders',budget_approver,'can_revise_change_orders',budget_approver); END; $function$;
CREATE OR REPLACE FUNCTION public.effective_permissions_for_user(p_role text, p_division text, p_permission_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.permission_base_for_user(p_role, p_division, p_permission_overrides)
    || coalesce((SELECT t.permissions FROM public.user_permission_templates a
                 JOIN public.permission_templates t ON t.id = a.template_id
                 WHERE a.user_id = auth.jwt()->>'sub'), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg(s.permission_flag, s.granted) FROM (
         SELECT o.permission_flag, bool_and(o.granted) AS granted FROM public.user_permission_overrides o
         WHERE o.user_id = auth.jwt()->>'sub' AND o.is_active AND o.permission_flag <> 'can_access_developer'
         GROUP BY o.permission_flag
       ) s), '{}'::jsonb);
$function$;
CREATE OR REPLACE FUNCTION public.permission_base_for_user(p_role text, p_division text, p_permission_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.default_permissions_for_role(p_role)
    || CASE WHEN p_division = 'Admin' THEN '{"can_view_all_divisions":true}'::jsonb ELSE '{}'::jsonb END
    || coalesce((SELECT t.permissions FROM public.permission_templates t
                 WHERE t.default_role = p_role AND t.default_division = coalesce(p_division, 'Unassigned')), '{}'::jsonb)
    || CASE WHEN p_permission_overrides ? 'can_access_developer'
       THEN jsonb_build_object('can_access_developer', coalesce((p_permission_overrides->>'can_access_developer')::boolean, false))
       ELSE '{}'::jsonb END;
$function$;
