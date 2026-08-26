-- Fix path authorization for signed Change Order uploads. Inside the jobs
-- subquery, unqualified `name` resolved to jobs.name instead of objects.name.
DROP POLICY IF EXISTS documents_storage_insert ON storage.objects;
CREATE POLICY documents_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='northgate-files'
  AND (storage.foldername(storage.objects.name))[1]='documents'
  AND (
    (
      (storage.foldername(storage.objects.name))[2]='job'
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id::TEXT=(storage.foldername(storage.objects.name))[3]
          AND j.archived_at IS NULL
          AND (
            public.current_user_can_edit_division(j.division,'can_manage_jobs')
            OR public.current_user_can_edit_division(j.division,'can_verify_change_orders')
          )
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2]='estimate'
      AND EXISTS (
        SELECT 1
        FROM public.estimates e
        WHERE e.id::TEXT=(storage.foldername(storage.objects.name))[3]
          AND e.archived_at IS NULL
          AND public.current_user_can_edit_division(e.division,'can_estimate')
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2]='change_order'
      AND EXISTS (
        SELECT 1
        FROM public.change_orders co
        WHERE co.id::TEXT=(storage.foldername(storage.objects.name))[3]
          AND co.archived_at IS NULL
          AND public.current_user_can_edit_division(co.division,'can_manage_change_orders')
      )
    )
  )
);
