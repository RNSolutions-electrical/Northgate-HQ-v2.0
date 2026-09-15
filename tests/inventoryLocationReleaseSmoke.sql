-- Production-compatible, rollback-only smoke. All new rows are synthetic.
-- Does not alter existing user permissions, items or location quantities.
BEGIN;
SET LOCAL statement_timeout='20s';
DO $$
DECLARE actor record; item uuid; unit_id uuid; shelf_id uuid; bay_id uuid; bin_id uuid;
 code text; result jsonb; intake record; correction record; denied boolean;
BEGIN
 SELECT id INTO item FROM public.items WHERE is_active AND NOT coalesce(is_archived,false) ORDER BY id LIMIT 1;
 IF item IS NULL THEN RAISE EXCEPTION 'No active catalogue item available for rollback smoke'; END IF;
 FOR actor IN SELECT clerk_user_id,role,division FROM public.user_permissions
  WHERE is_active AND role IN('Manager','Developer') ORDER BY role
 LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.clerk_user_id,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF NOT public.current_user_can_edit_division(actor.division,'can_manage_inventory') THEN
   RAISE EXCEPTION 'Smoke actor lacks effective Manage Inventory permission';
  END IF;
  unit_id:=gen_random_uuid();shelf_id:=gen_random_uuid();bay_id:=gen_random_uuid();bin_id:=gen_random_uuid();
  code:='RELEASE-SMOKE-'||unit_id::text;
  result:=public.create_inventory_location(unit_id,'unit',null,code,'Rollback test unit',actor.division,0,'Release smoke - rolled back');
  result:=public.create_inventory_location(unit_id,'unit',null,code,'Rollback test unit',actor.division,0,'Release smoke - rolled back');
  IF result->>'replayed'<>'true' THEN RAISE EXCEPTION 'Replay did not resolve saved unit'; END IF;
  denied:=false;
  BEGIN
   PERFORM public.create_inventory_location(gen_random_uuid(),'unit',null,code,'Duplicate',actor.division,0,'Release smoke - rolled back');
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT LIKE 'That location code already exists%' THEN RAISE; END IF;denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Duplicate location was accepted'; END IF;
  PERFORM public.create_inventory_location(shelf_id,'shelf',unit_id,'S1','Rollback shelf',actor.division,0,'Release smoke - rolled back');
  PERFORM public.create_inventory_location(bay_id,'bay',shelf_id,'A','Rollback bay',actor.division,0,'Release smoke - rolled back');
  PERFORM public.create_inventory_location(bin_id,'bin',bay_id,'01','Rollback bin',actor.division,0,'Release smoke - rolled back');
  IF NOT EXISTS(SELECT 1 FROM public.bins WHERE id=bin_id) THEN RAISE EXCEPTION 'Saved bin is not visible through RLS'; END IF;
  SELECT * INTO intake FROM public.intake_inventory_count(bin_id,item,12,'Release smoke - rolled back');
  IF intake.quantity_on_hand IS DISTINCT FROM 12::numeric THEN RAISE EXCEPTION 'Intake failed to establish 12'; END IF;
  SELECT * INTO correction FROM public.set_inventory_count_quantity(intake.bin_item_id,8,'Release smoke - rolled back');
  IF correction.quantity_on_hand IS DISTINCT FROM 8::numeric THEN RAISE EXCEPTION 'Correction failed to establish 8'; END IF;
  SELECT * INTO correction FROM public.set_inventory_count_quantity(intake.bin_item_id,0,'Release smoke - rolled back');
  IF correction.quantity_on_hand IS DISTINCT FROM 0::numeric THEN RAISE EXCEPTION 'Zero count failed'; END IF;
  EXECUTE 'RESET ROLE';
  IF (SELECT count(*) FROM public.change_logs WHERE record_id IN(unit_id::text,shelf_id::text,bay_id::text,bin_id::text) AND action='create' AND user_id=actor.clerk_user_id)<>4 THEN
   RAISE EXCEPTION 'Location audit or idempotency mismatch';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.change_logs WHERE record_id=correction.transaction_item_id::text AND action='physical_count_correction' AND user_id=actor.clerk_user_id) THEN RAISE EXCEPTION 'Count audit missing'; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{}',true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false;
 BEGIN
  PERFORM public.create_inventory_location(gen_random_uuid(),'unit',null,'RELEASE-DENIED','Denied','Electrical',0,'Smoke');
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Active sign-in and Manage Inventory%' THEN RAISE; END IF;denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Missing actor was accepted'; END IF;
 EXECUTE 'RESET ROLE';
 IF has_function_privilege('anon','public.create_inventory_location(uuid,text,uuid,text,text,text,integer,text)','execute') THEN RAISE EXCEPTION 'Anonymous location execution allowed'; END IF;
END $$;
SELECT 'PASS: real hierarchy, RLS reads, duplicate/retry, intake, correction, zero count, actor audits and missing-actor/anonymous denial; rollback follows' AS result;
ROLLBACK;
