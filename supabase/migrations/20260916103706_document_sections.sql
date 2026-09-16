-- Add organization metadata without moving files or reclassifying history.
ALTER TABLE public.documents ADD COLUMN document_section text CHECK(document_section IN('construction','electrical','general'));
CREATE INDEX documents_section_idx ON public.documents(document_section,created_at DESC)WHERE archived_at IS NULL;
DO $guard$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.guard_document_audit_mutation()'::regprocedure) INTO definition;
 IF position('ARRAY[''file_name'',''document_type'',''description'',''archived_at''' IN definition)=0
 OR position('IF TG_OP=''UPDATE'' THEN' IN definition)=0 THEN RAISE EXCEPTION 'Reconcile document audit guard before adding sections';END IF;
 definition:=replace(definition,'ARRAY[''file_name'',''document_type'',''description'',''archived_at''','ARRAY[''document_section'',''file_name'',''document_type'',''description'',''archived_at''');
 definition:=replace(definition,'IF TG_OP=''UPDATE'' THEN',
 'IF TG_OP=''UPDATE'' THEN
 IF NEW.document_section IS DISTINCT FROM OLD.document_section AND (workflow IS DISTINCT FROM ''classify'' OR OLD.archived_at IS NOT NULL) THEN
 RAISE EXCEPTION ''Use the document section workflow'' USING ERRCODE=''42501'';
 END IF;');
 EXECUTE definition;
END $guard$;
CREATE FUNCTION public.document_section_default()RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.document_type IN('afc_calculations','afc_labels','service_inspections','panel_directories','electrical_testing')THEN NEW.document_section:='electrical';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.document_section_default() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER document_section_default BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.document_section_default();
CREATE FUNCTION public.set_document_section(p_id uuid,p_section text,p_updated_at timestamptz)RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents;prior jsonb;workflow text:=current_setting('northgate.document_workflow',true);
BEGIN
 PERFORM public.hi_actor();
 SELECT * INTO d FROM public.documents WHERE id=p_id FOR UPDATE;
 IF d.id IS NULL OR NOT public.document_owner_can_manage(d.owner_type,d.owner_id) OR d.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Document owner management authority required' USING ERRCODE='42501';END IF;
 IF d.owner_type NOT IN('job','estimate') OR d.change_order_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.change_orders WHERE signed_document_id=d.id)
 OR d.document_type IN('afc_calculations','afc_labels','service_inspections','panel_directories','electrical_testing') OR d.storage_path LIKE 'afc/%' OR public.hi_managed_file(d.id) THEN RAISE EXCEPTION 'Keep the source workflow classification' USING ERRCODE='42501';END IF;
 IF d.updated_at IS DISTINCT FROM p_updated_at OR p_updated_at IS NULL THEN RAISE EXCEPTION 'Document changed. Refresh before organizing.' USING ERRCODE='40001';END IF;
 IF p_section IS NOT NULL AND p_section NOT IN('construction','electrical','general')THEN RAISE EXCEPTION 'Choose a supported document section';END IF;
 prior:=to_jsonb(d);PERFORM set_config('northgate.document_workflow','classify',true);
 UPDATE public.documents SET document_section=p_section,updated_at=clock_timestamp()WHERE id=p_id RETURNING * INTO d;
 PERFORM public.hi_audit('documents',d.id,prior,to_jsonb(d),'Document section set to '||coalesce(p_section,'unclassified'));
 PERFORM set_config('northgate.document_workflow',coalesce(workflow,''),true);RETURN d;
END $$;
REVOKE ALL ON FUNCTION public.set_document_section(uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_document_section(uuid,text,timestamptz) TO authenticated;
