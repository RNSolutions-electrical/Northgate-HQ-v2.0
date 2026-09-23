-- Cost reports are Job Financials source records, not general job attachments.
-- Reuse Documents while limiting raw financial-file access at the data layer.
CREATE POLICY job_cost_reports_insert ON public.documents
FOR INSERT TO authenticated WITH CHECK (
  owner_type = 'job' AND document_type = 'cost_reports' AND change_order_id IS NULL
  AND public.current_user_can_edit_job(owner_id, 'can_approve_budget')
  AND EXISTS (SELECT 1 FROM public.jobs j
    WHERE j.id = owner_id AND j.division = documents.division AND j.archived_at IS NULL)
);

CREATE POLICY job_cost_reports_visibility ON public.documents
AS RESTRICTIVE FOR SELECT TO authenticated USING (
  document_type IS DISTINCT FROM 'cost_reports'
  OR (owner_type = 'job' AND public.current_user_can_access_job(owner_id, 'can_view_protected_project_financials'))
);

CREATE POLICY job_cost_reports_storage_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'northgate-files'
  AND (storage.foldername(name))[1] = 'documents'
  AND (storage.foldername(name))[2] = 'job'
  AND (storage.foldername(name))[4] = 'cost-reports'
  AND EXISTS (SELECT 1 FROM public.jobs j
    WHERE j.id::text = (storage.foldername(storage.objects.name))[3]
      AND j.archived_at IS NULL
      AND public.current_user_can_edit_job(j.id, 'can_approve_budget'))
);

CREATE POLICY job_cost_reports_storage_visibility ON storage.objects
AS RESTRICTIVE FOR SELECT TO authenticated USING (
  bucket_id <> 'northgate-files' OR (storage.foldername(name))[4] IS DISTINCT FROM 'cost-reports'
  OR EXISTS (SELECT 1 FROM public.documents d
    WHERE d.storage_path = storage.objects.name AND d.document_type = 'cost_reports'
      AND d.owner_type = 'job' AND d.archived_at IS NULL
      AND public.current_user_can_access_job(d.owner_id, 'can_view_protected_project_financials'))
);

CREATE POLICY job_cost_reports_storage_read ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'northgate-files' AND (storage.foldername(name))[4] = 'cost-reports'
  AND EXISTS (SELECT 1 FROM public.documents d
    WHERE d.storage_path = storage.objects.name AND d.document_type = 'cost_reports'
      AND d.owner_type = 'job' AND d.archived_at IS NULL
      AND public.current_user_can_access_job(d.owner_id, 'can_view_protected_project_financials'))
);

-- The existing upload-cleanup RPC also needs to accept an authorized financial
-- importer; otherwise a failed Storage upload would leave an active metadata row.
CREATE OR REPLACE FUNCTION public.archive_failed_document_upload(p_document_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE doc public.documents; permitted boolean := false;
BEGIN
 IF auth.jwt()->>'sub' IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 SELECT * INTO doc FROM public.documents WHERE id=p_document_id AND archived_at IS NULL FOR UPDATE;
 IF doc.id IS NULL THEN RAISE EXCEPTION 'Active document not found; refresh Documents before retrying' USING ERRCODE='P0002'; END IF;
 IF doc.owner_type='job' THEN
   permitted := EXISTS(SELECT 1 FROM public.jobs j WHERE j.id=doc.owner_id AND j.division=doc.division AND j.archived_at IS NULL)
    AND (public.current_user_can_edit_job(doc.owner_id,'can_manage_jobs')
      OR (doc.document_type='cost_reports' AND doc.change_order_id IS NULL
        AND public.current_user_can_edit_job(doc.owner_id,'can_approve_budget'))
      OR (doc.change_order_id IS NULL AND public.current_user_can_edit_division(doc.division,'can_manage_jobs'))
      OR EXISTS(SELECT 1 FROM public.change_orders co WHERE co.id=doc.change_order_id AND co.job_id=doc.owner_id
        AND co.division=doc.division AND co.status='submitted' AND public.current_user_can_edit_division(co.division,'can_verify_change_orders')));
 ELSIF doc.owner_type='estimate' THEN
   permitted := doc.change_order_id IS NULL AND public.current_user_can_edit_division(doc.division,'can_estimate')
     AND EXISTS(SELECT 1 FROM public.estimates e WHERE e.id=doc.owner_id AND e.division=doc.division AND e.archived_at IS NULL);
 ELSIF doc.owner_type='change_order' THEN
   permitted := doc.change_order_id IS NULL AND public.current_user_can_edit_division(doc.division,'can_manage_change_orders')
     AND EXISTS(SELECT 1 FROM public.change_orders co WHERE co.id=doc.owner_id AND co.division=doc.division AND co.archived_at IS NULL);
 END IF;
 IF permitted IS NOT TRUE THEN RAISE EXCEPTION 'Document owner edit permission required' USING ERRCODE='42501'; END IF;
 UPDATE public.documents SET archived_at=clock_timestamp(),archive_reason=p_reason WHERE id=doc.id;
END $$;
REVOKE ALL ON FUNCTION public.archive_failed_document_upload(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.archive_failed_document_upload(uuid,text) TO authenticated;
