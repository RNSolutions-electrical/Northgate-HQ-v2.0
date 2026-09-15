-- Granular inventory setup/count authority. No role-default or historical-data changes.
-- Applied 2026-09-15; filename aligned with the Supabase migration history.
CREATE OR REPLACE FUNCTION public.intake_inventory_count(p_bin_id uuid, p_item_id uuid, p_counted_quantity numeric, p_reason text)
 RETURNS TABLE(bin_item_id uuid, transaction_id uuid, transaction_item_id uuid, prior_system_quantity numeric, counted_quantity numeric, variance numeric, reason text, quantity_on_hand numeric, status text, occurred_at timestamp with time zone, created_bin_item boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  jwt_subject TEXT;
  caller public.user_permissions%ROWTYPE;
  target_bin_id UUID;
  target_item_id UUID;
  target_bin_item_id UUID;
  retired_bin_item_id UUID;
  created_structural_link BOOLEAN := FALSE;
  prior_quantity NUMERIC := 0;
  correction_result RECORD;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_bin_id IS NULL THEN
    RAISE EXCEPTION 'bin_id is required';
  END IF;

  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'item_id is required';
  END IF;

  IF p_counted_quantity IS NULL THEN
    RAISE EXCEPTION 'counted_quantity is required';
  END IF;

  IF p_counted_quantity < 0 OR p_counted_quantity::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'counted_quantity must be greater than or equal to zero';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
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

  IF public.current_user_can_edit_division(caller.division, 'can_manage_inventory') IS NOT TRUE THEN
    RAISE EXCEPTION 'Manage Inventory permission is required';
  END IF;

  SELECT b.id
  INTO target_bin_id
  FROM public.bins b
  WHERE b.id = p_bin_id;

  IF target_bin_id IS NULL THEN
    RAISE EXCEPTION 'valid bin_id is required';
  END IF;


  IF NOT EXISTS (
    SELECT 1 FROM public.bins b JOIN public.bays ba ON ba.id=b.bay_id
    JOIN public.shelves s ON s.id=ba.shelf_id JOIN public.storage_units u ON u.id=s.unit_id
    WHERE b.id=p_bin_id AND public.current_user_can_edit_division(u.division,'can_manage_inventory')
  ) THEN RAISE EXCEPTION 'Storage location is unavailable or outside your editable department'; END IF;

  SELECT i.id
  INTO target_item_id
  FROM public.items i
  WHERE i.id = p_item_id
    AND i.is_active IS TRUE
    AND i.is_archived IS NOT TRUE;

  IF target_item_id IS NULL THEN
    RAISE EXCEPTION 'valid active catalog item_id is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_bin_id::TEXT || ':' || p_item_id::TEXT));

  SELECT bi.id
  INTO retired_bin_item_id
  FROM public.bin_items bi
  WHERE bi.bin_id = p_bin_id
    AND bi.item_id = p_item_id
    AND bi.archived_at IS NOT NULL
  LIMIT 1;

  IF retired_bin_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'this bin/material relationship has been retired and cannot be counted as active';
  END IF;

  WITH inserted AS (
    INSERT INTO public.bin_items (
      bin_id,
      item_id,
      min_quantity
    )
    VALUES (
      p_bin_id,
      p_item_id,
      0
    )
    ON CONFLICT (bin_id, item_id) DO NOTHING
    RETURNING id
  ),
  resolved AS (
    SELECT inserted.id, TRUE AS was_created
    FROM inserted
    UNION ALL
    SELECT bi.id, FALSE AS was_created
    FROM public.bin_items bi
    WHERE bi.bin_id = p_bin_id
      AND bi.item_id = p_item_id
      AND bi.archived_at IS NULL
  )
  SELECT resolved.id, resolved.was_created
  INTO target_bin_item_id, created_structural_link
  FROM resolved
  LIMIT 1;

  IF target_bin_item_id IS NULL THEN
    RAISE EXCEPTION 'failed to resolve active bin_item for count intake';
  END IF;

  SELECT COALESCE(ib.quantity, 0)
  INTO prior_quantity
  FROM public.bin_items bi
  LEFT JOIN public.inventory_balances ib ON ib.bin_item_id = bi.id
  WHERE bi.id = target_bin_item_id;

  SELECT *
  INTO correction_result
  FROM public.set_inventory_count_quantity(
    target_bin_item_id,
    p_counted_quantity,
    trim(p_reason)
  );

  RETURN QUERY
  SELECT
    target_bin_item_id,
    correction_result.transaction_id,
    correction_result.transaction_item_id,
    prior_quantity,
    p_counted_quantity,
    p_counted_quantity - prior_quantity,
    trim(p_reason),
    correction_result.quantity_on_hand,
    correction_result.status,
    correction_result.occurred_at,
    created_structural_link;
END;
$function$;


CREATE OR REPLACE FUNCTION public.set_inventory_count_quantity(p_bin_item_id uuid, p_target_quantity numeric, p_reason text)
 RETURNS TABLE(transaction_id uuid, transaction_item_id uuid, bin_item_id uuid, target_quantity numeric, quantity_on_hand numeric, status text, occurred_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  jwt_subject TEXT;
  caller public.user_permissions%ROWTYPE;
  bin_item_record RECORD;
  correction_transaction_id UUID;
  correction_item_id UUID;
  now_stamp TIMESTAMPTZ := NOW();
  adjusted_quantity NUMERIC;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_bin_item_id IS NULL THEN
    RAISE EXCEPTION 'bin_item_id is required';
  END IF;

  IF p_target_quantity IS NULL THEN
    RAISE EXCEPTION 'target_quantity is required';
  END IF;

  IF p_target_quantity < 0 OR p_target_quantity::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'target_quantity must be greater than or equal to zero';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
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

  IF public.current_user_can_edit_division(caller.division, 'can_manage_inventory') IS NOT TRUE THEN
    RAISE EXCEPTION 'Manage Inventory permission is required';
  END IF;

  SELECT
    bi.id AS bin_item_id,
    bi.item_id,
    bi.bin_id,
    bi.archived_at,
    i.material_code,
    i.name AS item_name,
    i.price_per_unit,
    i.default_cost_code_id,
    i.is_active,
    i.is_archived
  INTO bin_item_record
  FROM public.bin_items bi
  JOIN public.items i ON i.id = bi.item_id
  WHERE bi.id = p_bin_item_id;

  IF bin_item_record.bin_item_id IS NULL THEN
    RAISE EXCEPTION 'valid bin_item_id is required';
  END IF;


  IF NOT EXISTS (
    SELECT 1 FROM public.bins b JOIN public.bays ba ON ba.id=b.bay_id
    JOIN public.shelves s ON s.id=ba.shelf_id JOIN public.storage_units u ON u.id=s.unit_id
    WHERE b.id=bin_item_record.bin_id AND public.current_user_can_edit_division(u.division,'can_manage_inventory')
  ) THEN RAISE EXCEPTION 'Storage location is unavailable or outside your editable department'; END IF;

  IF bin_item_record.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'retired bin_item cannot be counted';
  END IF;

  IF bin_item_record.is_active IS NOT TRUE OR bin_item_record.is_archived IS TRUE THEN
    RAISE EXCEPTION 'linked item must be active and not archived';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_bin_item_id::TEXT));

  PERFORM 1
  FROM public.inventory_balances ib
  WHERE ib.bin_item_id = p_bin_item_id
  FOR UPDATE;

  INSERT INTO public.inventory_transactions (
    transaction_type,
    user_id,
    performed_by_name,
    source_vehicle_id,
    notes
  )
  VALUES (
    'physical_count_correction',
    jwt_subject,
    COALESCE(caller.display_name, caller.email, jwt_subject),
    NULL,
    trim(p_reason)
  )
  RETURNING id INTO correction_transaction_id;

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
  VALUES (
    correction_transaction_id,
    p_bin_item_id,
    bin_item_record.item_id,
    0,
    p_target_quantity,
    COALESCE(bin_item_record.price_per_unit, 0),
    'physical_count_correction',
    NULL,
    NULL,
    bin_item_record.default_cost_code_id,
    'approved',
    trim(p_reason),
    now_stamp
  )
  RETURNING id INTO correction_item_id;

  SELECT ib.quantity
  INTO adjusted_quantity
  FROM public.inventory_balances ib
  WHERE ib.bin_item_id = p_bin_item_id;

  RETURN QUERY
  SELECT
    correction_transaction_id,
    correction_item_id,
    p_bin_item_id,
    p_target_quantity,
    adjusted_quantity,
    'approved'::TEXT,
    now_stamp;
END;
$function$;


-- Reuse the physical hierarchy and its existing RLS read policies.
-- All creation is through this audited endpoint; no direct table-write grant is added.
CREATE OR REPLACE FUNCTION public.create_inventory_location(
 p_request_id uuid, p_kind text, p_parent_id uuid, p_code text, p_label text,
 p_division text, p_position integer, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 actor public.user_permissions%ROWTYPE;
 dept text; target_table text; parent_column text; code_column text; label_column text;
 code text:=upper(btrim(p_code)); label text:=nullif(btrim(p_label),'');
 existing jsonb; created jsonb; duplicate boolean; saved_audit public.change_logs%ROWTYPE;
BEGIN
 SELECT * INTO actor FROM public.user_permissions
 WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active;
 IF actor.id IS NULL OR public.current_user_can_edit_division(actor.division,'can_manage_inventory') IS NOT TRUE THEN
  RAISE EXCEPTION 'Active sign-in and Manage Inventory permission are required';
 END IF;
 IF p_request_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('unit','shelf','bay','bin') THEN
  RAISE EXCEPTION 'Choose a valid location type';
 END IF;
 IF code IS NULL OR code !~ '^[A-Z0-9][A-Z0-9._/-]{0,59}$' THEN
  RAISE EXCEPTION 'Code must be 1-60 letters/numbers, dots, dashes, underscores or slashes, starting with a letter or number';
 END IF;
 IF label IS NULL OR length(label)>160 THEN RAISE EXCEPTION 'Enter a location name (1-160 characters)'; END IF;
 IF p_position IS NULL OR p_position<0 THEN RAISE EXCEPTION 'Position must be a non-negative whole number'; END IF;
 IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reason is required'; END IF;

 CASE p_kind
 WHEN 'unit' THEN
  IF p_parent_id IS NOT NULL THEN RAISE EXCEPTION 'Storage unit cannot have a parent'; END IF;
  dept:=nullif(btrim(p_division),''); target_table:='storage_units'; code_column:='unit_code';label_column:='name';
 WHEN 'shelf' THEN
  SELECT division INTO dept FROM public.storage_units WHERE id=p_parent_id;
  target_table:='shelves';parent_column:='unit_id';code_column:='shelf_code';label_column:='label';
 WHEN 'bay' THEN
  SELECT u.division INTO dept FROM public.shelves s JOIN public.storage_units u ON u.id=s.unit_id WHERE s.id=p_parent_id;
  target_table:='bays';parent_column:='shelf_id';code_column:='bay_code';label_column:='label';
 WHEN 'bin' THEN
  SELECT u.division INTO dept FROM public.bays ba JOIN public.shelves s ON s.id=ba.shelf_id JOIN public.storage_units u ON u.id=s.unit_id WHERE ba.id=p_parent_id;
  target_table:='bins';parent_column:='bay_id';code_column:='bin_code';label_column:='label';
 END CASE;
 IF dept IS NULL OR public.current_user_can_edit_division(dept,'can_manage_inventory') IS NOT TRUE THEN
  RAISE EXCEPTION 'Parent location or department is unavailable or outside your editable department';
 END IF;
 IF p_kind<>'unit' AND nullif(btrim(p_division),'') IS DISTINCT FROM dept THEN
  RAISE EXCEPTION 'Department must match the parent location';
 END IF;
 -- Serialize identical requests and duplicate codes, before reading existing state.
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location-id:'||p_request_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location:'||p_kind||':'||coalesce(p_parent_id::text,'root')||':'||code,0));
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',target_table) INTO existing USING p_request_id;
 IF existing IS NOT NULL THEN
  SELECT * INTO saved_audit FROM public.change_logs
   WHERE table_name=target_table AND record_id=p_request_id::text AND action='create' ORDER BY created_at LIMIT 1;
  IF saved_audit.user_id IS DISTINCT FROM actor.clerk_user_id
   OR existing->>code_column IS DISTINCT FROM code OR existing->>label_column IS DISTINCT FROM label
   OR (p_kind='unit' AND existing->>'division' IS DISTINCT FROM dept)
   OR (p_kind<>'unit' AND (existing->>parent_column IS DISTINCT FROM p_parent_id::text OR (existing->>'position')::integer<>p_position))
   OR saved_audit.note IS DISTINCT FROM btrim(p_reason) THEN
   RAISE EXCEPTION 'This request was already used with different location details. Refresh before creating another location';
  END IF;
  RETURN jsonb_build_object('id',p_request_id,'kind',p_kind,'code',code,'label',label,'division',dept,'replayed',true);
 END IF;
 IF p_kind='unit' THEN
  SELECT EXISTS(SELECT 1 FROM public.storage_units WHERE upper(btrim(unit_code))=code) INTO duplicate;
 ELSE
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE %I=$1 AND upper(btrim(%I))=$2)',target_table,parent_column,code_column)
   INTO duplicate USING p_parent_id,code;
 END IF;
 IF duplicate THEN RAISE EXCEPTION 'That location code already exists under this parent. Select it or use a different code'; END IF;
 IF p_kind='unit' THEN
  INSERT INTO public.storage_units(id,unit_code,name,division) VALUES(p_request_id,code,label,dept) RETURNING to_jsonb(storage_units.*) INTO created;
 ELSE
  EXECUTE format('INSERT INTO public.%I(id,%I,%I,label,position) VALUES($1,$2,$3,$4,$5) RETURNING to_jsonb(%I.*)',
   target_table,parent_column,code_column,target_table) INTO created USING p_request_id,p_parent_id,code,label,p_position;
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.email,actor.clerk_user_id),target_table,p_request_id::text,'create',created,btrim(p_reason));
 RETURN jsonb_build_object('id',p_request_id,'kind',p_kind,'code',code,'label',label,'division',dept,'replayed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.create_inventory_location(uuid,text,uuid,text,text,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_location(uuid,text,uuid,text,text,text,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_inventory_count_quantity(uuid,numeric,text),public.intake_inventory_count(uuid,uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_count_quantity(uuid,numeric,text),public.intake_inventory_count(uuid,uuid,numeric,text) TO authenticated;
