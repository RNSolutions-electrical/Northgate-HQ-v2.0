WITH baseline_transaction AS (
  INSERT INTO public.inventory_transactions (
    transaction_type,
    user_id,
    performed_by_name,
    source_vehicle_id,
    notes
  )
  VALUES (
    'physical_count_correction',
    'system',
    'System Baseline',
    NULL,
    'Backfill physical count corrections from current inventory balances'
  )
  RETURNING id
)
INSERT INTO public.transaction_items (
  transaction_id,
  bin_item_id,
  item_id,
  quantity,
  target_quantity,
  unit_cost_at_time,
  transaction_type,
  destination_type,
  destination_id,
  cost_code_id,
  status,
  note,
  occurred_at
)
SELECT
  baseline_transaction.id,
  ib.bin_item_id,
  bi.item_id,
  0,
  ib.quantity,
  COALESCE(i.price_per_unit, 0),
  'physical_count_correction',
  'office',
  NULL,
  i.default_cost_code_id,
  'approved',
  'Ledger baseline backfill from current inventory balance',
  NOW()
FROM public.inventory_balances ib
JOIN public.bin_items bi ON bi.id = ib.bin_item_id
JOIN public.items i ON i.id = bi.item_id
CROSS JOIN baseline_transaction
WHERE ib.quantity >= 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.transaction_items ti
    WHERE ti.bin_item_id = ib.bin_item_id
      AND ti.status = 'approved'
      AND ti.transaction_type = 'physical_count_correction'
      AND ti.target_quantity = ib.quantity
      AND ti.note = 'Ledger baseline backfill from current inventory balance'
  );
