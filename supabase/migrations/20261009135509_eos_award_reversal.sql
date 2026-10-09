-- Reverse an EOS award without altering its Job association or Job financials.
-- Imported awarded rows may have no reliable pre-award phase; require the
-- operator to choose Pursuit or Estimate in that case instead of guessing.
ALTER TABLE public.eos_pursuits ADD COLUMN phase_before_award text
  CHECK (phase_before_award IN ('Pursuit','Estimate'));

UPDATE public.eos_pursuits p SET phase_before_award = (
  SELECT c.before_data->>'phase' FROM public.change_logs c
  WHERE c.table_name='eos_pursuits' AND c.record_id=p.id::text
    AND c.after_data->>'phase'='Awarded'
    AND c.before_data->>'phase' IN ('Pursuit','Estimate')
  ORDER BY c.created_at DESC LIMIT 1
) WHERE p.phase='Awarded';

CREATE OR REPLACE FUNCTION public.eos_guard_pursuit() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.phase='Awarded' AND NEW.phase IS DISTINCT FROM 'Awarded'
      AND current_setting('app.eos_award_reversal',true) IS DISTINCT FROM 'yes' THEN
      RAISE EXCEPTION 'Use the audited EOS award reversal' USING ERRCODE='42501';
    END IF;
    IF NEW.job_id IS DISTINCT FROM OLD.job_id
      AND current_setting('app.eos_job_link',true) IS DISTINCT FROM 'yes'
      AND current_setting('app.eos_award_handoff',true) IS DISTINCT FROM 'yes' THEN
      RAISE EXCEPTION 'Use the audited EOS Job link action' USING ERRCODE='42501';
    END IF;
    IF NEW.phase='Awarded' AND OLD.phase IS DISTINCT FROM 'Awarded'
      AND current_setting('app.eos_award_handoff',true) IS DISTINCT FROM 'yes' THEN
      RAISE EXCEPTION 'Use the atomic EOS award handoff' USING ERRCODE='42501';
    END IF;
    IF NEW.phase_before_award IS DISTINCT FROM OLD.phase_before_award
      AND current_setting('app.eos_award_handoff',true) IS DISTINCT FROM 'yes'
      AND current_setting('app.eos_award_reversal',true) IS DISTINCT FROM 'yes' THEN
      RAISE EXCEPTION 'Use the controlled EOS award action' USING ERRCODE='42501';
    END IF;
    IF NEW.initial_meeting IS DISTINCT FROM OLD.initial_meeting THEN
      NEW.follow_up_7_day:=NEW.initial_meeting + 7;
      NEW.meeting_2_week:=NEW.initial_meeting + 14;
    END IF;
  ELSIF (NEW.phase='Awarded' OR NEW.job_id IS NOT NULL OR NEW.phase_before_award IS NOT NULL)
    AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Use the controlled EOS award or Job link action' USING ERRCODE='42501';
  ELSIF NEW.initial_meeting IS NOT NULL THEN
    NEW.follow_up_7_day:=NEW.initial_meeting + 7;
    NEW.meeting_2_week:=NEW.initial_meeting + 14;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.eos_guard_pursuit() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.eos_award_pursuit(
  p_pursuit_id uuid,p_existing_job_id uuid DEFAULT NULL,
  p_division text DEFAULT NULL,p_job_number text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pursuit public.eos_pursuits%ROWTYPE; linked_job public.jobs%ROWTYPE;
BEGIN
  IF public.current_user_can_manage_eos() IS NOT TRUE THEN
    RAISE EXCEPTION 'EOS access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO pursuit FROM public.eos_pursuits WHERE id=p_pursuit_id AND deleted_at IS NULL FOR UPDATE;
  IF pursuit.id IS NULL THEN RAISE EXCEPTION 'Pursuit not found' USING ERRCODE='P0002'; END IF;
  IF pursuit.phase='Awarded' THEN
    IF pursuit.job_id IS NOT NULL THEN RETURN pursuit.job_id; END IF;
    RAISE EXCEPTION 'This pursuit is already awarded; link a Job separately' USING ERRCODE='22023';
  END IF;
  IF pursuit.job_id IS NOT NULL THEN
    IF p_existing_job_id IS NOT NULL AND p_existing_job_id IS DISTINCT FROM pursuit.job_id THEN
      RAISE EXCEPTION 'Change the Job link separately before awarding' USING ERRCODE='22023';
    END IF;
    SELECT * INTO linked_job FROM public.jobs WHERE id=pursuit.job_id AND archived_at IS NULL;
    IF linked_job.id IS NULL OR public.current_user_can_access_job(linked_job.id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Linked Job is unavailable to this user' USING ERRCODE='42501';
    END IF;
  ELSIF p_existing_job_id IS NOT NULL THEN
    SELECT * INTO linked_job FROM public.jobs WHERE id=p_existing_job_id AND archived_at IS NULL;
    IF linked_job.id IS NULL OR public.current_user_can_access_job(linked_job.id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Job is unavailable to this user' USING ERRCODE='42501';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.change_logs c WHERE c.table_name='eos_pursuits'
      AND c.record_id=p_pursuit_id::text AND c.before_data->>'phase'='Awarded') THEN
      RAISE EXCEPTION 'This pursuit was previously awarded; link an existing Job before re-awarding' USING ERRCODE='22023';
    END IF;
    IF p_division IS NULL OR nullif(btrim(p_job_number),'') IS NULL THEN
      RAISE EXCEPTION 'Division and job number are required to create a job' USING ERRCODE='22023';
    END IF;
    linked_job := public.create_job(p_division,p_job_number,pursuit.project_name,'active',
      pursuit.discussion,NULL,NULL,NULL,NULL,NULL,NULL,'job',NULL,NULL);
  END IF;
  PERFORM set_config('app.eos_award_handoff','yes',true);
  UPDATE public.eos_pursuits SET phase='Awarded',status='Active',job_id=linked_job.id,
    phase_before_award=CASE WHEN pursuit.phase IN ('Pursuit','Estimate') THEN pursuit.phase ELSE NULL END
    WHERE id=p_pursuit_id;
  RETURN linked_job.id;
END $$;
REVOKE ALL ON FUNCTION public.eos_award_pursuit(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eos_award_pursuit(uuid,uuid,text,text) TO authenticated;

CREATE FUNCTION public.eos_reverse_award(
  p_pursuit_id uuid,p_expected_job_id uuid,p_reason text,p_restore_phase text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pursuit public.eos_pursuits%ROWTYPE; saved public.eos_pursuits%ROWTYPE;
  target_phase text; actor text; actor_name text;
BEGIN
  IF public.current_user_can_manage_eos() IS NOT TRUE THEN
    RAISE EXCEPTION 'EOS access required' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(p_reason),'') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reverse an award' USING ERRCODE='22023';
  END IF;
  SELECT * INTO pursuit FROM public.eos_pursuits WHERE id=p_pursuit_id AND deleted_at IS NULL FOR UPDATE;
  IF pursuit.id IS NULL THEN RAISE EXCEPTION 'Pursuit not found' USING ERRCODE='P0002'; END IF;
  IF pursuit.phase IS DISTINCT FROM 'Awarded' THEN
    RAISE EXCEPTION 'Only an awarded pursuit can be reversed' USING ERRCODE='22023';
  END IF;
  IF pursuit.job_id IS DISTINCT FROM p_expected_job_id THEN
    RAISE EXCEPTION 'Job link changed since this pursuit was opened; refresh and retry' USING ERRCODE='40001';
  END IF;
  target_phase:=pursuit.phase_before_award;
  IF target_phase IS NULL THEN
    IF p_restore_phase NOT IN ('Pursuit','Estimate') OR p_restore_phase IS NULL THEN
      RAISE EXCEPTION 'Select Pursuit or Estimate: the prior phase was not recorded for this imported award' USING ERRCODE='22023';
    END IF;
    target_phase:=p_restore_phase;
  ELSIF p_restore_phase IS NOT NULL AND p_restore_phase IS DISTINCT FROM target_phase THEN
    RAISE EXCEPTION 'The recorded prior phase is %; it cannot be overridden',target_phase USING ERRCODE='22023';
  END IF;
  actor:=auth.jwt()->>'sub';
  SELECT coalesce(display_name,email,clerk_user_id) INTO actor_name
    FROM public.user_permissions WHERE clerk_user_id=actor;
  PERFORM set_config('app.eos_award_reversal','yes',true);
  UPDATE public.eos_pursuits SET phase=target_phase,status='Active'
    WHERE id=p_pursuit_id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,coalesce(actor_name,actor),'eos_pursuits',p_pursuit_id::text,'award_reversal',
    to_jsonb(pursuit),to_jsonb(saved),btrim(p_reason));
  RETURN target_phase;
END $$;
REVOKE ALL ON FUNCTION public.eos_reverse_award(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eos_reverse_award(uuid,uuid,text,text) TO authenticated;
