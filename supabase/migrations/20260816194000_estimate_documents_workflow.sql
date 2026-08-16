COMMENT ON TABLE public.documents IS
  'Generic Section 20 documents foundation. Job and estimate owner workflows are live; other owner types remain schema-declared until their own RLS milestones go live.';
COMMENT ON COLUMN public.documents.owner_type IS
  'Section 20 owner type. Job and estimate are currently RLS-permitted owner workflows.';

DROP POLICY IF EXISTS documents_read ON public.documents;
CREATE POLICY documents_read
ON public.documents
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND (
    (
      owner_type = 'job'
      AND public.current_user_can_read_division(division)
    )
    OR (
      owner_type = 'estimate'
      AND (
        public.current_user_can_read_division(division, 'can_estimate')
        OR public.current_user_can_read_division(division, 'can_approve_estimates')
      )
    )
  )
);

DROP POLICY IF EXISTS documents_insert ON public.documents;
CREATE POLICY documents_insert
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
  (
    owner_type = 'job'
    AND public.current_user_can_edit_division(division, 'can_manage_jobs')
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = owner_id
        AND j.division = documents.division
        AND j.archived_at IS NULL
    )
  )
  OR (
    owner_type = 'estimate'
    AND public.current_user_can_edit_division(division, 'can_estimate')
    AND EXISTS (
      SELECT 1
      FROM public.estimates e
      WHERE e.id = owner_id
        AND e.division = documents.division
        AND e.archived_at IS NULL
    )
  )
);

DROP POLICY IF EXISTS documents_update ON public.documents;
CREATE POLICY documents_update
ON public.documents
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND (
    (
      owner_type = 'job'
      AND public.current_user_can_edit_division(division, 'can_manage_jobs')
    )
    OR (
      owner_type = 'estimate'
      AND public.current_user_can_edit_division(division, 'can_estimate')
    )
  )
)
WITH CHECK (
  (
    owner_type = 'job'
    AND public.current_user_can_edit_division(division, 'can_manage_jobs')
  )
  OR (
    owner_type = 'estimate'
    AND public.current_user_can_edit_division(division, 'can_estimate')
  )
);

REVOKE ALL ON public.documents FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.documents TO authenticated;

DROP POLICY IF EXISTS documents_storage_read ON storage.objects;
CREATE POLICY documents_storage_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'northgate-files'
  AND (storage.foldername(storage.objects.name))[1] = 'documents'
  AND EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.storage_path = storage.objects.name
      AND d.archived_at IS NULL
      AND (
        (
          d.owner_type = 'job'
          AND public.current_user_can_read_division(d.division)
        )
        OR (
          d.owner_type = 'estimate'
          AND (
            public.current_user_can_read_division(d.division, 'can_estimate')
            OR public.current_user_can_read_division(d.division, 'can_approve_estimates')
          )
        )
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
  AND (
    (
      (storage.foldername(storage.objects.name))[2] = 'job'
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id::TEXT = (storage.foldername(storage.objects.name))[3]
          AND j.archived_at IS NULL
          AND public.current_user_can_edit_division(j.division, 'can_manage_jobs')
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] = 'estimate'
      AND EXISTS (
        SELECT 1
        FROM public.estimates e
        WHERE e.id::TEXT = (storage.foldername(storage.objects.name))[3]
          AND e.archived_at IS NULL
          AND public.current_user_can_edit_division(e.division, 'can_estimate')
      )
    )
  )
);

CREATE OR REPLACE FUNCTION public.archive_estimate_document(
  p_document_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  target_document public.documents%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
  reason_text TEXT := NULLIF(BTRIM(p_reason), '');
  archived_by_text TEXT;
BEGIN
  IF jwt_subject IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO target_document
  FROM public.documents
  WHERE id = p_document_id
    AND owner_type = 'estimate'
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimate document not found or already archived'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF NOT FOUND OR public.current_user_can_edit_division(target_document.division, 'can_estimate') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to archive this estimate document'
      USING ERRCODE = '42501';
  END IF;

  archived_by_text := COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject);

  UPDATE public.documents
  SET archived_at = now_stamp,
      archived_by = archived_by_text,
      archive_reason = reason_text
  WHERE id = p_document_id;

  INSERT INTO public.change_logs (
    user_id,
    user_name,
    table_name,
    record_id,
    action,
    before_data,
    after_data,
    note,
    created_at
  )
  VALUES (
    jwt_subject,
    archived_by_text,
    'documents',
    p_document_id::TEXT,
    'archive',
    jsonb_strip_nulls(to_jsonb(target_document)),
    jsonb_strip_nulls(
      to_jsonb(target_document)
      || jsonb_build_object(
        'archived_at', now_stamp,
        'archived_by', archived_by_text,
        'archive_reason', reason_text
      )
    ),
    reason_text,
    now_stamp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_estimate_document(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_estimate_document(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_estimate_document(UUID, TEXT) FROM anon;

CREATE OR REPLACE FUNCTION public.read_estimate_change_history(
  p_estimate_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  user_name TEXT,
  table_name TEXT,
  record_id TEXT,
  action TEXT,
  note TEXT,
  before_data JSONB,
  after_data JSONB,
  changed_fields TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  target_estimate public.estimates%ROWTYPE;
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250);
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF p_estimate_id IS NULL THEN
    RAISE EXCEPTION 'estimate id is required'
      USING ERRCODE = '22004';
  END IF;

  SELECT *
  INTO target_estimate
  FROM public.estimates
  WHERE estimates.id = p_estimate_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimate not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF (
    public.current_user_can_read_division(target_estimate.division, 'can_estimate') IS NOT TRUE
    AND public.current_user_can_read_division(target_estimate.division, 'can_approve_estimates') IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'You do not have permission to view this estimate history'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cl.id,
    cl.created_at,
    cl.user_name,
    cl.table_name,
    cl.record_id,
    cl.action,
    cl.note,
    cl.before_data,
    cl.after_data,
    ARRAY(
      SELECT key_name
      FROM jsonb_object_keys(COALESCE(cl.before_data, '{}'::JSONB) || COALESCE(cl.after_data, '{}'::JSONB)) AS key_name
      WHERE (cl.before_data -> key_name) IS DISTINCT FROM (cl.after_data -> key_name)
      ORDER BY key_name
    ) AS changed_fields
  FROM public.change_logs cl
  WHERE (
      cl.table_name = 'estimates'
      AND (
        cl.record_id = p_estimate_id::TEXT
        OR cl.before_data ->> 'id' = p_estimate_id::TEXT
        OR cl.after_data ->> 'id' = p_estimate_id::TEXT
      )
    )
    OR (
      cl.table_name = 'estimate_pricing_lines'
      AND (
        cl.before_data ->> 'estimate_id' = p_estimate_id::TEXT
        OR cl.after_data ->> 'estimate_id' = p_estimate_id::TEXT
      )
    )
    OR (
      cl.table_name = 'estimate_snapshots'
      AND (
        cl.before_data ->> 'estimate_id' = p_estimate_id::TEXT
        OR cl.after_data ->> 'estimate_id' = p_estimate_id::TEXT
      )
    )
    OR (
      cl.table_name = 'documents'
      AND (
        cl.before_data ->> 'owner_id' = p_estimate_id::TEXT
        OR cl.after_data ->> 'owner_id' = p_estimate_id::TEXT
      )
    )
  ORDER BY cl.created_at DESC, cl.id DESC
  LIMIT safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.read_estimate_change_history(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_estimate_change_history(UUID, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.read_estimate_change_history(UUID, INTEGER) FROM anon;

COMMENT ON FUNCTION public.read_estimate_change_history(UUID, INTEGER) IS
  'Read-only audit history for a visible estimate row, including pricing lines, approval snapshots, and estimate documents.';
