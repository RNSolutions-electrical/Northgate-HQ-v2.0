CREATE OR REPLACE FUNCTION public.add_inventory_cart_item(
  p_cart_id UUID,
  p_bin_item_id UUID,
  p_quantity NUMERIC DEFAULT 1
)
RETURNS TABLE (
  cart_item_id UUID,
  cart_id UUID,
  bin_item_id UUID,
  item_id UUID,
  quantity NUMERIC,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_subject TEXT;
  caller_permissions JSONB;
  resolved_item_id UUID;
  existing_cart_item_id UUID;
  available_quantity NUMERIC := 0;
  current_cart_quantity NUMERIC := 0;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_cart_id IS NULL THEN
    RAISE EXCEPTION 'cart_id is required';
  END IF;

  IF p_bin_item_id IS NULL THEN
    RAISE EXCEPTION 'bin_item_id is required';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be greater than zero';
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
    RAISE EXCEPTION 'inventory transaction permission is required to add inventory cart items';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_carts c
    WHERE c.id = p_cart_id
      AND c.user_id = jwt_subject
      AND c.status = 'active'
      AND (c.expires_at IS NULL OR c.expires_at > NOW())
  ) THEN
    RAISE EXCEPTION 'active cart owned by signed-in user is required';
  END IF;

  SELECT bi.item_id
  INTO resolved_item_id
  FROM public.bin_items bi
  JOIN public.items i ON i.id = bi.item_id
  WHERE bi.id = p_bin_item_id
    AND i.is_active = TRUE
    AND i.is_archived = FALSE;

  IF resolved_item_id IS NULL THEN
    RAISE EXCEPTION 'valid active bin item is required';
  END IF;

  SELECT COALESCE(ib.quantity, 0)
  INTO available_quantity
  FROM public.inventory_balances ib
  WHERE ib.bin_item_id = p_bin_item_id;

  SELECT COALESCE(SUM(ici.quantity), 0)
  INTO current_cart_quantity
  FROM public.inventory_cart_items ici
  WHERE ici.cart_id = p_cart_id
    AND ici.bin_item_id = p_bin_item_id;

  IF (current_cart_quantity + p_quantity) > available_quantity THEN
    RAISE EXCEPTION 'requested quantity exceeds current available balance';
  END IF;

  SELECT ici.id
  INTO existing_cart_item_id
  FROM public.inventory_cart_items ici
  WHERE ici.cart_id = p_cart_id
    AND ici.bin_item_id = p_bin_item_id
    AND ici.destination_type IS NULL
    AND ici.destination_id IS NULL
    AND ici.note IS NULL
  ORDER BY ici.created_at ASC
  LIMIT 1;

  IF existing_cart_item_id IS NULL THEN
    INSERT INTO public.inventory_cart_items (
      cart_id,
      bin_item_id,
      item_id,
      quantity
    )
    VALUES (
      p_cart_id,
      p_bin_item_id,
      resolved_item_id,
      p_quantity
    )
    RETURNING id INTO existing_cart_item_id;
  ELSE
    UPDATE public.inventory_cart_items ici
    SET quantity = ici.quantity + p_quantity
    WHERE ici.id = existing_cart_item_id;
  END IF;

  RETURN QUERY
  SELECT ici.id,
         ici.cart_id,
         ici.bin_item_id,
         ici.item_id,
         ici.quantity,
         ici.created_at
  FROM public.inventory_cart_items ici
  WHERE ici.id = existing_cart_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_inventory_cart_item(UUID, UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_inventory_cart_item(UUID, UUID, NUMERIC) TO anon, authenticated;
