CREATE OR REPLACE FUNCTION default_permissions_for_role(p_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  base JSONB;
BEGIN
  CASE p_role
    WHEN 'Developer' THEN
      base := '{"can_access_developer":true,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Administrator' THEN
      base := '{"can_access_developer":false,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Project Manager' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":true,"can_inventory_transactions":true,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Estimator' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":false,"can_estimate":true,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
    WHEN 'Field Supervisor' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":false,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":true,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
    ELSE
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":false,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":false,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
  END CASE;

  RETURN base || jsonb_build_object(
    'can_express_checkout', COALESCE((base ->> 'can_inventory_transactions')::boolean, false),
    'can_approve_express_checkout', p_role IN ('Developer', 'Administrator'),
    'can_defer_completion', p_role = 'Developer'
  );
END;
$$;
