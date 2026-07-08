CREATE OR REPLACE FUNCTION public.block_archived_job_schedule_item_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Archived job schedule items cannot be modified.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_archived_job_schedule_item_updates
ON public.job_schedule_items;

CREATE TRIGGER block_archived_job_schedule_item_updates
BEFORE UPDATE ON public.job_schedule_items
FOR EACH ROW
WHEN (OLD.archived_at IS NOT NULL)
EXECUTE FUNCTION public.block_archived_job_schedule_item_updates();

DROP POLICY IF EXISTS job_schedule_items_update ON public.job_schedule_items;

CREATE POLICY job_schedule_items_update
ON public.job_schedule_items
FOR UPDATE
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
