CREATE TABLE public.job_budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  category TEXT NOT NULL CHECK (
    category IN ('material', 'labor', 'subcontractor', 'equipment', 'permit', 'other')
  ),
  cost_code TEXT,
  description TEXT NOT NULL,
  budget_amount NUMERIC NOT NULL DEFAULT 0 CHECK (budget_amount >= 0),
  note TEXT,
  created_by TEXT
);

COMMENT ON TABLE public.job_budget_lines IS
  'Job Financials v1 budget planning lines only. No actuals, committed cost, revenue, profit, accounting, or transaction linkage in this phase.';
COMMENT ON COLUMN public.job_budget_lines.division IS
  'Text division scope matching user_permissions.division and existing Jobs conventions.';
COMMENT ON COLUMN public.job_budget_lines.cost_code IS
  'Free-text cost code for Budget Foundation v1. Formal cost-code table reserved for a later milestone.';

CREATE TRIGGER set_job_budget_lines_updated_at
BEFORE UPDATE ON public.job_budget_lines
FOR EACH ROW
EXECUTE FUNCTION touch_user_permissions_updated_at();

ALTER TABLE public.job_budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_budget_lines_read
ON public.job_budget_lines
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_view_financials'
      )::boolean, FALSE) IS TRUE
      AND (
        COALESCE((
          public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
            ->> 'can_view_all_divisions'
        )::boolean, FALSE) IS TRUE
        OR up.division = job_budget_lines.division
      )
  )
);

CREATE POLICY job_budget_lines_insert
ON public.job_budget_lines
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = job_budget_lines.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_approve_budget'
      )::boolean, FALSE) IS TRUE
  )
);

CREATE POLICY job_budget_lines_update
ON public.job_budget_lines
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = job_budget_lines.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_approve_budget'
      )::boolean, FALSE) IS TRUE
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = job_budget_lines.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_approve_budget'
      )::boolean, FALSE) IS TRUE
  )
);

REVOKE ALL ON public.job_budget_lines FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_budget_lines TO authenticated;
