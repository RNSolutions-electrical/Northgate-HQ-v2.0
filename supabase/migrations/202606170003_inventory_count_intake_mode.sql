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

  IF caller.role NOT IN ('Developer', 'Admin') THEN
    RAISE EXCEPTION 'Developer or Admin role is required to set inventory count quantity';
  END IF;

  SELECT
    bi.id AS bin_item_id,
    bi.item_id,
    bi.bin_id,
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

  IF caller.role NOT IN ('Developer', 'Admin') THEN
    RAISE EXCEPTION 'Developer or Admin role is required for inventory count intake';
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
  )
  SELECT resolved.id, resolved.was_created
  INTO target_bin_item_id, created_structural_link
  FROM resolved
  LIMIT 1;

  IF target_bin_item_id IS NULL THEN
    RAISE EXCEPTION 'failed to resolve bin_item for count intake';
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
