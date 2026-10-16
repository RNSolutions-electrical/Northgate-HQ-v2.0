-- Ryan accepted Staging 3a23a6a and authorized this bounded Production release.
-- Exact reviewed archive/restore + standalone source follows the fail-closed guard.
-- No estimate, snapshot, Job, CO, permission or personal-copy data updates.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.estimates IN SHARE ROW EXCLUSIVE MODE;
DO $production_preflight$
BEGIN
 IF to_regclass('public.estimate_review_requests') IS NOT NULL
 OR to_regprocedure('public.restore_estimate(uuid,timestamptz)') IS NOT NULL THEN
  RAISE EXCEPTION 'Estimate lifecycle is already installed or partially present; reconcile first';
 END IF;
 IF md5(pg_get_functiondef('public.guard_workbench_header()'::regprocedure))<>'34af2b33289b63abc271ee75dbb88a68'
 OR md5(pg_get_functiondef('public.submit_estimate_for_review_v2(uuid,integer,text,uuid,jsonb,text,jsonb,jsonb)'::regprocedure))<>'4fd3824f4b5ab2843ae60f646e85d8b3'
 OR md5(pg_get_functiondef('public.archive_estimate(uuid,text)'::regprocedure))<>'c2a909f11e4b4aeb55c2b930a94ecd94' THEN
  RAISE EXCEPTION 'Production lifecycle function drift; preserve current definitions and re-review';
 END IF;
 IF md5(pg_get_functiondef('public.set_contract_adjustment_status(uuid,text,text,timestamptz)'::regprocedure))<>'0099a2e4e5dcdb037af6fd69602a336b'
 OR md5(pg_get_functiondef('public.apply_v5_estimate_promotion(uuid,integer,text,text)'::regprocedure))<>'71bbbcef4ee5f7bffddccf9fa6ee5385'
 OR md5(pg_get_functiondef('public.workbench_handoff_pricing(jsonb)'::regprocedure))<>'ce3bc1adc014248106252263420fff39'
 OR md5(pg_get_functiondef('public.approve_workbench_estimate_internal(uuid,text)'::regprocedure))<>'b9860bd3229bf5fa8fef7d7be71a9a3c' THEN
  RAISE EXCEPTION 'Accepted CO/promotion/proposal-charge dependency drift';
 END IF;
END $production_preflight$;

-- BEGIN exact 20261015171453_estimate_lifecycle_archive_restore.sql
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

-- END archive/restore; BEGIN exact 20261016110350_standalone_estimate_review_v080.sql
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Local candidate only. Official estimate review is separate from destination handoff.
-- Fix the existing job-handoff retry aggregate without changing allocation math.
DO $$
DECLARE definition text:=pg_get_functiondef('public.submit_estimate_for_review_v2(uuid,integer,text,uuid,jsonb,text,jsonb,jsonb)'::regprocedure);
 anchor text:=E'SELECT count(*),COALESCE(sum(amount),0) INTO allocation_count,posted_total\n  FROM public.estimate_handoff_financial_allocations WHERE handoff_id=saved.id;';
 replacement text:=E'SELECT count(*),COALESCE(sum(allocation.amount),0) INTO allocation_count,posted_total\n  FROM public.estimate_handoff_financial_allocations allocation WHERE allocation.handoff_id=saved.id;';
BEGIN
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Unexpected financial handoff mapper; reconcile its aggregate before migration'; END IF;
 EXECUTE replace(definition,anchor,replacement);
END $$;

CREATE TABLE public.estimate_review_requests (
 id uuid PRIMARY KEY,
 estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE RESTRICT,
 source_revision integer NOT NULL CHECK(source_revision>0),
 source_document jsonb NOT NULL CHECK(jsonb_typeof(source_document)='object'),
 source_hash text NOT NULL,
 submitted_by text NOT NULL,
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 submission_note text NOT NULL CHECK(length(btrim(submission_note)) BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','returned')),
 decided_by text, decided_at timestamptz, decision_note text,
 approved_snapshot_id uuid REFERENCES public.estimate_snapshots(id) ON DELETE RESTRICT,
 CHECK((status='pending' AND decided_by IS NULL AND decided_at IS NULL AND decision_note IS NULL AND approved_snapshot_id IS NULL)
   OR (status<>'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_note IS NOT NULL AND length(btrim(decision_note)) BETWEEN 1 AND 1000
     AND ((status='approved' AND approved_snapshot_id IS NOT NULL) OR (status='returned' AND approved_snapshot_id IS NULL))))
);
CREATE UNIQUE INDEX estimate_review_one_pending ON public.estimate_review_requests(estimate_id) WHERE status='pending';
CREATE INDEX estimate_review_history ON public.estimate_review_requests(estimate_id,submitted_at DESC);
CREATE INDEX estimate_review_queue ON public.estimate_review_requests(submitted_at,id) WHERE status='pending';
ALTER TABLE public.estimate_review_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.estimate_review_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.estimate_review_requests TO authenticated;
CREATE POLICY estimate_review_read ON public.estimate_review_requests FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.estimates e WHERE e.id=estimate_id AND
  (public.current_user_can_read_division(e.division,'can_estimate') OR public.current_user_can_read_division(e.division,'can_approve_estimates'))));

CREATE FUNCTION public.guard_estimate_review_request() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'pending'
  OR nullif(current_setting('northgate.estimate_review_decision',true),'') IS DISTINCT FROM OLD.id::text
  OR (to_jsonb(NEW)-ARRAY['status','decided_by','decided_at','decision_note','approved_snapshot_id'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','decided_by','decided_at','decision_note','approved_snapshot_id']) THEN
  RAISE EXCEPTION 'Estimate review sources and completed decisions are immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_estimate_review_request() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_estimate_review_request BEFORE UPDATE OR DELETE ON public.estimate_review_requests
 FOR EACH ROW EXECUTE FUNCTION public.guard_estimate_review_request();

CREATE FUNCTION public.submit_standalone_estimate_review(p_request_id uuid,p_estimate_id uuid,p_expected_revision integer,p_reason text)
RETURNS public.estimate_review_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=nullif(btrim(auth.jwt()->>'sub'),''); e public.estimates; w public.estimate_workbenches;
 r public.estimate_review_requests; note text:=nullif(btrim(p_reason),''); previous text:=current_setting('northgate.workbench_approval',true);
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=actor AND is_active)
 THEN RAISE EXCEPTION 'Active signed-in user required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR note IS NULL OR length(note)>1000
 THEN RAISE EXCEPTION 'Request id, saved revision and a reason of 1 to 1000 characters are required' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM public.estimates WHERE id=p_estimate_id AND editor_version=2 AND archived_at IS NULL FOR UPDATE;
 IF e.id IS NULL OR public.current_user_can_edit_division(e.division,'can_estimate') IS NOT TRUE
 THEN RAISE EXCEPTION 'Estimate editing permission required' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.estimate_review_requests WHERE id=p_request_id;
 IF r.id IS NOT NULL THEN
  IF r.estimate_id IS DISTINCT FROM e.id OR r.source_revision IS DISTINCT FROM p_expected_revision
   OR r.submitted_by IS DISTINCT FROM actor OR r.submission_note IS DISTINCT FROM note
  THEN RAISE EXCEPTION 'Request id was used for a different submission' USING ERRCODE='PT409'; END IF;
  RETURN r;
 END IF;
 SELECT * INTO w FROM public.estimate_workbenches WHERE estimate_id=e.id FOR UPDATE;
 IF w.estimate_id IS NULL OR w.revision IS DISTINCT FROM p_expected_revision
 THEN RAISE EXCEPTION 'Estimate changed; save or reopen before submitting' USING ERRCODE='PT409'; END IF;
 SELECT * INTO r FROM public.estimate_review_requests WHERE estimate_id=e.id AND status='pending';
 IF r.id IS NOT NULL THEN
  IF r.source_revision=w.revision AND r.source_document=w.document AND r.submitted_by=actor AND r.submission_note=note THEN RETURN r; END IF;
  RAISE EXCEPTION 'This estimate is already submitted for review' USING ERRCODE='PT409';
 END IF;
 IF e.status<>'draft' THEN RAISE EXCEPTION 'An editable draft is required for review' USING ERRCODE='42501'; END IF;
 PERFORM public.validate_workbench_structure(w.document,true);
 -- Validate priced scope without invoking the destination-only proposal-charge guard.
 -- The immutable request retains the complete original document and charge rates.
 IF jsonb_array_length(public.workbench_handoff_pricing(jsonb_set(w.document,'{proposal}',coalesce(w.document->'proposal','{}'::jsonb)||'{"salesTaxPercent":0,"creditCardPercent":0}'::jsonb))->'lines')=0
 THEN RAISE EXCEPTION 'Add at least one priced item before submitting' USING ERRCODE='22023'; END IF;
 PERFORM public.workbench_finalization_snapshot(w.document);
 INSERT INTO public.estimate_review_requests(id,estimate_id,source_revision,source_document,source_hash,submitted_by,submission_note)
 VALUES(p_request_id,e.id,w.revision,w.document,md5(w.document::text),actor,note) RETURNING * INTO r;
 PERFORM set_config('northgate.workbench_approval','yes',true);
 UPDATE public.estimates SET status='submitted',submitted_at=clock_timestamp() WHERE id=e.id;
 PERFORM set_config('northgate.workbench_approval',coalesce(previous,''),true);
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,public.change_order_actor(),'estimate_review_requests',r.id::text,'create',to_jsonb(e),
  jsonb_build_object('estimate_id',e.id,'source_revision',w.revision,'source_hash',r.source_hash,'status','submitted'),note);
 RETURN r;
EXCEPTION WHEN OTHERS THEN PERFORM set_config('northgate.workbench_approval',coalesce(previous,''),true);RAISE;
END $$;

CREATE FUNCTION public.read_standalone_estimate_reviews(p_limit integer DEFAULT 100)
RETURNS TABLE(destination_id uuid,destination_version integer,payload_hash text,submitted_at timestamptz,
 submitted_by text,submitted_by_name text,shared_reason text,target_division text,estimate_name text,customer_name text,
 destination_key text,task_type text,proposed_payload jsonb,estimate_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT r.id,r.source_revision,r.source_hash,r.submitted_at,r.submitted_by,
  coalesce(nullif(u.display_name,''),nullif(u.email,''),r.submitted_by),r.submission_note,e.division,
  r.source_document->>'name',r.source_document->>'customer','standalone_estimate','Estimate approval',r.source_document,e.id
 FROM public.estimate_review_requests r JOIN public.estimates e ON e.id=r.estimate_id
 LEFT JOIN public.user_permissions u ON u.clerk_user_id=r.submitted_by
 WHERE r.status='pending' AND e.status='submitted' AND e.archived_at IS NULL
  AND public.current_user_can_edit_division(e.division,'can_approve_estimates') IS TRUE
 ORDER BY r.submitted_at,r.id LIMIT least(greatest(coalesce(p_limit,100),1),200)
$$;

CREATE FUNCTION public.review_standalone_estimate(p_request_id uuid,p_expected_revision integer,p_expected_hash text,p_decision text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=nullif(btrim(auth.jwt()->>'sub'),''); e public.estimates; w public.estimate_workbenches;
 r public.estimate_review_requests; snapshot_id uuid; note text:=nullif(btrim(p_note),''); estimate_id_value uuid;
 previous text:=current_setting('northgate.workbench_approval',true); previous_decision text:=current_setting('northgate.estimate_review_decision',true);
 desired_status text:=CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'return' THEN 'returned' END;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=actor AND is_active)
 THEN RAISE EXCEPTION 'Active signed-in reviewer required' USING ERRCODE='42501'; END IF;
 IF note IS NULL OR length(note)>1000 OR desired_status IS NULL THEN RAISE EXCEPTION 'Choose approve or return and enter a review note of 1 to 1000 characters' USING ERRCODE='22023'; END IF;
 SELECT estimate_id INTO estimate_id_value FROM public.estimate_review_requests WHERE id=p_request_id;
 -- Consistent lock order with submit and save: header, workbench, request.
 SELECT * INTO e FROM public.estimates WHERE id=estimate_id_value AND archived_at IS NULL FOR UPDATE;
 IF e.id IS NULL OR public.current_user_can_edit_division(e.division,'can_approve_estimates') IS NOT TRUE
 THEN RAISE EXCEPTION 'Estimate approval permission required' USING ERRCODE='42501'; END IF;
 SELECT * INTO w FROM public.estimate_workbenches WHERE estimate_id=e.id FOR UPDATE;
 SELECT * INTO r FROM public.estimate_review_requests WHERE id=p_request_id FOR UPDATE;
 IF r.source_revision IS DISTINCT FROM p_expected_revision OR r.source_hash IS DISTINCT FROM p_expected_hash
 THEN RAISE EXCEPTION 'Reviewed submission changed; reload before deciding' USING ERRCODE='PT409'; END IF;
 IF r.status<>'pending' THEN
  IF r.status=desired_status AND r.decision_note=note THEN RETURN to_jsonb(r)||jsonb_build_object('idempotent',true); END IF;
  RAISE EXCEPTION 'This review has already been decided' USING ERRCODE='PT409';
 END IF;
 IF e.editor_version<>2 OR e.status<>'submitted' OR w.revision IS DISTINCT FROM r.source_revision OR w.document IS DISTINCT FROM r.source_document
 THEN RAISE EXCEPTION 'The estimate no longer matches its submitted scope' USING ERRCODE='PT409'; END IF;
 PERFORM set_config('northgate.workbench_approval','yes',true);
 -- Existing approval engine accepts drafts. This transition is transaction-local;
 -- the header remains locked until approval/snapshot/audit all commit together.
 UPDATE public.estimates SET status='draft' WHERE id=e.id;
 IF p_decision='approve' THEN snapshot_id:=public.approve_workbench_estimate(e.id,note); END IF;
 PERFORM set_config('northgate.estimate_review_decision',r.id::text,true);
 UPDATE public.estimate_review_requests SET status=desired_status,decided_by=actor,decided_at=clock_timestamp(),
  decision_note=note,approved_snapshot_id=snapshot_id WHERE id=r.id RETURNING * INTO r;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,public.change_order_actor(),'estimate_review_requests',r.id::text,'update',
  jsonb_build_object('status','pending','estimate_id',e.id,'source_revision',r.source_revision),
  to_jsonb(r)-'source_document',note);
 PERFORM set_config('northgate.workbench_approval',coalesce(previous,''),true);
 PERFORM set_config('northgate.estimate_review_decision',coalesce(previous_decision,''),true);
 RETURN to_jsonb(r)||jsonb_build_object('idempotent',false);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('northgate.workbench_approval',coalesce(previous,''),true);
 PERFORM set_config('northgate.estimate_review_decision',coalesce(previous_decision,''),true);RAISE;
END $$;

CREATE FUNCTION public.handoff_estimate_to_destination(p_estimate_id uuid,p_expected_revision integer,p_destination text,
 p_job_id uuid,p_new_job jsonb,p_co_number text,p_line_targets jsonb,p_financial_targets jsonb DEFAULT '{}'::jsonb)
RETURNS public.estimate_workflow_handoffs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.estimates; w public.estimate_workbenches; s public.estimate_snapshots;
BEGIN
 IF nullif(btrim(auth.jwt()->>'sub'),'') IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.estimates WHERE id=p_estimate_id AND editor_version=2 AND archived_at IS NULL FOR UPDATE;
 IF e.id IS NULL OR public.current_user_can_edit_division(e.division,'can_estimate') IS NOT TRUE THEN RAISE EXCEPTION 'Estimate editing permission required' USING ERRCODE='42501'; END IF;
 -- Existing destination edits remain authoritative, including historical handoffs.
 IF NOT EXISTS(SELECT 1 FROM public.estimate_workflow_handoffs WHERE estimate_id=e.id) AND e.status='approved' THEN
  SELECT * INTO w FROM public.estimate_workbenches WHERE estimate_id=e.id FOR UPDATE;
  SELECT * INTO s FROM public.estimate_snapshots WHERE estimate_id=e.id AND locked ORDER BY approved_at DESC,id DESC LIMIT 1;
  IF s.workbench_document IS NULL OR (s.workbench_document-ARRAY['approvedAt','finalizationChecklist','proposalChargeSnapshot'])
     IS DISTINCT FROM (w.document-ARRAY['approvedAt','finalizationChecklist','proposalChargeSnapshot']) THEN
   RAISE EXCEPTION 'Approved scope does not match the saved estimate; reopen its snapshot or create a reviewed revision before handoff' USING ERRCODE='PT409';
  END IF;
 END IF;
 RETURN public.submit_estimate_for_review_v2(p_estimate_id,p_expected_revision,p_destination,p_job_id,p_new_job,p_co_number,p_line_targets,p_financial_targets);
END $$;

-- Archive and review share the estimate-header lock. Do not hide a pending review
-- through either the new directory action or an older editor's archive RPC.
CREATE FUNCTION public.guard_pending_standalone_estimate_archive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.estimate_review_requests WHERE estimate_id=OLD.id AND status='pending') THEN
  RAISE EXCEPTION 'Resolve pending estimate review before archiving' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_pending_standalone_estimate_archive() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_pending_standalone_estimate_archive BEFORE UPDATE ON public.estimates
FOR EACH ROW EXECUTE FUNCTION public.guard_pending_standalone_estimate_archive();

REVOKE ALL ON FUNCTION public.submit_standalone_estimate_review(uuid,uuid,integer,text),public.read_standalone_estimate_reviews(integer),
 public.review_standalone_estimate(uuid,integer,text,text,text),public.handoff_estimate_to_destination(uuid,integer,text,uuid,jsonb,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_standalone_estimate_review(uuid,uuid,integer,text),public.read_standalone_estimate_reviews(integer),
 public.review_standalone_estimate(uuid,integer,text,text,text),public.handoff_estimate_to_destination(uuid,integer,text,uuid,jsonb,text,jsonb,jsonb) TO authenticated;
COMMENT ON TABLE public.estimate_review_requests IS 'Immutable saved estimate review scopes and decisions; no job/service-call dependency. Existing approval snapshots and destination handoffs remain separate.';
NOTIFY pgrst,'reload schema';
