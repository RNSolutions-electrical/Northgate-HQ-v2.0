-- Business versions are separate from estimate_workbenches.revision (optimistic save counter).
ALTER TABLE public.estimates
 ADD COLUMN version_number integer NOT NULL DEFAULT 1 CHECK (version_number>0),
 ADD COLUMN revision_of uuid REFERENCES public.estimates(id),
 ADD COLUMN revision_root_id uuid REFERENCES public.estimates(id),
 ADD COLUMN source_snapshot_id uuid REFERENCES public.estimate_snapshots(id),
 ADD CONSTRAINT estimate_revision_lineage_check CHECK (
  (version_number=1 AND revision_of IS NULL AND revision_root_id IS NULL AND source_snapshot_id IS NULL)
  OR (version_number>1 AND revision_of IS NOT NULL AND revision_root_id IS NOT NULL AND source_snapshot_id IS NOT NULL AND revision_of<>id AND revision_root_id<>id));
CREATE UNIQUE INDEX estimates_root_version_unique ON public.estimates(revision_root_id,version_number) WHERE revision_root_id IS NOT NULL;
CREATE INDEX estimates_revision_parent_idx ON public.estimates(revision_of);
CREATE INDEX estimates_revision_snapshot_idx ON public.estimates(source_snapshot_id);

CREATE FUNCTION public.guard_estimate_revision_lineage()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (NEW.version_number,NEW.revision_of,NEW.revision_root_id,NEW.source_snapshot_id)
     IS NOT DISTINCT FROM (OLD.version_number,OLD.revision_of,OLD.revision_root_id,OLD.source_snapshot_id) THEN RETURN NEW; END IF;
  IF OLD.version_number<>1 OR OLD.revision_of IS NOT NULL THEN
   RAISE EXCEPTION 'Estimate version links are immutable' USING ERRCODE='42501';
  END IF;
 ELSIF NEW.version_number=1 AND NEW.revision_of IS NULL AND NEW.revision_root_id IS NULL AND NEW.source_snapshot_id IS NULL THEN
  RETURN NEW;
 END IF;
 IF COALESCE(current_setting('northgate.workbench_revision',true),'')<>'yes' THEN
  RAISE EXCEPTION 'Use Create editable revision to establish estimate version links' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_estimate_revision_lineage() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_estimate_revision_lineage BEFORE INSERT OR UPDATE ON public.estimates
 FOR EACH ROW EXECUTE FUNCTION public.guard_estimate_revision_lineage();

CREATE FUNCTION public.create_workbench_revision(p_estimate_id uuid,p_source_snapshot_id uuid,p_reason text)
RETURNS public.estimate_workbenches LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 source public.estimates; snapshot public.estimate_snapshots; saved public.estimate_workbenches;
 root_id uuid; next_version integer; doc jsonb;
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
 doc:=jsonb_set(snapshot.workbench_document,'{approvedAt}','null'::jsonb)
   ||jsonb_build_object('revisionContext',jsonb_build_object('version',next_version,'sourceEstimateId',source.id,'sourceSnapshotId',snapshot.id,'reason',btrim(p_reason)));
 saved:=public.save_estimate_workbench(NULL,source.division,doc,NULL,'[]');
 PERFORM set_config('northgate.workbench_save','yes',true);
 PERFORM set_config('northgate.workbench_revision','yes',true);
 UPDATE public.estimates SET version_number=next_version,revision_of=source.id,revision_root_id=root_id,source_snapshot_id=snapshot.id WHERE id=saved.estimate_id;
 PERFORM set_config('northgate.workbench_revision',COALESCE(prior_revision,''),true);
 PERFORM set_config('northgate.workbench_save',COALESCE(prior_save,''),true);
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.create_workbench_revision(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_workbench_revision(uuid,uuid,text) TO authenticated;
-- All tables retain existing RLS. No snapshots, approvals, or historical values are rewritten.
