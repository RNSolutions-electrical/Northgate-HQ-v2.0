CREATE OR REPLACE FUNCTION public.finalize_inventory_cart(
  p_cart_id UUID,
  p_destination_type TEXT,
  p_destination_id TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_line_destinations JSONB DEFAULT NULL
)
RETURNS TABLE (
  transaction_id UUID,
  cart_id UUID,
  transaction_item_count INTEGER,
  status TEXT,
  checked_out_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
  caller_permissions JSONB;
  cart_record public.inventory_carts%ROWTYPE;
  checkout_transaction_id UUID;
  header_transaction_type TEXT;
  line_count INTEGER := 0;
  target_count INTEGER := 0;
  invalid_count INTEGER := 0;
  insufficient_count INTEGER := 0;
  now_stamp TIMESTAMPTZ := NOW();
  lock_bin_item_ids UUID[];
  lock_bin_item_id UUID;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_cart_id IS NULL THEN
    RAISE EXCEPTION 'cart_id is required';
  END IF;

  IF p_destination_type IS NULL OR p_destination_type NOT IN (
    'job', 'service_call', 'vehicle', 'user', 'office', 'vendor_return', 'scrap', 'unknown'
  ) THEN
    RAISE EXCEPTION 'valid destination_type is required';
  END IF;

  IF p_line_destinations IS NULL THEN
    IF p_destination_type IN ('job', 'service_call', 'vehicle', 'user')
      AND (p_destination_id IS NULL OR length(trim(p_destination_id)) = 0) THEN
      RAISE EXCEPTION 'destination_id is required for this destination type';
    END IF;

    IF p_destination_type = 'unknown'
      AND (p_note IS NULL OR length(trim(p_note)) = 0) THEN
      RAISE EXCEPTION 'note is required for unknown destination';
    END IF;
  END IF;

  IF p_line_destinations IS NOT NULL AND jsonb_typeof(p_line_destinations) <> 'array' THEN
    RAISE EXCEPTION 'line destinations must be a JSON array';
  END IF;

  SELECT public.default_permissions_for_role(up.role) || up.permission_overrides
  INTO caller_permissions
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller_permissions IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required';
  END IF;

  IF COALESCE((caller_permissions ->> 'can_inventory_transactions')::boolean, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'inventory transaction permission is required to checkout inventory carts';
  END IF;

  SELECT *
  INTO cart_record
  FROM public.inventory_carts c
  WHERE c.id = p_cart_id
    AND c.user_id = jwt_subject
    AND c.status = 'active'
    AND (c.expires_at IS NULL OR c.expires_at > now_stamp)
  FOR UPDATE;

  IF cart_record.id IS NULL THEN
    RAISE EXCEPTION 'active cart owned by signed-in user is required';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO line_count
  FROM public.inventory_cart_items ci
  WHERE ci.cart_id = p_cart_id;

  IF line_count = 0 THEN
    RAISE EXCEPTION 'cart must contain at least one item before checkout';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS checkout_line_destinations (
    cart_item_id UUID PRIMARY KEY,
    destination_type TEXT NOT NULL,
    destination_id TEXT,
    note TEXT
  ) ON COMMIT DROP;

  TRUNCATE checkout_line_destinations;

  IF p_line_destinations IS NULL THEN
    INSERT INTO checkout_line_destinations (cart_item_id, destination_type, destination_id, note)
    SELECT ci.id, p_destination_type, NULLIF(trim(p_destination_id), ''), NULLIF(trim(p_note), '')
    FROM public.inventory_cart_items ci
    WHERE ci.cart_id = p_cart_id;
  ELSE
    INSERT INTO checkout_line_destinations (cart_item_id, destination_type, destination_id, note)
    SELECT
      (line_item ->> 'cart_item_id')::UUID,
      line_item ->> 'destination_type',
      NULLIF(trim(line_item ->> 'destination_id'), ''),
      COALESCE(NULLIF(trim(line_item ->> 'note'), ''), NULLIF(trim(p_note), ''))
    FROM jsonb_array_elements(p_line_destinations) AS line_item;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO target_count
  FROM checkout_line_destinations;

  IF target_count <> line_count THEN
    RAISE EXCEPTION 'line destination count must match cart item count';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO invalid_count
  FROM checkout_line_destinations d
  LEFT JOIN public.inventory_cart_items ci ON ci.id = d.cart_item_id AND ci.cart_id = p_cart_id
  WHERE ci.id IS NULL
     OR d.destination_type NOT IN ('job', 'service_call', 'vehicle', 'user', 'office', 'vendor_return', 'scrap', 'unknown')
     OR (d.destination_type IN ('job', 'service_call', 'vehicle', 'user') AND (d.destination_id IS NULL OR length(trim(d.destination_id)) = 0))
     OR (d.destination_type = 'unknown' AND (d.note IS NULL OR length(trim(d.note)) = 0));

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'one or more line destinations are invalid';
  END IF;

  SELECT ARRAY_AGG(DISTINCT ci.bin_item_id ORDER BY ci.bin_item_id)
  INTO lock_bin_item_ids
  FROM public.inventory_cart_items ci
  WHERE ci.cart_id = p_cart_id;

  FOREACH lock_bin_item_id IN ARRAY lock_bin_item_ids LOOP
    PERFORM pg_advisory_xact_lock(hashtext(lock_bin_item_id::text));
  END LOOP;

  PERFORM 1
  FROM public.inventory_balances ib
  WHERE ib.bin_item_id = ANY(lock_bin_item_ids)
  FOR UPDATE;

  WITH requested_by_bin AS (
    SELECT ci.bin_item_id, SUM(ci.quantity) AS requested_quantity
    FROM public.inventory_cart_items ci
    WHERE ci.cart_id = p_cart_id
    GROUP BY ci.bin_item_id
  )
  SELECT COUNT(*)::INTEGER
  INTO insufficient_count
  FROM requested_by_bin requested
  LEFT JOIN public.inventory_balances ib ON ib.bin_item_id = requested.bin_item_id
  WHERE requested.requested_quantity > COALESCE(ib.quantity, 0);

  IF insufficient_count > 0 THEN
    RAISE EXCEPTION 'one or more cart items exceed current available balance';
  END IF;

  SELECT CASE
    WHEN COUNT(DISTINCT d.destination_type) = 1 THEN
      CASE MIN(d.destination_type)
        WHEN 'job' THEN 'assign_to_job'
        WHEN 'service_call' THEN 'assign_to_job'
        WHEN 'vehicle' THEN 'assign_to_vehicle'
        WHEN 'vendor_return' THEN 'vendor_return'
        WHEN 'scrap' THEN 'scrap'
        ELSE 'remove_stock'
      END
    ELSE 'remove_stock'
  END
  INTO header_transaction_type
  FROM checkout_line_destinations d;

  INSERT INTO public.inventory_transactions (
    transaction_type,
    user_id,
    performed_by_name,
    source_vehicle_id,
    notes
  )
  VALUES (
    header_transaction_type,
    jwt_subject,
    cart_record.user_name,
    cart_record.active_vehicle_id,
    COALESCE(NULLIF(trim(p_note), ''), 'Cart checkout')
  )
  RETURNING id INTO checkout_transaction_id;

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
    checkout_transaction_id,
    ci.bin_item_id,
    ci.item_id,
    ci.quantity,
    NULL,
    i.price_per_unit,
    CASE d.destination_type
      WHEN 'job' THEN 'assign_to_job'
      WHEN 'service_call' THEN 'assign_to_job'
      WHEN 'vehicle' THEN 'assign_to_vehicle'
      WHEN 'vendor_return' THEN 'vendor_return'
      WHEN 'scrap' THEN 'scrap'
      ELSE 'remove_stock'
    END,
    d.destination_type,
    d.destination_id,
    i.default_cost_code_id,
    'approved',
    d.note,
    now_stamp
  FROM public.inventory_cart_items ci
  JOIN public.items i ON i.id = ci.item_id
  JOIN checkout_line_destinations d ON d.cart_item_id = ci.id
  WHERE ci.cart_id = p_cart_id;

  UPDATE public.inventory_cart_items ci
  SET destination_type = d.destination_type,
      destination_id = d.destination_id,
      note = d.note
  FROM checkout_line_destinations d
  WHERE ci.id = d.cart_item_id
    AND ci.cart_id = p_cart_id;

  UPDATE public.inventory_carts c
  SET status = 'checked_out',
      expires_at = now_stamp
  WHERE c.id = p_cart_id
    AND c.user_id = jwt_subject;

  RETURN QUERY
  SELECT checkout_transaction_id,
         p_cart_id,
         line_count,
         'checked_out'::TEXT,
         now_stamp;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_inventory_cart(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_inventory_cart(UUID, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
