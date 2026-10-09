-- Run only after both EOS Job-link migrations on an isolated Staging database.
-- Every fixture, audit row, and relationship change rolls back.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
INSERT INTO public.user_permissions(clerk_user_id,email,role,business_role,division,is_active) VALUES
 ('__eos_link_manager','eos-link-manager@example.invalid','Manager','Manager','Electrical',true),
 ('__eos_link_other','eos-link-other@example.invalid','Manager','Manager','Electrical',true);
INSERT INTO public.eos_access_grants(user_id,granted_by) VALUES('__eos_link_manager','rollback-test');
INSERT INTO public.jobs(division,name,job_number,status)
VALUES('Electrical','__eos_link_existing_job','EOS-LINK-ROLLBACK-ONLY','active');
SELECT set_config('request.jwt.claims','{"sub":"__eos_link_manager","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE pursuit_id uuid; fixture_job_id uuid; award_id uuid; denied boolean; row public.eos_pursuits%ROWTYPE;
BEGIN
  SELECT id INTO STRICT fixture_job_id FROM public.jobs WHERE job_number='EOS-LINK-ROLLBACK-ONLY';
  pursuit_id:=public.eos_save_pursuit(NULL,jsonb_build_object(
    'project_name','__eos_link_test','phase','Estimate','planning_value',1234,
    'status','Active'),ARRAY['__eos_link_manager']);
  IF public.eos_set_pursuit_job(pursuit_id,fixture_job_id,NULL) IS DISTINCT FROM fixture_job_id THEN
    RAISE EXCEPTION 'Link did not return the selected Job';
  END IF;
  SELECT * INTO STRICT row FROM public.eos_pursuits WHERE id=pursuit_id;
  IF row.job_id IS DISTINCT FROM fixture_job_id OR row.phase<>'Estimate' OR row.status<>'Active'
    OR EXISTS(SELECT 1 FROM public.job_budget_lines WHERE job_id=fixture_job_id) THEN
    RAISE EXCEPTION 'Link changed phase, status, or Job financials';
  END IF;
  denied:=false;
  BEGIN PERFORM public.eos_set_pursuit_job(pursuit_id,NULL,NULL);
  EXCEPTION WHEN serialization_failure THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale link change was accepted'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"__eos_link_other","role":"authenticated"}',true);
  denied:=false;
  BEGIN PERFORM public.eos_set_pursuit_job(pursuit_id,NULL,fixture_job_id);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Ungrantanted Manager changed EOS Job link'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"__eos_link_manager","role":"authenticated"}',true);
  PERFORM public.eos_set_pursuit_job(pursuit_id,NULL,fixture_job_id);
  IF (SELECT job_id FROM public.eos_pursuits WHERE id=pursuit_id) IS NOT NULL
    OR (SELECT phase FROM public.eos_pursuits WHERE id=pursuit_id)<>'Estimate' THEN
    RAISE EXCEPTION 'Unlink changed phase or left a Job association';
  END IF;
  PERFORM public.eos_set_pursuit_job(pursuit_id,fixture_job_id,NULL);
  award_id:=public.eos_award_pursuit(pursuit_id,fixture_job_id,NULL,NULL);
  IF award_id IS DISTINCT FROM fixture_job_id
    OR (SELECT phase FROM public.eos_pursuits WHERE id=pursuit_id)<>'Awarded' THEN
    RAISE EXCEPTION 'Awarding an already-linked pursuit failed';
  END IF;
  PERFORM public.eos_set_pursuit_job(pursuit_id,NULL,fixture_job_id);
  IF (SELECT phase FROM public.eos_pursuits WHERE id=pursuit_id)<>'Awarded'
    OR (SELECT job_id FROM public.eos_pursuits WHERE id=pursuit_id) IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.job_budget_lines WHERE job_id=fixture_job_id) THEN
    RAISE EXCEPTION 'Unlinking an award changed phase or Job financials';
  END IF;
  denied:=false;
  BEGIN PERFORM public.eos_award_pursuit(pursuit_id,NULL,'Electrical','EOS-SECOND-JOB-ROLLBACK');
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied OR EXISTS(SELECT 1 FROM public.jobs WHERE job_number='EOS-SECOND-JOB-ROLLBACK') THEN
    RAISE EXCEPTION 'A retry after unlink created a second Job';
  END IF;
  denied:=false;
  BEGIN UPDATE public.eos_pursuits SET phase='Pursuit' WHERE id=pursuit_id;
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Direct award reversal was allowed'; END IF;
END $test$;
RESET ROLE;
DO $audit$ BEGIN
  IF (SELECT count(*) FROM public.change_logs WHERE table_name='eos_pursuits'
    AND user_id='__eos_link_manager' AND action='update'
    AND before_data->'job_id' IS DISTINCT FROM after_data->'job_id') < 4 THEN
    RAISE EXCEPTION 'Job-link before/after audit entries missing';
  END IF;
END $audit$;
ROLLBACK;
