-- change_logs constrains action to its established vocabulary. Keep the
-- dedicated reasoned record but classify it as update.
CREATE OR REPLACE FUNCTION public.eos_reverse_award(
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
  VALUES(actor,coalesce(actor_name,actor),'eos_pursuits',p_pursuit_id::text,'update',
    to_jsonb(pursuit),to_jsonb(saved),btrim(p_reason));
  RETURN target_phase;
END $$;
REVOKE ALL ON FUNCTION public.eos_reverse_award(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eos_reverse_award(uuid,uuid,text,text) TO authenticated;
