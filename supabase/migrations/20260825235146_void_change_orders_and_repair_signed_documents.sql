-- HIGH RISK: approved Change Orders are never deleted. Voiding creates an
-- immutable equal-and-opposite ledger entry and retains the complete record.
ALTER TABLE public.change_orders DROP CONSTRAINT IF EXISTS change_orders_status_check;
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_status_check
  CHECK (status IN ('draft','submitted','approved','rejected','voided'));
ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by TEXT,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE public.change_order_financial_postings
  ADD COLUMN IF NOT EXISTS posting_kind TEXT NOT NULL DEFAULT 'approval';
ALTER TABLE public.change_order_financial_postings
  DROP CONSTRAINT IF EXISTS change_order_financial_postings_change_order_id_job_budget_line_id_key;
ALTER TABLE public.change_order_financial_postings
  DROP CONSTRAINT IF EXISTS change_order_financial_postings_posting_kind_check;
ALTER TABLE public.change_order_financial_postings
  ADD CONSTRAINT change_order_financial_postings_posting_kind_check CHECK (posting_kind IN ('approval','void')),
  ADD CONSTRAINT change_order_financial_postings_change_line_kind_key UNIQUE(change_order_id,job_budget_line_id,posting_kind);

CREATE OR REPLACE FUNCTION public.approve_job_change_order(p_change_order_id UUID,p_reason TEXT)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; target public.change_orders%ROWTYPE; saved public.change_orders%ROWTYPE; expected_count INTEGER; posted_count INTEGER;
BEGIN
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR NOT public.current_user_can_edit_division(target.division,'can_approve_change_orders') THEN RAISE EXCEPTION 'can_approve_change_orders is required' USING ERRCODE='42501'; END IF;
  IF target.status='approved' THEN RETURN target; END IF;
  IF target.status<>'submitted' OR target.signed_document_id IS NULL OR target.certification_state IS NOT TRUE OR target.verified_by IS NULL THEN RAISE EXCEPTION 'signed document and employee certification are required before approval'; END IF;
  WITH current_totals AS (
    SELECT job_budget_line_id,MAX(cost_code) cost_code,SUM(line_total) amount FROM public.change_order_lines WHERE change_order_id=target.id GROUP BY job_budget_line_id
  ), previous_totals AS (
    SELECT col.job_budget_line_id,SUM(col.line_total) amount FROM public.change_order_lines col WHERE col.change_order_id=target.revision_of_id GROUP BY col.job_budget_line_id
  ), deltas AS (
    SELECT COALESCE(c.job_budget_line_id,p.job_budget_line_id) job_budget_line_id,COALESCE(c.cost_code,jbl.cost_code) cost_code,COALESCE(c.amount,0)-COALESCE(p.amount,0) amount_delta
    FROM current_totals c FULL JOIN previous_totals p USING(job_budget_line_id)
    JOIN public.job_budget_lines jbl ON jbl.id=COALESCE(c.job_budget_line_id,p.job_budget_line_id)
  )
  INSERT INTO public.change_order_financial_postings(change_order_id,job_id,job_budget_line_id,division,cost_code,amount_delta,posted_by,posting_kind)
  SELECT target.id,target.job_id,d.job_budget_line_id,target.division,d.cost_code,d.amount_delta,actor_id,'approval' FROM deltas d
  ON CONFLICT(change_order_id,job_budget_line_id,posting_kind) DO NOTHING;
  SELECT COUNT(DISTINCT job_budget_line_id) INTO expected_count FROM public.change_order_lines WHERE change_order_id=target.id OR change_order_id=target.revision_of_id;
  SELECT COUNT(*) INTO posted_count FROM public.change_order_financial_postings WHERE change_order_id=target.id AND posting_kind='approval';
  IF posted_count<>expected_count THEN RAISE EXCEPTION 'financial posting count did not reconcile; approval rolled back'; END IF;
  UPDATE public.change_orders SET status='approved',approved_by=actor_id,approved_at=NOW(),updated_by=actor_id,updated_at=NOW() WHERE id=target.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,public.change_order_actor(),'change_orders',saved.id::TEXT,'update',to_jsonb(target),to_jsonb(saved),COALESCE(NULLIF(BTRIM(p_reason),''),'Change Order approved and financial postings created atomically.'));
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,public.change_order_actor(),'change_order_financial_postings',saved.id::TEXT,'create',NULL,jsonb_build_object('posting_kind','approval','posting_count',posted_count,'change_order_id',saved.id,'job_id',saved.job_id),'Immutable Change Order approval postings created.');
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.void_approved_job_change_order(p_change_order_id UUID,p_reason TEXT,p_confirmation TEXT)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; target public.change_orders%ROWTYPE; saved public.change_orders%ROWTYPE; approval_count INTEGER; void_count INTEGER; unbalanced_count INTEGER; normalized_reason TEXT:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR NOT public.current_user_can_edit_division(target.division,'can_revise_change_orders') THEN RAISE EXCEPTION 'Change Order and can_revise_change_orders are required' USING ERRCODE='42501'; END IF;
  IF target.status='voided' THEN RETURN target; END IF;
  IF target.status<>'approved' THEN RAISE EXCEPTION 'only an approved Change Order may be voided'; END IF;
  IF normalized_reason IS NULL OR BTRIM(COALESCE(p_confirmation,''))<>target.co_number THEN RAISE EXCEPTION 'reason and exact Change Order number confirmation are required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.change_order_financial_postings(change_order_id,job_id,job_budget_line_id,division,cost_code,amount_delta,posted_by,posting_kind)
  SELECT change_order_id,job_id,job_budget_line_id,division,cost_code,-amount_delta,actor_id,'void'
  FROM public.change_order_financial_postings WHERE change_order_id=target.id AND posting_kind='approval'
  ON CONFLICT(change_order_id,job_budget_line_id,posting_kind) DO NOTHING;
  SELECT COUNT(*) FILTER(WHERE posting_kind='approval'),COUNT(*) FILTER(WHERE posting_kind='void') INTO approval_count,void_count
  FROM public.change_order_financial_postings WHERE change_order_id=target.id;
  SELECT COUNT(*) INTO unbalanced_count FROM (
    SELECT job_budget_line_id FROM public.change_order_financial_postings WHERE change_order_id=target.id GROUP BY job_budget_line_id HAVING SUM(amount_delta)<>0
  ) unbalanced;
  IF approval_count=0 OR void_count<>approval_count OR unbalanced_count<>0 THEN RAISE EXCEPTION 'void reversal did not reconcile; operation rolled back'; END IF;
  UPDATE public.change_orders SET status='voided',voided_at=NOW(),voided_by=actor_id,void_reason=normalized_reason,updated_by=actor_id,updated_at=NOW()
  WHERE id=target.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor_id,public.change_order_actor(),'change_orders',saved.id::TEXT,'void',to_jsonb(target),to_jsonb(saved),normalized_reason);
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor_id,public.change_order_actor(),'change_order_financial_postings',saved.id::TEXT,'create',NULL,jsonb_build_object('posting_kind','void','posting_count',void_count,'change_order_id',saved.id,'job_id',saved.job_id),'Immutable equal-and-opposite void postings created.');
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.retire_unsigned_change_order_documents(p_change_order_id UUID,p_reason TEXT)
RETURNS TABLE(storage_path TEXT) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; target public.change_orders%ROWTYPE; doc public.documents%ROWTYPE; saved public.documents%ROWTYPE; normalized_reason TEXT:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
BEGIN
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF actor_id IS NULL OR target.id IS NULL OR target.status<>'submitted' OR target.signed_document_id IS NOT NULL OR normalized_reason IS NULL OR NOT public.current_user_can_edit_division(target.division,'can_verify_change_orders') THEN
    RAISE EXCEPTION 'authorized unsigned submitted Change Order and reason are required' USING ERRCODE='42501';
  END IF;
  FOR doc IN SELECT * FROM public.documents WHERE change_order_id=target.id AND archived_at IS NULL FOR UPDATE LOOP
    UPDATE public.documents SET archived_at=NOW(),archived_by=actor_id,archive_reason=normalized_reason,updated_at=NOW() WHERE id=doc.id RETURNING * INTO saved;
    INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
    VALUES(actor_id,public.change_order_actor(),'documents',doc.id::TEXT,'archive',to_jsonb(doc),to_jsonb(saved),normalized_reason);
    storage_path:=doc.storage_path; RETURN NEXT;
  END LOOP;
END $$;

-- Repair metadata left by failed uploads. This is recoverable and audited.
INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
SELECT 'system:signed-document-repair','System repair','documents',d.id::TEXT,'archive',to_jsonb(d),to_jsonb(d)||jsonb_build_object('archived_at',NOW(),'archived_by','system:signed-document-repair','archive_reason','Archived orphaned signed Change Order metadata; Storage object was not found.'),'Archived orphaned signed Change Order metadata; Storage object was not found.'
FROM public.documents d JOIN public.change_orders co ON co.id=d.change_order_id
LEFT JOIN storage.objects o ON o.bucket_id='northgate-files' AND o.name=d.storage_path
WHERE d.archived_at IS NULL AND o.id IS NULL AND co.status='submitted' AND co.signed_document_id IS NULL;
UPDATE public.documents d SET archived_at=NOW(),archived_by='system:signed-document-repair',archive_reason='Archived orphaned signed Change Order metadata; Storage object was not found.',updated_at=NOW()
FROM public.change_orders co
WHERE co.id=d.change_order_id AND d.archived_at IS NULL AND co.status='submitted' AND co.signed_document_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='northgate-files' AND o.name=d.storage_path);

DROP POLICY IF EXISTS documents_storage_delete_change_order ON storage.objects;
CREATE POLICY documents_storage_delete_change_order ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='northgate-files' AND EXISTS (
    SELECT 1 FROM public.documents d JOIN public.change_orders co ON co.id=d.change_order_id
    WHERE d.storage_path=storage.objects.name AND co.status='submitted' AND co.signed_document_id IS NULL
      AND public.current_user_can_edit_division(co.division,'can_verify_change_orders')
  )
);

REVOKE ALL ON FUNCTION public.approve_job_change_order(UUID,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.void_approved_job_change_order(UUID,TEXT,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.retire_unsigned_change_order_documents(UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_job_change_order(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_approved_job_change_order(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_unsigned_change_order_documents(UUID,TEXT) TO authenticated;
