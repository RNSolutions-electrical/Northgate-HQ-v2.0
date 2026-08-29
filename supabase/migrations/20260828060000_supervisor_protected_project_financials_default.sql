-- Applied to production as `supervisor_protected_project_financials_default`.
-- This preserves every existing role default and changes only the Supervisor
-- default for protected project-financial visibility.
CREATE OR REPLACE FUNCTION public.default_permissions_for_role(p_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE base JSONB; budget_approver BOOLEAN; full_project_financials BOOLEAN;
BEGIN
  CASE p_role
    WHEN 'Developer' THEN base := '{"can_access_developer":true,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Director' THEN base := '{"can_access_developer":false,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Manager' THEN base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Supervisor' THEN base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":true}'::jsonb;
    ELSE base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":false,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":false,"can_view_all_divisions":false,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
  END CASE;
  budget_approver := COALESCE((base->>'can_approve_budget')::BOOLEAN,FALSE);
  full_project_financials := p_role IN ('Supervisor','Manager','Director','Developer');
  RETURN base || jsonb_build_object('can_view_asset_financials',TRUE,'can_view_project_financials',p_role IN ('Supervisor','Manager','Director','Developer'),'can_view_protected_project_financials',full_project_financials,'can_express_checkout',COALESCE((base->>'can_inventory_transactions')::BOOLEAN,FALSE),'can_approve_express_checkout',p_role IN ('Developer','Manager','Director'),'can_defer_completion',p_role='Developer','can_create_change_orders',budget_approver,'can_submit_change_orders',budget_approver,'can_verify_change_orders',budget_approver,'can_approve_change_orders',budget_approver,'can_revise_change_orders',budget_approver);
END;
$$;
