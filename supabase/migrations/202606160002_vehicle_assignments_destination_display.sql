ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS display_name TEXT;

UPDATE public.vehicles
SET display_name = COALESCE(
  NULLIF(trim(vehicle_number), ''),
  NULLIF(trim(name), ''),
  'Vehicle ' || left(id::TEXT, 8)
)
WHERE display_name IS NULL
   OR length(trim(display_name)) = 0;

ALTER TABLE public.vehicles
ALTER COLUMN display_name SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.vehicle_assignments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ,
  assigned_by TEXT,
  note TEXT,
  CONSTRAINT vehicle_assignments_unassigned_after_assigned
    CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
);

ALTER TABLE public.vehicle_assignments ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS ux_vehicle_assignments_active_user
  ON public.vehicle_assignments (user_id)
  WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_vehicle_time
  ON public.vehicle_assignments (vehicle_id, assigned_at, unassigned_at);

COMMENT ON TABLE public.vehicle_assignments IS
  'Time-bounded Clerk user to vehicle assignment history. Active row has unassigned_at IS NULL.';

COMMENT ON COLUMN public.vehicles.display_name IS
  'Stable vehicle unit label. Not derived from current vehicle assignment.';

-- No assignment seed rows are inserted here because the current live seed data
-- does not contain an explicit user-to-vehicle mapping to preserve.

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

  SELECT va.vehicle_id
  INTO server_vehicle_snapshot
  FROM public.vehicle_assignments va
  JOIN public.vehicles v ON v.id = va.vehicle_id
  WHERE va.user_id = jwt_subject
    AND va.unassigned_at IS NULL
    AND v.is_active = TRUE
    AND v.holds_stock = TRUE
  ORDER BY va.assigned_at DESC
  LIMIT 1;

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

DROP FUNCTION IF EXISTS public.read_inventory_transaction_history(INTEGER, TEXT, TEXT);

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
  destination_label TEXT,
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
    COALESCE(
      NULLIF(tx.performed_by_name, ''),
      NULLIF(actor_up.display_name, ''),
      NULLIF(actor_up.email, ''),
      tx.user_id
    ) AS actor_name,
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
    CASE
      WHEN ti.destination_type IS NULL THEN NULL
      WHEN ti.destination_type = 'office' THEN 'Office'
      WHEN ti.destination_type = 'user' THEN COALESCE(
        NULLIF(destination_user.display_name, ''),
        NULLIF(destination_user.email, ''),
        ti.destination_id
      )
      WHEN ti.destination_type = 'vehicle' THEN COALESCE(
        CASE
          WHEN destination_vehicle.id IS NULL THEN NULL
          WHEN destination_operator.operator_name IS NULL THEN destination_vehicle.display_name
          ELSE destination_vehicle.display_name || ' (' || destination_operator.operator_name || ')'
        END,
        ti.destination_id
      )
      WHEN ti.destination_type IN ('job', 'service_call') THEN ti.destination_id
      ELSE ti.destination_id
    END AS destination_label,
    COALESCE(NULLIF(ti.note, ''), NULLIF(tx.notes, '')) AS note
  FROM public.transaction_items ti
  JOIN public.inventory_transactions tx ON tx.id = ti.transaction_id
  JOIN public.bin_items bi ON bi.id = ti.bin_item_id
  JOIN public.bins b ON b.id = bi.bin_id
  JOIN public.items i ON i.id = ti.item_id
  LEFT JOIN public.user_permissions actor_up
    ON actor_up.clerk_user_id = tx.user_id
   AND actor_up.is_active = TRUE
  LEFT JOIN public.user_permissions destination_user
    ON ti.destination_type = 'user'
   AND destination_user.clerk_user_id = ti.destination_id
   AND destination_user.is_active = TRUE
  LEFT JOIN public.vehicles destination_vehicle
    ON ti.destination_type = 'vehicle'
   AND ti.destination_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND destination_vehicle.id = ti.destination_id::UUID
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      NULLIF(operator_up.display_name, ''),
      NULLIF(operator_up.email, ''),
      va.user_id
    ) AS operator_name
    FROM public.vehicle_assignments va
    LEFT JOIN public.user_permissions operator_up
      ON operator_up.clerk_user_id = va.user_id
     AND operator_up.is_active = TRUE
    WHERE destination_vehicle.id IS NOT NULL
      AND va.vehicle_id = destination_vehicle.id
      AND va.assigned_at <= COALESCE(ti.occurred_at, tx.created_at)
      AND (
        va.unassigned_at IS NULL
        OR va.unassigned_at > COALESCE(ti.occurred_at, tx.created_at)
      )
    ORDER BY va.assigned_at DESC
    LIMIT 1
  ) destination_operator ON TRUE
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
