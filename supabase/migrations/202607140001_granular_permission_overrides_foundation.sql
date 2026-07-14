CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  permission_flag TEXT NOT NULL CHECK (
    permission_flag IN (
      'can_access_developer',
      'can_manage_users',
      'can_view_reports',
      'can_edit_catalog',
      'can_manage_employees',
      'can_manage_vehicles',
      'can_manage_tools',
      'can_manage_inventory',
      'can_inventory_transactions',
      'can_view_all_divisions',
      'can_estimate',
      'can_approve_estimates',
      'can_create_jobs',
      'can_manage_jobs',
      'can_approve_budget',
      'can_view_financials',
      'can_field_access',
      'can_archive_records',
      'can_manage_change_orders',
      'can_express_checkout',
      'can_approve_express_checkout',
      'can_defer_completion'
    )
  ),
  granted BOOLEAN NOT NULL,
  granted_by_user_id TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL CHECK (
    length(trim(reason)) > 0
    AND length(reason) <= 500
  ),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_override_per_user_flag
  ON public.user_permission_overrides (user_id, permission_flag)
  WHERE is_active = TRUE;

ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_has_developer_access()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
  caller_permissions JSONB;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT public.default_permissions_for_role(up.role)
         || CASE
              WHEN up.division = 'Admin' THEN '{"can_view_all_divisions":true}'::jsonb
              ELSE '{}'::jsonb
            END
         || CASE
              WHEN up.permission_overrides ? 'can_access_developer' THEN jsonb_build_object(
                'can_access_developer',
                COALESCE((up.permission_overrides ->> 'can_access_developer')::BOOLEAN, FALSE)
              )
              ELSE '{}'::jsonb
            END
  INTO caller_permissions
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  RETURN COALESCE((caller_permissions ->> 'can_access_developer')::BOOLEAN, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.effective_permissions_for_user(
  p_role TEXT,
  p_division TEXT,
  p_permission_overrides JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH base_permissions AS (
    SELECT public.default_permissions_for_role(p_role)
      || CASE
           WHEN p_division = 'Admin' THEN '{"can_view_all_divisions":true}'::jsonb
           ELSE '{}'::jsonb
         END
      || CASE
           WHEN p_permission_overrides ? 'can_access_developer' THEN jsonb_build_object(
             'can_access_developer',
             COALESCE((p_permission_overrides ->> 'can_access_developer')::BOOLEAN, FALSE)
           )
           ELSE '{}'::jsonb
         END AS permissions
  ),
  active_override_state AS (
    SELECT
      uo.permission_flag,
      BOOL_OR(NOT uo.granted) AS has_revoke,
      BOOL_OR(uo.granted) AS has_grant
    FROM public.user_permission_overrides uo
    WHERE uo.user_id = auth.jwt() ->> 'sub'
      AND uo.is_active = TRUE
      AND uo.permission_flag <> 'can_access_developer'
    GROUP BY uo.permission_flag
  ),
  override_permissions AS (
    SELECT COALESCE(
      jsonb_object_agg(
        active_override_state.permission_flag,
        to_jsonb(
          CASE
            WHEN active_override_state.has_revoke THEN FALSE
            ELSE active_override_state.has_grant
          END
        )
      ),
      '{}'::jsonb
    ) AS permissions
    FROM active_override_state
  )
  SELECT base_permissions.permissions || override_permissions.permissions
  FROM base_permissions
  CROSS JOIN override_permissions;
$$;

CREATE OR REPLACE FUNCTION public.set_permission_override(
  p_user_id TEXT,
  p_permission_flag TEXT,
  p_granted BOOLEAN,
  p_reason TEXT
)
RETURNS TABLE (
  id UUID,
  user_id TEXT,
  permission_flag TEXT,
  granted BOOLEAN,
  granted_by_user_id TEXT,
  granted_at TIMESTAMPTZ,
  reason TEXT,
  is_active BOOLEAN,
  previous_effective_permissions JSONB,
  new_effective_permissions JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
  normalized_user_id TEXT;
  normalized_permission_flag TEXT;
  normalized_reason TEXT;
  caller public.user_permissions%ROWTYPE;
  target_user public.user_permissions%ROWTYPE;
  target_base_permissions JSONB;
  before_permissions JSONB;
  after_permissions JSONB;
  acting_user_name TEXT;
  previous_override JSONB := NULL;
  inserted_override public.user_permission_overrides%ROWTYPE;
  override_state RECORD;
  target_has_developer_access BOOLEAN := FALSE;
  canonical_flags TEXT[] := ARRAY[
    'can_access_developer',
    'can_manage_users',
    'can_view_reports',
    'can_edit_catalog',
    'can_manage_employees',
    'can_manage_vehicles',
    'can_manage_tools',
    'can_manage_inventory',
    'can_inventory_transactions',
    'can_view_all_divisions',
    'can_estimate',
    'can_approve_estimates',
    'can_create_jobs',
    'can_manage_jobs',
    'can_approve_budget',
    'can_view_financials',
    'can_field_access',
    'can_archive_records',
    'can_manage_change_orders',
    'can_express_checkout',
    'can_approve_express_checkout',
    'can_defer_completion'
  ];
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required to manage permission overrides';
  END IF;

  normalized_user_id := NULLIF(trim(COALESCE(p_user_id, '')), '');
  normalized_permission_flag := NULLIF(trim(COALESCE(p_permission_flag, '')), '');
  normalized_reason := NULLIF(trim(COALESCE(p_reason, '')), '');

  IF normalized_user_id IS NULL THEN
    RAISE EXCEPTION 'target user_id is required';
  END IF;

  IF normalized_permission_flag IS NULL THEN
    RAISE EXCEPTION 'permission_flag is required';
  END IF;

  IF p_granted IS NULL THEN
    RAISE EXCEPTION 'granted is required';
  END IF;

  IF normalized_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  IF length(normalized_reason) > 500 THEN
    RAISE EXCEPTION 'reason must be 500 characters or fewer';
  END IF;

  IF normalized_permission_flag <> ALL(canonical_flags) THEN
    RAISE EXCEPTION 'permission_flag must be a canonical Section 17 permission';
  END IF;

  IF normalized_permission_flag = 'can_access_developer' THEN
    RAISE EXCEPTION 'can_access_developer is excluded from this override system';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'active caller user_permissions record is required';
  END IF;

  SELECT *
  INTO target_user
  FROM public.user_permissions up
  WHERE up.clerk_user_id = normalized_user_id
    AND up.is_active = TRUE
  LIMIT 1
  FOR UPDATE;

  IF target_user.id IS NULL THEN
    RAISE EXCEPTION 'active target user_permissions record is required';
  END IF;

  SELECT COALESCE((
    public.default_permissions_for_role(target_user.role)
      || CASE
           WHEN target_user.division = 'Admin' THEN '{"can_view_all_divisions":true}'::jsonb
           ELSE '{}'::jsonb
         END
      || CASE
           WHEN target_user.permission_overrides ? 'can_access_developer' THEN jsonb_build_object(
             'can_access_developer',
             COALESCE((target_user.permission_overrides ->> 'can_access_developer')::BOOLEAN, FALSE)
           )
           ELSE '{}'::jsonb
         END
  ) ->> 'can_access_developer', 'false')::BOOLEAN
  INTO target_has_developer_access;

  IF target_has_developer_access IS TRUE THEN
    RAISE EXCEPTION 'Developer users cannot be targeted through this override system';
  END IF;

  target_base_permissions := public.default_permissions_for_role(target_user.role)
    || CASE
         WHEN target_user.division = 'Admin' THEN '{"can_view_all_divisions":true}'::jsonb
         ELSE '{}'::jsonb
       END
    || CASE
         WHEN target_user.permission_overrides ? 'can_access_developer' THEN jsonb_build_object(
           'can_access_developer',
           COALESCE((target_user.permission_overrides ->> 'can_access_developer')::BOOLEAN, FALSE)
         )
         ELSE '{}'::jsonb
       END;

  before_permissions := target_base_permissions;

  FOR override_state IN
    SELECT
      uo.permission_flag,
      BOOL_OR(NOT uo.granted) AS has_revoke,
      BOOL_OR(uo.granted) AS has_grant
    FROM public.user_permission_overrides uo
    WHERE uo.user_id = normalized_user_id
      AND uo.is_active = TRUE
      AND uo.permission_flag = ANY(canonical_flags)
      AND uo.permission_flag <> 'can_access_developer'
    GROUP BY uo.permission_flag
  LOOP
    before_permissions := before_permissions || jsonb_build_object(
      override_state.permission_flag,
      CASE
        WHEN override_state.has_revoke THEN FALSE
        ELSE override_state.has_grant
      END
    );
  END LOOP;

  after_permissions := before_permissions || jsonb_build_object(normalized_permission_flag, p_granted);

  SELECT COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject)
  INTO acting_user_name;

  WITH deactivated AS (
    UPDATE public.user_permission_overrides
    SET is_active = FALSE
    WHERE user_id = normalized_user_id
      AND permission_flag = normalized_permission_flag
      AND is_active = TRUE
    RETURNING *
  )
  SELECT to_jsonb(deactivated.*)
  INTO previous_override
  FROM deactivated
  LIMIT 1;

  INSERT INTO public.user_permission_overrides (
    user_id,
    permission_flag,
    granted,
    granted_by_user_id,
    reason,
    is_active
  )
  VALUES (
    normalized_user_id,
    normalized_permission_flag,
    p_granted,
    jwt_subject,
    normalized_reason,
    TRUE
  )
  RETURNING *
  INTO inserted_override;

  INSERT INTO public.change_logs (
    user_id,
    user_name,
    table_name,
    record_id,
    action,
    before_data,
    after_data,
    note,
    created_at
  )
  VALUES (
    jwt_subject,
    acting_user_name,
    'user_permission_overrides',
    inserted_override.id::TEXT,
    'permission_change',
    jsonb_build_object(
      'affected_user_id', normalized_user_id,
      'permission_flag', normalized_permission_flag,
      'direction', CASE WHEN p_granted THEN 'grant' ELSE 'revoke' END,
      'effective_permissions', before_permissions,
      'prior_active_override', previous_override
    ),
    jsonb_build_object(
      'affected_user_id', normalized_user_id,
      'permission_flag', normalized_permission_flag,
      'direction', CASE WHEN p_granted THEN 'grant' ELSE 'revoke' END,
      'effective_permissions', after_permissions,
      'new_active_override', jsonb_build_object(
        'id', inserted_override.id,
        'user_id', inserted_override.user_id,
        'permission_flag', inserted_override.permission_flag,
        'granted', inserted_override.granted,
        'granted_by_user_id', inserted_override.granted_by_user_id,
        'granted_at', inserted_override.granted_at,
        'reason', inserted_override.reason,
        'is_active', inserted_override.is_active
      )
    ),
    normalized_reason,
    inserted_override.granted_at
  );

  RETURN QUERY
  SELECT
    inserted_override.id,
    inserted_override.user_id,
    inserted_override.permission_flag,
    inserted_override.granted,
    inserted_override.granted_by_user_id,
    inserted_override.granted_at,
    inserted_override.reason,
    inserted_override.is_active,
    before_permissions,
    after_permissions;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_inventory_cart(p_user_name TEXT DEFAULT NULL)
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

  SELECT public.effective_permissions_for_user(up.role, up.division, up.permission_overrides),
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

  IF COALESCE((caller_permissions ->> 'can_inventory_transactions')::BOOLEAN, FALSE) IS NOT TRUE THEN
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

  PERFORM pg_advisory_xact_lock(hashtext(p_bin_item_id::TEXT));

  SELECT public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
  INTO caller_permissions
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller_permissions IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required';
  END IF;

  IF COALESCE((caller_permissions ->> 'can_inventory_transactions')::BOOLEAN, FALSE) IS NOT TRUE THEN
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
  WHERE ib.bin_item_id = p_bin_item_id
  FOR UPDATE;

  SELECT COALESCE(SUM(ici.quantity), 0)
  INTO current_cart_quantity
  FROM public.inventory_cart_items ici
  JOIN public.inventory_carts c ON c.id = ici.cart_id
  WHERE ici.bin_item_id = p_bin_item_id
    AND c.status = 'active'
    AND (c.expires_at IS NULL OR c.expires_at > NOW());

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
    'job', 'service_call', 'vehicle', 'user', 'vendor_return', 'scrap', 'unknown'
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

  SELECT public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
  INTO caller_permissions
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller_permissions IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required';
  END IF;

  IF COALESCE((caller_permissions ->> 'can_inventory_transactions')::BOOLEAN, FALSE) IS NOT TRUE THEN
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

  SELECT ARRAY_AGG(DISTINCT ci.bin_item_id ORDER BY ci.bin_item_id)
  INTO lock_bin_item_ids
  FROM public.inventory_cart_items ci
  WHERE ci.cart_id = p_cart_id;

  FOREACH lock_bin_item_id IN ARRAY lock_bin_item_ids LOOP
    PERFORM pg_advisory_xact_lock(hashtext(lock_bin_item_id::TEXT));
  END LOOP;

  PERFORM 1
  FROM public.inventory_balances ib
  WHERE ib.bin_item_id = ANY(lock_bin_item_ids)
  FOR UPDATE;

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
    'job', 'service_call', 'vehicle', 'user', 'vendor_return', 'scrap', 'unknown'
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

  SELECT public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
  INTO caller_permissions
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller_permissions IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required';
  END IF;

  IF COALESCE((caller_permissions ->> 'can_inventory_transactions')::BOOLEAN, FALSE) IS NOT TRUE THEN
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
     OR d.destination_type NOT IN ('job', 'service_call', 'vehicle', 'user', 'vendor_return', 'scrap', 'unknown')
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
    PERFORM pg_advisory_xact_lock(hashtext(lock_bin_item_id::TEXT));
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

  SELECT public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
  INTO caller_permissions
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller_permissions IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required';
  END IF;

  IF COALESCE((caller_permissions ->> 'can_inventory_transactions')::BOOLEAN, FALSE) IS NOT TRUE THEN
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

  SELECT public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
  INTO caller_permissions
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller_permissions IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required';
  END IF;

  IF COALESCE((caller_permissions ->> 'can_inventory_transactions')::BOOLEAN, FALSE) IS NOT TRUE THEN
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

CREATE OR REPLACE FUNCTION public.retire_bin_item(
  p_bin_item_id UUID,
  p_reason TEXT
)
RETURNS TABLE (
  bin_item_id UUID,
  bin_id UUID,
  item_id UUID,
  bin_code TEXT,
  material_code TEXT,
  item_name TEXT,
  ledger_balance NUMERIC,
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  target_record RECORD;
  latest_correction_sequence BIGINT;
  latest_correction_occurred_at TIMESTAMPTZ;
  latest_target_quantity NUMERIC;
  calculated_balance NUMERIC := 0;
  reason_text TEXT;
  now_stamp TIMESTAMPTZ := NOW();
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_bin_item_id IS NULL THEN
    RAISE EXCEPTION 'bin_item_id is required';
  END IF;

  reason_text := NULLIF(trim(COALESCE(p_reason, '')), '');

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'archive reason is required';
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

  caller_permissions := public.effective_permissions_for_user(
    caller.role,
    caller.division,
    caller.permission_overrides
  );

  IF caller.role NOT IN ('Developer', 'Administrator', 'Admin') THEN
    RAISE EXCEPTION 'Developer or Administrator role is required to retire a bin item';
  END IF;

  IF COALESCE((caller_permissions ->> 'can_archive_records')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'can_archive_records permission is required to retire a bin item';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_bin_item_id::TEXT));

  SELECT
    bi.id AS bin_item_id,
    bi.bin_id,
    bi.item_id,
    bi.min_quantity,
    bi.created_at,
    bi.archived_at,
    bi.archived_by,
    bi.archive_reason,
    b.bin_code,
    i.material_code,
    i.name AS item_name
  INTO target_record
  FROM public.bin_items bi
  JOIN public.bins b ON b.id = bi.bin_id
  JOIN public.items i ON i.id = bi.item_id
  WHERE bi.id = p_bin_item_id
  FOR UPDATE OF bi;

  IF target_record.bin_item_id IS NULL THEN
    RAISE EXCEPTION 'valid bin_item_id is required';
  END IF;

  IF target_record.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'bin_item is already retired';
  END IF;

  SELECT ti.ledger_sequence, ti.occurred_at, ti.target_quantity
  INTO latest_correction_sequence, latest_correction_occurred_at, latest_target_quantity
  FROM public.transaction_items ti
  WHERE ti.bin_item_id = p_bin_item_id
    AND ti.status = 'approved'
    AND ti.transaction_type = 'physical_count_correction'
    AND ti.target_quantity IS NOT NULL
  ORDER BY ti.occurred_at DESC, ti.ledger_sequence DESC
  LIMIT 1;

  IF latest_correction_sequence IS NOT NULL THEN
    SELECT latest_target_quantity + COALESCE(SUM(
      CASE
        WHEN ti.transaction_type IN (
          'add_stock',
          'return_from_job',
          'return_from_vehicle'
        ) THEN ti.quantity

        WHEN ti.transaction_type IN (
          'remove_stock',
          'assign_to_job',
          'assign_to_vehicle',
          'scrap',
          'vendor_return',
          'mark_damaged'
        ) THEN -ti.quantity

        ELSE 0
      END
    ), 0)
    INTO calculated_balance
    FROM public.transaction_items ti
    WHERE ti.bin_item_id = p_bin_item_id
      AND ti.status = 'approved'
      AND ti.transaction_type <> 'physical_count_correction'
      AND (
        ti.occurred_at > latest_correction_occurred_at
        OR (
          ti.occurred_at = latest_correction_occurred_at
          AND ti.ledger_sequence > latest_correction_sequence
        )
      );
  ELSE
    SELECT COALESCE(SUM(
      CASE
        WHEN ti.transaction_type IN (
          'add_stock',
          'return_from_job',
          'return_from_vehicle'
        ) THEN ti.quantity

        WHEN ti.transaction_type IN (
          'remove_stock',
          'assign_to_job',
          'assign_to_vehicle',
          'scrap',
          'vendor_return',
          'mark_damaged'
        ) THEN -ti.quantity

        ELSE 0
      END
    ), 0)
    INTO calculated_balance
    FROM public.transaction_items ti
    WHERE ti.bin_item_id = p_bin_item_id
      AND ti.status = 'approved'
      AND ti.transaction_type <> 'physical_count_correction';
  END IF;

  calculated_balance := COALESCE(calculated_balance, 0);

  IF calculated_balance <> 0 THEN
    RAISE EXCEPTION 'bin_item balance is %. Use physical count correction to zero it before retirement.', calculated_balance;
  END IF;

  UPDATE public.bin_items bi
  SET archived_at = now_stamp,
      archived_by = jwt_subject,
      archive_reason = reason_text
  WHERE bi.id = p_bin_item_id;

  INSERT INTO public.change_logs (
    user_id,
    user_name,
    table_name,
    record_id,
    action,
    before_data,
    after_data,
    note,
    created_at
  )
  VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'bin_items',
    p_bin_item_id::TEXT,
    'archive',
    jsonb_build_object(
      'bin_item_id', target_record.bin_item_id,
      'bin_id', target_record.bin_id,
      'item_id', target_record.item_id,
      'archived_at', target_record.archived_at,
      'archived_by', target_record.archived_by,
      'archive_reason', target_record.archive_reason,
      'ledger_balance', calculated_balance
    ),
    jsonb_build_object(
      'bin_item_id', target_record.bin_item_id,
      'bin_id', target_record.bin_id,
      'item_id', target_record.item_id,
      'archived_at', now_stamp,
      'archived_by', jwt_subject,
      'archive_reason', reason_text,
      'ledger_balance', calculated_balance
    ),
    reason_text,
    now_stamp
  );

  RETURN QUERY
  SELECT
    target_record.bin_item_id,
    target_record.bin_id,
    target_record.item_id,
    target_record.bin_code,
    target_record.material_code,
    target_record.item_name,
    calculated_balance,
    now_stamp,
    jwt_subject,
    reason_text;
END;
$$;

DROP POLICY IF EXISTS user_permission_overrides_self_read ON public.user_permission_overrides;
CREATE POLICY user_permission_overrides_self_read
ON public.user_permission_overrides
FOR SELECT
TO authenticated
USING (
  user_id = auth.jwt() ->> 'sub'
);

DROP POLICY IF EXISTS user_permission_overrides_developer_read_all ON public.user_permission_overrides;
CREATE POLICY user_permission_overrides_developer_read_all
ON public.user_permission_overrides
FOR SELECT
TO authenticated
USING (
  public.current_user_has_developer_access()
);

REVOKE ALL ON public.user_permission_overrides FROM anon, authenticated;
GRANT SELECT ON public.user_permission_overrides TO authenticated;

REVOKE ALL ON FUNCTION public.current_user_has_developer_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_has_developer_access() TO authenticated;

REVOKE ALL ON FUNCTION public.effective_permissions_for_user(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_permissions_for_user(TEXT, TEXT, JSONB) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.set_permission_override(TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_permission_override(TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;
