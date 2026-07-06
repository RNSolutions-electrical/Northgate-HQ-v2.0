DROP POLICY IF EXISTS documents_read ON public.documents;
CREATE POLICY documents_read
ON public.documents
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND owner_type = 'job'
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
        OR up.division = documents.division
      )
  )
);

DROP POLICY IF EXISTS documents_storage_insert ON storage.objects;
CREATE POLICY documents_storage_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'northgate-files'
  AND (storage.foldername(storage.objects.name))[1] = 'documents'
  AND (storage.foldername(storage.objects.name))[2] = 'job'
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.user_permissions up
      ON up.clerk_user_id = auth.jwt() ->> 'sub'
     AND up.is_active = TRUE
    WHERE j.id::text = (storage.foldername(storage.objects.name))[3]
      AND up.division = j.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, FALSE) IS TRUE
  )
);
