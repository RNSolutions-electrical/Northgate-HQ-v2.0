CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  job_number TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'on_hold', 'complete', 'cancelled')
  ),
  description TEXT,
  notes TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  job_type TEXT NOT NULL DEFAULT 'job' CHECK (
    job_type IN ('job', 'service_call')
  ),
  service_call_number TEXT,
  created_by TEXT
);

COMMENT ON TABLE public.jobs IS
  'Jobs foundation record. Material workflow, phases, assignments, documents, and financials are reserved for future milestones.';
COMMENT ON COLUMN public.jobs.division IS
  'Text division scope matching user_permissions.division and existing app conventions. No divisions table or UUID division normalization in this phase.';
COMMENT ON COLUMN public.jobs.status IS
  'Foundation status only. archived is not a status value; archive via archived_at/archived_by/archive_reason.';

CREATE UNIQUE INDEX jobs_job_number_unique
  ON public.jobs(job_number)
  WHERE job_number IS NOT NULL;

CREATE TRIGGER set_jobs_updated_at
BEFORE UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION touch_user_permissions_updated_at();

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_read
ON public.jobs
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND (
        COALESCE((
          public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
            ->> 'can_view_all_divisions'
        )::boolean, FALSE) IS TRUE
        OR up.division = jobs.division
      )
  )
);

CREATE POLICY jobs_insert
ON public.jobs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = jobs.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_create_jobs'
      )::boolean, FALSE) IS TRUE
  )
);

CREATE POLICY jobs_update
ON public.jobs
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = jobs.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, FALSE) IS TRUE
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = jobs.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, FALSE) IS TRUE
  )
);

REVOKE ALL ON public.jobs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.jobs TO authenticated;
