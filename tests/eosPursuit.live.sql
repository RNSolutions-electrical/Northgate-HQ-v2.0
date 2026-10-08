-- Run only after EOS migration on an isolated schema rehearsal database.
-- All fixtures and audit rows roll back. Never run as a Production release step.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
INSERT INTO public.user_permissions(clerk_user_id,email,role,business_role,division,is_active) VALUES
 ('__eos_granted','eos-granted@example.invalid','Manager','Manager','Electrical',true),
 ('__eos_other','eos-other@example.invalid','Manager','Manager','Electrical',true),
 ('__eos_user','eos-user@example.invalid','User','User','Electrical',true),
 ('__eos_developer','eos-developer@example.invalid','Developer','Director','Electrical',true);
INSERT INTO public.user_technical_assignments(user_id,assignment_key,granted_by,grant_reason)
VALUES('__eos_developer','developer','rollback-test','EOS rollback-only permission fixture');
INSERT INTO public.eos_access_grants(user_id,granted_by) VALUES('__eos_granted','rollback-test');
INSERT INTO public.jobs(division,name,job_number,status)
VALUES('Electrical','__eos_existing_job','EOS-ROLLBACK-ONLY','active');
SELECT set_config('request.jwt.claims','{"sub":"__eos_granted","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE pursuit_id uuid; fixture_job_id uuid; repeat_id uuid; saved_id uuid;
  created_pursuit_id uuid; created_job_id uuid;
  row public.eos_pursuits%ROWTYPE; denied boolean;
BEGIN
  IF public.current_user_can_manage_eos() IS NOT TRUE THEN RAISE EXCEPTION 'Named manager grant failed'; END IF;
  pursuit_id:=public.eos_save_pursuit(NULL,jsonb_build_object(
    'project_name','__eos_rollback_pursuit','phase','Pursuit','planning_value',0,
    'probability',NULL,'initial_meeting','2026-12-27','status','Active'),
    ARRAY['__eos_granted','__eos_other']);
  SELECT * INTO STRICT row FROM public.eos_pursuits WHERE id=pursuit_id;
  IF row.planning_value IS DISTINCT FROM 0 OR row.probability IS NOT NULL
    OR row.follow_up_7_day IS DISTINCT FROM DATE '2027-01-03'
    OR row.meeting_2_week IS DISTINCT FROM DATE '2027-01-10' THEN
    RAISE EXCEPTION 'Zero/null or calendar follow-up semantics failed';
  END IF;
  IF (SELECT count(*) FROM public.eos_pursuit_managers pm WHERE pm.pursuit_id=row.id)<>2 THEN
    RAISE EXCEPTION 'Multiple manager assignment failed';
  END IF;
  saved_id:=public.eos_save_pursuit(pursuit_id,jsonb_build_object(
    'project_name',row.project_name,'phase','Pursuit','planning_value',2500,
    'probability',50.1,'initial_meeting','2026-12-27',
    'follow_up_7_day','2027-01-05','meeting_2_week','2027-01-10',
    'status','Dormant'),ARRAY['__eos_granted']);
  IF saved_id<>pursuit_id OR (SELECT count(*) FROM public.eos_pursuit_managers pm WHERE pm.pursuit_id=row.id)<>1
    OR (SELECT follow_up_7_day FROM public.eos_pursuits WHERE id=row.id) IS DISTINCT FROM DATE '2027-01-05'
    OR (SELECT status FROM public.eos_pursuits WHERE id=row.id)<>'Dormant' THEN
    RAISE EXCEPTION 'Atomic edit, manager removal, manual date or Dormant failed';
  END IF;
  IF NOT public.eos_set_pursuit_removed(pursuit_id,true) THEN
    RAISE EXCEPTION 'Recoverable delete failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.eos_pursuits WHERE id=pursuit_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Deleted pursuit remained visible as active';
  END IF;
  IF NOT public.eos_set_pursuit_removed(pursuit_id,false) THEN
    RAISE EXCEPTION 'Recoverable undo failed';
  END IF;
  denied:=false;
  BEGIN UPDATE public.eos_pursuits SET project_name='Unauthorized direct edit' WHERE id=pursuit_id;
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Direct pursuit table update was allowed'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"__eos_other","role":"authenticated"}',true);
  IF public.current_user_can_manage_eos() IS TRUE OR
    EXISTS(SELECT 1 FROM public.eos_pursuits WHERE id=pursuit_id) THEN
    RAISE EXCEPTION 'Ungrantanted Manager could access EOS';
  END IF;
  denied:=false;
  BEGIN PERFORM public.eos_save_pursuit(NULL,'{"project_name":"Denied"}'::jsonb,ARRAY[]::text[]);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Ungrantanted Manager wrote EOS'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"__eos_user","role":"authenticated"}',true);
  IF public.current_user_can_manage_eos() IS TRUE THEN RAISE EXCEPTION 'Ordinary User accessed EOS'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"__eos_developer","role":"authenticated"}',true);
  IF public.current_user_can_manage_eos() IS TRUE THEN RAISE EXCEPTION 'Technical Developer got implicit EOS access'; END IF;
  PERFORM public.set_eos_access('__eos_other',true);
  PERFORM set_config('request.jwt.claims','{"sub":"__eos_other","role":"authenticated"}',true);
  IF public.current_user_can_manage_eos() IS NOT TRUE THEN RAISE EXCEPTION 'Explicit EOS grant failed'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"__eos_granted","role":"authenticated"}',true);
  SELECT id INTO STRICT fixture_job_id FROM public.jobs WHERE job_number='EOS-ROLLBACK-ONLY';
  repeat_id:=public.eos_award_pursuit(pursuit_id,fixture_job_id,NULL,NULL);
  IF repeat_id<>fixture_job_id OR public.eos_award_pursuit(pursuit_id,fixture_job_id,NULL,NULL)<>fixture_job_id THEN
    RAISE EXCEPTION 'Award retry was not idempotent';
  END IF;
  IF (SELECT phase FROM public.eos_pursuits WHERE id=pursuit_id)<>'Awarded'
    OR EXISTS(SELECT 1 FROM public.job_budget_lines budget WHERE budget.job_id=fixture_job_id) THEN
    RAISE EXCEPTION 'Award failed or planning value posted to Job budget';
  END IF;
  created_pursuit_id:=public.eos_save_pursuit(NULL,jsonb_build_object(
    'project_name','__eos_new_job','phase','Pursuit','planning_value',4000,
    'status','Active'),ARRAY['__eos_granted']);
  created_job_id:=public.eos_award_pursuit(created_pursuit_id,NULL,'Electrical','EOS-CREATE-ROLLBACK');
  IF created_job_id IS NULL
    OR public.eos_award_pursuit(created_pursuit_id,NULL,'Electrical','EOS-CREATE-ROLLBACK')<>created_job_id
    OR (SELECT count(*) FROM public.jobs WHERE job_number='EOS-CREATE-ROLLBACK')<>1
    OR EXISTS(SELECT 1 FROM public.job_budget_lines budget WHERE budget.job_id=created_job_id) THEN
    RAISE EXCEPTION 'New Job award handoff, retry, or budget isolation failed';
  END IF;
END $test$;
RESET ROLE;
DO $audit$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.change_logs WHERE table_name='eos_pursuits'
    AND action='update' AND user_id='__eos_granted') THEN
    RAISE EXCEPTION 'EOS pursuit audit missing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.change_logs WHERE table_name='eos_access_grants'
    AND action='permission_change' AND user_id='__eos_developer') THEN
    RAISE EXCEPTION 'EOS permission audit missing';
  END IF;
END $audit$;
ROLLBACK;
