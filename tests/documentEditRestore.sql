-- Run in BEGIN/ROLLBACK only. Synthetic metadata, including storage metadata, is never retained.
INSERT INTO public.user_permissions(clerk_user_id,email,role,division,is_active)
VALUES('__doc_maintenance','doc-maintenance@example.invalid','Developer','Admin',true),
('__doc_maintenance_denied','doc-maintenance-denied@example.invalid','User','Electrical',true);
SELECT set_config('request.jwt.claims','{"sub":"__doc_maintenance","role":"authenticated"}',true);
INSERT INTO public.jobs(name,division,status) VALUES('__doc_maintenance','Admin','active');
INSERT INTO public.estimates(title,division) VALUES('__doc_maintenance','Admin');
INSERT INTO storage.objects(bucket_id,name) VALUES('northgate-files','__doc_maintenance/fixture.pdf');
CREATE FUNCTION pg_temp.fail_maintenance_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.table_name='documents' AND NEW.note='Reject maintenance audit' THEN
   RAISE EXCEPTION 'Injected audit failure' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER test_maintenance_audit_failure BEFORE INSERT ON public.change_logs FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_maintenance_audit();
SET LOCAL ROLE authenticated;
DO $test$
DECLARE j uuid; e uuid; d public.documents; saved public.documents; a public.documents; denied boolean;
BEGIN
 SELECT id INTO STRICT j FROM public.jobs WHERE name='__doc_maintenance';
 SELECT id INTO STRICT e FROM public.estimates WHERE title='__doc_maintenance';
 INSERT INTO public.documents(division,owner_type,owner_id,file_name,document_type,storage_path)
 VALUES('Admin','job',j,'fixture.pdf','misc','__doc_maintenance/fixture.pdf') RETURNING * INTO d;
 BEGIN
  PERFORM public.maintain_owner_document(d.id,'job',j,'edit','{"file_name":"new.pdf"}',' ',d.updated_at);
  RAISE EXCEPTION 'Blank reason accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN
  PERFORM public.maintain_owner_document(d.id,'job',j,'edit','{"storage_path":"wrong"}','Changed',d.updated_at);
  RAISE EXCEPTION 'Stored file mutation accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN
  PERFORM public.maintain_owner_document(d.id,'job',j,'edit','{"file_name":"folder/file.pdf"}','Changed',d.updated_at);
  RAISE EXCEPTION 'Path accepted as filename';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN
  PERFORM public.maintain_owner_document(d.id,'job',j,'edit','{"file_name":"new.pdf"}','Changed',d.updated_at-interval '1 day');
  RAISE EXCEPTION 'Stale edit accepted';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
 BEGIN
  PERFORM public.maintain_owner_document(d.id,'estimate',e,'edit','{}','Wrong owner',d.updated_at);
  RAISE EXCEPTION 'Wrong owner accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.documents SET file_name='bypass.pdf' WHERE id=d.id;
  RAISE EXCEPTION 'Direct edit accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN
  PERFORM public.maintain_owner_document(d.id,'job',j,'edit','{"file_name":"failed.pdf"}','Reject maintenance audit',d.updated_at);
  RAISE EXCEPTION 'Audit failure ignored';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.documents WHERE id=d.id AND file_name='fixture.pdf') THEN RAISE EXCEPTION 'Failed edit persisted'; END IF;
 SELECT * INTO saved FROM public.maintain_owner_document(d.id,'job',j,'edit','{"file_name":"updated.pdf","document_type":"plans","description":"Reclassified"}','Correct details',d.updated_at);
 IF saved.file_name<>'updated.pdf' OR saved.document_type<>'plans' OR saved.storage_path<>d.storage_path THEN RAISE EXCEPTION 'Bad edit result'; END IF;
 IF NULLIF(current_setting('northgate.document_workflow',true),'') IS NOT NULL THEN RAISE EXCEPTION 'Workflow leaked'; END IF;
 PERFORM public.archive_job_document(d.id,'Superseded');
 SELECT * INTO STRICT a FROM public.read_archived_owner_documents('job',j,0);
 BEGIN
  PERFORM public.maintain_owner_document(a.id,'job',j,'restore','{}','Reject maintenance audit',a.updated_at);
  RAISE EXCEPTION 'Restore audit failure ignored';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT count(*) FROM public.read_archived_owner_documents('job',j,0))<>1 THEN RAISE EXCEPTION 'Failed restore persisted'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"__doc_maintenance_denied","role":"authenticated"}',true);
 BEGIN
  PERFORM public.read_archived_owner_documents('job',j,0);
  RAISE EXCEPTION 'Unauthorized archived read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.maintain_owner_document(a.id,'job',j,'restore','{}','Unauthorized',a.updated_at);
  RAISE EXCEPTION 'Unauthorized restore accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{"sub":"__doc_maintenance","role":"authenticated"}',true);
 SELECT * INTO saved FROM public.maintain_owner_document(a.id,'job',j,'restore','{}','Still needed',a.updated_at);
 IF saved.archived_at IS NOT NULL OR saved.archive_reason IS NOT NULL OR saved.archived_by IS NOT NULL THEN RAISE EXCEPTION 'Restore did not clear archive fields'; END IF;
 IF EXISTS(SELECT 1 FROM public.read_archived_owner_documents('job',j,0)) THEN RAISE EXCEPTION 'Restored document still listed'; END IF;
 INSERT INTO public.documents(division,owner_type,owner_id,file_name,document_type,storage_path)
 VALUES('Admin','estimate',e,'missing.pdf','misc','__doc_maintenance/missing.pdf') RETURNING * INTO d;
 PERFORM public.maintain_owner_document(d.id,'estimate',e,'edit','{"description":"Estimate details"}','Correct estimate details',d.updated_at);
 PERFORM public.archive_estimate_document(d.id,'Missing upload');
 SELECT * INTO STRICT a FROM public.read_archived_owner_documents('estimate',e,0);
 BEGIN
  PERFORM public.maintain_owner_document(a.id,'estimate',e,'restore','{}','Try restore',a.updated_at);
  RAISE EXCEPTION 'Missing stored file restored';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM NOT LIKE 'Stored file is missing%' THEN RAISE; END IF;
 END;
END $test$;
RESET ROLE;
DO $audit$
BEGIN
 IF (SELECT count(*) FROM public.change_logs WHERE table_name='documents' AND user_id='__doc_maintenance' AND action='update')<>2 THEN RAISE EXCEPTION 'Wrong edit audit count'; END IF;
 IF (SELECT count(*) FROM public.change_logs WHERE table_name='documents' AND user_id='__doc_maintenance' AND action='restore')<>1 THEN RAISE EXCEPTION 'Wrong restore audit count'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.change_logs WHERE table_name='documents' AND user_id='__doc_maintenance' AND note='Correct details' AND before_data->>'file_name'='fixture.pdf' AND after_data->>'file_name'='updated.pdf') THEN RAISE EXCEPTION 'Missing before/after audit'; END IF;
 IF EXISTS(SELECT 1 FROM public.change_logs WHERE user_id='__doc_maintenance' AND note='Reject maintenance audit') THEN RAISE EXCEPTION 'Failed audit persisted'; END IF;
 IF has_function_privilege('anon','public.maintain_owner_document(uuid,text,uuid,text,jsonb,text,timestamptz)','execute') OR has_function_privilege('anon','public.read_archived_owner_documents(text,uuid,integer)','execute') THEN RAISE EXCEPTION 'Anonymous execute allowed'; END IF;
 IF has_function_privilege('authenticated','public.document_owner_can_manage(text,uuid)','execute') THEN RAISE EXCEPTION 'Internal helper exposed'; END IF;
END $audit$;
SELECT 'PASS: document maintenance permissions, edits, restores, missing storage, stale writes, immutable identity and atomic audits' AS result;
