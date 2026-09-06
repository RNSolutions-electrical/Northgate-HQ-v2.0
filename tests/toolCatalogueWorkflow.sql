-- Run exclusively inside BEGIN/ROLLBACK; no test users, tools or audit entries survive.
INSERT INTO public.user_permissions(clerk_user_id,email,role,division,is_active)
VALUES ('__tools_workflow_test','tools-test@example.invalid','Developer','Admin',true),
('__tools_workflow_denied','tools-denied@example.invalid','User','Electrical',true);
SELECT set_config('request.jwt.claims','{"sub":"__tools_workflow_test","role":"authenticated"}',true);
-- Inject audit failure for a single synthetic name to prove atomicity.
CREATE FUNCTION pg_temp.reject_tool_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.table_name='tools' AND NEW.after_data->>'name'='__tool_audit_failure' THEN
    RAISE EXCEPTION 'Injected audit failure' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_tool_audit_failure BEFORE INSERT ON public.change_logs
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_tool_test_audit();
SET LOCAL ROLE authenticated;
DO $test$
DECLARE t public.tools; saved public.tools; original public.tools;
BEGIN
  t := public.save_tool_catalogue(NULL,'Admin','{"name":"__tools_test","notes":"Operational note"}');
  IF t.id IS NULL THEN RAISE EXCEPTION 'Create failed'; END IF;
  original := t;
  BEGIN
    PERFORM public.save_tool_catalogue(t.id,'Admin','{"model":"New model"}','save',NULL,t.updated_at);
    RAISE EXCEPTION 'Edit without reason accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  t := public.save_tool_catalogue(t.id,'Admin','{"model":"New model","brand":"New brand"}','save','Correct catalogue details',t.updated_at);
  IF t.model<>'New model' OR t.brand<>'New brand' OR t.notes<>'Operational note' THEN RAISE EXCEPTION 'Patch lost data'; END IF;
  IF COALESCE(current_setting('northgate.tool_workflow',true),'')<>'' OR COALESCE(current_setting('northgate.tool_reason',true),'')<>'' THEN
    RAISE EXCEPTION 'Workflow context leaked';
  END IF;
  BEGIN
    UPDATE public.tools SET model='Bypass' WHERE id=t.id;
    RAISE EXCEPTION 'Direct update bypass accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.tools(division,name) VALUES('Admin','__tools_bypass');
    RAISE EXCEPTION 'Direct insert bypass accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.save_tool_catalogue(t.id,'Admin','{"division":"Electrical"}','save','Move',t.updated_at);
    RAISE EXCEPTION 'Identity field accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.save_tool_catalogue(t.id,'Admin','{"model":"Stale"}','save','Update','2000-01-01');
    RAISE EXCEPTION 'Stale save accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
  BEGIN
    PERFORM public.save_tool_catalogue(t.id,'Admin','{}','archive','   ',t.updated_at);
    RAISE EXCEPTION 'Archive without reason accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  t := public.save_tool_catalogue(t.id,'Admin','{}','archive','No longer in service',t.updated_at);
  IF t.archived_at IS NULL OR t.archived_by<>'__tools_workflow_test' THEN RAISE EXCEPTION 'Archive failed'; END IF;
  BEGIN
    PERFORM public.save_tool_catalogue(t.id,'Admin','{"name":"Edit archived"}','save','Edit',t.updated_at);
    RAISE EXCEPTION 'Archived edit accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.save_tool_catalogue(t.id,'Admin','{}','restore',NULL,t.updated_at);
    RAISE EXCEPTION 'Restore without reason accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  t := public.save_tool_catalogue(t.id,'Admin','{}','restore','Returned to service',t.updated_at);
  IF t.archived_at IS NOT NULL OR t.archive_reason IS NOT NULL THEN RAISE EXCEPTION 'Restore failed'; END IF;
  BEGIN
    PERFORM public.save_tool_catalogue(t.id,'Admin','{"name":"__tool_audit_failure"}','save','Audit failure test',t.updated_at);
    RAISE EXCEPTION 'Audit failure not propagated';
  EXCEPTION WHEN check_violation THEN NULL; END;
  SELECT * INTO saved FROM public.tools WHERE id=t.id;
  IF to_jsonb(saved)<>to_jsonb(t) THEN RAISE EXCEPTION 'Audit failure left partial write'; END IF;
  BEGIN
    PERFORM public.save_tool_catalogue(NULL,'Admin','{"name":"__tool_audit_failure"}');
    RAISE EXCEPTION 'Create audit failure not propagated';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.tools WHERE name='__tool_audit_failure') THEN RAISE EXCEPTION 'Failed create persisted'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"__tools_workflow_denied","role":"authenticated"}',true);
  BEGIN
    PERFORM public.save_tool_catalogue(t.id,'Admin','{"name":"Denied"}','save','Denied',t.updated_at);
    RAISE EXCEPTION 'Unauthorized edit accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.save_tool_catalogue(NULL,'Admin','{"name":"Denied create"}');
    RAISE EXCEPTION 'Unauthorized create accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claims','{}',true);
  BEGIN
    PERFORM public.save_tool_catalogue(NULL,'Admin','{"name":"Anonymous"}');
    RAISE EXCEPTION 'Unauthenticated create accepted';
  EXCEPTION WHEN SQLSTATE '28000' THEN NULL; END;
END $test$;
RESET ROLE;
DO $audit$
DECLARE id_text text;
BEGIN
  SELECT id::text INTO STRICT id_text FROM public.tools WHERE name='__tools_test';
  IF (SELECT count(*) FROM public.change_logs WHERE table_name='tools' AND record_id=id_text)<>4 THEN RAISE EXCEPTION 'Expected exactly four successful audit events'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.change_logs WHERE record_id=id_text AND action='update'
    AND before_data->>'model' IS NULL AND after_data->>'model'='New model'
    AND after_data->>'notes'='Operational note' AND note='Correct catalogue details'
    AND user_id='__tools_workflow_test' AND created_at IS NOT NULL) THEN RAISE EXCEPTION 'Update audit context missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.change_logs WHERE record_id=id_text AND action='archive' AND note='No longer in service')
    OR NOT EXISTS(SELECT 1 FROM public.change_logs WHERE record_id=id_text AND action='restore' AND note='Returned to service')
    THEN RAISE EXCEPTION 'Archive/restore audit missing'; END IF;
END $audit$;
SELECT 'PASS: creation, shared edit reason, notes, archive/restore, stale and denied writes, direct-write guards, atomic audit rollback and exact history' AS result;
