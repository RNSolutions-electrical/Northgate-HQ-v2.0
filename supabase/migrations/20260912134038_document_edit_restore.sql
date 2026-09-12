-- Owner-scoped document maintenance without changing public table/storage RLS.
-- Archived SELECT is intentionally hidden by RLS; these RPCs explicitly authorize the active owner.
CREATE OR REPLACE FUNCTION public.document_owner_can_manage(p_owner_type text,p_owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active)
 AND CASE WHEN p_owner_type='job' THEN EXISTS(
   SELECT 1 FROM public.jobs j WHERE j.id=p_owner_id AND j.archived_at IS NULL
     AND (public.current_user_can_edit_job(j.id,'can_manage_jobs') OR public.current_user_can_edit_division(j.division,'can_manage_jobs')))
 WHEN p_owner_type='estimate' THEN EXISTS(
   SELECT 1 FROM public.estimates e WHERE e.id=p_owner_id AND e.archived_at IS NULL
     AND public.current_user_can_edit_division(e.division,'can_estimate'))
 ELSE false END;
$$;
REVOKE ALL ON FUNCTION public.document_owner_can_manage(text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.read_archived_owner_documents(p_owner_type text,p_owner_id uuid,p_offset integer DEFAULT 0)
RETURNS SETOF public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF public.document_owner_can_manage(p_owner_type,p_owner_id) IS NOT TRUE THEN
   RAISE EXCEPTION 'Document owner edit permission required' USING ERRCODE='42501';
 END IF;
 IF p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'Invalid page offset' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT d.* FROM public.documents d WHERE d.owner_type=p_owner_type AND d.owner_id=p_owner_id
   AND d.archived_at IS NOT NULL AND d.change_order_id IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.change_orders co WHERE co.signed_document_id=d.id)
 ORDER BY d.archived_at DESC,d.id LIMIT 50 OFFSET p_offset;
END $$;
REVOKE ALL ON FUNCTION public.read_archived_owner_documents(text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_archived_owner_documents(text,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.maintain_owner_document(
 p_document_id uuid,p_owner_type text,p_owner_id uuid,p_action text,p_changes jsonb,
 p_reason text,p_expected_updated_at timestamptz)
RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE doc public.documents; saved public.documents; candidate public.documents;
 reason text := NULLIF(regexp_replace(COALESCE(p_reason,''),'^\s+|\s+$','','g'),'');
 previous_workflow text := current_setting('northgate.document_workflow',true);
 previous_reason text := current_setting('northgate.document_reason',true);
BEGIN
 IF public.document_owner_can_manage(p_owner_type,p_owner_id) IS NOT TRUE THEN
   RAISE EXCEPTION 'Document owner edit permission required' USING ERRCODE='42501';
 END IF;
 IF p_action IS NULL OR p_action NOT IN ('edit','restore') THEN RAISE EXCEPTION 'Invalid document action' USING ERRCODE='22023'; END IF;
 IF reason IS NULL OR length(reason)>4000 THEN RAISE EXCEPTION 'A reason is required (maximum 4000 characters)' USING ERRCODE='22023'; END IF;
 IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'object' OR octet_length(p_changes::text)>20000
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_changes) k WHERE k NOT IN ('file_name','document_type','description')) THEN
   RAISE EXCEPTION 'Unsupported document fields' USING ERRCODE='22023';
 END IF;
 SELECT * INTO doc FROM public.documents WHERE id=p_document_id AND owner_type=p_owner_type AND owner_id=p_owner_id FOR UPDATE;
 IF doc.id IS NULL THEN RAISE EXCEPTION 'Document not found for this owner' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NULL OR doc.updated_at IS DISTINCT FROM p_expected_updated_at THEN
   RAISE EXCEPTION 'Document changed since it was opened. Refresh and review before saving' USING ERRCODE='40001';
 END IF;
 IF doc.change_order_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.change_orders WHERE signed_document_id=doc.id) THEN
   RAISE EXCEPTION 'Use the dedicated Change Order document workflow' USING ERRCODE='22023';
 END IF;
 IF p_action='restore' THEN
   IF p_changes<>'{}'::jsonb THEN RAISE EXCEPTION 'Restore cannot also edit document details' USING ERRCODE='22023'; END IF;
   IF doc.archived_at IS NULL THEN RAISE EXCEPTION 'Document is no longer archived' USING ERRCODE='40001'; END IF;
   IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='northgate-files' AND name=doc.storage_path) THEN
     RAISE EXCEPTION 'Stored file is missing. Re-upload the document instead of restoring it' USING ERRCODE='22023';
   END IF;
 ELSE
   IF doc.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Restore the document before editing' USING ERRCODE='22023'; END IF;
   candidate := jsonb_populate_record(doc,p_changes);
   candidate.file_name := btrim(candidate.file_name);
   IF NULLIF(candidate.file_name,'') IS NULL OR length(candidate.file_name)>255 OR candidate.file_name ~ '[\\/[:cntrl:]]' THEN
     RAISE EXCEPTION 'Enter a filename without folder separators (maximum 255 characters)' USING ERRCODE='22023';
   END IF;
   IF candidate.document_type IS NULL OR candidate.document_type NOT IN
      ('contracts','plans','specifications','permits','submittals','photos','change_orders','closeout','invoices','quotes','misc','pay_apps') THEN
     RAISE EXCEPTION 'Select a document category' USING ERRCODE='22023';
   END IF;
   IF length(candidate.description)>10000 THEN RAISE EXCEPTION 'Description exceeds 10000 characters' USING ERRCODE='22023'; END IF;
 END IF;
 PERFORM set_config('northgate.document_workflow',p_action,true);
 PERFORM set_config('northgate.document_reason',reason,true);
 IF p_action='restore' THEN
   UPDATE public.documents SET archived_at=NULL,archived_by=NULL,archive_reason=NULL WHERE id=doc.id RETURNING * INTO saved;
 ELSE
   UPDATE public.documents SET file_name=candidate.file_name,document_type=candidate.document_type,
     description=NULLIF(btrim(candidate.description),'') WHERE id=doc.id RETURNING * INTO saved;
 END IF;
 PERFORM set_config('northgate.document_workflow',COALESCE(previous_workflow,''),true);
 PERFORM set_config('northgate.document_reason',COALESCE(previous_reason,''),true);
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.maintain_owner_document(uuid,text,uuid,text,jsonb,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.maintain_owner_document(uuid,text,uuid,text,jsonb,text,timestamptz) TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_document_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor text := auth.jwt()->>'sub'; reason text;
  workflow text := current_setting('northgate.document_workflow',true);
  workflow_reason text := NULLIF(regexp_replace(COALESCE(current_setting('northgate.document_reason',true),''),'^\s+|\s+$','','g'),'');
BEGIN
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=actor AND is_active) THEN
    RAISE EXCEPTION 'Active authenticated user required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['file_name','document_type','description','archived_at','archived_by','archive_reason','updated_at'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['file_name','document_type','description','archived_at','archived_by','archive_reason','updated_at']) THEN
      RAISE EXCEPTION 'Document identity, owner and stored file cannot change' USING ERRCODE='22023';
    END IF;
    IF ROW(NEW.file_name,NEW.document_type,NEW.description) IS DISTINCT FROM ROW(OLD.file_name,OLD.document_type,OLD.description) THEN
      IF workflow IS DISTINCT FROM 'edit' OR workflow_reason IS NULL OR OLD.archived_at IS NOT NULL OR NEW.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Document metadata edits require a dedicated audited workflow' USING ERRCODE='22023';
      END IF;
    END IF;
    IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      IF workflow IS DISTINCT FROM 'restore' OR workflow_reason IS NULL OR NEW.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Document restore requires a dedicated audited workflow' USING ERRCODE='22023';
      END IF;
    END IF;
    IF workflow IN ('edit','restore') AND (OLD.change_order_id IS NOT NULL OR OLD.owner_type NOT IN ('job','estimate')
      OR EXISTS(SELECT 1 FROM public.change_orders WHERE signed_document_id=OLD.id)) THEN
      RAISE EXCEPTION 'Use the dedicated Change Order document workflow' USING ERRCODE='22023';
    END IF;
  END IF;
  IF NEW.archived_at IS NOT NULL THEN
    reason := NULLIF(regexp_replace(COALESCE(NEW.archive_reason,''),'^\s+|\s+$','','g'),'');
    IF reason IS NULL OR length(reason)>4000 THEN RAISE EXCEPTION 'Archive reason is required (maximum 4000 characters)' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT 1 FROM public.change_orders WHERE signed_document_id=NEW.id AND status='approved' AND archived_at IS NULL) THEN
      RAISE EXCEPTION 'Approved signed Change Order documents cannot be archived' USING ERRCODE='22023';
    END IF;
    NEW.archive_reason := reason;
    NEW.archived_by := actor;
  ELSE
    NEW.archive_reason := NULL;
    NEW.archived_by := NULL;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.record_document_metadata_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE action text; reason text;
BEGIN
 IF TG_OP='INSERT' THEN action := 'create';
 ELSIF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN action := 'archive'; reason := NEW.archive_reason;
 ELSIF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN action := 'restore';
 ELSIF ROW(OLD.file_name,OLD.document_type,OLD.description) IS DISTINCT FROM ROW(NEW.file_name,NEW.document_type,NEW.description) THEN action := 'update';
 ELSE RETURN NEW;
 END IF;
 IF action IN ('restore','update') THEN reason := current_setting('northgate.document_reason',true); END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(auth.jwt()->>'sub',public.change_order_actor(),'documents',NEW.id::text,action,
 CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW),reason);
 RETURN NEW;
END $$;
