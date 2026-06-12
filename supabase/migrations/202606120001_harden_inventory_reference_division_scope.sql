CREATE OR REPLACE VIEW public.inventory_cart_candidates_view AS
WITH viewer AS (
  SELECT up.division
  FROM public.user_permissions up
  WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
    AND up.is_active = TRUE
  LIMIT 1
)
SELECT
  bi.id AS bin_item_id,
  bi.item_id,
  b.id AS bin_id,
  b.bin_code,
  b.label AS bin_label,
  i.material_code,
  i.name AS item_name,
  i.unit_of_measure,
  i.division,
  i.price_per_unit,
  COALESCE(ib.quantity, 0) AS quantity_on_hand,
  bi.min_quantity,
  bi.created_at
FROM public.bin_items bi
JOIN public.items i ON i.id = bi.item_id
JOIN public.bins b ON b.id = bi.bin_id
LEFT JOIN public.inventory_balances ib ON ib.bin_item_id = bi.id
CROSS JOIN viewer v
WHERE i.is_active = TRUE
  AND i.is_archived = FALSE
  AND (
    v.division = 'Admin'
    OR (v.division IN ('Electrical', 'Construction') AND i.division = v.division)
  );

CREATE OR REPLACE VIEW public.inventory_destination_users_view AS
WITH viewer AS (
  SELECT up.division
  FROM public.user_permissions up
  WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
    AND up.is_active = TRUE
  LIMIT 1
)
SELECT
  target.clerk_user_id,
  target.display_name,
  target.email,
  target.role,
  target.division
FROM public.user_permissions target
CROSS JOIN viewer v
WHERE target.is_active = TRUE
  AND (
    v.division = 'Admin'
    OR (v.division IN ('Electrical', 'Construction') AND target.division = v.division)
  );

CREATE OR REPLACE VIEW public.inventory_destination_vehicles_view AS
WITH viewer AS (
  SELECT up.division
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
  AND v.division = 'Admin';

GRANT SELECT ON public.inventory_cart_candidates_view TO anon, authenticated;
GRANT SELECT ON public.inventory_destination_users_view TO anon, authenticated;
GRANT SELECT ON public.inventory_destination_vehicles_view TO anon, authenticated;
