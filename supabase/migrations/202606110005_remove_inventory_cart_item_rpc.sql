CREATE OR REPLACE FUNCTION public.remove_inventory_cart_item(p_cart_item_id UUID)
RETURNS TABLE (
  removed_cart_item_id UUID,
  cart_id UUID,
  remaining_item_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
  caller_permissions JSONB;
  target_cart_id UUID;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_cart_item_id IS NULL THEN
    RAISE EXCEPTION 'cart_item_id is required';
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
    RAISE EXCEPTION 'inventory transaction permission is required to remove inventory cart items';
  END IF;

  SELECT ci.cart_id
  INTO target_cart_id
  FROM public.inventory_cart_items ci
  JOIN public.inventory_carts c ON c.id = ci.cart_id
  WHERE ci.id = p_cart_item_id
    AND c.user_id = jwt_subject
    AND c.status = 'active'
  FOR UPDATE OF ci, c;

  IF target_cart_id IS NULL THEN
    RAISE EXCEPTION 'active cart item owned by signed-in user is required';
  END IF;

  DELETE FROM public.inventory_cart_items
  WHERE id = p_cart_item_id;

  RETURN QUERY
  SELECT
    p_cart_item_id AS removed_cart_item_id,
    target_cart_id AS cart_id,
    COUNT(*)::INTEGER AS remaining_item_count
  FROM public.inventory_cart_items ci
  WHERE ci.cart_id = target_cart_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_inventory_cart_item(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_inventory_cart_item(UUID) TO anon, authenticated;
