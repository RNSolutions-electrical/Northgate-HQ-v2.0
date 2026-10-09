-- A retry after an awarded pursuit has been deliberately unlinked must not
-- create a second Job. Re-link it through eos_set_pursuit_job instead.
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
