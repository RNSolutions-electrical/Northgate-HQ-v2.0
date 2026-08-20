-- Preserve the current forecast-to-complete value as the month-end forecast.
-- Backfill final forecast so existing jobs retain their current total forecast.
ALTER TABLE public.job_budget_lines
  ADD COLUMN IF NOT EXISTS forecast_final_amount NUMERIC NOT NULL DEFAULT 0;

UPDATE public.job_budget_lines
SET forecast_final_amount = actual_cost_amount + committed_cost_amount + forecast_to_complete_amount
WHERE forecast_final_amount = 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_budget_lines_forecast_final_nonnegative'
      AND conrelid = 'public.job_budget_lines'::regclass
  ) THEN
    ALTER TABLE public.job_budget_lines
      ADD CONSTRAINT job_budget_lines_forecast_final_nonnegative
      CHECK (forecast_final_amount >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.job_budget_lines.forecast_to_complete_amount IS
  'Expected payment through the end of the current month. Planning only; does not post to accounting.';
COMMENT ON COLUMN public.job_budget_lines.forecast_final_amount IS
  'Expected total final cost for this financial line, including actual, committed, current-month, and future costs. Planning only.';
