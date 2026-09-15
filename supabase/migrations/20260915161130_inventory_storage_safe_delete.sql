-- Applied as 20260915161130. No records are deleted by this migration.
-- Audit rows are the durable backup store; existing clients have no direct audit writes.
CREATE FUNCTION public.storage_location_deletion_snapshot(p_kind text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE target text; code_field text; item jsonb; ancestors jsonb:='[]'; history jsonb;
 ref record; has_reference boolean; parent uuid; parent_kind text;
BEGIN
 IF public.current_user_has_developer_access() IS NOT TRUE OR NOT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active AND role='Developer') THEN
  RAISE EXCEPTION 'Active Developer access is required for permanent deletion' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location-lifecycle',0));
 LOCK TABLE public.storage_units,public.shelves,public.bays,public.bins IN SHARE ROW EXCLUSIVE MODE;
 CASE p_kind
 WHEN 'unit' THEN target:='storage_units';code_field:='unit_code';
 WHEN 'shelf' THEN target:='shelves';code_field:='shelf_code';
 WHEN 'bay' THEN target:='bays';code_field:='bay_code';
 WHEN 'bin' THEN target:='bins';code_field:='bin_code';
 ELSE RAISE EXCEPTION 'Choose a valid location type' USING ERRCODE='22023'; END CASE;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',target) INTO item USING p_id;
 IF item IS NULL THEN RAISE EXCEPTION 'Location no longer exists. Refresh Storage.' USING ERRCODE='22023'; END IF;
 IF item->>'archived_at' IS NULL THEN RAISE EXCEPTION 'Archive this location before permanently deleting it' USING ERRCODE='22023'; END IF;
 -- Every inbound FK, not only currently known children. Includes archived/zero rows.
 FOR ref IN SELECT n.nspname schema_name,c.relname table_name,a.attname column_name,k.conkey,k.confkey
  FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.conkey[1]
  WHERE k.contype='f' AND k.confrelid=format('public.%I',target)::regclass ORDER BY n.nspname,c.relname,k.conname
 LOOP
  IF cardinality(ref.conkey)<>1 OR cardinality(ref.confkey)<>1 THEN
   RAISE EXCEPTION 'This location has a complex relationship requiring developer review; deletion is blocked'; END IF;
  EXECUTE format('LOCK TABLE %I.%I IN SHARE MODE',ref.schema_name,ref.table_name);
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1)',ref.schema_name,ref.table_name,ref.column_name) INTO has_reference USING p_id;
  IF has_reference THEN RAISE EXCEPTION 'Cannot permanently delete: referenced by %.%. Children, material links, stock and history must be preserved, including archived records.',ref.schema_name,ref.table_name USING ERRCODE='23503'; END IF;
 END LOOP;
 -- Legacy polymorphic destination IDs have no FK. Conservatively block any match.
 LOCK TABLE public.transaction_items,public.inventory_cart_items IN SHARE MODE;
 IF EXISTS(SELECT 1 FROM public.transaction_items WHERE destination_id::text=p_id::text)
 OR EXISTS(SELECT 1 FROM public.inventory_cart_items WHERE destination_id::text=p_id::text)
 OR EXISTS(SELECT 1 FROM public.change_logs WHERE table_name IN ('transaction_items','inventory_transactions','inventory_cart_items','inventory_balances','bin_items')
  AND (position(p_id::text in coalesce(before_data::text,''))>0 OR position(p_id::text in coalesce(after_data::text,''))>0)) THEN
  RAISE EXCEPTION 'Cannot permanently delete: inventory transaction, cart or material history references this location' USING ERRCODE='23503'; END IF;
 -- Preserve ancestors for a human-readable recovery context, never delete them.
 parent:=coalesce((item->>'bay_id')::uuid,(item->>'shelf_id')::uuid,(item->>'unit_id')::uuid);
 parent_kind:=CASE p_kind WHEN 'bin' THEN 'bays' WHEN 'bay' THEN 'shelves' WHEN 'shelf' THEN 'storage_units' END;
 WHILE parent IS NOT NULL AND parent_kind IS NOT NULL LOOP
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',parent_kind) INTO history USING parent;
  IF history IS NULL THEN RAISE EXCEPTION 'Parent relationship is missing; developer review required'; END IF;
  ancestors:=jsonb_build_array(jsonb_build_object('table',parent_kind,'record',history))||ancestors;
  parent:=coalesce((history->>'shelf_id')::uuid,(history->>'unit_id')::uuid);
  parent_kind:=CASE parent_kind WHEN 'bays' THEN 'shelves' WHEN 'shelves' THEN 'storage_units' END;
 END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY created_at,id),'[]') INTO history FROM public.change_logs l
 WHERE table_name=target AND record_id=p_id::text AND coalesce(after_data->>'operation','')<>'storage_deletion_backup';
 RETURN jsonb_build_object('format','northgate-storage-location-backup','version',1,'kind',p_kind,'table',target,'code',item->>code_field,'record',item,'ancestors',ancestors,'audit_history',history);
END $$;
REVOKE ALL ON FUNCTION public.storage_location_deletion_snapshot(text,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.prepare_storage_location_deletion(p_kind text,p_id uuid,p_reason text,p_initials text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; actor public.user_permissions; backup_id uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active AND role='Developer';
 IF actor.id IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN RAISE EXCEPTION 'Active Developer access is required for permanent deletion' USING ERRCODE='42501'; END IF;
 IF coalesce(length(btrim(p_reason)),0) NOT BETWEEN 1 AND 2000 OR coalesce(btrim(p_initials),'') !~ '^[A-Za-z][A-Za-z .''-]{0,19}$' THEN
  RAISE EXCEPTION 'Enter a deletion reason (up to 2000 characters) and your initials (up to 20 characters)' USING ERRCODE='22023'; END IF;
 snapshot:=public.storage_location_deletion_snapshot(p_kind,p_id)||jsonb_build_object('operation','storage_deletion_backup','backup_id',backup_id,'prepared_at',now(),'prepared_by',actor.clerk_user_id,'prepared_by_name',actor.display_name,'reason',btrim(p_reason),'initials',btrim(p_initials));
 INSERT INTO public.change_logs(id,user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(backup_id,actor.clerk_user_id,coalesce(actor.display_name,actor.clerk_user_id),snapshot->>'table',p_id::text,'update',snapshot->'record',snapshot,'Permanent deletion backup prepared: '||btrim(p_reason));
 RETURN snapshot;
END $$;
REVOKE ALL ON FUNCTION public.prepare_storage_location_deletion(text,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_storage_location_deletion(text,uuid,text,text) TO authenticated;

CREATE FUNCTION public.permanently_delete_storage_location(p_backup_id uuid,p_confirmation_code text,p_download_confirmed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.user_permissions; backup public.change_logs; snapshot jsonb; target_id uuid; prior_delete uuid;
BEGIN
 SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active AND role='Developer';
 IF actor.id IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN RAISE EXCEPTION 'Active Developer access is required for permanent deletion' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location-lifecycle',0));
 SELECT * INTO backup FROM public.change_logs WHERE id=p_backup_id AND user_id=actor.clerk_user_id AND after_data->>'operation'='storage_deletion_backup' FOR UPDATE;
 IF backup.id IS NULL THEN RAISE EXCEPTION 'Download a fresh backup using this Developer account before deleting' USING ERRCODE='42501'; END IF;
 IF p_download_confirmed IS NOT TRUE OR btrim(p_confirmation_code) IS DISTINCT FROM backup.after_data->>'code' THEN
  RAISE EXCEPTION 'Confirm you saved the backup JSON and type the exact location code' USING ERRCODE='22023'; END IF;
 target_id:=backup.record_id::uuid;
 SELECT id INTO prior_delete FROM public.change_logs WHERE table_name=backup.table_name AND record_id=backup.record_id AND action='delete' AND after_data->>'backup_id'=p_backup_id::text LIMIT 1;
 IF prior_delete IS NOT NULL THEN RETURN jsonb_build_object('deleted',true,'id',target_id,'backup_id',p_backup_id,'replayed',true); END IF;
 snapshot:=public.storage_location_deletion_snapshot(backup.after_data->>'kind',target_id);
 IF snapshot->'record' IS DISTINCT FROM backup.after_data->'record' OR snapshot->'ancestors' IS DISTINCT FROM backup.after_data->'ancestors' THEN
  RAISE EXCEPTION 'Location or parent changed since backup. Refresh and download a new backup.' USING ERRCODE='40001'; END IF;
 -- Fixed table is resolved by the guarded snapshot, never supplied by the client.
 EXECUTE format('DELETE FROM public.%I WHERE id=$1',snapshot->>'table') USING target_id;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.clerk_user_id),snapshot->>'table',target_id::text,'delete',snapshot->'record',jsonb_build_object('operation','storage_location_delete','backup_id',p_backup_id,'initials',backup.after_data->>'initials','download_confirmed',true),backup.after_data->>'reason');
 RETURN jsonb_build_object('deleted',true,'id',target_id,'backup_id',p_backup_id,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.permanently_delete_storage_location(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.permanently_delete_storage_location(uuid,text,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
