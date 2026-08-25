CREATE OR REPLACE FUNCTION public.create_job(
  p_division TEXT, p_job_number TEXT, p_name TEXT, p_status TEXT, p_description TEXT,
  p_notes TEXT, p_address_line1 TEXT, p_address_line2 TEXT, p_city TEXT, p_state TEXT,
  p_postal_code TEXT, p_job_type TEXT, p_service_call_number TEXT, p_created_by TEXT
)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  created_job public.jobs%ROWTYPE;
BEGIN
  SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id = jwt_subject AND is_active = TRUE LIMIT 1;
  IF caller.id IS NULL THEN RAISE EXCEPTION 'An active user permission record is required' USING ERRCODE = '42501'; END IF;
  caller_permissions := public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides);
  IF COALESCE((caller_permissions ->> 'can_create_jobs')::BOOLEAN, FALSE) IS NOT TRUE
     OR NOT (caller.role IN ('Developer', 'Manager') OR caller.division = p_division) THEN
    RAISE EXCEPTION 'Job creation permission is required for this division' USING ERRCODE = '42501';
  END IF;
  IF p_division NOT IN ('Construction', 'Electrical', 'Admin') OR NULLIF(BTRIM(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'A valid division and job name are required';
  END IF;
  INSERT INTO public.jobs(division, job_number, name, status, description, notes, address_line1, address_line2, city, state, postal_code, job_type, service_call_number, created_by)
  VALUES (p_division, NULLIF(BTRIM(p_job_number), ''), BTRIM(p_name), COALESCE(p_status, 'active'), NULLIF(BTRIM(p_description), ''), NULLIF(BTRIM(p_notes), ''), NULLIF(BTRIM(p_address_line1), ''), NULLIF(BTRIM(p_address_line2), ''), NULLIF(BTRIM(p_city), ''), NULLIF(BTRIM(p_state), ''), NULLIF(BTRIM(p_postal_code), ''), COALESCE(p_job_type, 'job'), NULLIF(BTRIM(p_service_call_number), ''), COALESCE(NULLIF(BTRIM(p_created_by), ''), caller.display_name, caller.email, jwt_subject))
  RETURNING * INTO created_job;
  INSERT INTO public.change_logs(user_id, user_name, table_name, record_id, action, note)
  VALUES (jwt_subject, COALESCE(caller.display_name, caller.email, jwt_subject), 'jobs', created_job.id::TEXT, 'create', 'Job ' || COALESCE(created_job.job_number, created_job.name) || ' created.');
  RETURN created_job;
END;
$$;
REVOKE ALL ON FUNCTION public.create_job(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_job(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;
