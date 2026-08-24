CREATE OR REPLACE FUNCTION public.reassign_job_division(p_job_id UUID, p_new_division TEXT, p_reason TEXT)
RETURNS public.jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub'; caller public.user_permissions%ROWTYPE; target public.jobs%ROWTYPE; saved public.jobs%ROWTYPE;
BEGIN
  IF jwt_subject IS NULL OR p_job_id IS NULL OR NULLIF(BTRIM(p_reason), '') IS NULL OR p_new_division NOT IN ('Construction','Electrical','Admin') THEN RAISE EXCEPTION 'job, valid division, and reason are required'; END IF;
  SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id = jwt_subject AND is_active = TRUE LIMIT 1;
  SELECT * INTO target FROM public.jobs WHERE id = p_job_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR caller.id IS NULL OR (caller.role <> 'Developer' AND COALESCE((caller.permission_overrides ->> 'can_reassign_job_division')::BOOLEAN, FALSE) IS NOT TRUE) THEN RAISE EXCEPTION 'job division reassignment permission is required' USING ERRCODE = '42501'; END IF;
  UPDATE public.jobs SET division = p_new_division, updated_at = NOW() WHERE id = p_job_id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(jwt_subject,COALESCE(caller.display_name,caller.email,jwt_subject),'jobs',p_job_id::TEXT,'update',jsonb_build_object('division',target.division),jsonb_build_object('division',saved.division),p_reason);
  RETURN saved;
END; $$;
REVOKE ALL ON FUNCTION public.reassign_job_division(UUID,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_job_division(UUID,TEXT,TEXT) TO authenticated;
