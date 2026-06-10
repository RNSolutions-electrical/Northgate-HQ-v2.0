CREATE OR REPLACE VIEW public.inventory_cart_candidates_view AS
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
WHERE i.is_active = TRUE
  AND i.is_archived = FALSE;

GRANT SELECT ON public.inventory_cart_candidates_view TO anon, authenticated;
