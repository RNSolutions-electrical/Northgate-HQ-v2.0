-- Actual-schema synthetic smoke. Every grant, location, stock entry and audit rolls back.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $$ DECLARE subject text; BEGIN
 SELECT clerk_user_id INTO subject FROM public.user_permissions WHERE is_active AND role='Developer'
 AND coalesce((permission_overrides->>'can_access_developer')::boolean,true) ORDER BY clerk_user_id LIMIT 1;
 IF subject IS NULL THEN RAISE EXCEPTION 'Active Developer required for rollback smoke'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role','authenticated')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();b uuid:=gen_random_uuid();n uuid:=gen_random_uuid();material uuid;binding uuid;retired timestamptz;answer jsonb;prior boolean; BEGIN
 prior:=public.current_user_can_correct_inventory_data();
 PERFORM public.set_developer_data_correction(auth.jwt()->>'sub',true,prior,'Rollback-only correction release test');
 IF public.current_user_can_correct_inventory_data() IS NOT TRUE THEN RAISE EXCEPTION 'Grant failed'; END IF;
 PERFORM public.create_inventory_location(u,'unit',NULL,'QA-CORRECT-'||left(u::text,8),'Rollback only','Electrical',0,'Rollback-only correction release test');
 PERFORM public.create_inventory_location(s,'shelf',u,'S','Rollback only','Electrical',0,'Rollback-only correction release test');
 PERFORM public.create_inventory_location(b,'bay',s,'B','Rollback only','Electrical',0,'Rollback-only correction release test');
 PERFORM public.create_inventory_location(n,'bin',b,'N','Rollback only','Electrical',0,'Rollback-only correction release test');
 SELECT id INTO material FROM public.items WHERE is_active AND NOT is_archived ORDER BY id LIMIT 1;
 binding:=(public.map_material_to_inventory_bin(n,material,'Rollback-only correction release test')->>'bin_item_id')::uuid;
 PERFORM public.set_inventory_count_quantity(binding,0,'Rollback-only confirmed empty');
 SELECT archived_at INTO retired FROM public.retire_bin_item(binding,'Rollback-only incorrect assignment');
 IF jsonb_array_length(public.read_retired_bin_assignments(n))<>1 THEN RAISE EXCEPTION 'Retired list failed'; END IF;
 BEGIN
  PERFORM public.restore_retired_bin_assignment(binding,retired,'');
  RAISE EXCEPTION 'Missing reason accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Enter a restoration reason%' THEN RAISE; END IF; END;
 answer:=public.restore_retired_bin_assignment(binding,retired,'Rollback-only correct assignment');
 IF answer->>'restored'<>'true' OR (answer->>'quantity_unchanged')::numeric<>0 THEN RAISE EXCEPTION 'Restoration failed'; END IF;
 BEGIN
  PERFORM public.restore_retired_bin_assignment(binding,retired,'Repeat request');
  RAISE EXCEPTION 'Duplicate restoration accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'This assignment is already active%' THEN RAISE; END IF; END;
 PERFORM public.set_developer_data_correction(auth.jwt()->>'sub',false,true,'Rollback-only revoke test');
 IF public.current_user_can_correct_inventory_data() THEN RAISE EXCEPTION 'Revocation failed'; END IF;
 BEGIN
  PERFORM public.read_retired_bin_assignments(n);RAISE EXCEPTION 'Revoked read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('correction_test.binding',binding::text,true);
END $$;
RESET ROLE;
DO $$ DECLARE binding uuid:=current_setting('correction_test.binding')::uuid; BEGIN
 IF (SELECT quantity FROM public.inventory_balances WHERE bin_item_id=binding)<>0 THEN RAISE EXCEPTION 'Quantity changed'; END IF;
 IF (SELECT count(*) FROM public.transaction_items WHERE bin_item_id=binding)<>1 THEN RAISE EXCEPTION 'Restoration created stock history'; END IF;
 IF (SELECT count(*) FROM public.change_logs WHERE record_id=binding::text AND action='restore')<>1 THEN RAISE EXCEPTION 'Restore audit missing/duplicated'; END IF;
END $$;
ROLLBACK;
