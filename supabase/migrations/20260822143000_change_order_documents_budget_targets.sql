ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS project_division_id UUID REFERENCES public.job_budget_divisions(id),
  ADD COLUMN IF NOT EXISTS budget_line_id UUID REFERENCES public.job_budget_lines(id);

DROP FUNCTION IF EXISTS public.save_job_change_order(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.save_job_change_order(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION public.save_job_change_order(
  p_change_order_id UUID,
  p_job_id UUID,
  p_division TEXT,
  p_co_number TEXT,
  p_title TEXT,
  p_description TEXT,
  p_price_amount NUMERIC,
  p_cost_amount NUMERIC,
  p_status TEXT,
  p_reason TEXT,
  p_project_division_id UUID DEFAULT NULL,
  p_budget_line_id UUID DEFAULT NULL
)
RETURNS public.change_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  target_job public.jobs%ROWTYPE;
  target_project_division public.job_budget_divisions%ROWTYPE;
  target_budget_line public.job_budget_lines%ROWTYPE;
  before_row public.change_orders%ROWTYPE;
  saved_row public.change_orders%ROWTYPE;
  normalized_division TEXT := NULLIF(BTRIM(COALESCE(p_division, '')), '');
  normalized_number TEXT := NULLIF(BTRIM(COALESCE(p_co_number, '')), '');
  normalized_title TEXT := NULLIF(BTRIM(COALESCE(p_title, '')), '');
  normalized_status TEXT := LOWER(NULLIF(BTRIM(COALESCE(p_status, '')), ''));
  normalized_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  normalized_project_division_id UUID := p_project_division_id;
  actor_label TEXT;
  now_stamp TIMESTAMPTZ := NOW();
BEGIN
  IF jwt_subject IS NULL OR LENGTH(BTRIM(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '28000';
  END IF;
  IF p_job_id IS NULL OR normalized_division IS NULL OR normalized_number IS NULL
    OR normalized_title IS NULL OR normalized_reason IS NULL THEN
    RAISE EXCEPTION 'job, division, change order number, title, and reason are required'
      USING ERRCODE = '22004';
  END IF;
  IF normalized_status NOT IN ('proposed', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'change order status must be proposed, approved, or rejected'
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_price_amount, 0) < 0 OR COALESCE(p_cost_amount, 0) < 0 THEN
    RAISE EXCEPTION 'change order price and cost cannot be negative' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO caller FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject AND up.is_active = TRUE LIMIT 1;
  IF caller.id IS NULL
    OR public.current_user_can_edit_division(normalized_division, 'can_approve_budget') IS NOT TRUE THEN
    RAISE EXCEPTION 'can_approve_budget permission is required in this division' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_job FROM public.jobs j
  WHERE j.id = p_job_id AND j.archived_at IS NULL LIMIT 1;
  IF target_job.id IS NULL OR target_job.division <> normalized_division THEN
    RAISE EXCEPTION 'active job was not found in the selected division' USING ERRCODE = 'P0002';
  END IF;

  IF p_budget_line_id IS NOT NULL THEN
    SELECT * INTO target_budget_line FROM public.job_budget_lines bl
    WHERE bl.id = p_budget_line_id
      AND bl.job_id = p_job_id
      AND bl.archived_at IS NULL
    LIMIT 1;

    IF target_budget_line.id IS NULL THEN
      RAISE EXCEPTION 'active budget line was not found for this job' USING ERRCODE = 'P0002';
    END IF;

    IF target_budget_line.project_division_id IS NOT NULL THEN
      IF normalized_project_division_id IS NULL THEN
        normalized_project_division_id := target_budget_line.project_division_id;
      ELSIF normalized_project_division_id <> target_budget_line.project_division_id THEN
        RAISE EXCEPTION 'budget line does not belong to the selected project division'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  IF normalized_project_division_id IS NOT NULL THEN
    SELECT * INTO target_project_division FROM public.job_budget_divisions pd
    WHERE pd.id = normalized_project_division_id
      AND pd.job_id = p_job_id
      AND pd.archived_at IS NULL
    LIMIT 1;

    IF target_project_division.id IS NULL THEN
      RAISE EXCEPTION 'active project budget division was not found for this job'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  actor_label := COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject);

  IF p_change_order_id IS NULL THEN
    INSERT INTO public.change_orders (
      job_id, division, co_number, title, description, price_amount, cost_amount,
      project_division_id, budget_line_id, status, submitted_by, approved_by,
      approved_at, rejected_by, rejected_at
    ) VALUES (
      p_job_id, normalized_division, normalized_number, normalized_title,
      NULLIF(BTRIM(COALESCE(p_description, '')), ''), COALESCE(p_price_amount, 0),
      COALESCE(p_cost_amount, 0), normalized_project_division_id, p_budget_line_id,
      normalized_status, jwt_subject,
      CASE WHEN normalized_status = 'approved' THEN jwt_subject ELSE NULL END,
      CASE WHEN normalized_status = 'approved' THEN now_stamp ELSE NULL END,
      CASE WHEN normalized_status = 'rejected' THEN jwt_subject ELSE NULL END,
      CASE WHEN normalized_status = 'rejected' THEN now_stamp ELSE NULL END
    ) RETURNING * INTO saved_row;

    INSERT INTO public.change_logs (
      user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at
    ) VALUES (
      jwt_subject, actor_label, 'change_orders', saved_row.id::TEXT, 'create', NULL,
      jsonb_strip_nulls(to_jsonb(saved_row)), normalized_reason, now_stamp
    );
  ELSE
    SELECT * INTO before_row FROM public.change_orders co
    WHERE co.id = p_change_order_id AND co.archived_at IS NULL FOR UPDATE;
    IF before_row.id IS NULL OR before_row.job_id <> p_job_id
      OR before_row.division <> normalized_division THEN
      RAISE EXCEPTION 'active change order not found for this job and division' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.change_orders
    SET co_number = normalized_number,
        title = normalized_title,
        description = NULLIF(BTRIM(COALESCE(p_description, '')), ''),
        price_amount = COALESCE(p_price_amount, 0),
        cost_amount = COALESCE(p_cost_amount, 0),
        project_division_id = normalized_project_division_id,
        budget_line_id = p_budget_line_id,
        status = normalized_status,
        approved_by = CASE
          WHEN normalized_status = 'approved' AND before_row.status <> 'approved' THEN jwt_subject
          WHEN normalized_status = 'approved' THEN before_row.approved_by ELSE NULL END,
        approved_at = CASE
          WHEN normalized_status = 'approved' AND before_row.status <> 'approved' THEN now_stamp
          WHEN normalized_status = 'approved' THEN before_row.approved_at ELSE NULL END,
        rejected_by = CASE
          WHEN normalized_status = 'rejected' AND before_row.status <> 'rejected' THEN jwt_subject
          WHEN normalized_status = 'rejected' THEN before_row.rejected_by ELSE NULL END,
        rejected_at = CASE
          WHEN normalized_status = 'rejected' AND before_row.status <> 'rejected' THEN now_stamp
          WHEN normalized_status = 'rejected' THEN before_row.rejected_at ELSE NULL END,
        updated_at = now_stamp
    WHERE id = before_row.id
    RETURNING * INTO saved_row;

    INSERT INTO public.change_logs (
      user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at
    ) VALUES (
      jwt_subject, actor_label, 'change_orders', saved_row.id::TEXT, 'update',
      jsonb_strip_nulls(to_jsonb(before_row)), jsonb_strip_nulls(to_jsonb(saved_row)),
      normalized_reason, now_stamp
    );
  END IF;
  RETURN saved_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_job_change_order(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_job_change_order(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID) TO authenticated;

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
    OR (
      owner_type = 'change_order'
      AND EXISTS (
        SELECT 1
        FROM public.change_orders co
        WHERE co.id = documents.owner_id
          AND co.division = documents.division
          AND co.archived_at IS NULL
          AND public.current_user_can_read_division(co.division, 'can_view_financials')
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
      SELECT 1 FROM public.jobs j
      WHERE j.id = owner_id
        AND j.division = documents.division
        AND j.archived_at IS NULL
    )
  )
  OR (
    owner_type = 'estimate'
    AND public.current_user_can_edit_division(division, 'can_estimate')
    AND EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = owner_id
        AND e.division = documents.division
        AND e.archived_at IS NULL
    )
  )
  OR (
    owner_type = 'change_order'
    AND public.current_user_can_edit_division(division, 'can_manage_change_orders')
    AND EXISTS (
      SELECT 1 FROM public.change_orders co
      WHERE co.id = owner_id
        AND co.division = documents.division
        AND co.archived_at IS NULL
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
    OR (
      owner_type = 'change_order'
      AND public.current_user_can_edit_division(division, 'can_manage_change_orders')
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
  OR (
    owner_type = 'change_order'
    AND public.current_user_can_edit_division(division, 'can_manage_change_orders')
    AND EXISTS (
      SELECT 1 FROM public.change_orders co
      WHERE co.id = documents.owner_id
        AND co.division = documents.division
        AND co.archived_at IS NULL
    )
  )
);

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
        OR (
          d.owner_type = 'change_order'
          AND EXISTS (
            SELECT 1
            FROM public.change_orders co
            WHERE co.id = d.owner_id
              AND co.division = d.division
              AND co.archived_at IS NULL
              AND public.current_user_can_read_division(co.division, 'can_view_financials')
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
        SELECT 1 FROM public.jobs j
        WHERE j.id::TEXT = (storage.foldername(storage.objects.name))[3]
          AND j.archived_at IS NULL
          AND public.current_user_can_edit_division(j.division, 'can_manage_jobs')
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] = 'estimate'
      AND EXISTS (
        SELECT 1 FROM public.estimates e
        WHERE e.id::TEXT = (storage.foldername(storage.objects.name))[3]
          AND e.archived_at IS NULL
          AND public.current_user_can_edit_division(e.division, 'can_estimate')
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] = 'change_order'
      AND EXISTS (
        SELECT 1 FROM public.change_orders co
        WHERE co.id::TEXT = (storage.foldername(storage.objects.name))[3]
          AND co.archived_at IS NULL
          AND public.current_user_can_edit_division(co.division, 'can_manage_change_orders')
      )
    )
  )
);

CREATE OR REPLACE FUNCTION public.archive_change_order_document(
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
  target_change_order public.change_orders%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
  reason_text TEXT := NULLIF(BTRIM(p_reason), '');
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
    AND owner_type = 'change_order'
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change order document not found or already archived' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO target_change_order
  FROM public.change_orders co
  WHERE co.id = target_document.owner_id
    AND co.division = target_document.division
    AND co.archived_at IS NULL
  LIMIT 1;

  IF target_change_order.id IS NULL
    OR public.current_user_can_edit_division(target_change_order.division, 'can_manage_change_orders') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to archive this change order document'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Active user permission record is required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.documents
  SET archived_at = now_stamp,
      archived_by = jwt_subject,
      archive_reason = reason_text
  WHERE id = p_document_id;

  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at
  ) VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'documents',
    p_document_id::TEXT,
    'archive',
    jsonb_strip_nulls(to_jsonb(target_document)),
    jsonb_strip_nulls(to_jsonb(target_document) || jsonb_build_object(
      'archived_at', now_stamp,
      'archived_by', jwt_subject,
      'archive_reason', reason_text
    )),
    reason_text,
    now_stamp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_change_order_document(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_change_order_document(UUID, TEXT) TO authenticated;

COMMENT ON COLUMN public.change_orders.project_division_id IS 'Optional project budget division receiving this change order.';
COMMENT ON COLUMN public.change_orders.budget_line_id IS 'Optional financial line receiving this change order cost impact.';
COMMENT ON FUNCTION public.save_job_change_order(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID)
  IS 'Creates or updates a job change order, including optional budget target fields, and records the audit entry.';
COMMENT ON FUNCTION public.archive_change_order_document(UUID, TEXT)
  IS 'Archives a change-order-owned document and records the audit entry.';
