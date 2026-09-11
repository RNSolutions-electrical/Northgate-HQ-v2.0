-- Run inside BEGIN/ROLLBACK only; no storage objects or production fixtures are retained.
INSERT INTO public.user_permissions(clerk_user_id,email,role,division,is_active)
VALUES('__document_audit_test','document-test@example.invalid','Developer','Admin',true),
('__document_audit_denied','document-denied@example.invalid','User','Electrical',true);
SELECT set_config('request.jwt.claims','{"sub":"__document_audit_test","role":"authenticated"}',true);
INSERT INTO public.jobs(name,division,status) VALUES('__document_audit_job','Admin','active');
INSERT INTO public.estimates(title,division) VALUES('__document_audit_estimate','Admin');
CREATE FUNCTION pg_temp.fail_document_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.table_name='documents' AND (NEW.after_data->>'file_name'='fail-audit.pdf' OR NEW.note='Reject archive audit') THEN
 RAISE EXCEPTION 'Injected audit failure' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER test_document_audit_failure BEFORE INSERT ON public.change_logs FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_document_audit();
SET LOCAL ROLE authenticated;
DO $test$
DECLARE j uuid; e uuid; d uuid; ed uuid; failed boolean;
BEGIN
 SELECT id INTO STRICT j FROM public.jobs WHERE name='__document_audit_job';
 SELECT id INTO STRICT e FROM public.estimates WHERE title='__document_audit_estimate';
 INSERT INTO public.documents(division,owner_type,owner_id,file_name,storage_path,description)
 VALUES('Admin','job',j,'audit.pdf','__document_audit/audit.pdf','User document note') RETURNING id INTO d;
 BEGIN
  PERFORM public.archive_job_document(d,'   ');
  RAISE EXCEPTION 'Missing archive reason accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN
  UPDATE public.documents SET archived_at=now(),archive_reason=NULL WHERE id=d;
  RAISE EXCEPTION 'Direct archive without reason accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN
  UPDATE public.documents SET owner_id=gen_random_uuid() WHERE id=d;
  RAISE EXCEPTION 'Owner reassignment accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN
  INSERT INTO public.documents(division,owner_type,owner_id,file_name,storage_path)
  VALUES('Admin','job',j,'fail-audit.pdf','__document_audit/fail-audit.pdf');
  RAISE EXCEPTION 'Creation audit failure ignored';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.documents WHERE file_name='fail-audit.pdf' AND owner_id=j) THEN RAISE EXCEPTION 'Failed metadata creation persisted'; END IF;
 INSERT INTO public.documents(division,owner_type,owner_id,file_name,storage_path)
 VALUES('Admin','estimate',e,'estimate-audit.pdf','__document_audit/estimate-audit.pdf') RETURNING id INTO ed;
 failed := false;
 BEGIN PERFORM public.archive_job_document(ed,'Wrong endpoint');
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%Job document not found%' THEN RAISE; END IF;
  failed := true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'Job endpoint archived an estimate document'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"__document_audit_denied","role":"authenticated"}',true);
 BEGIN
  PERFORM public.archive_job_document(d,'Denied');
  RAISE EXCEPTION 'Unauthorized archive accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{"sub":"__document_audit_test","role":"authenticated"}',true);
 BEGIN
  PERFORM public.archive_job_document(d,'Reject archive audit');
  RAISE EXCEPTION 'Archive audit failure ignored';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.documents WHERE id=d AND archived_at IS NULL) THEN RAISE EXCEPTION 'Failed archive persisted'; END IF;
 PERFORM public.archive_job_document(d,'Superseded');
 PERFORM public.archive_estimate_document(ed,'Superseded estimate');
 INSERT INTO public.documents(division,owner_type,owner_id,file_name,storage_path)
 VALUES('Admin','job',j,'upload-failed.pdf','__document_audit/upload-failed.pdf') RETURNING id INTO d;
 PERFORM public.archive_failed_document_upload(d,'Upload failed: network');
END $test$;
RESET ROLE;
DO $check$
DECLARE j uuid; d uuid;
BEGIN
 SELECT id INTO j FROM public.jobs WHERE name='__document_audit_job';
 IF (SELECT count(*) FROM public.change_logs WHERE user_id='__document_audit_test' AND table_name='documents')<>6 THEN
  RAISE EXCEPTION 'Expected one create and one archive per document'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.change_logs WHERE user_id='__document_audit_test'
 AND after_data->>'file_name'='audit.pdf' AND action='archive' AND note='Superseded'
 AND after_data->>'archived_by'='__document_audit_test'
 AND before_data->>'description'='User document note' AND after_data->>'description'='User document note'
 AND after_data->>'archive_reason'='Superseded' AND created_at IS NOT NULL) THEN RAISE EXCEPTION 'Full audit snapshot missing'; END IF;
 SELECT id INTO d FROM public.documents WHERE owner_id=j AND file_name='upload-failed.pdf';
 IF (SELECT archived_by FROM public.documents WHERE id=d)<>'__document_audit_test' THEN RAISE EXCEPTION 'Archive actor spoofed'; END IF;
 -- Restore/edit controls are not implemented; direct metadata restoration is not an exemption.
 BEGIN UPDATE public.documents SET archived_at=NULL WHERE id=d;
 RAISE EXCEPTION 'Unaudited restoration accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
END $check$;
SELECT 'PASS: metadata audit atomicity, job/estimate archive reasons, direct guards, owner isolation, denied caller, cleanup actor/reason and exact audit snapshots' AS result;
