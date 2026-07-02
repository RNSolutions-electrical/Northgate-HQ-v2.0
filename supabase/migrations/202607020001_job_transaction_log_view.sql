CREATE OR REPLACE VIEW public.job_transaction_log AS
SELECT
  ti.id AS transaction_item_id,
  ti.transaction_id,
  COALESCE(ti.occurred_at, ti.created_at, tx.created_at) AS occurred_at,
  tx.created_at AS transaction_created_at,
  ti.division,
  ti.destination_id AS job_id,
  ti.item_id,
  i.material_code,
  i.name AS item_name,
  i.unit_of_measure,
  ti.quantity,
  ti.transaction_type,
  bi.id AS source_bin_id,
  b.bin_code AS source_bin_code,
  b.label AS source_bin_label,
  NULLIF(
    CONCAT_WS(' / ', su.unit_code, sh.shelf_code, bay.bay_code, b.bin_code),
    ''
  ) AS source_location_label,
  COALESCE(
    NULLIF(tx.performed_by_name, ''),
    NULLIF(actor.display_name, ''),
    NULLIF(actor.email, ''),
    tx.user_id
  ) AS performed_by,
  tx.user_id AS performed_by_user_id,
  COALESCE(NULLIF(ti.note, ''), NULLIF(tx.notes, '')) AS note,
  ti.ledger_sequence
FROM public.transaction_items ti
JOIN public.inventory_transactions tx
  ON tx.id = ti.transaction_id
JOIN public.bin_items bi
  ON bi.id = ti.bin_item_id
JOIN public.bins b
  ON b.id = bi.bin_id
JOIN public.bays bay
  ON bay.id = b.bay_id
JOIN public.shelves sh
  ON sh.id = bay.shelf_id
JOIN public.storage_units su
  ON su.id = sh.unit_id
JOIN public.items i
  ON i.id = ti.item_id
LEFT JOIN public.user_permissions actor
  ON actor.clerk_user_id = tx.user_id
 AND actor.is_active = TRUE
WHERE ti.destination_type = 'job';

COMMENT ON VIEW public.job_transaction_log IS
  'Read-only job transaction log sourced from the existing inventory ledger. No cost, value, write, or accounting behavior.';

GRANT SELECT ON public.job_transaction_log TO authenticated;
