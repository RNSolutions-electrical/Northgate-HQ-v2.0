ALTER TABLE public.job_buyout_lines
  ADD COLUMN IF NOT EXISTS budget_amount NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS initial_value NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS actual_value NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS initial_lead_time_days INTEGER NULL,
  ADD COLUMN IF NOT EXISTS actual_lead_time_days INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_buyout_lines_budget_amount_nonnegative'
      AND conrelid = 'public.job_buyout_lines'::regclass
  ) THEN
    ALTER TABLE public.job_buyout_lines
      ADD CONSTRAINT job_buyout_lines_budget_amount_nonnegative
      CHECK (budget_amount IS NULL OR budget_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_buyout_lines_initial_value_nonnegative'
      AND conrelid = 'public.job_buyout_lines'::regclass
  ) THEN
    ALTER TABLE public.job_buyout_lines
      ADD CONSTRAINT job_buyout_lines_initial_value_nonnegative
      CHECK (initial_value IS NULL OR initial_value >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_buyout_lines_actual_value_nonnegative'
      AND conrelid = 'public.job_buyout_lines'::regclass
  ) THEN
    ALTER TABLE public.job_buyout_lines
      ADD CONSTRAINT job_buyout_lines_actual_value_nonnegative
      CHECK (actual_value IS NULL OR actual_value >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_buyout_lines_initial_lead_time_nonnegative'
      AND conrelid = 'public.job_buyout_lines'::regclass
  ) THEN
    ALTER TABLE public.job_buyout_lines
      ADD CONSTRAINT job_buyout_lines_initial_lead_time_nonnegative
      CHECK (initial_lead_time_days IS NULL OR initial_lead_time_days >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_buyout_lines_actual_lead_time_nonnegative'
      AND conrelid = 'public.job_buyout_lines'::regclass
  ) THEN
    ALTER TABLE public.job_buyout_lines
      ADD CONSTRAINT job_buyout_lines_actual_lead_time_nonnegative
      CHECK (actual_lead_time_days IS NULL OR actual_lead_time_days >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.job_buyout_lines.budget_amount IS
  'Buyout checklist budget target for this line. Planning only; no accounting post.';
COMMENT ON COLUMN public.job_buyout_lines.initial_value IS
  'Initial expected buyout value for this line. Planning only.';
COMMENT ON COLUMN public.job_buyout_lines.actual_value IS
  'Actual buyout value recorded for checklist tracking. Planning only.';
COMMENT ON COLUMN public.job_buyout_lines.initial_lead_time_days IS
  'Initial expected lead time in days for this line.';
COMMENT ON COLUMN public.job_buyout_lines.actual_lead_time_days IS
  'Actual lead time in days for this line.';
