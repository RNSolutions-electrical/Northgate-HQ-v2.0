-- Controlled real-schema validation. All synthetic records and audit entries roll back.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE subject text;
BEGIN
 SELECT clerk_user_id INTO subject FROM public.user_permissions WHERE is_active AND role='Developer' ORDER BY clerk_user_id LIMIT 1;
 IF subject IS NULL THEN RAISE EXCEPTION 'No active Developer available for controlled validation'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role','authenticated')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE material uuid; unit jsonb; shelf jsonb; bay jsonb; bin jsonb; empty_bin jsonb; mapped jsonb; edited jsonb;
 alias_row jsonb; quantity numeric; code text:='QA-'||left(gen_random_uuid()::text,8); before_alias_count integer;
BEGIN
 SELECT id INTO material FROM public.items WHERE is_active AND NOT is_archived ORDER BY id LIMIT 1;
 IF material IS NULL THEN RAISE EXCEPTION 'No active catalogue material for validation'; END IF;
 SELECT count(*) INTO before_alias_count FROM public.item_aliases;
 alias_row:=public.save_material_alias(material,code||' rollback alias',false,'Phase 1 rollback-only release validation');
 IF (SELECT count(*) FROM public.item_aliases)<>before_alias_count+1 THEN RAISE EXCEPTION 'Alias read/RLS validation failed'; END IF;
 PERFORM public.save_material_alias(material,code||' rollback alias',true,'Phase 1 rollback-only archive validation');
 PERFORM public.save_material_alias(material,code||' rollback alias',false,'Phase 1 rollback-only restore validation');
 unit:=public.create_inventory_location(gen_random_uuid(),'unit',NULL,code,'Rollback-only validation','Electrical',0,'Phase 1 rollback-only release validation');
 shelf:=public.create_inventory_location(gen_random_uuid(),'shelf',(unit->>'id')::uuid,'S1','Rollback-only shelf','Electrical',0,'Phase 1 rollback-only release validation');
 bay:=public.create_inventory_location(gen_random_uuid(),'bay',(shelf->>'id')::uuid,'A','Rollback-only bay','Electrical',0,'Phase 1 rollback-only release validation');
 bin:=public.create_inventory_location(gen_random_uuid(),'bin',(bay->>'id')::uuid,'01','Rollback-only bin','Electrical',0,'Phase 1 rollback-only release validation');
 empty_bin:=public.create_inventory_location(gen_random_uuid(),'bin',(bay->>'id')::uuid,'02','Rollback-only empty bin','Electrical',0,'Phase 1 rollback-only release validation');
 mapped:=public.map_material_to_inventory_bin((bin->>'id')::uuid,material,'Phase 1 rollback-only mapping');
 IF EXISTS(SELECT 1 FROM public.inventory_balances WHERE bin_item_id=(mapped->>'bin_item_id')::uuid) THEN RAISE EXCEPTION 'Mapping created a balance'; END IF;
 IF (SELECT quantity_recorded FROM public.inventory_cart_candidates_view WHERE bin_item_id=(mapped->>'bin_item_id')::uuid) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Unknown quantity was not preserved'; END IF;
 IF (public.map_material_to_inventory_bin((bin->>'id')::uuid,material,'Phase 1 rollback-only mapping')->>'created')::boolean THEN RAISE EXCEPTION 'Duplicate mapping created'; END IF;
 SELECT quantity_on_hand INTO quantity FROM public.set_inventory_count_quantity((mapped->>'bin_item_id')::uuid,0,'Phase 1 rollback-only confirmed zero');
 IF quantity IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Count ledger failed'; END IF;
 IF (SELECT quantity_recorded FROM public.inventory_cart_candidates_view WHERE bin_item_id=(mapped->>'bin_item_id')::uuid) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirmed zero not distinguished'; END IF;
 edited:=public.edit_inventory_location('bin',(bin->>'id')::uuid,'RENAMED','Rollback-only renamed bin',1,1,'Phase 1 rollback-only edit');
 IF edited->>'id'<>bin->>'id' OR (edited->>'revision')::int<>2 OR edited->>'bay_id'<>bay->>'id' THEN RAISE EXCEPTION 'Location identity changed'; END IF;
 BEGIN
  PERFORM public.edit_inventory_location('bin',(bin->>'id')::uuid,'STALE','Stale edit',1,1,'Phase 1 stale request');
  RAISE EXCEPTION 'Stale revision was accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.set_inventory_location_archived('bin',(bin->>'id')::uuid,true,'Phase 1 active-link blocker');
  RAISE EXCEPTION 'Active mapping was archived';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.set_inventory_location_archived('bin',(empty_bin->>'id')::uuid,true,'');
  RAISE EXCEPTION 'Blank reason accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.set_inventory_location_archived('bin',(empty_bin->>'id')::uuid,true,'Phase 1 rollback-only archive');
 BEGIN
  PERFORM public.map_material_to_inventory_bin((empty_bin->>'id')::uuid,material,'Phase 1 archived mapping');
  RAISE EXCEPTION 'Archived location accepted a new mapping';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.set_inventory_location_archived('bin',(empty_bin->>'id')::uuid,false,'Phase 1 rollback-only restore');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','phase1-nonexistent-actor','role','authenticated')::text,true);
 BEGIN
  PERFORM public.save_material_alias(material,'Unauthorized alias',false,'Phase 1 permission validation');
  RAISE EXCEPTION 'Unknown actor granted write access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
SELECT 'PASS: actual authenticated RPCs, RLS reads, alias lifecycle, mapping/retry, unknown-to-zero ledger, stable edit/stale rejection, archive safeguards/restore, unknown actor denied; all test data rolled back' AS release_smoke;
