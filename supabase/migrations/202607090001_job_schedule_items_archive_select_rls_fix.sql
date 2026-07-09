DROP POLICY IF EXISTS job_schedule_items_manage_read ON public.job_schedule_items;

CREATE POLICY job_schedule_items_manage_read
ON public.job_schedule_items
FOR SELECT
TO authenticated
USING (
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
