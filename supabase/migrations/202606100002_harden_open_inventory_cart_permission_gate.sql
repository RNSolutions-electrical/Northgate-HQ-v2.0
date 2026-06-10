DROP FUNCTION IF EXISTS public.open_inventory_cart(TEXT, UUID);

CREATE OR REPLACE FUNCTION public.open_inventory_cart(
  p_user_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  cart_id UUID,
  user_id TEXT,
  user_name TEXT,
  active_vehicle_id UUID,
  status TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_subject TEXT;
  existing_cart_id UUID;
  caller_permissions JSONB;
  caller_display_name TEXT;
  server_vehicle_snapshot UUID := NULL;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  SELECT public.default_permissions_for_role(up.role) || up.permission_overrides,
         NULLIF(trim(up.display_name), '')
  INTO caller_permissions,
       caller_display_name
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller_permissions IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required';
  END IF;

  IF COALESCE((caller_permissions ->> 'can_inventory_transactions')::boolean, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'inventory transaction permission is required to open an inventory cart';
  END IF;

  -- Vehicle snapshot is intentionally server-derived.
  -- The active user-to-vehicle assignment source is not present yet, so this remains NULL.
  -- Once the assignment source exists, populate this value only when the assigned vehicle holds_stock = TRUE.
  server_vehicle_snapshot := NULL;

  SELECT c.id
  INTO existing_cart_id
  FROM public.inventory_carts c
  WHERE c.user_id = jwt_subject
    AND c.status = 'active'
    AND (c.expires_at IS NULL OR c.expires_at > NOW())
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF existing_cart_id IS NULL THEN
    INSERT INTO public.inventory_carts (
      user_id,
      user_name,
      active_vehicle_id,
      status,
      expires_at
    )
    VALUES (
      jwt_subject,
      COALESCE(caller_display_name, NULLIF(trim(p_user_name), ''), 'Unknown User'),
      server_vehicle_snapshot,
      'active',
      NOW() + INTERVAL '24 hours'
    )
    RETURNING id INTO existing_cart_id;
  END IF;

  RETURN QUERY
  SELECT c.id,
         c.user_id,
         c.user_name,
         c.active_vehicle_id,
         c.status,
         c.expires_at,
         c.created_at
  FROM public.inventory_carts c
  WHERE c.id = existing_cart_id
    AND c.user_id = jwt_subject;
END;
$$;

REVOKE ALL ON FUNCTION public.open_inventory_cart(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_inventory_cart(TEXT) TO anon, authenticated;
