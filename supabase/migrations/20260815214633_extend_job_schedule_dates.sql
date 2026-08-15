ALTER TABLE public.job_schedule_items
  ADD COLUMN IF NOT EXISTS initial_start_date DATE,
  ADD COLUMN IF NOT EXISTS actual_start_date DATE,
  ADD COLUMN IF NOT EXISTS initial_completion_date DATE,
  ADD COLUMN IF NOT EXISTS actual_completion_date DATE,
  ADD COLUMN IF NOT EXISTS duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS dependencies TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_schedule_items_duration_nonnegative'
      AND conrelid = 'public.job_schedule_items'::regclass
  ) THEN
    ALTER TABLE public.job_schedule_items
      ADD CONSTRAINT job_schedule_items_duration_nonnegative
      CHECK (duration_days IS NULL OR duration_days >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_schedule_items_initial_date_order'
      AND conrelid = 'public.job_schedule_items'::regclass
  ) THEN
    ALTER TABLE public.job_schedule_items
      ADD CONSTRAINT job_schedule_items_initial_date_order
      CHECK (
        initial_start_date IS NULL
        OR initial_completion_date IS NULL
        OR initial_completion_date >= initial_start_date
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_schedule_items_actual_date_order'
      AND conrelid = 'public.job_schedule_items'::regclass
  ) THEN
    ALTER TABLE public.job_schedule_items
      ADD CONSTRAINT job_schedule_items_actual_date_order
      CHECK (
        actual_start_date IS NULL
        OR actual_completion_date IS NULL
        OR actual_completion_date >= actual_start_date
      );
  END IF;
END $$;

COMMENT ON COLUMN public.job_schedule_items.initial_start_date IS
  'Planned/initial start date for the schedule item.';
COMMENT ON COLUMN public.job_schedule_items.actual_start_date IS
  'Actual start date for the schedule item.';
COMMENT ON COLUMN public.job_schedule_items.initial_completion_date IS
  'Planned/initial completion date for the schedule item.';
COMMENT ON COLUMN public.job_schedule_items.actual_completion_date IS
  'Actual completion date for the schedule item.';
COMMENT ON COLUMN public.job_schedule_items.duration_days IS
  'Duration in days for schedule planning and Gantt display.';
COMMENT ON COLUMN public.job_schedule_items.dependencies IS
  'Free-text dependency or predecessor notes for schedule planning. No calendar/dependency engine is implied.';
