-- Draft Change Orders may be archived, but never silently or without a full audit snapshot.
CREATE OR REPLACE FUNCTION public.archive_job_change_order(p_change_order_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor_id TEXT:=auth.jwt()->>'sub';
  target public.change_orders%ROWTYPE;
  saved public.change_orders%ROWTYPE;
  normalized_reason TEXT:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  IF p_change_order_id IS NULL OR normalized_reason IS NULL THEN RAISE EXCEPTION 'change order and archive reason are required' USING ERRCODE='22004'; END IF;
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR target.status<>'draft' OR NOT public.current_user_can_edit_division(target.division,'can_create_change_orders') THEN
    RAISE EXCEPTION 'only an authorized draft may be archived' USING ERRCODE='42501';
  END IF;
  UPDATE public.change_orders SET archived_at=NOW(),archived_by=actor_id,archive_reason=normalized_reason,updated_by=actor_id,updated_at=NOW()
  WHERE id=target.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor_id,public.change_order_actor(),'change_orders',target.id::TEXT,'archive',to_jsonb(target),to_jsonb(saved),normalized_reason);
END $$;

REVOKE ALL ON FUNCTION public.archive_job_change_order(UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.archive_job_change_order(UUID,TEXT) TO authenticated;
