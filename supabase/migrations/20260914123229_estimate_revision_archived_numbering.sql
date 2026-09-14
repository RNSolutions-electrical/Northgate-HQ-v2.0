CREATE OR REPLACE FUNCTION public.create_workbench_revision(p_estimate_id uuid,p_source_snapshot_id uuid,p_reason text)
RETURNS public.estimate_workbenches LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 source public.estimates; snapshot public.estimate_snapshots; saved public.estimate_workbenches;
 root_id uuid; next_version integer; doc jsonb; conflict_constraint text;
 prior_save text:=current_setting('northgate.workbench_save',true);
 prior_revision text:=current_setting('northgate.workbench_revision',true);
BEGIN
 IF auth.jwt()->>'sub' IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='28000'; END IF;
 IF NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Enter a revision reason' USING ERRCODE='22023'; END IF;
 SELECT * INTO source FROM public.estimates WHERE id=p_estimate_id AND editor_version=2 AND status='approved' AND archived_at IS NULL;
 IF source.id IS NULL OR public.current_user_can_edit_division(source.division,'can_estimate') IS NOT TRUE THEN
  RAISE EXCEPTION 'An approved estimate and estimate editing permission are required' USING ERRCODE='42501';
 END IF;
 root_id:=COALESCE(source.revision_root_id,source.id);
 -- Serializes all branches of one estimate family, including retries/concurrent requests.
 PERFORM 1 FROM public.estimates WHERE id=root_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'The original estimate is unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO snapshot FROM public.estimate_snapshots
 WHERE id=p_source_snapshot_id AND estimate_id=source.id AND locked AND workbench_document IS NOT NULL;
 IF snapshot.id IS NULL THEN RAISE EXCEPTION 'Select the approved snapshot for this estimate' USING ERRCODE='22023'; END IF;
 SELECT w.* INTO saved FROM public.estimate_workbenches w JOIN public.estimates e ON e.id=w.estimate_id
 WHERE e.source_snapshot_id=snapshot.id AND e.status='draft' AND e.archived_at IS NULL ORDER BY e.version_number DESC LIMIT 1;
 IF saved.estimate_id IS NOT NULL THEN RETURN saved; END IF;
 SELECT COALESCE(max(version_number),1)+1 INTO next_version FROM public.estimates WHERE id=root_id OR revision_root_id=root_id;
 LOOP
 BEGIN
 doc:=jsonb_set(snapshot.workbench_document,'{approvedAt}','null'::jsonb)
   ||jsonb_build_object('revisionContext',jsonb_build_object('version',next_version,'sourceEstimateId',source.id,'sourceSnapshotId',snapshot.id,'reason',btrim(p_reason)));
 saved:=public.save_estimate_workbench(NULL,source.division,doc,NULL,'[]');
 PERFORM set_config('northgate.workbench_save','yes',true);
 PERFORM set_config('northgate.workbench_revision','yes',true);
 UPDATE public.estimates SET version_number=next_version,revision_of=source.id,revision_root_id=root_id,source_snapshot_id=snapshot.id WHERE id=saved.estimate_id;
 EXIT;
 EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS conflict_constraint=CONSTRAINT_NAME;
  IF conflict_constraint<>'estimates_root_version_unique' THEN RAISE; END IF;
  -- RLS may hide archived descendants. Let the unique index reserve their numbers
  -- without exposing archived data or bypassing RLS. The failed attempt (including
  -- its draft/save audit) rolls back in this subtransaction before retrying.
  next_version:=next_version+1;
 END;
 END LOOP;
 PERFORM set_config('northgate.workbench_revision',COALESCE(prior_revision,''),true);
 PERFORM set_config('northgate.workbench_save',COALESCE(prior_save,''),true);
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.create_workbench_revision(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_workbench_revision(uuid,uuid,text) TO authenticated;
