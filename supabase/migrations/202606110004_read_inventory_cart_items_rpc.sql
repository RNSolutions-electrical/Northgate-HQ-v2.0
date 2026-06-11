CREATE OR REPLACE FUNCTION public.read_inventory_cart_items(p_cart_id UUID)
RETURNS TABLE (
  cart_item_id UUID,
  cart_id UUID,
  bin_item_id UUID,
  item_id UUID,
  material_code TEXT,
  item_name TEXT,
  unit_of_measure TEXT,
  bin_code TEXT,
  bin_label TEXT,
  quantity NUMERIC,
  quantity_on_hand NUMERIC,
  destination_type TEXT,
  destination_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_subject TEXT;
  caller_permissions JSONB;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_cart_id IS NULL THEN
    RAISE EXCEPTION 'cart_id is required';
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
    RAISE EXCEPTION 'inventory transaction permission is required to read inventory cart items';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_carts c
    WHERE c.id = p_cart_id
      AND c.user_id = jwt_subject
  ) THEN
    RAISE EXCEPTION 'cart owned by signed-in user is required';
  END IF;

  RETURN QUERY
  SELECT
    ci.id AS cart_item_id,
    ci.cart_id,
    ci.bin_item_id,
    ci.item_id,
    i.material_code,
    i.name AS item_name,
    i.unit_of_measure,
    b.bin_code,
    b.label AS bin_label,
    ci.quantity,
    COALESCE(ib.quantity, 0) AS quantity_on_hand,
    ci.destination_type,
    ci.destination_id,
    ci.note,
    ci.created_at
  FROM public.inventory_cart_items ci
  JOIN public.items i ON i.id = ci.item_id
  JOIN public.bin_items bi ON bi.id = ci.bin_item_id
  JOIN public.bins b ON b.id = bi.bin_id
  LEFT JOIN public.inventory_balances ib ON ib.bin_item_id = ci.bin_item_id
  WHERE ci.cart_id = p_cart_id
  ORDER BY ci.created_at ASC, ci.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.read_inventory_cart_items(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_inventory_cart_items(UUID) TO anon, authenticated;
