-- Live-schema validation only: synthetic rows are rolled back.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ DECLARE subject text; j uuid; BEGIN
 SELECT clerk_user_id INTO subject FROM public.user_permissions WHERE is_active AND role='Developer' ORDER BY clerk_user_id LIMIT 1;
 IF subject IS NULL THEN RAISE EXCEPTION 'Active Developer required for controlled test';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role','authenticated')::text,true);
 INSERT INTO public.jobs(name,division,status)VALUES('__JUNIPER_ROLLBACK__','Electrical','active')RETURNING id INTO j;
 PERFORM set_config('test.release_job',j::text,true);
 INSERT INTO storage.objects(bucket_id,name)VALUES('northgate-files','__JUNIPER_ROLLBACK__/'||j||'.pdf');
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE j uuid:=current_setting('test.release_job')::uuid; d public.documents; tagged public.documents; edited public.documents; a public.documents; u uuid:=gen_random_uuid();s uuid:=gen_random_uuid(); result jsonb; BEGIN
 INSERT INTO public.documents(division,owner_type,owner_id,file_name,document_type,storage_path)
 VALUES('Electrical','job',j,'release.pdf','misc','__JUNIPER_ROLLBACK__/'||j||'.pdf') RETURNING * INTO d;
 tagged:=public.set_document_tags(d.id,ARRAY['construction','electrical'],ARRAY['Change Order','Site'],d.updated_at,d.organization_version);
 IF tagged.department_tags<>ARRAY['construction','electrical'] OR tagged.custom_tags<>ARRAY['change order','site'] OR tagged.organization_version<>2 THEN RAISE EXCEPTION 'Tag normalization failed';END IF;
 BEGIN PERFORM public.set_document_tags(d.id,ARRAY['general'],'{}',d.updated_at,d.organization_version);RAISE EXCEPTION 'Stale accepted';EXCEPTION WHEN serialization_failure THEN NULL;END;
 edited:=public.maintain_owner_document(d.id,'job',j,'edit','{"description":"Automatic audit validation"}',NULL,tagged.updated_at);
 PERFORM public.archive_job_document(d.id,NULL);
 SELECT * INTO STRICT a FROM public.read_archived_owner_documents('job',j,0);
 edited:=public.maintain_owner_document(d.id,'job',j,'restore','{}',NULL,a.updated_at);
 IF edited.archived_at IS NOT NULL OR edited.department_tags<>tagged.department_tags OR edited.storage_path<>d.storage_path THEN RAISE EXCEPTION 'Restore changed protected identity/tags';END IF;
 PERFORM public.create_inventory_location(u,'unit',NULL,'QA-'||left(u::text,8),'Rollback unit','Electrical',0,NULL,'{"physical_location":"North wall","materials_summary":"Fittings"}');
 result:=public.create_inventory_location(u,'unit',NULL,'QA-'||left(u::text,8),'Rollback unit','Electrical',0,NULL,'{"physical_location":"North wall","materials_summary":"Fittings"}');
 IF NOT (result->>'replayed')::boolean THEN RAISE EXCEPTION 'Replay failed'; END IF;
 PERFORM public.create_inventory_location(s,'shelf',u,'S','Rollback shelf','Electrical',0,NULL,'{}');
 IF (SELECT physical_location FROM public.shelves WHERE id=s) IS NOT NULL THEN RAISE EXCEPTION 'Inheritance marker lost';END IF;
 PERFORM public.edit_inventory_location('shelf',s,'S','Updated',0,1,NULL,'{"materials_summary":"Connectors","physical_location":null}',u);
 PERFORM public.set_inventory_location_archived('shelf',s,true,NULL);
 PERFORM public.set_inventory_location_archived('shelf',s,false,NULL);
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.change_logs WHERE table_name='documents' AND note LIKE 'Automatic audit:%' AND before_data IS NOT NULL AND after_data IS NOT NULL AND user_id IS NOT NULL) THEN RAISE EXCEPTION 'Automatic document audit missing';END IF;
 IF has_function_privilege('anon','public.set_document_tags(uuid,text[],text[],timestamptz,integer)','execute') OR has_function_privilege('anon','public.create_inventory_location(uuid,text,uuid,text,text,text,integer,text,jsonb)','execute') THEN RAISE EXCEPTION 'Anonymous RPC access';END IF;
END $$;
ROLLBACK;
SELECT 'PASS: actual-schema tags/stale guard; reason-free document edit/archive/restore with identity retained; atomic storage details/replay/inheritance marker/lifecycle and anonymous denial; all test rows rolled back' AS release_check;
