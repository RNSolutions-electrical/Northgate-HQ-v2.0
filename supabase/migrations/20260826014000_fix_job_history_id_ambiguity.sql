-- Qualify the jobs lookup because the RETURNS TABLE `id` output variable is
-- also visible inside this PL/pgSQL function.
CREATE OR REPLACE FUNCTION public.read_job_change_history(
  p_job_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  user_name TEXT,
  table_name TEXT,
  record_id TEXT,
  action TEXT,
  note TEXT,
  before_data JSONB,
  after_data JSONB,
  changed_fields TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  target_job public.jobs%ROWTYPE;
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250);
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT j.*
  INTO target_job
  FROM public.jobs AS j
  WHERE j.id = p_job_id
    AND j.archived_at IS NULL;

  IF target_job.id IS NULL THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_permissions AS up
    WHERE up.clerk_user_id = actor_id
      AND up.is_active = TRUE
      AND (
        up.division = target_job.division
        OR COALESCE((
          public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
            ->> 'can_view_all_divisions'
        )::BOOLEAN, FALSE)
      )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to view this job history' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cl.id,
    cl.created_at,
    cl.user_name,
    cl.table_name,
    cl.record_id,
    cl.action,
    cl.note,
    cl.before_data,
    cl.after_data,
    ARRAY(
      SELECT key_name
      FROM jsonb_object_keys(
        COALESCE(cl.before_data, '{}'::JSONB) || COALESCE(cl.after_data, '{}'::JSONB)
      ) AS key_name
      WHERE (cl.before_data -> key_name) IS DISTINCT FROM (cl.after_data -> key_name)
      ORDER BY key_name
    )
  FROM public.change_logs AS cl
  WHERE (
    cl.table_name = 'jobs'
    AND cl.record_id = p_job_id::TEXT
  ) OR (
    cl.table_name IN (
      'job_buyout_lines',
      'job_budget_lines',
      'job_schedule_items',
      'change_orders',
      'change_order_financial_postings'
    )
    AND (
      cl.before_data ->> 'job_id' = p_job_id::TEXT
      OR cl.after_data ->> 'job_id' = p_job_id::TEXT
    )
  ) OR (
    cl.table_name = 'documents'
    AND (
      (
        cl.before_data ->> 'owner_type' = 'job'
        AND cl.before_data ->> 'owner_id' = p_job_id::TEXT
      ) OR (
        cl.after_data ->> 'owner_type' = 'job'
        AND cl.after_data ->> 'owner_id' = p_job_id::TEXT
      )
    )
  )
  ORDER BY cl.created_at DESC, cl.id DESC
  LIMIT safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.read_job_change_history(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_job_change_history(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.read_job_change_history(UUID, INTEGER) IS
  'Returns division-authorized job and job-owned audit history without ambiguous PL/pgSQL output-column references.';
