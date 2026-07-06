CREATE TABLE public.job_schedule_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  title TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_progress', 'complete', 'delayed')
  ),
  sort_order NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  created_by TEXT
);

COMMENT ON TABLE public.job_schedule_items IS
  'Job Schedule v1 flat milestone/task list only. No calendar sync, dependencies, assignments, reminders, or recurring behavior in this phase.';
COMMENT ON COLUMN public.job_schedule_items.status IS
  'Schedule item workflow state locked to pending, in_progress, complete, or delayed for Job Schedule v1.';
COMMENT ON COLUMN public.job_schedule_items.sort_order IS
  'Manual ordering value for simple up/down schedule item reordering.';

CREATE TRIGGER set_job_schedule_items_updated_at
BEFORE UPDATE ON public.job_schedule_items
FOR EACH ROW
EXECUTE FUNCTION touch_user_permissions_updated_at();

ALTER TABLE public.job_schedule_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_schedule_items_read
ON public.job_schedule_items
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
        OR up.division = job_schedule_items.division
      )
  )
);

CREATE POLICY job_schedule_items_insert
ON public.job_schedule_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = job_schedule_items.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, FALSE) IS TRUE
  )
);

CREATE POLICY job_schedule_items_update
ON public.job_schedule_items
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = job_schedule_items.division
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
      AND up.division = job_schedule_items.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, FALSE) IS TRUE
  )
);

REVOKE ALL ON public.job_schedule_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_schedule_items TO authenticated;
