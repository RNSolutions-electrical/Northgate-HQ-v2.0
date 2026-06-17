ALTER TABLE public.bin_items
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS archived_by TEXT,
ADD COLUMN IF NOT EXISTS archive_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_bin_items_active_bin_item
  ON public.bin_items (bin_id, item_id)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN public.bin_items.archived_at IS
  'Soft-retirement timestamp for mistaken bin/material structural links. Retirement writes no ledger row and no quantity.';
COMMENT ON COLUMN public.bin_items.archived_by IS
  'Clerk subject that retired the bin/material structural link.';
COMMENT ON COLUMN public.bin_items.archive_reason IS
  'Required reason for retiring the bin/material structural link.';

ALTER TABLE public.change_logs DROP CONSTRAINT IF EXISTS change_logs_action_check;

ALTER TABLE public.change_logs ADD CONSTRAINT change_logs_action_check
  CHECK (action IN (
    'create', 'update', 'delete', 'restore', 'archive',
    'import', 'permission_change', 'physical_count_correction'
  ));

REVOKE INSERT, UPDATE, DELETE ON public.bin_items FROM anon, authenticated;
GRANT SELECT ON public.bin_items TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.retire_bin_item(
  p_bin_item_id UUID,
  p_reason TEXT
)
RETURNS TABLE (
  bin_item_id UUID,
  bin_id UUID,
  item_id UUID,
  bin_code TEXT,
  material_code TEXT,
  item_name TEXT,
  ledger_balance NUMERIC,
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  target_record RECORD;
  latest_correction_sequence BIGINT;
  latest_correction_occurred_at TIMESTAMPTZ;
  latest_target_quantity NUMERIC;
  calculated_balance NUMERIC := 0;
  reason_text TEXT;
  now_stamp TIMESTAMPTZ := NOW();
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_bin_item_id IS NULL THEN
    RAISE EXCEPTION 'bin_item_id is required';
  END IF;

  reason_text := NULLIF(trim(COALESCE(p_reason, '')), '');

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'archive reason is required';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required';
  END IF;

  caller_permissions := public.default_permissions_for_role(caller.role) || caller.permission_overrides;

  IF caller.role NOT IN ('Developer', 'Administrator', 'Admin') THEN
    RAISE EXCEPTION 'Developer or Administrator role is required to retire a bin item';
  END IF;

  IF COALESCE((caller_permissions ->> 'can_archive_records')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'can_archive_records permission is required to retire a bin item';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_bin_item_id::TEXT));

  SELECT
    bi.id AS bin_item_id,
    bi.bin_id,
    bi.item_id,
    bi.min_quantity,
    bi.created_at,
    bi.archived_at,
    bi.archived_by,
    bi.archive_reason,
    b.bin_code,
    i.material_code,
    i.name AS item_name
  INTO target_record
  FROM public.bin_items bi
  JOIN public.bins b ON b.id = bi.bin_id
  JOIN public.items i ON i.id = bi.item_id
  WHERE bi.id = p_bin_item_id
  FOR UPDATE OF bi;

  IF target_record.bin_item_id IS NULL THEN
    RAISE EXCEPTION 'valid bin_item_id is required';
  END IF;

  IF target_record.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'bin_item is already retired';
  END IF;

  SELECT ti.ledger_sequence, ti.occurred_at, ti.target_quantity
  INTO latest_correction_sequence, latest_correction_occurred_at, latest_target_quantity
  FROM public.transaction_items ti
  WHERE ti.bin_item_id = p_bin_item_id
    AND ti.status = 'approved'
    AND ti.transaction_type = 'physical_count_correction'
    AND ti.target_quantity IS NOT NULL
  ORDER BY ti.occurred_at DESC, ti.ledger_sequence DESC
  LIMIT 1;

  IF latest_correction_sequence IS NOT NULL THEN
    SELECT latest_target_quantity + COALESCE(SUM(
      CASE
        WHEN ti.transaction_type IN (
          'add_stock',
          'return_from_job',
          'return_from_vehicle'
        ) THEN ti.quantity

        WHEN ti.transaction_type IN (
          'remove_stock',
          'assign_to_job',
          'assign_to_vehicle',
          'scrap',
          'vendor_return',
          'mark_damaged'
        ) THEN -ti.quantity

        ELSE 0
      END
    ), 0)
    INTO calculated_balance
    FROM public.transaction_items ti
    WHERE ti.bin_item_id = p_bin_item_id
      AND ti.status = 'approved'
      AND ti.transaction_type <> 'physical_count_correction'
      AND (
        ti.occurred_at > latest_correction_occurred_at
        OR (
          ti.occurred_at = latest_correction_occurred_at
          AND ti.ledger_sequence > latest_correction_sequence
        )
      );
  ELSE
    SELECT COALESCE(SUM(
      CASE
        WHEN ti.transaction_type IN (
          'add_stock',
          'return_from_job',
          'return_from_vehicle'
        ) THEN ti.quantity

        WHEN ti.transaction_type IN (
          'remove_stock',
          'assign_to_job',
          'assign_to_vehicle',
          'scrap',
          'vendor_return',
          'mark_damaged'
        ) THEN -ti.quantity

        ELSE 0
      END
    ), 0)
    INTO calculated_balance
    FROM public.transaction_items ti
    WHERE ti.bin_item_id = p_bin_item_id
      AND ti.status = 'approved'
      AND ti.transaction_type <> 'physical_count_correction';
  END IF;

  calculated_balance := COALESCE(calculated_balance, 0);

  IF calculated_balance <> 0 THEN
    RAISE EXCEPTION 'bin_item balance is %. Use physical count correction to zero it before retirement.', calculated_balance;
  END IF;

  UPDATE public.bin_items bi
  SET archived_at = now_stamp,
      archived_by = jwt_subject,
      archive_reason = reason_text
  WHERE bi.id = p_bin_item_id;

  INSERT INTO public.change_logs (
    user_id,
    user_name,
    table_name,
    record_id,
    action,
    before_data,
    after_data,
    note,
    created_at
  )
  VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'bin_items',
    p_bin_item_id::TEXT,
    'archive',
    jsonb_build_object(
      'bin_item_id', target_record.bin_item_id,
      'bin_id', target_record.bin_id,
      'item_id', target_record.item_id,
      'archived_at', target_record.archived_at,
      'archived_by', target_record.archived_by,
      'archive_reason', target_record.archive_reason,
      'ledger_balance', calculated_balance
    ),
    jsonb_build_object(
      'bin_item_id', target_record.bin_item_id,
      'bin_id', target_record.bin_id,
      'item_id', target_record.item_id,
      'archived_at', now_stamp,
      'archived_by', jwt_subject,
      'archive_reason', reason_text,
      'ledger_balance', calculated_balance
    ),
    reason_text,
    now_stamp
  );

  RETURN QUERY
  SELECT
    target_record.bin_item_id,
    target_record.bin_id,
    target_record.item_id,
    target_record.bin_code,
    target_record.material_code,
    target_record.item_name,
    calculated_balance,
    now_stamp,
    jwt_subject,
    reason_text;
END;
$$;

REVOKE ALL ON FUNCTION public.retire_bin_item(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retire_bin_item(UUID, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_inventory_count_quantity(
  p_bin_item_id UUID,
  p_target_quantity NUMERIC,
  p_reason TEXT
)
RETURNS TABLE (
  transaction_id UUID,
  transaction_item_id UUID,
  bin_item_id UUID,
  target_quantity NUMERIC,
  quantity_on_hand NUMERIC,
  status TEXT,
  occurred_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
  caller public.user_permissions%ROWTYPE;
  bin_item_record RECORD;
  correction_transaction_id UUID;
  correction_item_id UUID;
  now_stamp TIMESTAMPTZ := NOW();
  adjusted_quantity NUMERIC;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_bin_item_id IS NULL THEN
    RAISE EXCEPTION 'bin_item_id is required';
  END IF;

  IF p_target_quantity IS NULL THEN
    RAISE EXCEPTION 'target_quantity is required';
  END IF;

  IF p_target_quantity < 0 THEN
    RAISE EXCEPTION 'target_quantity must be greater than or equal to zero';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required';
  END IF;

  IF caller.role NOT IN ('Developer', 'Administrator', 'Admin') THEN
    RAISE EXCEPTION 'Developer or Administrator role is required to set inventory count quantity';
  END IF;

  SELECT
    bi.id AS bin_item_id,
    bi.item_id,
    bi.bin_id,
    bi.archived_at,
    i.material_code,
    i.name AS item_name,
    i.price_per_unit,
    i.default_cost_code_id,
    i.is_active,
    i.is_archived
  INTO bin_item_record
  FROM public.bin_items bi
  JOIN public.items i ON i.id = bi.item_id
  WHERE bi.id = p_bin_item_id;

  IF bin_item_record.bin_item_id IS NULL THEN
    RAISE EXCEPTION 'valid bin_item_id is required';
  END IF;

  IF bin_item_record.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'retired bin_item cannot be counted';
  END IF;

  IF bin_item_record.is_active IS NOT TRUE OR bin_item_record.is_archived IS TRUE THEN
    RAISE EXCEPTION 'linked item must be active and not archived';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_bin_item_id::TEXT));

  PERFORM 1
  FROM public.inventory_balances ib
  WHERE ib.bin_item_id = p_bin_item_id
  FOR UPDATE;

  INSERT INTO public.inventory_transactions (
    transaction_type,
    user_id,
    performed_by_name,
    source_vehicle_id,
    notes
  )
  VALUES (
    'physical_count_correction',
    jwt_subject,
    COALESCE(caller.display_name, caller.email, jwt_subject),
    NULL,
    trim(p_reason)
  )
  RETURNING id INTO correction_transaction_id;

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
  VALUES (
    correction_transaction_id,
    p_bin_item_id,
    bin_item_record.item_id,
    0,
    p_target_quantity,
    COALESCE(bin_item_record.price_per_unit, 0),
    'physical_count_correction',
    NULL,
    NULL,
    bin_item_record.default_cost_code_id,
    'approved',
    trim(p_reason),
    now_stamp
  )
  RETURNING id INTO correction_item_id;

  SELECT ib.quantity
  INTO adjusted_quantity
  FROM public.inventory_balances ib
  WHERE ib.bin_item_id = p_bin_item_id;

  RETURN QUERY
  SELECT
    correction_transaction_id,
    correction_item_id,
    p_bin_item_id,
    p_target_quantity,
    adjusted_quantity,
    'approved'::TEXT,
    now_stamp;
END;
$$;

REVOKE ALL ON FUNCTION public.set_inventory_count_quantity(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_inventory_count_quantity(UUID, NUMERIC, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.intake_inventory_count(
  p_bin_id UUID,
  p_item_id UUID,
  p_counted_quantity NUMERIC,
  p_reason TEXT
)
RETURNS TABLE (
  bin_item_id UUID,
  transaction_id UUID,
  transaction_item_id UUID,
  prior_system_quantity NUMERIC,
  counted_quantity NUMERIC,
  variance NUMERIC,
  reason TEXT,
  quantity_on_hand NUMERIC,
  status TEXT,
  occurred_at TIMESTAMPTZ,
  created_bin_item BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
  caller public.user_permissions%ROWTYPE;
  target_bin_id UUID;
  target_item_id UUID;
  target_bin_item_id UUID;
  retired_bin_item_id UUID;
  created_structural_link BOOLEAN := FALSE;
  prior_quantity NUMERIC := 0;
  correction_result RECORD;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_bin_id IS NULL THEN
    RAISE EXCEPTION 'bin_id is required';
  END IF;

  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'item_id is required';
  END IF;

  IF p_counted_quantity IS NULL THEN
    RAISE EXCEPTION 'counted_quantity is required';
  END IF;

  IF p_counted_quantity < 0 THEN
    RAISE EXCEPTION 'counted_quantity must be greater than or equal to zero';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required';
  END IF;

  IF caller.role NOT IN ('Developer', 'Administrator', 'Admin') THEN
    RAISE EXCEPTION 'Developer or Administrator role is required for inventory count intake';
  END IF;

  SELECT b.id
  INTO target_bin_id
  FROM public.bins b
  WHERE b.id = p_bin_id;

  IF target_bin_id IS NULL THEN
    RAISE EXCEPTION 'valid bin_id is required';
  END IF;

  SELECT i.id
  INTO target_item_id
  FROM public.items i
  WHERE i.id = p_item_id
    AND i.is_active IS TRUE
    AND i.is_archived IS NOT TRUE;

  IF target_item_id IS NULL THEN
    RAISE EXCEPTION 'valid active catalog item_id is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_bin_id::TEXT || ':' || p_item_id::TEXT));

  SELECT bi.id
  INTO retired_bin_item_id
  FROM public.bin_items bi
  WHERE bi.bin_id = p_bin_id
    AND bi.item_id = p_item_id
    AND bi.archived_at IS NOT NULL
  LIMIT 1;

  IF retired_bin_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'this bin/material relationship has been retired and cannot be counted as active';
  END IF;

  WITH inserted AS (
    INSERT INTO public.bin_items (
      bin_id,
      item_id,
      min_quantity
    )
    VALUES (
      p_bin_id,
      p_item_id,
      0
    )
    ON CONFLICT (bin_id, item_id) DO NOTHING
    RETURNING id
  ),
  resolved AS (
    SELECT inserted.id, TRUE AS was_created
    FROM inserted
    UNION ALL
    SELECT bi.id, FALSE AS was_created
    FROM public.bin_items bi
    WHERE bi.bin_id = p_bin_id
      AND bi.item_id = p_item_id
      AND bi.archived_at IS NULL
  )
  SELECT resolved.id, resolved.was_created
  INTO target_bin_item_id, created_structural_link
  FROM resolved
  LIMIT 1;

  IF target_bin_item_id IS NULL THEN
    RAISE EXCEPTION 'failed to resolve active bin_item for count intake';
  END IF;

  SELECT COALESCE(ib.quantity, 0)
  INTO prior_quantity
  FROM public.bin_items bi
  LEFT JOIN public.inventory_balances ib ON ib.bin_item_id = bi.id
  WHERE bi.id = target_bin_item_id;

  SELECT *
  INTO correction_result
  FROM public.set_inventory_count_quantity(
    target_bin_item_id,
    p_counted_quantity,
    trim(p_reason)
  );

  RETURN QUERY
  SELECT
    target_bin_item_id,
    correction_result.transaction_id,
    correction_result.transaction_item_id,
    prior_quantity,
    p_counted_quantity,
    p_counted_quantity - prior_quantity,
    trim(p_reason),
    correction_result.quantity_on_hand,
    correction_result.status,
    correction_result.occurred_at,
    created_structural_link;
END;
$$;

REVOKE ALL ON FUNCTION public.intake_inventory_count(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intake_inventory_count(UUID, UUID, NUMERIC, TEXT) TO anon, authenticated;

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
WHERE bi.archived_at IS NULL
  AND i.is_active = TRUE
  AND i.is_archived = FALSE
  AND (
    v.division = 'Admin'
    OR (v.division IN ('Electrical', 'Construction') AND i.division = v.division)
  );

GRANT SELECT ON public.inventory_cart_candidates_view TO anon, authenticated;

CREATE OR REPLACE VIEW public.grand_master_inventory_view AS
SELECT
  i.material_code,
  i.name                                        AS item_name,
  i.broad_category,
  i.sub_category,
  i.sub_category_2,
  i.sub_category_3,
  i.size,
  i.unit_of_measure,
  i.division,
  i.price_per_unit,
  i.labor_rate_hrs,
  su.unit_code                                  AS storage_unit,
  sh.shelf_code,
  b.bay_code,
  bn.bin_code,
  bi.min_quantity,
  COALESCE(ib.quantity, 0)                      AS quantity_on_hand,
  COALESCE(ib.quantity, 0) * i.price_per_unit   AS total_value,
  CASE
    WHEN bi.min_quantity > 0
     AND COALESCE(ib.quantity, 0) <= bi.min_quantity
    THEN TRUE ELSE FALSE
  END                                           AS below_minimum,
  ib.last_rebuilt                               AS balance_as_of
FROM public.bin_items bi
JOIN public.items         i   ON i.id  = bi.item_id
JOIN public.bins          bn  ON bn.id = bi.bin_id
JOIN public.bays          b   ON b.id  = bn.bay_id
JOIN public.shelves       sh  ON sh.id = b.shelf_id
JOIN public.storage_units su  ON su.id = sh.unit_id
LEFT JOIN public.inventory_balances ib ON ib.bin_item_id = bi.id
WHERE bi.archived_at IS NULL
  AND i.is_active = TRUE
  AND i.is_archived = FALSE
ORDER BY i.broad_category, i.sub_category, i.name;

GRANT SELECT ON public.grand_master_inventory_view TO anon, authenticated;
