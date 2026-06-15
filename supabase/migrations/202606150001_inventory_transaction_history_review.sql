CREATE OR REPLACE FUNCTION public.read_inventory_transaction_history(
  p_limit INTEGER DEFAULT 50,
  p_transaction_type TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  transaction_id UUID,
  transaction_type TEXT,
  transaction_created_at TIMESTAMPTZ,
  actor_user_id TEXT,
  actor_name TEXT,
  cart_id UUID,
  transaction_item_id UUID,
  bin_item_id UUID,
  bin_code TEXT,
  material_code TEXT,
  item_name TEXT,
  quantity NUMERIC,
  target_quantity NUMERIC,
  status TEXT,
  occurred_at TIMESTAMPTZ,
  unit_cost_at_time NUMERIC,
  destination_type TEXT,
  destination_id TEXT,
  note TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
  caller public.user_permissions%ROWTYPE;
  bounded_limit INTEGER;
  normalized_type TEXT;
  normalized_search TEXT;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
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

  IF caller.role <> 'Developer' THEN
    RAISE EXCEPTION 'Developer role is required to read inventory transaction history';
  END IF;

  bounded_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  normalized_type := NULLIF(trim(COALESCE(p_transaction_type, '')), '');
  normalized_search := NULLIF(trim(COALESCE(p_search, '')), '');

  RETURN QUERY
  SELECT
    tx.id AS transaction_id,
    ti.transaction_type,
    tx.created_at AS transaction_created_at,
    tx.user_id AS actor_user_id,
    tx.performed_by_name AS actor_name,
    NULL::UUID AS cart_id,
    ti.id AS transaction_item_id,
    ti.bin_item_id,
    b.bin_code,
    i.material_code,
    i.name AS item_name,
    ti.quantity,
    ti.target_quantity,
    ti.status,
    ti.occurred_at,
    ti.unit_cost_at_time,
    ti.destination_type,
    ti.destination_id,
    COALESCE(NULLIF(ti.note, ''), NULLIF(tx.notes, '')) AS note
  FROM public.transaction_items ti
  JOIN public.inventory_transactions tx ON tx.id = ti.transaction_id
  JOIN public.bin_items bi ON bi.id = ti.bin_item_id
  JOIN public.bins b ON b.id = bi.bin_id
  JOIN public.items i ON i.id = ti.item_id
  WHERE (
      normalized_type IS NULL
      OR (normalized_type = 'checkout' AND ti.transaction_type IN (
        'remove_stock',
        'assign_to_job',
        'assign_to_vehicle',
        'vendor_return',
        'scrap'
      ))
      OR (normalized_type <> 'checkout' AND ti.transaction_type = normalized_type)
    )
    AND (
      normalized_search IS NULL
      OR i.material_code ILIKE '%' || normalized_search || '%'
      OR i.name ILIKE '%' || normalized_search || '%'
      OR b.bin_code ILIKE '%' || normalized_search || '%'
    )
  ORDER BY COALESCE(ti.occurred_at, ti.created_at, tx.created_at) DESC,
           ti.ledger_sequence DESC
  LIMIT bounded_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.read_inventory_transaction_history(INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_inventory_transaction_history(INTEGER, TEXT, TEXT) TO anon, authenticated;
