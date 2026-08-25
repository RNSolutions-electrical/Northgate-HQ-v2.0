CREATE OR REPLACE FUNCTION public.save_change_order_allocations(p_change_order_id UUID, p_allocations JSONB, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub'; co public.change_orders%ROWTYPE; caller public.user_permissions%ROWTYPE; allocation_total NUMERIC;
BEGIN
  IF jwt_subject IS NULL OR p_change_order_id IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'change order, allocations, and reason are required'; END IF;
  SELECT * INTO co FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id=jwt_subject AND is_active=TRUE LIMIT 1;
  IF co.id IS NULL OR caller.id IS NULL OR public.current_user_can_edit_division(co.division,'can_manage_change_orders') IS NOT TRUE THEN RAISE EXCEPTION 'change-order management permission is required' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(SUM((item->>'amount')::NUMERIC),0) INTO allocation_total FROM jsonb_array_elements(p_allocations) item;
  IF co.status='approved' AND allocation_total <> co.price_amount THEN RAISE EXCEPTION 'approved allocations must equal the approved price'; END IF;
  DELETE FROM public.change_order_allocations WHERE change_order_id=p_change_order_id;
  INSERT INTO public.change_order_allocations(change_order_id,project_division_id,budget_line_id,amount)
  SELECT p_change_order_id,NULLIF(item->>'project_division_id','')::UUID,(item->>'budget_line_id')::UUID,(item->>'amount')::NUMERIC FROM jsonb_array_elements(p_allocations) item;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,note) VALUES(jwt_subject,COALESCE(caller.display_name,caller.email,jwt_subject),'change_order_allocations',p_change_order_id::TEXT,'update',p_reason);
END; $$;
REVOKE ALL ON FUNCTION public.save_change_order_allocations(UUID,JSONB,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_change_order_allocations(UUID,JSONB,TEXT) TO authenticated;
