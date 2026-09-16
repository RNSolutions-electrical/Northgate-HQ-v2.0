-- Extend the existing atomic create workflow. No location data is rewritten.
-- NULL/blank physical_location means inherit the nearest parent's location.
-- Default details keep old clients compatible without an ambiguous RPC overload.
DROP FUNCTION public.create_inventory_location(uuid,text,uuid,text,text,text,integer,text);
CREATE OR REPLACE FUNCTION public.create_inventory_location(p_request_id uuid, p_kind text, p_parent_id uuid, p_code text, p_label text, p_division text, p_position integer, p_reason text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 actor public.user_permissions%ROWTYPE;
 dept text; target_table text; parent_column text; code_column text; label_column text;
 code text:=upper(btrim(p_code)); label text:=nullif(btrim(p_label),'');
 existing jsonb; created jsonb; duplicate boolean; saved_audit public.change_logs%ROWTYPE;
BEGIN
 p_reason:=coalesce(nullif(btrim(p_reason),''),'Automatic audit: storage location created.');
 IF p_details IS NULL OR jsonb_typeof(p_details)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_details) k WHERE k NOT IN('physical_location','materials_summary')) OR EXISTS(SELECT 1 FROM jsonb_each(p_details) e WHERE jsonb_typeof(e.value) NOT IN('string','null')) OR coalesce(length(p_details->>'physical_location'),0)>500 OR coalesce(length(p_details->>'materials_summary'),0)>500 THEN RAISE EXCEPTION 'Location details must be text of 500 characters or fewer' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('inventory-location-lifecycle',0));
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
   OR saved_audit.note IS DISTINCT FROM btrim(p_reason)
   OR existing->>'physical_location' IS DISTINCT FROM nullif(btrim(p_details->>'physical_location'),'')
   OR existing->>'materials_summary' IS DISTINCT FROM nullif(btrim(p_details->>'materials_summary'),'') THEN
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
  INSERT INTO public.storage_units(id,unit_code,name,division,physical_location,materials_summary) VALUES(p_request_id,code,label,dept,nullif(btrim(p_details->>'physical_location'),''),nullif(btrim(p_details->>'materials_summary'),'')) RETURNING to_jsonb(storage_units.*) INTO created;
 ELSE
  EXECUTE format('INSERT INTO public.%I(id,%I,%I,label,position,physical_location,materials_summary) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING to_jsonb(%I.*)',
   target_table,parent_column,code_column,target_table) INTO created USING p_request_id,p_parent_id,code,label,p_position,nullif(btrim(p_details->>'physical_location'),''),nullif(btrim(p_details->>'materials_summary'),'');
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.email,actor.clerk_user_id),target_table,p_request_id::text,'create',created,btrim(p_reason));
 RETURN jsonb_build_object('id',p_request_id,'kind',p_kind,'code',code,'label',label,'division',dept,'replayed',false);
END;$function$;

REVOKE ALL ON FUNCTION public.create_inventory_location(uuid,text,uuid,text,text,text,integer,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_location(uuid,text,uuid,text,text,text,integer,text,jsonb) TO authenticated;
