ALTER TABLE public.inventory_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_carts_self_select ON public.inventory_carts;
CREATE POLICY inventory_carts_self_select
ON public.inventory_carts
FOR SELECT
USING (user_id = (auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS inventory_cart_items_self_select ON public.inventory_cart_items;
CREATE POLICY inventory_cart_items_self_select
ON public.inventory_cart_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.inventory_carts c
    WHERE c.id = inventory_cart_items.cart_id
      AND c.user_id = (auth.jwt() ->> 'sub')
  )
);

DROP POLICY IF EXISTS inventory_carts_no_direct_insert ON public.inventory_carts;
CREATE POLICY inventory_carts_no_direct_insert
ON public.inventory_carts
FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS inventory_carts_no_direct_update ON public.inventory_carts;
CREATE POLICY inventory_carts_no_direct_update
ON public.inventory_carts
FOR UPDATE
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS inventory_carts_no_direct_delete ON public.inventory_carts;
CREATE POLICY inventory_carts_no_direct_delete
ON public.inventory_carts
FOR DELETE
USING (false);

DROP POLICY IF EXISTS inventory_cart_items_no_direct_insert ON public.inventory_cart_items;
CREATE POLICY inventory_cart_items_no_direct_insert
ON public.inventory_cart_items
FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS inventory_cart_items_no_direct_update ON public.inventory_cart_items;
CREATE POLICY inventory_cart_items_no_direct_update
ON public.inventory_cart_items
FOR UPDATE
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS inventory_cart_items_no_direct_delete ON public.inventory_cart_items;
CREATE POLICY inventory_cart_items_no_direct_delete
ON public.inventory_cart_items
FOR DELETE
USING (false);

CREATE OR REPLACE FUNCTION public.open_inventory_cart(
  p_user_name TEXT DEFAULT NULL,
  p_active_vehicle_id UUID DEFAULT NULL
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
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_active_vehicle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vehicles v WHERE v.id = p_active_vehicle_id AND v.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'active vehicle snapshot is invalid';
  END IF;

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
      COALESCE(NULLIF(trim(p_user_name), ''), jwt_subject),
      p_active_vehicle_id,
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

REVOKE ALL ON FUNCTION public.open_inventory_cart(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_inventory_cart(TEXT, UUID) TO anon, authenticated;
