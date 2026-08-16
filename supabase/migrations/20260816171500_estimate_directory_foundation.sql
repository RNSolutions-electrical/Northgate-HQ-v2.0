CREATE TABLE IF NOT EXISTS public.estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  estimate_number TEXT,
  title TEXT NOT NULL,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'pursuit', 'submitted', 'rejected', 'archived')
  ),
  bid_due_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  estimator_id TEXT,
  scope_summary TEXT,
  notes TEXT,
  created_by TEXT
);

COMMENT ON TABLE public.estimates IS
  'Estimate directory foundation. Pricing, approval snapshots, and approved estimate immutability remain reserved for a later estimating workflow.';
COMMENT ON COLUMN public.estimates.division IS
  'Text division scope matching user_permissions.division and existing app conventions.';
COMMENT ON COLUMN public.estimates.status IS
  'Foundation status only. Approved estimates require a future locked snapshot workflow and are intentionally not writable here.';

CREATE UNIQUE INDEX IF NOT EXISTS estimates_estimate_number_unique
  ON public.estimates(estimate_number)
  WHERE estimate_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_division_status
  ON public.estimates(division, status)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_estimator
  ON public.estimates(estimator_id)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS set_estimates_updated_at ON public.estimates;
CREATE TRIGGER set_estimates_updated_at
BEFORE UPDATE ON public.estimates
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_permissions_updated_at();

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimates_read ON public.estimates;
CREATE POLICY estimates_read
ON public.estimates
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND (
    public.current_user_can_read_division(division, 'can_estimate')
    OR public.current_user_can_read_division(division, 'can_approve_estimates')
  )
);

DROP POLICY IF EXISTS estimates_insert ON public.estimates;
CREATE POLICY estimates_insert
ON public.estimates
FOR INSERT
TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND status <> 'archived'
  AND public.current_user_can_edit_division(division, 'can_estimate')
);

DROP POLICY IF EXISTS estimates_update ON public.estimates;
CREATE POLICY estimates_update
ON public.estimates
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND public.current_user_can_edit_division(division, 'can_estimate')
)
WITH CHECK (
  archived_at IS NULL
  AND status <> 'archived'
  AND public.current_user_can_edit_division(division, 'can_estimate')
);

REVOKE ALL ON public.estimates FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.estimates TO authenticated;
