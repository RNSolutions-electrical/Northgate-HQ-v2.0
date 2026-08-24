CREATE TABLE public.job_sub_divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_id UUID NOT NULL REFERENCES public.jobs(id), division TEXT NOT NULL CHECK (division IN ('Construction','Electrical','Admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(job_id, division)
);
ALTER TABLE public.job_sub_divisions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.job_sub_divisions TO authenticated;
CREATE POLICY job_sub_divisions_manage ON public.job_sub_divisions FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id=job_id AND public.current_user_can_edit_division(j.division,'can_manage_jobs')))
WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id=job_id AND public.current_user_can_edit_division(j.division,'can_manage_jobs')));
CREATE OR REPLACE FUNCTION public.current_user_can_access_job(p_job_id UUID,p_permission TEXT DEFAULT NULL) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.jobs j WHERE j.id=p_job_id AND (public.current_user_can_read_division(j.division,p_permission) OR EXISTS(SELECT 1 FROM public.job_sub_divisions s WHERE s.job_id=j.id AND public.current_user_can_read_division(s.division,p_permission))));
$$;
REVOKE ALL ON FUNCTION public.current_user_can_access_job(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_job(UUID,TEXT) TO authenticated;
DROP POLICY IF EXISTS jobs_read ON public.jobs;
CREATE POLICY jobs_read ON public.jobs FOR SELECT TO authenticated USING (archived_at IS NULL AND public.current_user_can_access_job(id));
