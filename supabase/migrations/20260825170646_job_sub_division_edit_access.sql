-- A linked access division lets a user work in a job only when they already
-- hold the required permission in that division. Assignment itself remains a
-- developer-level action and is fully audited.
CREATE OR REPLACE FUNCTION public.current_user_can_edit_job(
  p_job_id UUID,
  p_required_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = p_job_id
      AND j.archived_at IS NULL
      AND (
        public.current_user_can_edit_division(j.division, p_required_permission)
        OR EXISTS (
          SELECT 1
          FROM public.job_sub_divisions s
          WHERE s.job_id = j.id
            AND public.current_user_can_edit_division(s.division, p_required_permission)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_can_edit_job(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_edit_job(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_job_divisions(p_job_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    JOIN public.jobs j ON j.id = p_job_id AND j.archived_at IS NULL
    WHERE up.clerk_user_id = (auth.jwt() ->> 'sub')
      AND up.is_active IS TRUE
      AND (
        up.role = 'Developer'
        OR COALESCE((up.permission_overrides ->> 'can_reassign_job_division')::BOOLEAN, FALSE) IS TRUE
      )
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_can_manage_job_divisions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_job_divisions(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_job_sub_divisions(
  p_job_id UUID,
  p_divisions JSONB,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  target_job public.jobs%ROWTYPE;
  caller public.user_permissions%ROWTYPE;
  normalized_divisions TEXT[];
  before_divisions JSONB;
  after_divisions JSONB;
BEGIN
  IF jwt_subject IS NULL OR p_job_id IS NULL OR jsonb_typeof(p_divisions) <> 'array' OR NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'job, division list, and audit reason are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target_job FROM public.jobs WHERE id = p_job_id AND archived_at IS NULL FOR UPDATE;
  IF target_job.id IS NULL OR public.current_user_can_manage_job_divisions(p_job_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'job division assignment permission is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id = jwt_subject AND is_active IS TRUE LIMIT 1;
  SELECT COALESCE(array_agg(DISTINCT value ORDER BY value), ARRAY[]::TEXT[])
    INTO normalized_divisions
  FROM jsonb_array_elements_text(p_divisions) AS value
  WHERE value IN ('Construction', 'Electrical', 'Admin')
    AND value <> target_job.division;

  IF jsonb_array_length(p_divisions) <> cardinality(normalized_divisions)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_divisions) AS value WHERE value NOT IN ('Construction', 'Electrical', 'Admin', target_job.division)) THEN
    RAISE EXCEPTION 'sub-divisions must be unique Northgate divisions other than the primary job division' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(division ORDER BY division), '[]'::JSONB) INTO before_divisions
  FROM public.job_sub_divisions WHERE job_id = p_job_id;

  DELETE FROM public.job_sub_divisions WHERE job_id = p_job_id;
  INSERT INTO public.job_sub_divisions(job_id, division)
  SELECT p_job_id, value FROM unnest(normalized_divisions) AS value;

  SELECT COALESCE(jsonb_agg(division ORDER BY division), '[]'::JSONB) INTO after_divisions
  FROM public.job_sub_divisions WHERE job_id = p_job_id;

  INSERT INTO public.change_logs(user_id, user_name, table_name, record_id, action, before_data, after_data, note)
  VALUES (
    jwt_subject,
    COALESCE(caller.display_name, caller.email, jwt_subject),
    'jobs', p_job_id::TEXT, 'update',
    jsonb_build_object('sub_divisions', before_divisions),
    jsonb_build_object('sub_divisions', after_divisions),
    p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_job_sub_divisions(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_job_sub_divisions(UUID, JSONB, TEXT) TO authenticated;

CREATE POLICY job_sub_divisions_read_linked ON public.job_sub_divisions
  FOR SELECT TO authenticated
  USING (public.current_user_can_access_job(job_id));

CREATE POLICY jobs_update_linked ON public.jobs
  FOR UPDATE TO authenticated
  USING (archived_at IS NULL AND public.current_user_can_edit_job(id, 'can_manage_jobs'))
  WITH CHECK (public.current_user_can_edit_job(id, 'can_manage_jobs'));

CREATE POLICY job_budget_lines_read_linked ON public.job_budget_lines
  FOR SELECT TO authenticated
  USING (archived_at IS NULL AND public.current_user_can_access_job(job_id, 'can_view_financials'));
CREATE POLICY job_budget_lines_insert_linked ON public.job_budget_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit_job(job_id, 'can_approve_budget'));
CREATE POLICY job_budget_lines_update_linked ON public.job_budget_lines
  FOR UPDATE TO authenticated
  USING (archived_at IS NULL AND public.current_user_can_edit_job(job_id, 'can_approve_budget'))
  WITH CHECK (public.current_user_can_edit_job(job_id, 'can_approve_budget'));

CREATE POLICY job_revenue_lines_read_linked ON public.job_revenue_lines
  FOR SELECT TO authenticated
  USING (archived_at IS NULL AND public.current_user_can_access_job(job_id, 'can_view_financials'));
CREATE POLICY job_revenue_lines_insert_linked ON public.job_revenue_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit_job(job_id, 'can_approve_budget'));
CREATE POLICY job_revenue_lines_update_linked ON public.job_revenue_lines
  FOR UPDATE TO authenticated
  USING (archived_at IS NULL AND public.current_user_can_edit_job(job_id, 'can_approve_budget'))
  WITH CHECK (public.current_user_can_edit_job(job_id, 'can_approve_budget'));

CREATE POLICY job_buyout_lines_read_linked ON public.job_buyout_lines
  FOR SELECT TO authenticated
  USING (archived_at IS NULL AND public.current_user_can_access_job(job_id));
CREATE POLICY job_buyout_lines_insert_linked ON public.job_buyout_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit_job(job_id, 'can_manage_jobs'));
CREATE POLICY job_buyout_lines_update_linked ON public.job_buyout_lines
  FOR UPDATE TO authenticated
  USING (archived_at IS NULL AND public.current_user_can_edit_job(job_id, 'can_manage_jobs'))
  WITH CHECK (public.current_user_can_edit_job(job_id, 'can_manage_jobs'));

CREATE POLICY job_schedule_items_read_linked ON public.job_schedule_items
  FOR SELECT TO authenticated
  USING (archived_at IS NULL AND public.current_user_can_access_job(job_id));
CREATE POLICY job_schedule_items_insert_linked ON public.job_schedule_items
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit_job(job_id, 'can_manage_jobs'));
CREATE POLICY job_schedule_items_update_linked ON public.job_schedule_items
  FOR UPDATE TO authenticated
  USING (archived_at IS NULL AND public.current_user_can_edit_job(job_id, 'can_manage_jobs'))
  WITH CHECK (public.current_user_can_edit_job(job_id, 'can_manage_jobs'));

CREATE POLICY job_documents_read_linked ON public.documents
  FOR SELECT TO authenticated
  USING (owner_type = 'job' AND archived_at IS NULL AND public.current_user_can_access_job(owner_id));
CREATE POLICY job_documents_insert_linked ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_type = 'job'
    AND public.current_user_can_edit_job(owner_id, 'can_manage_jobs')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = owner_id AND j.division = documents.division AND j.archived_at IS NULL)
  );
CREATE POLICY job_documents_update_linked ON public.documents
  FOR UPDATE TO authenticated
  USING (owner_type = 'job' AND archived_at IS NULL AND public.current_user_can_edit_job(owner_id, 'can_manage_jobs'))
  WITH CHECK (
    owner_type = 'job'
    AND public.current_user_can_edit_job(owner_id, 'can_manage_jobs')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = owner_id AND j.division = documents.division AND j.archived_at IS NULL)
  );
