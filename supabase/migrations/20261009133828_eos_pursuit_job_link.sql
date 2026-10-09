-- A Job reference is an editable relationship, not an award or financial posting.
-- Keep award transition controlled by eos_award_pursuit. Existing audit trigger
-- records the before/after job_id and actor for each real relationship change.
CREATE OR REPLACE FUNCTION public.eos_guard_pursuit() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.phase='Awarded' AND NEW.phase IS DISTINCT FROM 'Awarded' THEN
      RAISE EXCEPTION 'Awarded pursuits require a separately defined reversal workflow' USING ERRCODE='42501';
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
    IF NEW.initial_meeting IS DISTINCT FROM OLD.initial_meeting THEN
      NEW.follow_up_7_day:=NEW.initial_meeting + 7;
      NEW.meeting_2_week:=NEW.initial_meeting + 14;
    END IF;
  ELSIF (NEW.phase='Awarded' OR NEW.job_id IS NOT NULL)
    AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Use the controlled EOS award or Job link action' USING ERRCODE='42501';
  ELSIF NEW.initial_meeting IS NOT NULL THEN
    NEW.follow_up_7_day:=NEW.initial_meeting + 7;
    NEW.meeting_2_week:=NEW.initial_meeting + 14;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.eos_guard_pursuit() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.eos_set_pursuit_job(
  p_pursuit_id uuid, p_job_id uuid, p_expected_job_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pursuit public.eos_pursuits%ROWTYPE; linked_job public.jobs%ROWTYPE;
BEGIN
  IF public.current_user_can_manage_eos() IS NOT TRUE THEN
    RAISE EXCEPTION 'EOS access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO pursuit FROM public.eos_pursuits
    WHERE id=p_pursuit_id AND deleted_at IS NULL FOR UPDATE;
  IF pursuit.id IS NULL THEN RAISE EXCEPTION 'Pursuit not found' USING ERRCODE='P0002'; END IF;
  IF pursuit.job_id IS DISTINCT FROM p_expected_job_id THEN
    RAISE EXCEPTION 'Job link changed since this pursuit was opened; refresh and retry' USING ERRCODE='40001';
  END IF;
  IF pursuit.job_id IS NOT DISTINCT FROM p_job_id THEN RETURN pursuit.job_id; END IF;
  IF p_job_id IS NOT NULL THEN
    SELECT * INTO linked_job FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL;
    IF linked_job.id IS NULL OR public.current_user_can_access_job(linked_job.id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Job is unavailable to this user' USING ERRCODE='42501';
    END IF;
  END IF;
  PERFORM set_config('app.eos_job_link','yes',true);
  UPDATE public.eos_pursuits SET job_id=p_job_id WHERE id=p_pursuit_id;
  RETURN p_job_id;
END $$;
REVOKE ALL ON FUNCTION public.eos_set_pursuit_job(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eos_set_pursuit_job(uuid,uuid,uuid) TO authenticated;

-- Awarding an already-linked pursuit promotes its phase using the same atomic
-- handoff. The association alone never awards or changes Job financials.
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
  IF pursuit.phase='Awarded' AND pursuit.job_id IS NOT NULL THEN RETURN pursuit.job_id; END IF;
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
    IF p_division IS NULL OR nullif(btrim(p_job_number),'') IS NULL THEN
      RAISE EXCEPTION 'Division and job number are required to create a job' USING ERRCODE='22023';
    END IF;
    linked_job := public.create_job(p_division,p_job_number,pursuit.project_name,'active',
      pursuit.discussion,NULL,NULL,NULL,NULL,NULL,NULL,'job',NULL,NULL);
  END IF;
  PERFORM set_config('app.eos_award_handoff','yes',true);
  UPDATE public.eos_pursuits SET phase='Awarded',status='Active',job_id=linked_job.id
    WHERE id=p_pursuit_id;
  RETURN linked_job.id;
END $$;
REVOKE ALL ON FUNCTION public.eos_award_pursuit(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eos_award_pursuit(uuid,uuid,text,text) TO authenticated;
