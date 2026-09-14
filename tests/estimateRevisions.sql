-- Synthetic users/estimates only. Everything rolls back.
BEGIN;
INSERT INTO public.user_permissions(clerk_user_id,email,role,division,is_active,permission_overrides)
VALUES ('__revision_test','revision-test@example.invalid','Developer','Admin',true,'{}'),
('__revision_denied','revision-denied@example.invalid','User','Electrical',true,'{"can_estimate":false}');
SELECT set_config('request.jwt.claims','{"sub":"__revision_test","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE doc jsonb:='{"name":"Revision rollback test","rate":10,"materialMarkup":0,"feePercent":0,"entries":[{"id":"e","number":1,"items":[{"id":"i","number":1,"name":"Work","qty":1,"lines":[{"qty":1,"price":100,"hours":0}]}]}],"proposal":{"scope":"Original approved scope"}}';
 original public.estimate_workbenches; revised public.estimate_workbenches; retry public.estimate_workbenches;
 snapshot uuid; next_snapshot uuid; original_json jsonb; version integer;
BEGIN
 original:=public.save_estimate_workbench(NULL,'Electrical',doc,NULL,'[]');
 snapshot:=public.approve_workbench_estimate(original.estimate_id,'Synthetic original approval');
 SELECT to_jsonb(s) INTO original_json FROM public.estimate_snapshots s WHERE id=snapshot;
 revised:=public.create_workbench_revision(original.estimate_id,snapshot,'Client changed scope');
 IF revised.estimate_id=original.estimate_id OR COALESCE(revised.document->>'approvedAt','')<>'' THEN RAISE EXCEPTION 'Revision did not create a new draft'; END IF;
 SELECT version_number INTO version FROM public.estimates WHERE id=revised.estimate_id AND revision_of=original.estimate_id AND source_snapshot_id=snapshot;
 IF version IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Missing V2 lineage'; END IF;
 retry:=public.create_workbench_revision(original.estimate_id,snapshot,'Repeated request');
 IF retry.estimate_id<>revised.estimate_id THEN RAISE EXCEPTION 'Retry duplicated revision'; END IF;
 revised:=public.save_estimate_workbench(revised.estimate_id,'Electrical',jsonb_set(revised.document,'{proposal,scope}','"Revised scope"'),revised.revision,'[]');
 BEGIN
  PERFORM public.save_estimate_workbench(revised.estimate_id,'Electrical',revised.document,1,'[]');
  RAISE EXCEPTION 'Stale save accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 next_snapshot:=public.approve_workbench_estimate(revised.estimate_id,'Synthetic V2 approval');
 retry:=public.create_workbench_revision(revised.estimate_id,next_snapshot,'Third version');
 SELECT version_number INTO version FROM public.estimates WHERE id=retry.estimate_id AND revision_root_id=original.estimate_id;
 IF version IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'Missing V3 lineage'; END IF;
 IF (SELECT to_jsonb(s) FROM public.estimate_snapshots s WHERE id=snapshot) IS DISTINCT FROM original_json THEN RAISE EXCEPTION 'Original snapshot changed'; END IF;
 PERFORM set_config('northgate.test_revision_id',revised.estimate_id::text,true);
 PERFORM set_config('northgate.test_source_snapshot',next_snapshot::text,true);
 PERFORM set_config('northgate.test_archived_revision',retry.estimate_id::text,true);
 BEGIN
  PERFORM public.create_workbench_revision(original.estimate_id,next_snapshot,'Wrong source');
  RAISE EXCEPTION 'Cross-estimate snapshot accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.create_workbench_revision(original.estimate_id,snapshot,' ');
  RAISE EXCEPTION 'Empty reason accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  UPDATE public.estimates SET version_number=99 WHERE id=retry.estimate_id;
  RAISE EXCEPTION 'Lineage mutation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{"sub":"__revision_denied","role":"authenticated"}',true);
 BEGIN
  PERFORM public.create_workbench_revision(original.estimate_id,snapshot,'Unauthorized');
  RAISE EXCEPTION 'Unauthorized revision accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
-- Simulate an administrative archive of V3. This is synthetic data only and
-- deliberately does not claim to test the unrelated legacy archive UI/RPC.
SELECT set_config('northgate.workbench_approval','yes',true);
UPDATE public.estimates SET archived_at=now(),status='archived' WHERE id=current_setting('northgate.test_archived_revision')::uuid;
SELECT set_config('northgate.workbench_approval','',true);
SELECT set_config('request.jwt.claims','{"sub":"__revision_test","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $archived$
DECLARE saved public.estimate_workbenches; n integer;
BEGIN
 saved:=public.create_workbench_revision(current_setting('northgate.test_revision_id')::uuid,current_setting('northgate.test_source_snapshot')::uuid,'After archived version');
 SELECT version_number INTO n FROM public.estimates WHERE id=saved.estimate_id;
 IF n IS DISTINCT FROM 4 OR (saved.document->'revisionContext'->>'version')::integer<>4 THEN RAISE EXCEPTION 'Archived version number was reused'; END IF;
END $archived$;
RESET ROLE;
DO $acl$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.change_logs WHERE record_id=current_setting('northgate.test_revision_id') AND after_data->'document'->'revisionContext'->>'reason'='Client changed scope') THEN RAISE EXCEPTION 'Revision reason not audited'; END IF;
 IF has_function_privilege('anon','public.create_workbench_revision(uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous revision access'; END IF;
END $acl$;
ROLLBACK;
