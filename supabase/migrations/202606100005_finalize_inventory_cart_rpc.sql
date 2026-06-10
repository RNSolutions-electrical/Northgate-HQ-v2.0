CREATE OR REPLACE FUNCTION public.finalize_inventory_cart(
  p_cart_id UUID,
  p_destination_type TEXT,
  p_destination_id TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
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
SET search_path = public
AS $$
DECLARE
  jwt_subject TEXT;
  caller_permissions JSONB;
  cart_record public.inventory_carts%ROWTYPE;
  checkout_transaction_id UUID;
  checkout_transaction_type TEXT;
  line_count INTEGER := 0;
  insufficient_count INTEGER := 0;
  now_stamp TIMESTAMPTZ := NOW();
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

  IF p_destination_type IN ('job', 'service_call', 'vehicle', 'user')
    AND (p_destination_id IS NULL OR length(trim(p_destination_id)) = 0) THEN
    RAISE EXCEPTION 'destination_id is required for this destination type';
  END IF;

  IF p_destination_type = 'unknown'
    AND (p_note IS NULL OR length(trim(p_note)) = 0) THEN
    RAISE EXCEPTION 'note is required for unknown destination';
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

  SELECT COUNT(*)::INTEGER
  INTO insufficient_count
  FROM public.inventory_cart_items ci
  LEFT JOIN public.inventory_balances ib ON ib.bin_item_id = ci.bin_item_id
  WHERE ci.cart_id = p_cart_id
    AND ci.quantity > COALESCE(ib.quantity, 0);

  IF insufficient_count > 0 THEN
    RAISE EXCEPTION 'one or more cart items exceed current available balance';
  END IF;

  checkout_transaction_type := CASE
    WHEN p_destination_type IN ('job', 'service_call') THEN 'assign_to_job'
    WHEN p_destination_type = 'vehicle' THEN 'assign_to_vehicle'
    WHEN p_destination_type = 'vendor_return' THEN 'vendor_return'
    WHEN p_destination_type = 'scrap' THEN 'scrap'
    ELSE 'remove_stock'
  END;

  INSERT INTO public.inventory_transactions (
    transaction_type,
    user_id,
    performed_by_name,
    source_vehicle_id,
    notes
  )
  VALUES (
    checkout_transaction_type,
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
    checkout_transaction_type,
    p_destination_type,
    NULLIF(trim(p_destination_id), ''),
    i.default_cost_code_id,
    'approved',
    NULLIF(trim(p_note), ''),
    now_stamp
  FROM public.inventory_cart_items ci
  JOIN public.items i ON i.id = ci.item_id
  WHERE ci.cart_id = p_cart_id;

  UPDATE public.inventory_cart_items ci
  SET destination_type = p_destination_type,
      destination_id = NULLIF(trim(p_destination_id), ''),
      note = NULLIF(trim(p_note), '')
  WHERE ci.cart_id = p_cart_id;

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

REVOKE ALL ON FUNCTION public.finalize_inventory_cart(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_inventory_cart(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
