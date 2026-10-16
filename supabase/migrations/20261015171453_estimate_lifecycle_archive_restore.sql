SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Unapplied lifecycle extension. Personal archive is independent of promotion.
-- Keep workflow status/version/hash intact: they identify immutable submissions.
CREATE FUNCTION public.set_personal_estimate_archived(p_id uuid,p_expected_version integer,p_expected_updated_at timestamptz,p_archived boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor text:=auth.jwt()->>'sub'; target public.v5_working_copies%ROWTYPE; prior jsonb;
BEGIN
 IF nullif(actor,'') IS NULL OR NOT coalesce((public.current_scoped_authorization_decision('V3-006','{}')->>'allowed')::boolean,false) THEN
  RAISE EXCEPTION 'Personal work access required' USING ERRCODE='42501';
 END IF;
 IF p_archived IS NULL THEN RAISE EXCEPTION 'Archive state required' USING ERRCODE='22023'; END IF;
 SELECT * INTO target FROM public.v5_working_copies WHERE id=p_id AND owner_user_id=actor
 AND module_key='estimating' AND work_type='estimate' FOR UPDATE;
 IF target.id IS NULL THEN RAISE EXCEPTION 'Personal estimate not found' USING ERRCODE='P0002'; END IF;
 IF target.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Estimate changed; refresh first' USING ERRCODE='PT409'; END IF;
 IF (target.archived_at IS NOT NULL)=p_archived THEN RETURN; END IF;
 IF target.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Estimate changed; refresh first' USING ERRCODE='PT409'; END IF;
 -- Pending review must be resolved first; do not strand reviewer work or cancel it.
 IF target.status='submitted' OR EXISTS(SELECT 1 FROM public.v5_change_sets s
 JOIN public.v5_change_set_destinations d ON d.change_set_id=s.id
 WHERE s.working_copy_id=target.id AND d.status='pending') THEN
  RAISE EXCEPTION 'Resolve pending review before archiving this personal estimate' USING ERRCODE='55000';
 END IF;
 prior:=to_jsonb(target);
 UPDATE public.v5_working_copies SET archived_at=CASE WHEN p_archived THEN now() ELSE NULL END,updated_at=now()
 WHERE id=target.id RETURNING * INTO target;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,actor,'v5_working_copies',target.id::text,CASE WHEN p_archived THEN 'archive' ELSE 'update' END,
 prior,to_jsonb(target),CASE WHEN p_archived THEN 'Personal estimate archived; official records unchanged.' ELSE 'Personal estimate restored; official records unchanged.' END);
END $$;

-- An old browser must not edit or submit an archived draft through existing RPCs.
CREATE FUNCTION public.guard_archived_personal_estimate() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.module_key='estimating' AND OLD.work_type='estimate' AND OLD.archived_at IS NOT NULL
 AND (to_jsonb(NEW)-ARRAY['archived_at','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['archived_at','updated_at']) THEN
  RAISE EXCEPTION 'Restore this personal estimate before changing it' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_archived_personal_estimate BEFORE UPDATE ON public.v5_working_copies
FOR EACH ROW EXECUTE FUNCTION public.guard_archived_personal_estimate();

CREATE FUNCTION public.read_personal_estimate_directory(p_archived boolean DEFAULT false)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT to_jsonb(c)||jsonb_build_object('promotion',(
  SELECT jsonb_build_object('state',CASE
   WHEN e.id IS NULL OR (public.current_user_can_read_division(e.division,'can_estimate') OR public.current_user_can_read_division(e.division,'can_approve_estimates')) IS NOT TRUE THEN 'unavailable'
   WHEN e.archived_at IS NOT NULL THEN 'archived'
   WHEN w.estimate_id IS NULL THEN 'unavailable' ELSE 'active' END,
   'estimate_id',CASE WHEN public.current_user_can_read_division(e.division,'can_estimate') OR public.current_user_can_read_division(e.division,'can_approve_estimates') THEN e.id ELSE NULL END,
   'division',CASE WHEN public.current_user_can_read_division(e.division,'can_estimate') OR public.current_user_can_read_division(e.division,'can_approve_estimates') THEN e.division ELSE NULL END)
  FROM public.v5_change_sets s JOIN public.v5_change_set_destinations d ON d.change_set_id=s.id
  LEFT JOIN public.estimates e ON e.id::text=d.applied_record->>'estimate_id'
  LEFT JOIN public.estimate_workbenches w ON w.estimate_id=e.id
  WHERE s.working_copy_id=c.id AND d.destination_key='official_estimate' AND d.status='applied'
  ORDER BY d.applied_at DESC LIMIT 1))
 FROM public.v5_working_copies c WHERE c.owner_user_id=auth.jwt()->>'sub'
 AND coalesce((public.current_scoped_authorization_decision('V3-006','{}')->>'allowed')::boolean,false)
 AND c.module_key='estimating' AND c.work_type='estimate' AND (c.archived_at IS NOT NULL)=p_archived
 ORDER BY c.updated_at DESC LIMIT 200
$$;

-- Archived headers remain hidden by existing RLS. Use a narrow scoped directory,
-- rather than relaxing active estimate/workbench policies or exposing documents.
CREATE FUNCTION public.read_archived_estimate_directory(p_division text)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('estimate_id',e.id,'updated_at',e.updated_at,'archived_at',e.archived_at,
 'document',jsonb_build_object('name',e.title,'customer',e.customer_name),
 'estimates',jsonb_build_object('division',e.division,'status',e.status,'version_number',e.version_number))
 FROM public.estimates e WHERE e.division=p_division AND e.archived_at IS NOT NULL
 AND public.current_user_can_edit_division(e.division,'can_estimate')
 AND EXISTS(SELECT 1 FROM public.user_permissions u WHERE u.clerk_user_id=auth.jwt()->>'sub' AND u.is_active
 AND coalesce((public.effective_permissions_for_user(u.role,u.division,u.permission_overrides)->>'can_archive_records')::boolean,false))
 ORDER BY e.archived_at DESC LIMIT 200
$$;

CREATE FUNCTION public.restore_estimate(p_estimate_id uuid,p_expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor text:=auth.jwt()->>'sub'; target public.estimates%ROWTYPE; prior jsonb; previous_status text;
 previous_context text:=current_setting('northgate.workbench_restore',true);
BEGIN
 SELECT * INTO target FROM public.estimates WHERE id=p_estimate_id FOR UPDATE;
 IF target.id IS NULL THEN RAISE EXCEPTION 'Estimate not found' USING ERRCODE='P0002'; END IF;
 IF nullif(actor,'') IS NULL OR public.current_user_can_edit_division(target.division,'can_estimate') IS NOT TRUE OR NOT EXISTS(
 SELECT 1 FROM public.user_permissions u WHERE u.clerk_user_id=actor AND u.is_active
 AND coalesce((public.effective_permissions_for_user(u.role,u.division,u.permission_overrides)->>'can_archive_records')::boolean,false)) THEN
  RAISE EXCEPTION 'Estimate edit scope and archive permission required' USING ERRCODE='42501';
 END IF;
 IF target.archived_at IS NULL THEN RETURN; END IF;
 IF target.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Estimate changed; refresh first' USING ERRCODE='PT409'; END IF;
 -- Restore exact pre-archive state, including approved/submitted. Never invent draft.
 SELECT l.before_data->>'status' INTO previous_status FROM public.change_logs l WHERE l.table_name='estimates'
 AND l.record_id=target.id::text AND l.action='archive'
 AND (l.after_data->>'archived_at')::timestamptz=target.archived_at ORDER BY l.created_at DESC LIMIT 1;
 IF previous_status IS NULL OR previous_status='archived' THEN
  RAISE EXCEPTION 'Original estimate state unavailable; administrator review required' USING ERRCODE='55000';
 END IF;
 prior:=to_jsonb(target);
 PERFORM set_config('northgate.workbench_restore',target.id::text,true);
 UPDATE public.estimates SET archived_at=NULL,archived_by=NULL,archive_reason=NULL,status=previous_status WHERE id=target.id RETURNING * INTO target;
 PERFORM set_config('northgate.workbench_restore',coalesce(previous_context,''),true);
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,actor,'estimates',target.id::text,'update',prior,to_jsonb(target),'Official estimate restored to its pre-archive state; personal sources unchanged.');
END $$;

CREATE FUNCTION public.set_official_estimate_archived(p_id uuid,p_expected_updated_at timestamptz,p_archived boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target public.estimates%ROWTYPE; actor text:=auth.jwt()->>'sub';
BEGIN
 SELECT * INTO target FROM public.estimates WHERE id=p_id FOR UPDATE;
 IF target.id IS NULL THEN RAISE EXCEPTION 'Estimate not found' USING ERRCODE='P0002'; END IF;
 IF nullif(actor,'') IS NULL OR public.current_user_can_edit_division(target.division,'can_estimate') IS NOT TRUE
 OR NOT EXISTS(SELECT 1 FROM public.user_permissions u WHERE u.clerk_user_id=actor AND u.is_active
 AND coalesce((public.effective_permissions_for_user(u.role,u.division,u.permission_overrides)->>'can_archive_records')::boolean,false)) THEN
  RAISE EXCEPTION 'Estimate edit scope and archive permission required' USING ERRCODE='42501';
 END IF;
 IF p_archived IS NULL THEN RAISE EXCEPTION 'Archive state required' USING ERRCODE='22023'; END IF;
 IF (target.archived_at IS NOT NULL)=p_archived THEN RETURN; END IF;
 IF target.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Estimate changed; refresh first' USING ERRCODE='PT409'; END IF;
 IF p_archived THEN PERFORM public.archive_estimate(p_id,NULL);
 ELSE PERFORM public.restore_estimate(p_id,p_expected_updated_at); END IF;
END $$;

-- Extend the existing strict header guard with an equally narrow restore branch.
DO $patch$
DECLARE definition text:=pg_get_functiondef('public.guard_workbench_header()'::regprocedure);
 anchor text:='  IF NEW.editor_version = 2';
BEGIN
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Workbench guard changed; review restore integration'; END IF;
 definition:=overlay(definition placing $branch$
  IF TG_OP='UPDATE' AND OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL
     AND nullif(current_setting('northgate.workbench_restore',true),'')=OLD.id::text
     AND NEW.archived_by IS NULL AND NEW.archive_reason IS NULL AND NEW.status<>'archived'
     AND (to_jsonb(NEW)-ARRAY['archived_at','archived_by','archive_reason','status','updated_at'])
       IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['archived_at','archived_by','archive_reason','status','updated_at']) THEN
    RETURN NEW;
  END IF;
$branch$ from position(anchor IN definition) for 0);
 EXECUTE definition;
END $patch$;

REVOKE ALL ON FUNCTION public.set_personal_estimate_archived(uuid,integer,timestamptz,boolean),public.guard_archived_personal_estimate(),
 public.read_personal_estimate_directory(boolean),public.read_archived_estimate_directory(text),public.restore_estimate(uuid,timestamptz),public.set_official_estimate_archived(uuid,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_personal_estimate_archived(uuid,integer,timestamptz,boolean),public.read_personal_estimate_directory(boolean),
 public.read_archived_estimate_directory(text),public.restore_estimate(uuid,timestamptz),public.set_official_estimate_archived(uuid,timestamptz,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
