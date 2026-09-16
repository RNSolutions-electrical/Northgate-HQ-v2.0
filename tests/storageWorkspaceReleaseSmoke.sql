-- Actual production-schema test; every synthetic row and audit entry rolls back.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE subject text;
BEGIN
 SELECT clerk_user_id INTO subject FROM public.user_permissions WHERE is_active AND role='Developer' ORDER BY clerk_user_id LIMIT 1;
 IF subject IS NULL THEN RAISE EXCEPTION 'No active Developer for controlled validation'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role','authenticated')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); t uuid:=gen_random_uuid();
 b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); n uuid:=gen_random_uuid(); e uuid:=gen_random_uuid();
 material uuid; mapped jsonb; result jsonb; quantity numeric; code text:='QA-'||left(u::text,8);
BEGIN
 SELECT id INTO material FROM public.items WHERE is_active AND NOT is_archived ORDER BY id LIMIT 1;
 IF material IS NULL THEN RAISE EXCEPTION 'No active material for test'; END IF;
 PERFORM public.create_inventory_location(u,'unit',NULL,code,'Rollback unit A','Electrical',0,'Storage release rollback-only test');
 PERFORM public.create_inventory_location(v,'unit',NULL,code||'-B','Rollback unit B','Electrical',0,'Storage release rollback-only test');
 PERFORM public.create_inventory_location(s,'shelf',u,'S','Rollback shelf A','Electrical',0,'Storage release rollback-only test');
 PERFORM public.create_inventory_location(t,'shelf',v,'T','Rollback shelf B','Electrical',0,'Storage release rollback-only test');
 PERFORM public.create_inventory_location(b,'bay',s,'B','Rollback bay A','Electrical',0,'Storage release rollback-only test');
 PERFORM public.create_inventory_location(c,'bay',t,'C','Rollback bay B','Electrical',0,'Storage release rollback-only test');
 PERFORM public.create_inventory_location(n,'bin',b,'N','Rollback bin A','Electrical',0,'Storage release rollback-only test');
 PERFORM public.create_inventory_location(e,'bin',c,'E','Rollback empty bin','Electrical',0,'Storage release rollback-only test');
 mapped:=public.map_material_to_inventory_bin(n,material,'Rollback-only mapping');
 SELECT quantity_on_hand INTO quantity FROM public.set_inventory_count_quantity((mapped->>'bin_item_id')::uuid,3,'Rollback-only count');
 IF quantity IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'Count failed'; END IF;
 result:=public.edit_inventory_location('shelf',s,'S','Moved shelf',0,1,'Rollback-only shelf move','{"physical_location":"North wall","materials_summary":"Fittings"}',v);
 IF result->>'unit_id'<>v::text OR result->>'physical_location'<>'North wall' THEN RAISE EXCEPTION 'Shelf move/details failed'; END IF;
 IF (SELECT shelf_id FROM public.bays WHERE id=b)<>s OR (SELECT bay_id FROM public.bins WHERE id=n)<>b THEN RAISE EXCEPTION 'Descendant relationships changed'; END IF;
 result:=public.edit_inventory_location('bay',b,'B','Moved bay',0,1,'Rollback-only bay move',NULL,t);
 IF result->>'shelf_id'<>t::text THEN RAISE EXCEPTION 'Bay move failed'; END IF;
 result:=public.edit_inventory_location('bin',n,'N','Moved bin',0,1,'Rollback-only bin move','{"physical_location":"Right side"}',c);
 IF result->>'bay_id'<>c::text THEN RAISE EXCEPTION 'Bin move failed'; END IF;
 result:=public.edit_inventory_location('bin',n,'N','Old-client rename',0,2,'Rollback-only compatibility');
 IF result->>'physical_location'<>'Right side' OR result->>'bay_id'<>c::text THEN RAISE EXCEPTION 'Old client lost details/parent'; END IF;
 IF (SELECT quantity_on_hand FROM public.inventory_cart_candidates_view WHERE bin_item_id=(mapped->>'bin_item_id')::uuid) IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'Move changed quantity'; END IF;
 BEGIN
  PERFORM public.edit_inventory_location('bin',n,'N','Stale',0,1,'Rollback stale',NULL,c);
  RAISE EXCEPTION 'Stale edit accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.edit_inventory_location('bin',n,'N','Wrong parent type',0,3,'Rollback wrong parent',NULL,t);
  RAISE EXCEPTION 'Wrong parent type accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.edit_inventory_location('bin',n,'E','Duplicate',0,3,'Rollback duplicate',NULL,c);
  RAISE EXCEPTION 'Duplicate code accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 result:=public.edit_inventory_location('bin',n,'N','No reason',0,3,'',NULL,c);
 IF result->>'name'<>'No reason' THEN RAISE EXCEPTION 'Routine edit failed'; END IF;
 BEGIN
  PERFORM public.set_inventory_location_archived('bin',n,true,'Rollback active-link blocker');
  RAISE EXCEPTION 'Mapped bin archived';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.set_inventory_location_archived('bin',e,true,'Rollback archive');
 PERFORM public.set_inventory_location_archived('bin',e,false,'Rollback restore');
 PERFORM set_config('request.jwt.claims','{"sub":"storage-release-unknown-actor","role":"authenticated"}',true);
 BEGIN
  PERFORM public.edit_inventory_location('bin',n,'N','Unauthorized',0,3,'Rollback denied',NULL,c);
  RAISE EXCEPTION 'Unknown actor accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
SELECT 'PASS: actual authenticated/RLS hierarchy create, map, count, shelf/bay/bin moves, stable descendants/quantity, details, old-client preservation, reason-free edit, stale/type/collision/actor rejections and archive/restore; all synthetic data rolled back' AS storage_release_smoke;
