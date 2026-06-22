CREATE OR REPLACE FUNCTION public.default_permissions_for_role(p_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  base JSONB;
BEGIN
  CASE p_role
    WHEN 'Developer' THEN
      base := '{"can_access_developer":true,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Administrator' THEN
      base := '{"can_access_developer":false,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":false,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Project Manager' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":false,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Estimator' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":false,"can_view_all_divisions":false,"can_estimate":true,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
    WHEN 'Field Supervisor' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":false,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":true,"can_view_all_divisions":false,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
    ELSE
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":false,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":false,"can_view_all_divisions":false,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
  END CASE;

  RETURN base || jsonb_build_object(
    'can_express_checkout', COALESCE((base ->> 'can_inventory_transactions')::boolean, false),
    'can_approve_express_checkout', p_role IN ('Developer', 'Administrator'),
    'can_defer_completion', p_role = 'Developer'
  );
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
AS $$
  SELECT public.default_permissions_for_role(p_role)
    || CASE
      WHEN p_division = 'Admin' THEN '{"can_view_all_divisions":true}'::jsonb
      ELSE '{}'::jsonb
    END
    || COALESCE(p_permission_overrides, '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_user_permissions(
  p_clerk_user_id TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS TABLE (
  clerk_user_id TEXT,
  display_name TEXT,
  email TEXT,
  role TEXT,
  division TEXT,
  effective_permissions JSONB,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_clerk_user_id IS NULL OR length(trim(p_clerk_user_id)) = 0 THEN
    RAISE EXCEPTION 'clerk_user_id is required';
  END IF;

  IF p_clerk_user_id <> jwt_subject THEN
    RAISE EXCEPTION 'permission lookup user mismatch';
  END IF;

  INSERT INTO public.user_permissions AS up_insert (
    clerk_user_id,
    display_name,
    email,
    role,
    division,
    permission_overrides,
    is_active
  )
  VALUES (
    p_clerk_user_id,
    p_display_name,
    p_email,
    'User',
    NULL,
    '{}'::jsonb,
    TRUE
  )
  ON CONFLICT ON CONSTRAINT user_permissions_clerk_user_id_key DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, up_insert.display_name),
        email = COALESCE(EXCLUDED.email, up_insert.email),
        updated_at = NOW();

  RETURN QUERY
  SELECT up.clerk_user_id,
         up.display_name,
         up.email,
         up.role,
         up.division,
         public.effective_permissions_for_user(up.role, up.division, up.permission_overrides) AS effective_permissions,
         up.is_active
  FROM public.user_permissions up
  WHERE up.clerk_user_id = p_clerk_user_id
    AND up.is_active = TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.effective_permissions_for_user(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_permissions_for_user(TEXT, TEXT, JSONB) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_or_create_user_permissions(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_user_permissions(TEXT, TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE VIEW public.inventory_cart_candidates_view AS
WITH viewer AS (
  SELECT
    up.division,
    public.effective_permissions_for_user(up.role, up.division, up.permission_overrides) AS effective_permissions
  FROM public.user_permissions up
  WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
    AND up.is_active = TRUE
  LIMIT 1
)
SELECT
  bi.id AS bin_item_id,
  bi.item_id,
  b.id AS bin_id,
  b.bin_code,
  b.label AS bin_label,
  i.material_code,
  i.name AS item_name,
  i.unit_of_measure,
  i.division,
  i.price_per_unit,
  COALESCE(ib.quantity, 0) AS quantity_on_hand,
  bi.min_quantity,
  bi.created_at
FROM public.bin_items bi
JOIN public.items i ON i.id = bi.item_id
JOIN public.bins b ON b.id = bi.bin_id
LEFT JOIN public.inventory_balances ib ON ib.bin_item_id = bi.id
CROSS JOIN viewer v
WHERE bi.archived_at IS NULL
  AND i.is_active = TRUE
  AND i.is_archived = FALSE
  AND (
    COALESCE((v.effective_permissions ->> 'can_view_all_divisions')::boolean, FALSE) IS TRUE
    OR (v.division IN ('Electrical', 'Construction', 'Admin') AND i.division = v.division)
  );

CREATE OR REPLACE VIEW public.inventory_destination_users_view AS
WITH viewer AS (
  SELECT
    up.division,
    public.effective_permissions_for_user(up.role, up.division, up.permission_overrides) AS effective_permissions
  FROM public.user_permissions up
  WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
    AND up.is_active = TRUE
  LIMIT 1
)
SELECT
  target.clerk_user_id,
  target.display_name,
  target.email,
  target.role,
  target.division
FROM public.user_permissions target
CROSS JOIN viewer v
WHERE target.is_active = TRUE
  AND (
    COALESCE((v.effective_permissions ->> 'can_view_all_divisions')::boolean, FALSE) IS TRUE
    OR (v.division IN ('Electrical', 'Construction', 'Admin') AND target.division = v.division)
  );

CREATE OR REPLACE VIEW public.inventory_destination_vehicles_view AS
WITH viewer AS (
  SELECT
    up.division,
    public.effective_permissions_for_user(up.role, up.division, up.permission_overrides) AS effective_permissions
  FROM public.user_permissions up
  WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
    AND up.is_active = TRUE
  LIMIT 1
)
SELECT
  target.id,
  target.vehicle_number,
  target.name,
  NULL::TEXT AS make,
  NULL::TEXT AS model,
  target.classification,
  target.holds_stock,
  NULL::TEXT AS division
FROM public.vehicles target
CROSS JOIN viewer v
WHERE target.is_active = TRUE
  AND COALESCE((v.effective_permissions ->> 'can_view_all_divisions')::boolean, FALSE) IS TRUE;

GRANT SELECT ON public.inventory_cart_candidates_view TO anon, authenticated;
GRANT SELECT ON public.inventory_destination_users_view TO anon, authenticated;
GRANT SELECT ON public.inventory_destination_vehicles_view TO anon, authenticated;

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
  caller_permissions JSONB;
  bounded_limit INTEGER;
  normalized_type TEXT;
  normalized_search TEXT;
  can_cross_division BOOLEAN := FALSE;
  can_full_division BOOLEAN := FALSE;
  can_self_scoped BOOLEAN := FALSE;
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

  caller_permissions := public.effective_permissions_for_user(
    caller.role,
    caller.division,
    caller.permission_overrides
  );

  can_cross_division := COALESCE((caller_permissions ->> 'can_view_all_divisions')::boolean, FALSE);
  can_full_division := can_cross_division OR (
    caller.role IN ('Administrator', 'Project Manager', 'Estimator', 'Field Supervisor')
    AND COALESCE((caller_permissions ->> 'can_manage_inventory')::boolean, FALSE) IS TRUE
    AND caller.division IN ('Electrical', 'Construction', 'Admin')
  );
  can_self_scoped := COALESCE((caller_permissions ->> 'can_inventory_transactions')::boolean, FALSE);

  IF can_full_division IS NOT TRUE AND can_self_scoped IS NOT TRUE THEN
    RAISE EXCEPTION 'inventory transaction history permission is required';
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
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN ti.destination_type = 'vehicle'
       AND ti.destination_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN ti.destination_id::UUID
      ELSE NULL::UUID
    END AS vehicle_id
  ) destination_vehicle_key ON TRUE
  LEFT JOIN public.vehicles destination_vehicle
    ON destination_vehicle.id = destination_vehicle_key.vehicle_id
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
      can_cross_division IS TRUE
      OR (
        can_full_division IS TRUE
        AND caller.division IN ('Electrical', 'Construction', 'Admin')
        AND i.division = caller.division
      )
      OR (
        can_self_scoped IS TRUE
        AND tx.user_id = jwt_subject
        AND caller.division IN ('Electrical', 'Construction')
        AND i.division = caller.division
      )
    )
    AND (
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
