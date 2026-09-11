-- Audit document metadata atomically; storage upload remains a separate operation.

-- Archived documents are intentionally hidden by SELECT RLS. Cleanup must use a
-- controlled function, like the existing archive endpoints, not a direct update.
CREATE OR REPLACE FUNCTION public.archive_failed_document_upload(p_document_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE doc public.documents; permitted boolean := false;
BEGIN
 IF auth.jwt()->>'sub' IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
 SELECT * INTO doc FROM public.documents WHERE id=p_document_id AND archived_at IS NULL FOR UPDATE;
 IF doc.id IS NULL THEN RAISE EXCEPTION 'Active document not found; refresh Documents before retrying' USING ERRCODE='P0002'; END IF;
 IF doc.owner_type='job' THEN
   permitted := EXISTS(SELECT 1 FROM public.jobs j WHERE j.id=doc.owner_id AND j.division=doc.division AND j.archived_at IS NULL)
    AND (public.current_user_can_edit_job(doc.owner_id,'can_manage_jobs')
      OR (doc.change_order_id IS NULL AND public.current_user_can_edit_division(doc.division,'can_manage_jobs'))
      OR EXISTS(SELECT 1 FROM public.change_orders co WHERE co.id=doc.change_order_id AND co.job_id=doc.owner_id
        AND co.division=doc.division AND co.status='submitted' AND public.current_user_can_edit_division(co.division,'can_verify_change_orders')));
 ELSIF doc.owner_type='estimate' THEN
   permitted := doc.change_order_id IS NULL AND public.current_user_can_edit_division(doc.division,'can_estimate')
     AND EXISTS(SELECT 1 FROM public.estimates e WHERE e.id=doc.owner_id AND e.division=doc.division AND e.archived_at IS NULL);
 ELSIF doc.owner_type='change_order' THEN
   permitted := doc.change_order_id IS NULL AND public.current_user_can_edit_division(doc.division,'can_manage_change_orders')
     AND EXISTS(SELECT 1 FROM public.change_orders co WHERE co.id=doc.owner_id AND co.division=doc.division AND co.archived_at IS NULL);
 END IF;
 IF permitted IS NOT TRUE THEN RAISE EXCEPTION 'Document owner edit permission required' USING ERRCODE='42501'; END IF;
 UPDATE public.documents SET archived_at=clock_timestamp(),archive_reason=p_reason WHERE id=doc.id;
END $$;
REVOKE ALL ON FUNCTION public.archive_failed_document_upload(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.archive_failed_document_upload(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_document_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE actor text := auth.jwt()->>'sub'; reason text;
BEGIN
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=actor AND is_active) THEN
    RAISE EXCEPTION 'Active authenticated user required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['archived_at','archived_by','archive_reason','updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['archived_at','archived_by','archive_reason','updated_at']) THEN
      RAISE EXCEPTION 'Document metadata edits require a dedicated audited workflow' USING ERRCODE='22023';
    END IF;
    IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      RAISE EXCEPTION 'Document restore requires a dedicated audited workflow' USING ERRCODE='22023';
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
END $$;
REVOKE ALL ON FUNCTION public.guard_document_audit_mutation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_document_audit_mutation BEFORE INSERT OR UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.guard_document_audit_mutation();

CREATE OR REPLACE FUNCTION public.record_document_metadata_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF TG_OP='INSERT' OR (OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL) THEN
    INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
    VALUES(auth.jwt()->>'sub',public.change_order_actor(),'documents',NEW.id::text,
      CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'archive' END,
      CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW),
      CASE WHEN TG_OP='INSERT' THEN NULL ELSE NEW.archive_reason END);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_document_metadata_audit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER record_document_metadata_audit AFTER INSERT OR UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.record_document_metadata_audit();

CREATE OR REPLACE FUNCTION public.archive_change_order_document(p_document_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  target_document public.documents%ROWTYPE;
  target_change_order public.change_orders%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
  reason_text TEXT := NULLIF(BTRIM(p_reason), '');
BEGIN
  IF jwt_subject IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target_document
  FROM public.documents
  WHERE id = p_document_id
    AND owner_type = 'change_order'
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change order document not found or already archived' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO target_change_order
  FROM public.change_orders co
  WHERE co.id = target_document.owner_id
    AND co.division = target_document.division
    AND co.archived_at IS NULL
  LIMIT 1;

  IF target_change_order.id IS NULL
    OR public.current_user_can_edit_division(target_change_order.division, 'can_manage_change_orders') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to archive this change order document'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Active user permission record is required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.documents
  SET archived_at = now_stamp,
      archived_by = jwt_subject,
      archive_reason = reason_text
  WHERE id = p_document_id;

  END;
$function$
;

CREATE OR REPLACE FUNCTION public.archive_estimate_document(p_document_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  target_document public.documents%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
  reason_text TEXT := NULLIF(BTRIM(p_reason), '');
  archived_by_text TEXT;
BEGIN
  IF jwt_subject IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO target_document
  FROM public.documents
  WHERE id = p_document_id
    AND owner_type = 'estimate'
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimate document not found or already archived'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF NOT FOUND OR public.current_user_can_edit_division(target_document.division, 'can_estimate') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to archive this estimate document'
      USING ERRCODE = '42501';
  END IF;

  archived_by_text := COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject);

  UPDATE public.documents
  SET archived_at = now_stamp,
      archived_by = archived_by_text,
      archive_reason = reason_text
  WHERE id = p_document_id;

  END;
$function$
;

CREATE OR REPLACE FUNCTION public.archive_job_document(p_document_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE doc public.documents%ROWTYPE;
BEGIN
  SELECT * INTO doc FROM public.documents WHERE id=p_document_id AND owner_type='job' AND archived_at IS NULL FOR UPDATE;
  IF doc.id IS NULL THEN RAISE EXCEPTION 'Job document not found or already archived'; END IF;
  IF EXISTS(SELECT 1 FROM public.change_orders co WHERE co.signed_document_id=doc.id AND co.status='approved' AND co.archived_at IS NULL) THEN RAISE EXCEPTION 'approved signed Change Order documents cannot be archived'; END IF;
  IF public.current_user_can_edit_division(doc.division,'can_manage_jobs') IS NOT TRUE THEN RAISE EXCEPTION 'You do not have permission to archive this document' USING ERRCODE='42501'; END IF;
  UPDATE public.documents SET archived_at=NOW(),archived_by=auth.jwt()->>'sub',archive_reason=BTRIM(p_reason),updated_at=NOW() WHERE id=doc.id;
  END $function$
;

CREATE OR REPLACE FUNCTION public.retire_unsigned_change_order_documents(p_change_order_id uuid, p_reason text)
 RETURNS TABLE(storage_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; target public.change_orders%ROWTYPE; doc public.documents%ROWTYPE; saved public.documents%ROWTYPE; normalized_reason TEXT:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
BEGIN
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF actor_id IS NULL OR target.id IS NULL OR target.status<>'submitted' OR target.signed_document_id IS NOT NULL OR normalized_reason IS NULL OR NOT public.current_user_can_edit_division(target.division,'can_verify_change_orders') THEN
    RAISE EXCEPTION 'authorized unsigned submitted Change Order and reason are required' USING ERRCODE='42501';
  END IF;
  FOR doc IN SELECT * FROM public.documents WHERE change_order_id=target.id AND archived_at IS NULL FOR UPDATE LOOP
    UPDATE public.documents SET archived_at=NOW(),archived_by=actor_id,archive_reason=normalized_reason,updated_at=NOW() WHERE id=doc.id RETURNING * INTO saved;
    storage_path:=doc.storage_path; RETURN NEXT;
  END LOOP;
END $function$
;
