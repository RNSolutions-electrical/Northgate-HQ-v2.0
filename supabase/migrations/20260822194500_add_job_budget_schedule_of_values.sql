ALTER TABLE public.job_budget_lines
  ADD COLUMN IF NOT EXISTS schedule_of_values_amount NUMERIC NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_budget_lines_schedule_of_values_nonnegative'
      AND conrelid = 'public.job_budget_lines'::regclass
  ) THEN
    ALTER TABLE public.job_budget_lines
      ADD CONSTRAINT job_budget_lines_schedule_of_values_nonnegative
      CHECK (schedule_of_values_amount >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.job_budget_lines.schedule_of_values_amount IS
  'Schedule of Values billing amount assigned to this financial line. Planning/billing setup only; pay app records are reserved.';
