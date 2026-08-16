CREATE OR REPLACE VIEW public.inventory_destination_users_view AS
SELECT
  target.clerk_user_id,
  target.display_name,
  target.email,
  target.role,
  target.division
FROM public.user_permissions target
WHERE target.is_active = TRUE
  AND public.current_user_can_read_division(target.division);

CREATE OR REPLACE VIEW public.inventory_destination_vehicles_view AS
WITH viewer AS (
  SELECT
    public.effective_permissions_for_user(up.role, up.division, up.permission_overrides) AS effective_permissions
  FROM public.user_permissions up
  WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
    AND up.is_active = TRUE
  LIMIT 1
)
SELECT
  target.id,
  target.vehicle_number,
  target.name,
  NULL::TEXT AS make,
  NULL::TEXT AS model,
  target.classification,
  target.holds_stock,
  NULL::TEXT AS division
FROM public.vehicles target
CROSS JOIN viewer v
WHERE target.is_active = TRUE
  AND COALESCE((v.effective_permissions ->> 'can_view_all_divisions')::BOOLEAN, FALSE) IS TRUE;

COMMENT ON VIEW public.inventory_destination_users_view IS
  'Limited employee directory/destination reference. Visible rows follow current_user_can_read_division(target.division).';
COMMENT ON VIEW public.inventory_destination_vehicles_view IS
  'Limited vehicle directory/destination reference. Vehicles do not currently have a division column, so visibility remains all-division only until a vehicle division source exists.';

GRANT SELECT ON public.inventory_destination_users_view TO anon, authenticated;
GRANT SELECT ON public.inventory_destination_vehicles_view TO anon, authenticated;
