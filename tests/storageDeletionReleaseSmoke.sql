-- Actual-schema release validation. All locations/backups/audit rows roll back.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE subject text;
BEGIN
 SELECT clerk_user_id INTO subject FROM public.user_permissions WHERE is_active AND role='Developer' ORDER BY clerk_user_id LIMIT 1;
 IF subject IS NULL THEN RAISE EXCEPTION 'No active Developer for release validation'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role','authenticated')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();b uuid:=gen_random_uuid();n uuid:=gen_random_uuid();
 code text:='QA-DELETE-'||left(u::text,8); backup jsonb; answer jsonb; target record;
BEGIN
 PERFORM set_config('storage_delete_test.ids',jsonb_build_array(u,s,b,n)::text,true);
 PERFORM public.create_inventory_location(u,'unit',NULL,code,'Rollback-only unit','Electrical',0,'Storage deletion rollback-only test');
 PERFORM public.create_inventory_location(s,'shelf',u,'S','Rollback-only shelf','Electrical',0,'Storage deletion rollback-only test');
 PERFORM public.create_inventory_location(b,'bay',s,'B','Rollback-only bay','Electrical',0,'Storage deletion rollback-only test');
 PERFORM public.create_inventory_location(n,'bin',b,'N','Rollback-only bin','Electrical',0,'Storage deletion rollback-only test');
 BEGIN
  PERFORM public.prepare_storage_location_deletion('bin',n,'Release smoke','RN');
  RAISE EXCEPTION 'Active location deletion accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.set_inventory_location_archived('bin',n,true,'Release smoke');
 PERFORM public.set_inventory_location_archived('bay',b,true,'Release smoke');
 PERFORM public.set_inventory_location_archived('shelf',s,true,'Release smoke');
 PERFORM public.set_inventory_location_archived('unit',u,true,'Release smoke');
 BEGIN
  PERFORM public.prepare_storage_location_deletion('unit',u,'Release smoke','RN');
  RAISE EXCEPTION 'Archived child did not block deletion';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 FOR target IN SELECT * FROM (VALUES ('bin',n),('bay',b),('shelf',s),('unit',u)) x(kind,id) LOOP
  BEGIN
   PERFORM public.prepare_storage_location_deletion(target.kind,target.id,'','RN');
   RAISE EXCEPTION 'Missing reason accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  backup:=public.prepare_storage_location_deletion(target.kind,target.id,'Release smoke: temporary unused location','RN');
  IF backup->'record'->>'id'<>target.id::text OR jsonb_array_length(backup->'audit_history')<2 THEN RAISE EXCEPTION 'Incomplete backup'; END IF;
  BEGIN
   PERFORM public.permanently_delete_storage_location((backup->>'backup_id')::uuid,'WRONG',true);
   RAISE EXCEPTION 'Wrong code accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
   PERFORM public.permanently_delete_storage_location((backup->>'backup_id')::uuid,backup->>'code',false);
   RAISE EXCEPTION 'Missing download confirmation accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  answer:=public.permanently_delete_storage_location((backup->>'backup_id')::uuid,backup->>'code',true);
  IF answer->>'deleted'<>'true' THEN RAISE EXCEPTION 'Deletion unconfirmed'; END IF;
  answer:=public.permanently_delete_storage_location((backup->>'backup_id')::uuid,backup->>'code',true);
  IF answer->>'replayed'<>'true' THEN RAISE EXCEPTION 'Retry not idempotent'; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{"sub":"storage-delete-unknown-actor","role":"authenticated"}',true);
 BEGIN
  PERFORM public.permanently_delete_storage_location((backup->>'backup_id')::uuid,backup->>'code',true);
  RAISE EXCEPTION 'Unknown actor accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$
DECLARE ids jsonb:=current_setting('storage_delete_test.ids')::jsonb;
BEGIN
 IF (SELECT count(*) FROM public.change_logs WHERE record_id IN (SELECT jsonb_array_elements_text(ids)) AND after_data->>'operation'='storage_deletion_backup')<>4 THEN RAISE EXCEPTION 'Backup audit not retained'; END IF;
 IF (SELECT count(*) FROM public.change_logs WHERE record_id IN (SELECT jsonb_array_elements_text(ids)) AND action='delete')<>4 THEN RAISE EXCEPTION 'Deletion audit/retry count incorrect'; END IF;
 IF EXISTS(SELECT 1 FROM public.storage_units WHERE id::text IN (SELECT jsonb_array_elements_text(ids))) THEN RAISE EXCEPTION 'Unit not removed'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: real-schema authenticated four-level deletion, archived-child blocker, reason/code/download/actor gates, complete backups, retained audit, idempotent retries. All temporary records rolled back.' AS release_smoke;
