CREATE OR REPLACE FUNCTION public.current_user_can_read_division(
  p_division TEXT,
  p_required_permission TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  required_ok BOOLEAN := TRUE;
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RETURN FALSE;
  END IF;

  caller_permissions := public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides);

  IF p_required_permission IS NOT NULL THEN
    required_ok := COALESCE((caller_permissions ->> p_required_permission)::BOOLEAN, FALSE);
  END IF;

  RETURN required_ok IS TRUE
    AND (
      COALESCE((caller_permissions ->> 'can_view_all_divisions')::BOOLEAN, FALSE) IS TRUE
      OR (p_division IS NOT NULL AND caller.division = p_division)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_edit_division(
  p_division TEXT,
  p_required_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RETURN FALSE;
  END IF;

  IF p_required_permission IS NULL OR length(trim(p_required_permission)) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RETURN FALSE;
  END IF;

  caller_permissions := public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides);

  RETURN COALESCE((caller_permissions ->> p_required_permission)::BOOLEAN, FALSE) IS TRUE
    AND (
      caller.role IN ('Developer', 'Manager')
      OR (p_division IS NOT NULL AND caller.division = p_division)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_can_read_division(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_can_read_division(TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_can_read_division(TEXT, TEXT) FROM anon;

REVOKE ALL ON FUNCTION public.current_user_can_edit_division(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_can_edit_division(TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_can_edit_division(TEXT, TEXT) FROM anon;

DROP POLICY IF EXISTS jobs_read ON public.jobs;
CREATE POLICY jobs_read
ON public.jobs
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND public.current_user_can_read_division(division)
);

DROP POLICY IF EXISTS jobs_insert ON public.jobs;
CREATE POLICY jobs_insert
ON public.jobs
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_can_edit_division(division, 'can_create_jobs')
);

DROP POLICY IF EXISTS jobs_update ON public.jobs;
CREATE POLICY jobs_update
ON public.jobs
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND public.current_user_can_edit_division(division, 'can_manage_jobs')
)
WITH CHECK (
  public.current_user_can_edit_division(division, 'can_manage_jobs')
);

DROP POLICY IF EXISTS job_buyout_lines_read ON public.job_buyout_lines;
CREATE POLICY job_buyout_lines_read
ON public.job_buyout_lines
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND public.current_user_can_read_division(division)
);

DROP POLICY IF EXISTS job_buyout_lines_insert ON public.job_buyout_lines;
CREATE POLICY job_buyout_lines_insert
ON public.job_buyout_lines
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_can_edit_division(division, 'can_manage_jobs')
);

DROP POLICY IF EXISTS job_buyout_lines_update ON public.job_buyout_lines;
CREATE POLICY job_buyout_lines_update
ON public.job_buyout_lines
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND public.current_user_can_edit_division(division, 'can_manage_jobs')
)
WITH CHECK (
  public.current_user_can_edit_division(division, 'can_manage_jobs')
);

DROP POLICY IF EXISTS job_budget_lines_read ON public.job_budget_lines;
CREATE POLICY job_budget_lines_read
ON public.job_budget_lines
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND public.current_user_can_read_division(division, 'can_view_financials')
);

DROP POLICY IF EXISTS job_budget_lines_insert ON public.job_budget_lines;
CREATE POLICY job_budget_lines_insert
ON public.job_budget_lines
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_can_edit_division(division, 'can_approve_budget')
);

DROP POLICY IF EXISTS job_budget_lines_update ON public.job_budget_lines;
CREATE POLICY job_budget_lines_update
ON public.job_budget_lines
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND public.current_user_can_edit_division(division, 'can_approve_budget')
)
WITH CHECK (
  public.current_user_can_edit_division(division, 'can_approve_budget')
);

DROP POLICY IF EXISTS job_schedule_items_read ON public.job_schedule_items;
CREATE POLICY job_schedule_items_read
ON public.job_schedule_items
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND public.current_user_can_read_division(division)
);

DROP POLICY IF EXISTS job_schedule_items_manage_read ON public.job_schedule_items;
CREATE POLICY job_schedule_items_manage_read
ON public.job_schedule_items
FOR SELECT
TO authenticated
USING (
  public.current_user_can_edit_division(division, 'can_manage_jobs')
);

DROP POLICY IF EXISTS job_schedule_items_insert ON public.job_schedule_items;
CREATE POLICY job_schedule_items_insert
ON public.job_schedule_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_can_edit_division(division, 'can_manage_jobs')
);

DROP POLICY IF EXISTS job_schedule_items_update ON public.job_schedule_items;
CREATE POLICY job_schedule_items_update
ON public.job_schedule_items
FOR UPDATE
TO authenticated
USING (
  public.current_user_can_edit_division(division, 'can_manage_jobs')
)
WITH CHECK (
  public.current_user_can_edit_division(division, 'can_manage_jobs')
);

DROP POLICY IF EXISTS documents_read ON public.documents;
CREATE POLICY documents_read
ON public.documents
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND owner_type = 'job'
  AND public.current_user_can_read_division(division)
);

DROP POLICY IF EXISTS documents_insert ON public.documents;
CREATE POLICY documents_insert
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
  owner_type = 'job'
  AND public.current_user_can_edit_division(division, 'can_manage_jobs')
);

DROP POLICY IF EXISTS documents_update ON public.documents;
CREATE POLICY documents_update
ON public.documents
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND owner_type = 'job'
  AND public.current_user_can_edit_division(division, 'can_manage_jobs')
)
WITH CHECK (
  owner_type = 'job'
  AND public.current_user_can_edit_division(division, 'can_manage_jobs')
);

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
    WHERE d.storage_path = storage.objects.name
      AND d.archived_at IS NULL
      AND d.owner_type = 'job'
      AND public.current_user_can_read_division(d.division)
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
    WHERE j.id::TEXT = (storage.foldername(name))[3]
      AND public.current_user_can_edit_division(j.division, 'can_manage_jobs')
  )
);

CREATE OR REPLACE FUNCTION public.archive_job(
  p_job_id UUID,
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
  target_job public.jobs%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
  reason_text TEXT := NULLIF(BTRIM(p_reason), '');
  archived_by_text TEXT;
BEGIN
  IF jwt_subject IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target_job
  FROM public.jobs
  WHERE id = p_job_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found or already archived' USING ERRCODE = 'P0002';
  END IF;

  IF public.current_user_can_edit_division(target_job.division, 'can_manage_jobs') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to archive this job' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Active user permission record is required' USING ERRCODE = '42501';
  END IF;

  archived_by_text := jwt_subject;

  UPDATE public.jobs
  SET archived_at = now_stamp,
      archived_by = archived_by_text,
      archive_reason = reason_text
  WHERE id = p_job_id;

  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at)
  VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'jobs',
    p_job_id::TEXT,
    'archive',
    jsonb_strip_nulls(to_jsonb(target_job)),
    jsonb_strip_nulls(to_jsonb(target_job) || jsonb_build_object('archived_at', now_stamp, 'archived_by', archived_by_text, 'archive_reason', reason_text)),
    reason_text,
    now_stamp
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_job_buyout_line(
  p_buyout_line_id UUID,
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
  target_line public.job_buyout_lines%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
  reason_text TEXT := NULLIF(BTRIM(p_reason), '');
  archived_by_text TEXT;
BEGIN
  IF jwt_subject IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target_line
  FROM public.job_buyout_lines
  WHERE id = p_buyout_line_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Buyout item not found or already archived' USING ERRCODE = 'P0002';
  END IF;

  IF public.current_user_can_edit_division(target_line.division, 'can_manage_jobs') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to archive this buyout item' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Active user permission record is required' USING ERRCODE = '42501';
  END IF;

  archived_by_text := jwt_subject;

  UPDATE public.job_buyout_lines
  SET archived_at = now_stamp,
      archived_by = archived_by_text,
      archive_reason = reason_text
  WHERE id = p_buyout_line_id;

  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at)
  VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'job_buyout_lines',
    p_buyout_line_id::TEXT,
    'archive',
    jsonb_strip_nulls(to_jsonb(target_line)),
    jsonb_strip_nulls(to_jsonb(target_line) || jsonb_build_object('archived_at', now_stamp, 'archived_by', archived_by_text, 'archive_reason', reason_text)),
    reason_text,
    now_stamp
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_job_budget_line(
  p_budget_line_id UUID,
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
  target_line public.job_budget_lines%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
  reason_text TEXT := NULLIF(BTRIM(p_reason), '');
  archived_by_text TEXT;
BEGIN
  IF jwt_subject IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target_line
  FROM public.job_budget_lines
  WHERE id = p_budget_line_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial line not found or already archived' USING ERRCODE = 'P0002';
  END IF;

  IF public.current_user_can_edit_division(target_line.division, 'can_approve_budget') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to archive this financial line' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Active user permission record is required' USING ERRCODE = '42501';
  END IF;

  archived_by_text := jwt_subject;

  UPDATE public.job_budget_lines
  SET archived_at = now_stamp,
      archived_by = archived_by_text,
      archive_reason = reason_text
  WHERE id = p_budget_line_id;

  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at)
  VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'job_budget_lines',
    p_budget_line_id::TEXT,
    'archive',
    jsonb_strip_nulls(to_jsonb(target_line)),
    jsonb_strip_nulls(to_jsonb(target_line) || jsonb_build_object('archived_at', now_stamp, 'archived_by', archived_by_text, 'archive_reason', reason_text)),
    reason_text,
    now_stamp
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_job_document(
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
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target_document
  FROM public.documents
  WHERE id = p_document_id
    AND owner_type = 'job'
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job document not found or already archived' USING ERRCODE = 'P0002';
  END IF;

  IF public.current_user_can_edit_division(target_document.division, 'can_manage_jobs') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to archive this document' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Active user permission record is required' USING ERRCODE = '42501';
  END IF;

  archived_by_text := jwt_subject;

  UPDATE public.documents
  SET archived_at = now_stamp,
      archived_by = archived_by_text,
      archive_reason = reason_text
  WHERE id = p_document_id;

  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at)
  VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'documents',
    p_document_id::TEXT,
    'archive',
    jsonb_strip_nulls(to_jsonb(target_document)),
    jsonb_strip_nulls(to_jsonb(target_document) || jsonb_build_object('archived_at', now_stamp, 'archived_by', archived_by_text, 'archive_reason', reason_text)),
    reason_text,
    now_stamp
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_job_schedule_item(
  p_schedule_item_id UUID,
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
  target_item public.job_schedule_items%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
  reason_text TEXT := NULLIF(BTRIM(p_reason), '');
  archived_by_text TEXT;
BEGIN
  IF jwt_subject IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target_item
  FROM public.job_schedule_items
  WHERE id = p_schedule_item_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule item not found or already archived' USING ERRCODE = 'P0002';
  END IF;

  IF public.current_user_can_edit_division(target_item.division, 'can_manage_jobs') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to archive this schedule item' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Active user permission record is required' USING ERRCODE = '42501';
  END IF;

  archived_by_text := jwt_subject;

  UPDATE public.job_schedule_items
  SET archived_at = now_stamp,
      archived_by = archived_by_text,
      archive_reason = reason_text
  WHERE id = p_schedule_item_id;

  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at)
  VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'job_schedule_items',
    p_schedule_item_id::TEXT,
    'archive',
    jsonb_strip_nulls(to_jsonb(target_item)),
    jsonb_strip_nulls(to_jsonb(target_item) || jsonb_build_object('archived_at', now_stamp, 'archived_by', archived_by_text, 'archive_reason', reason_text)),
    reason_text,
    now_stamp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_job(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_job(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_job(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.archive_job_buyout_line(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_job_buyout_line(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_job_buyout_line(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.archive_job_budget_line(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_job_budget_line(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_job_budget_line(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.archive_job_document(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_job_document(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_job_document(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.archive_job_schedule_item(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_job_schedule_item(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_job_schedule_item(UUID, TEXT) TO authenticated;
