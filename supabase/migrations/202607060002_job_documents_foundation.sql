CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  owner_type TEXT NOT NULL CHECK (
    owner_type IN ('job', 'estimate', 'vehicle', 'tool', 'employee', 'change_order', 'report', 'snapshot')
  ),
  owner_id UUID NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  document_type TEXT,
  description TEXT,
  file_size_bytes BIGINT,
  mime_type TEXT,
  created_by TEXT
);

COMMENT ON TABLE public.documents IS
  'Generic Section 20 documents foundation. Job is the first live owner type; other owner types remain schema-declared only until their own RLS milestones go live.';
COMMENT ON COLUMN public.documents.owner_type IS
  'Section 20 owner type. Job is the only RLS-permitted owner type in Job Documents v1.';

CREATE OR REPLACE FUNCTION public.set_documents_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_documents_updated_at ON public.documents;
CREATE TRIGGER set_documents_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.set_documents_updated_at();

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

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
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_view_all_divisions'
      )::boolean, FALSE) IS TRUE
      AND (
        COALESCE((
          public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
            ->> 'can_view_all_divisions'
        )::boolean, FALSE) IS TRUE
        OR up.division = documents.division
      )
  )
);

DROP POLICY IF EXISTS documents_insert ON public.documents;
CREATE POLICY documents_insert
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
  owner_type = 'job'
  AND EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = documents.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, FALSE) IS TRUE
  )
);

DROP POLICY IF EXISTS documents_update ON public.documents;
CREATE POLICY documents_update
ON public.documents
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND owner_type = 'job'
  AND EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = documents.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, FALSE) IS TRUE
  )
)
WITH CHECK (
  owner_type = 'job'
  AND EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = documents.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, FALSE) IS TRUE
  )
);

REVOKE ALL ON public.documents FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.documents TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('northgate-files', 'northgate-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS documents_storage_read ON storage.objects;
CREATE POLICY documents_storage_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'northgate-files'
  AND (storage.foldername(name))[1] = 'documents'
  AND (storage.foldername(name))[2] = 'job'
  AND EXISTS (
    SELECT 1
    FROM public.documents d
    JOIN public.user_permissions up
      ON up.clerk_user_id = auth.jwt() ->> 'sub'
     AND up.is_active = TRUE
    WHERE d.storage_path = storage.objects.name
      AND d.archived_at IS NULL
      AND d.owner_type = 'job'
      AND (
        COALESCE((
          public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
            ->> 'can_view_all_divisions'
        )::boolean, FALSE) IS TRUE
        OR up.division = d.division
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
  AND (storage.foldername(name))[1] = 'documents'
  AND (storage.foldername(name))[2] = 'job'
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.user_permissions up
      ON up.clerk_user_id = auth.jwt() ->> 'sub'
     AND up.is_active = TRUE
    WHERE j.id::text = (storage.foldername(name))[3]
      AND up.division = j.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, FALSE) IS TRUE
  )
);
