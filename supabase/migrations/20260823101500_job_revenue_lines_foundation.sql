CREATE TABLE IF NOT EXISTS public.job_revenue_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  sov_line TEXT,
  description TEXT NOT NULL,
  scheduled_value_amount NUMERIC NOT NULL DEFAULT 0 CHECK (scheduled_value_amount >= 0),
  approved_change_amount NUMERIC NOT NULL DEFAULT 0 CHECK (approved_change_amount >= 0),
  billed_to_date_amount NUMERIC NOT NULL DEFAULT 0 CHECK (billed_to_date_amount >= 0),
  note TEXT,
  created_by TEXT
);

COMMENT ON TABLE public.job_revenue_lines IS
  'Job Schedule of Values revenue lines for billing progress. Planning and billing visibility only; no accounting post or invoice creation.';
COMMENT ON COLUMN public.job_revenue_lines.sov_line IS
  'Free-text Schedule of Values line identifier.';
COMMENT ON COLUMN public.job_revenue_lines.scheduled_value_amount IS
  'Original scheduled contract value for this SOV line.';
COMMENT ON COLUMN public.job_revenue_lines.approved_change_amount IS
  'Approved customer-facing contract changes assigned to this SOV line.';
COMMENT ON COLUMN public.job_revenue_lines.billed_to_date_amount IS
  'Amount billed to date for this SOV line. Does not represent cash collection.';

CREATE TRIGGER set_job_revenue_lines_updated_at
BEFORE UPDATE ON public.job_revenue_lines
FOR EACH ROW
EXECUTE FUNCTION touch_user_permissions_updated_at();

CREATE INDEX IF NOT EXISTS idx_job_revenue_lines_job_id
ON public.job_revenue_lines (job_id)
WHERE archived_at IS NULL;

ALTER TABLE public.job_revenue_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_revenue_lines_read ON public.job_revenue_lines;
CREATE POLICY job_revenue_lines_read
ON public.job_revenue_lines
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND public.current_user_can_read_division(division, 'can_view_financials')
);

DROP POLICY IF EXISTS job_revenue_lines_insert ON public.job_revenue_lines;
CREATE POLICY job_revenue_lines_insert
ON public.job_revenue_lines
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_can_edit_division(division, 'can_approve_budget')
);

DROP POLICY IF EXISTS job_revenue_lines_update ON public.job_revenue_lines;
CREATE POLICY job_revenue_lines_update
ON public.job_revenue_lines
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND public.current_user_can_edit_division(division, 'can_approve_budget')
)
WITH CHECK (
  public.current_user_can_edit_division(division, 'can_approve_budget')
);

REVOKE ALL ON public.job_revenue_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_revenue_lines TO authenticated;
