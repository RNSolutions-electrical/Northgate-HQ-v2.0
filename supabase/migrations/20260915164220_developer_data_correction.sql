-- Applied as 20260915164220. Explicit per-user correction access; no stock/history changes.
-- Extend the existing allowlist without discarding flags added by another machine.
DO $$ DECLARE expression text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT expression FROM pg_constraint
 WHERE conrelid='public.user_permission_overrides'::regclass AND conname='user_permission_overrides_permission_flag_check';
 ALTER TABLE public.user_permission_overrides DROP CONSTRAINT user_permission_overrides_permission_flag_check;
 EXECUTE 'ALTER TABLE public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_permission_flag_check CHECK (('||expression||') OR permission_flag = ''can_developer_data_correction'')';
END $$;

CREATE FUNCTION public.current_user_can_correct_inventory_data() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_permissions u WHERE u.clerk_user_id=auth.jwt()->>'sub'
 AND u.is_active AND u.role='Developer') AND public.current_user_has_developer_access() IS TRUE
 AND coalesce((SELECT bool_and(o.granted) FROM public.user_permission_overrides o
 WHERE o.user_id=auth.jwt()->>'sub' AND o.permission_flag='can_developer_data_correction' AND o.is_active),false);
$$;
REVOKE ALL ON FUNCTION public.current_user_can_correct_inventory_data() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_correct_inventory_data() TO authenticated;

-- Dedicated exception for this flag only; generic Developer override protection stays intact.
CREATE FUNCTION public.set_developer_data_correction(p_user_id text,p_enabled boolean,p_expected_enabled boolean,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.user_permissions; target public.user_permissions; prior boolean; saved public.user_permission_overrides;
BEGIN
 SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active AND role='Developer';
 IF actor.id IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN RAISE EXCEPTION 'Active Developer access is required' USING ERRCODE='42501'; END IF;
 IF p_enabled IS NULL OR p_expected_enabled IS NULL OR coalesce(length(btrim(p_reason)),0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Choose a state and enter a reason (1 to 500 characters)'; END IF;
 SELECT * INTO target FROM public.user_permissions WHERE clerk_user_id=p_user_id FOR UPDATE;
 IF target.id IS NULL THEN RAISE EXCEPTION 'User no longer exists'; END IF;
 IF p_enabled AND (target.role IS DISTINCT FROM 'Developer' OR target.is_active IS NOT TRUE OR coalesce((target.permission_overrides->>'can_access_developer')::boolean,true) IS NOT TRUE) THEN RAISE EXCEPTION 'Only active Developers with technical access can receive correction access' USING ERRCODE='42501'; END IF;
 SELECT coalesce(bool_and(granted),false) INTO prior FROM public.user_permission_overrides WHERE user_id=p_user_id AND permission_flag='can_developer_data_correction' AND is_active;
 IF prior IS DISTINCT FROM p_expected_enabled THEN RAISE EXCEPTION 'Correction access changed. Refresh permissions before saving.' USING ERRCODE='40001'; END IF;
 UPDATE public.user_permission_overrides SET is_active=false WHERE user_id=p_user_id AND permission_flag='can_developer_data_correction' AND is_active;
 INSERT INTO public.user_permission_overrides(user_id,permission_flag,granted,granted_by_user_id,reason)
 VALUES(p_user_id,'can_developer_data_correction',p_enabled,actor.clerk_user_id,btrim(p_reason)) RETURNING * INTO saved;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.clerk_user_id),'user_permission_overrides',saved.id::text,'permission_change',
 jsonb_build_object('affected_user_id',p_user_id,'can_developer_data_correction',prior),to_jsonb(saved),btrim(p_reason));
 RETURN jsonb_build_object('enabled',p_enabled,'user_id',p_user_id);
END $$;
REVOKE ALL ON FUNCTION public.set_developer_data_correction(text,boolean,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_developer_data_correction(text,boolean,boolean,text) TO authenticated;

CREATE FUNCTION public.read_retired_bin_assignments(p_bin_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE department text; BEGIN
 IF public.current_user_can_correct_inventory_data() IS NOT TRUE THEN RAISE EXCEPTION 'Developer Data Correction permission is required' USING ERRCODE='42501'; END IF;
 SELECT u.division INTO department FROM public.bins n JOIN public.bays b ON b.id=n.bay_id JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id WHERE n.id=p_bin_id;
 IF NOT FOUND OR public.current_user_can_edit_division(department,'can_manage_inventory') IS NOT TRUE THEN RAISE EXCEPTION 'Inventory management access to this department is required' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',bi.id,'material_code',i.material_code,'item_name',i.name,'archived_at',bi.archived_at,'archive_reason',bi.archive_reason,'quantity',bal.quantity) ORDER BY i.material_code,bi.id)
 FROM public.bin_items bi JOIN public.items i ON i.id=bi.item_id LEFT JOIN public.inventory_balances bal ON bal.bin_item_id=bi.id WHERE bi.bin_id=p_bin_id AND bi.archived_at IS NOT NULL),'[]');
END $$;
REVOKE ALL ON FUNCTION public.read_retired_bin_assignments(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_retired_bin_assignments(uuid) TO authenticated;

CREATE FUNCTION public.restore_retired_bin_assignment(p_bin_item_id uuid,p_expected_archived_at timestamptz,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.user_permissions; prior public.bin_items; saved public.bin_items; department text; active_location boolean; active_item boolean; cached numeric; ledger numeric; correction record;
BEGIN
 -- Hold actor/override state for this short transaction so revocation cannot be ignored.
 SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' FOR SHARE;
 LOCK TABLE public.user_permission_overrides IN SHARE MODE;
 IF public.current_user_can_correct_inventory_data() IS NOT TRUE THEN RAISE EXCEPTION 'Developer Data Correction permission is required' USING ERRCODE='42501'; END IF;
 IF coalesce(length(btrim(p_reason)),0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Enter a restoration reason (1 to 500 characters)'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location-lifecycle',0));
 PERFORM pg_advisory_xact_lock(hashtext(p_bin_item_id::text));
 SELECT * INTO prior FROM public.bin_items WHERE id=p_bin_item_id FOR UPDATE;
 IF prior.id IS NULL THEN RAISE EXCEPTION 'Material assignment no longer exists'; END IF;
 IF prior.archived_at IS NULL THEN RAISE EXCEPTION 'This assignment is already active. Refresh the bin; no restoration is needed.'; END IF;
 IF prior.archived_at IS DISTINCT FROM p_expected_archived_at THEN RAISE EXCEPTION 'Retirement changed. Refresh the bin before restoring.' USING ERRCODE='40001'; END IF;
 SELECT u.division,(n.archived_at IS NULL AND b.archived_at IS NULL AND s.archived_at IS NULL AND u.archived_at IS NULL)
 INTO department,active_location FROM public.bins n JOIN public.bays b ON b.id=n.bay_id JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id WHERE n.id=prior.bin_id FOR SHARE OF n,b,s,u;
 IF active_location IS NOT TRUE THEN RAISE EXCEPTION 'Restore the storage location and its parents first'; END IF;
 IF public.current_user_can_edit_division(department,'can_manage_inventory') IS NOT TRUE THEN RAISE EXCEPTION 'Inventory management access to this department is required' USING ERRCODE='42501'; END IF;
 SELECT is_active AND NOT is_archived INTO active_item FROM public.items WHERE id=prior.item_id FOR SHARE;
 IF active_item IS NOT TRUE THEN RAISE EXCEPTION 'The catalogue material is inactive. Review it before restoring this assignment.'; END IF;
 -- Preserve stock: check both the canonical ledger and its cached balance; never rewrite either.
 LOCK TABLE public.transaction_items IN SHARE MODE;
 SELECT quantity INTO cached FROM public.inventory_balances WHERE bin_item_id=prior.id FOR SHARE;
 IF cached IS NULL OR cached<>0 THEN RAISE EXCEPTION 'A recorded zero balance is required. Review inventory history; restoration never resets stock.'; END IF;
 IF EXISTS(SELECT 1 FROM public.transaction_items WHERE bin_item_id=prior.id AND (status IS NULL OR status NOT IN ('approved','rejected','cancelled'))) THEN RAISE EXCEPTION 'Unresolved inventory transactions require review before restoration'; END IF;
 SELECT ledger_sequence,occurred_at,target_quantity INTO correction FROM public.transaction_items
 WHERE bin_item_id=prior.id AND status='approved' AND transaction_type='physical_count_correction' AND target_quantity IS NOT NULL ORDER BY occurred_at DESC,ledger_sequence DESC LIMIT 1;
 SELECT coalesce(correction.target_quantity,0)+coalesce(sum(CASE
 WHEN transaction_type IN ('add_stock','return_from_job','return_from_vehicle') THEN quantity
 WHEN transaction_type IN ('remove_stock','assign_to_job','assign_to_vehicle','scrap','vendor_return','mark_damaged') THEN -quantity ELSE 0 END),0) INTO ledger
 FROM public.transaction_items WHERE bin_item_id=prior.id AND status='approved' AND transaction_type<>'physical_count_correction'
 AND (correction.ledger_sequence IS NULL OR (occurred_at,ledger_sequence)>(correction.occurred_at,correction.ledger_sequence));
 IF ledger<>0 THEN RAISE EXCEPTION 'Inventory ledger is not zero. Review the discrepancy before restoration.'; END IF;
 UPDATE public.bin_items SET archived_at=null,archived_by=null,archive_reason=null WHERE id=prior.id RETURNING * INTO saved;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.clerk_user_id),'bin_items',prior.id::text,'restore',to_jsonb(prior),
 to_jsonb(saved)||jsonb_build_object('operation','developer_restore_bin_assignment','quantity_unchanged',cached),btrim(p_reason));
 RETURN jsonb_build_object('id',saved.id,'bin_id',saved.bin_id,'restored',true,'quantity_unchanged',cached);
END $$;
REVOKE ALL ON FUNCTION public.restore_retired_bin_assignment(uuid,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_retired_bin_assignment(uuid,timestamptz,text) TO authenticated;
NOTIFY pgrst,'reload schema';
