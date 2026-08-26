-- Make status-specific record actions explicit while preserving the approved
-- Change Order lock and complete audit history.
CREATE OR REPLACE FUNCTION public.reopen_submitted_job_change_order(p_change_order_id UUID,p_reason TEXT)
RETURNS public.change_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor_id TEXT:=auth.jwt()->>'sub';
  target public.change_orders%ROWTYPE;
  saved public.change_orders%ROWTYPE;
  normalized_reason TEXT:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR target.status<>'submitted' OR target.signed_document_id IS NOT NULL OR target.certification_state IS TRUE THEN
    RAISE EXCEPTION 'only an unsigned submitted Change Order may be returned to draft';
  END IF;
  IF normalized_reason IS NULL OR NOT public.current_user_can_edit_division(target.division,'can_create_change_orders') OR NOT public.current_user_can_edit_division(target.division,'can_submit_change_orders') THEN
    RAISE EXCEPTION 'create, submit, and audit reason are required' USING ERRCODE='42501';
  END IF;
  UPDATE public.change_orders
  SET status='draft',submitted_by=NULL,submitted_at=NULL,exported_by=NULL,exported_at=NULL,updated_by=actor_id,updated_at=NOW()
  WHERE id=target.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor_id,public.change_order_actor(),'change_orders',saved.id::TEXT,'update',to_jsonb(target),to_jsonb(saved),normalized_reason);
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.archive_job_change_order(p_change_order_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor_id TEXT:=auth.jwt()->>'sub';
  target public.change_orders%ROWTYPE;
  saved public.change_orders%ROWTYPE;
  normalized_reason TEXT:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR target.status NOT IN ('draft','submitted') OR target.signed_document_id IS NOT NULL OR normalized_reason IS NULL
    OR NOT public.current_user_can_edit_division(target.division,'can_create_change_orders')
    OR (target.status='submitted' AND NOT public.current_user_can_edit_division(target.division,'can_submit_change_orders')) THEN
    RAISE EXCEPTION 'only an authorized unsigned draft or submitted Change Order may be archived' USING ERRCODE='42501';
  END IF;
  UPDATE public.change_orders
  SET archived_at=NOW(),archived_by=actor_id,archive_reason=normalized_reason,updated_by=actor_id,updated_at=NOW()
  WHERE id=target.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor_id,public.change_order_actor(),'change_orders',saved.id::TEXT,'archive',to_jsonb(target),to_jsonb(saved),normalized_reason);
END $$;

REVOKE ALL ON FUNCTION public.reopen_submitted_job_change_order(UUID,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.archive_job_change_order(UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reopen_submitted_job_change_order(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_job_change_order(UUID,TEXT) TO authenticated;
