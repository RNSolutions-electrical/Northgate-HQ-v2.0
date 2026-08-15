ALTER TABLE public.job_budget_lines
  ADD COLUMN IF NOT EXISTS budget_change_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_cost_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS committed_cost_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast_to_complete_amount NUMERIC NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_budget_lines_budget_change_nonnegative'
      AND conrelid = 'public.job_budget_lines'::regclass
  ) THEN
    ALTER TABLE public.job_budget_lines
      ADD CONSTRAINT job_budget_lines_budget_change_nonnegative
      CHECK (budget_change_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_budget_lines_actual_cost_nonnegative'
      AND conrelid = 'public.job_budget_lines'::regclass
  ) THEN
    ALTER TABLE public.job_budget_lines
      ADD CONSTRAINT job_budget_lines_actual_cost_nonnegative
      CHECK (actual_cost_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_budget_lines_committed_cost_nonnegative'
      AND conrelid = 'public.job_budget_lines'::regclass
  ) THEN
    ALTER TABLE public.job_budget_lines
      ADD CONSTRAINT job_budget_lines_committed_cost_nonnegative
      CHECK (committed_cost_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_budget_lines_forecast_to_complete_nonnegative'
      AND conrelid = 'public.job_budget_lines'::regclass
  ) THEN
    ALTER TABLE public.job_budget_lines
      ADD CONSTRAINT job_budget_lines_forecast_to_complete_nonnegative
      CHECK (forecast_to_complete_amount >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_budget_lines_job_id
ON public.job_budget_lines (job_id)
WHERE archived_at IS NULL;

COMMENT ON COLUMN public.job_budget_lines.budget_change_amount IS
  'Approved or planned budget change amount for revised budget calculations. Planning only.';
COMMENT ON COLUMN public.job_budget_lines.actual_cost_amount IS
  'Actual cost amount for job financial tracking. Does not post to accounting.';
COMMENT ON COLUMN public.job_budget_lines.committed_cost_amount IS
  'Committed cost amount for job financial tracking. Does not create purchase orders.';
COMMENT ON COLUMN public.job_budget_lines.forecast_to_complete_amount IS
  'Forecast-to-complete amount for job financial tracking.';
