-- Applied as 20260915153440; additive details, existing RLS/grants retained.
-- Existing map/count/create functions take the shared half of the same lock
-- before reading ancestry. Move/archive take its exclusive half. Preserve each
-- function body, signature, permission checks and grants; only prepend the lock.
DO $$
DECLARE signature text; definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'public.intake_inventory_count(uuid,uuid,numeric,text)',
 'public.set_inventory_count_quantity(uuid,numeric,text)',
 'public.map_material_to_inventory_bin(uuid,uuid,text)',
 'public.create_inventory_location(uuid,text,uuid,text,text,text,integer,text)'
 ] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF definition !~* '\mBEGIN\M' THEN RAISE EXCEPTION 'Expected PL/pgSQL body for %',signature; END IF;
  definition:=regexp_replace(definition,'\mBEGIN\M',E'BEGIN\n PERFORM pg_advisory_xact_lock_shared(hashtextextended(''inventory-location-lifecycle'',0));','i');
  EXECUTE definition;
 END LOOP;
END $$;
ALTER TABLE public.storage_units ADD COLUMN physical_location text CHECK(length(physical_location)<=500), ADD COLUMN materials_summary text CHECK(length(materials_summary)<=500);
ALTER TABLE public.shelves ADD COLUMN physical_location text CHECK(length(physical_location)<=500), ADD COLUMN materials_summary text CHECK(length(materials_summary)<=500);
ALTER TABLE public.bays ADD COLUMN physical_location text CHECK(length(physical_location)<=500), ADD COLUMN materials_summary text CHECK(length(materials_summary)<=500);
ALTER TABLE public.bins ADD COLUMN physical_location text CHECK(length(physical_location)<=500), ADD COLUMN materials_summary text CHECK(length(materials_summary)<=500);
CREATE FUNCTION public.edit_inventory_location(p_kind text,p_id uuid,p_code text,p_label text,p_position integer,p_expected_revision integer,p_reason text,p_details jsonb,p_parent_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.user_permissions; target_table text; code_field text; label_field text; parent_field text;
 dept text; destination_dept text; parent_id uuid; before_row jsonb; after_row jsonb; duplicate boolean; clean_code text:=upper(btrim(p_code));
BEGIN
 -- Serialize short hierarchy mutations against archive/restore and other moves.
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location-lifecycle',0));
 LOCK TABLE public.storage_units, public.shelves, public.bays, public.bins IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active;
 CASE p_kind
 WHEN 'unit' THEN target_table:='storage_units';code_field:='unit_code';label_field:='name';
 WHEN 'shelf' THEN target_table:='shelves';code_field:='shelf_code';label_field:='label';parent_field:='unit_id';
 WHEN 'bay' THEN target_table:='bays';code_field:='bay_code';label_field:='label';parent_field:='shelf_id';
 WHEN 'bin' THEN target_table:='bins';code_field:='bin_code';label_field:='label';parent_field:='bay_id';
 ELSE RAISE EXCEPTION 'Choose a valid location type'; END CASE;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',target_table) INTO before_row USING p_id;
 CASE p_kind
 WHEN 'unit' THEN dept:=before_row->>'division';
 WHEN 'shelf' THEN SELECT u.division INTO dept FROM public.shelves s JOIN public.storage_units u ON u.id=s.unit_id WHERE s.id=p_id;
 WHEN 'bay' THEN SELECT u.division INTO dept FROM public.bays b JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id WHERE b.id=p_id;
 WHEN 'bin' THEN SELECT u.division INTO dept FROM public.bins n JOIN public.bays b ON b.id=n.bay_id JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id WHERE n.id=p_id;
 END CASE;
 IF actor.clerk_user_id IS NULL OR before_row IS NULL OR public.current_user_can_edit_division(dept,'can_manage_inventory') IS NOT TRUE THEN
  RAISE EXCEPTION 'Inventory management permission for this department is required' USING ERRCODE='42501'; END IF;
 IF before_row->>'archived_at' IS NOT NULL THEN RAISE EXCEPTION 'Restore this location before editing it'; END IF;
 IF p_expected_revision IS DISTINCT FROM (before_row->>'revision')::integer THEN
  RAISE EXCEPTION 'Location changed. Refresh and review the latest version before saving.' USING ERRCODE='40001'; END IF;
 IF clean_code IS NULL OR clean_code !~ '^[A-Z0-9][A-Z0-9._/-]{0,59}$'
 OR coalesce(length(btrim(p_label)),0) NOT BETWEEN 1 AND 160 OR p_position IS NULL OR p_position<0 OR coalesce(btrim(p_reason),'')='' THEN
  RAISE EXCEPTION 'Enter a valid code, name, nonnegative sort position, and reason' USING ERRCODE='22023'; END IF;
 IF p_details IS NOT NULL AND (jsonb_typeof(p_details)<>'object' OR
 EXISTS(SELECT 1 FROM jsonb_object_keys(p_details) k WHERE k NOT IN ('physical_location','materials_summary')) OR
 EXISTS(SELECT 1 FROM jsonb_each(p_details) e WHERE jsonb_typeof(e.value) NOT IN ('string','null')) OR
 coalesce(length(p_details->>'physical_location'),0)>500 OR coalesce(length(p_details->>'materials_summary'),0)>500) THEN
 RAISE EXCEPTION 'Location details must be text of 500 characters or fewer' USING ERRCODE='22023'; END IF;
 IF parent_field IS NOT NULL THEN
  parent_id:=coalesce(p_parent_id,(before_row->>parent_field)::uuid);
  CASE p_kind
  WHEN 'shelf' THEN SELECT division INTO destination_dept FROM public.storage_units WHERE id=parent_id AND archived_at IS NULL;
  WHEN 'bay' THEN SELECT u.division INTO destination_dept FROM public.shelves s JOIN public.storage_units u ON u.id=s.unit_id
    WHERE s.id=parent_id AND s.archived_at IS NULL AND u.archived_at IS NULL;
  WHEN 'bin' THEN SELECT u.division INTO destination_dept FROM public.bays b JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id
    WHERE b.id=parent_id AND b.archived_at IS NULL AND s.archived_at IS NULL AND u.archived_at IS NULL;
  END CASE;
  IF destination_dept IS NULL OR public.current_user_can_edit_division(destination_dept,'can_manage_inventory') IS NOT TRUE THEN
   RAISE EXCEPTION 'Choose an active parent within your inventory management permissions' USING ERRCODE='42501'; END IF;
 ELSIF p_parent_id IS NOT NULL THEN RAISE EXCEPTION 'Storage units cannot have a parent' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location:'||p_kind||':'||coalesce(parent_id::text,'root')||':'||clean_code,0));
 IF parent_field IS NULL THEN
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id<>$1 AND upper(btrim(%I))=$2)',target_table,code_field) INTO duplicate USING p_id,clean_code;
 ELSE
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id<>$1 AND upper(btrim(%I))=$2 AND %I=$3)',target_table,code_field,parent_field) INTO duplicate USING p_id,clean_code,parent_id;
 END IF;
 IF duplicate THEN RAISE EXCEPTION 'This code already exists at this level. Choose another code.' USING ERRCODE='23505'; END IF;
 IF parent_field IS NULL THEN
  EXECUTE format('UPDATE public.%I SET %I=$2,%I=$3,physical_location=$4,materials_summary=$5,revision=revision+1 WHERE id=$1 RETURNING to_jsonb(%I)',target_table,code_field,label_field,target_table)
   INTO after_row USING p_id,clean_code,btrim(p_label),CASE WHEN p_details ? 'physical_location' THEN nullif(btrim(p_details->>'physical_location'),'') ELSE before_row->>'physical_location' END,CASE WHEN p_details ? 'materials_summary' THEN nullif(btrim(p_details->>'materials_summary'),'') ELSE before_row->>'materials_summary' END;
 ELSE
  EXECUTE format('UPDATE public.%I SET %I=$2,%I=$3,position=$4,%I=$5,physical_location=$6,materials_summary=$7,revision=revision+1 WHERE id=$1 RETURNING to_jsonb(%I)',target_table,code_field,label_field,parent_field,target_table)
   INTO after_row USING p_id,clean_code,btrim(p_label),p_position,parent_id,CASE WHEN p_details ? 'physical_location' THEN nullif(btrim(p_details->>'physical_location'),'') ELSE before_row->>'physical_location' END,CASE WHEN p_details ? 'materials_summary' THEN nullif(btrim(p_details->>'materials_summary'),'') ELSE before_row->>'materials_summary' END;
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.clerk_user_id),target_table,p_id::text,'update',before_row,after_row,btrim(p_reason));
 RETURN after_row;
END $$;
REVOKE ALL ON FUNCTION public.edit_inventory_location(text,uuid,text,text,integer,integer,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_inventory_location(text,uuid,text,text,integer,integer,text,jsonb,uuid) TO authenticated;


-- Old clients retain the seven-argument endpoint and preserve the new details.
CREATE OR REPLACE FUNCTION public.edit_inventory_location(p_kind text,p_id uuid,p_code text,p_label text,p_position integer,p_expected_revision integer,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT public.edit_inventory_location(p_kind,p_id,p_code,p_label,p_position,p_expected_revision,p_reason,NULL::jsonb,NULL::uuid)
$$;
REVOKE ALL ON FUNCTION public.edit_inventory_location(text,uuid,text,text,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_inventory_location(text,uuid,text,text,integer,integer,text) TO authenticated;
NOTIFY pgrst,'reload schema';
