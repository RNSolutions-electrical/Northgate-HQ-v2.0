-- Organizational metadata only. No storage, financial, approval, or visibility changes.
-- NULL department_tags inherits the existing document_section until first save;
-- this preserves issued/immutable documents without rewriting their historical rows.
ALTER TABLE public.documents
 ADD COLUMN department_tags text[],
 ADD COLUMN custom_tags text[] NOT NULL DEFAULT '{}',
 ADD COLUMN organization_version integer NOT NULL DEFAULT 1 CHECK(organization_version>0),
 ADD CONSTRAINT documents_department_tags_check CHECK(department_tags IS NULL OR
   (cardinality(department_tags)<=3 AND array_ndims(department_tags)<=1
    AND department_tags <@ ARRAY['construction','electrical','general']::text[]
    AND array_position(department_tags,NULL) IS NULL)),
 ADD CONSTRAINT documents_custom_tags_count CHECK(cardinality(custom_tags)<=20 AND
   coalesce(array_ndims(custom_tags),1)=1 AND array_position(custom_tags,NULL) IS NULL);

-- Retain every existing audit/file guard. Only the three organization fields join
-- the existing classify-only gate; they cannot piggyback on normal metadata edits.
DO $guard$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.guard_document_audit_mutation()'::regprocedure) INTO definition;
 IF position('IF NEW.document_section IS DISTINCT FROM OLD.document_section AND' IN definition)=0
 OR position('ARRAY[''document_section'',''file_name''' IN definition)=0 THEN
   RAISE EXCEPTION 'Reconcile document audit guard before adding tags';
 END IF;
 definition:=replace(definition,'IF NEW.document_section IS DISTINCT FROM OLD.document_section AND',
   'IF ROW(NEW.document_section,NEW.department_tags,NEW.custom_tags,NEW.organization_version) IS DISTINCT FROM ROW(OLD.document_section,OLD.department_tags,OLD.custom_tags,OLD.organization_version) AND');
 definition:=replace(definition,'ARRAY[''document_section'',''file_name''',
   'ARRAY[''department_tags'',''custom_tags'',''organization_version'',''document_section'',''file_name''');
 EXECUTE definition;
END $guard$;

CREATE FUNCTION public.set_document_tags(p_id uuid,p_departments text[],p_tags text[],p_updated_at timestamptz,p_version integer)
RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents; prior jsonb; allowed boolean:=false;
 departments text[]; tags text[]; workflow text:=current_setting('northgate.document_workflow',true);
BEGIN
 PERFORM public.hi_actor();
 SELECT * INTO d FROM public.documents WHERE id=p_id FOR UPDATE;
 IF d.id IS NULL OR d.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Active document management authority required' USING ERRCODE='42501'; END IF;
 IF d.owner_type IN('job','estimate') THEN
   allowed:=public.document_owner_can_manage(d.owner_type,d.owner_id);
 ELSIF d.owner_type='change_order' THEN
   SELECT EXISTS(SELECT 1 FROM public.change_orders co JOIN public.jobs j ON j.id=co.job_id
     WHERE co.id=d.owner_id AND co.archived_at IS NULL AND j.archived_at IS NULL
     AND public.current_user_can_read_division(co.division,'can_view_financials')
     AND (public.document_owner_can_manage('job',j.id)
       OR public.current_user_can_edit_division(co.division,'can_manage_change_orders'))) INTO allowed;
 END IF;
 IF allowed IS NOT TRUE THEN RAISE EXCEPTION 'Document owner management authority required' USING ERRCODE='42501'; END IF;
 -- Released technical evidence retains its dedicated source workflow and guards.
 IF d.document_type IN('afc_calculations','afc_labels','service_inspections','panel_directories','electrical_testing')
 OR d.storage_path LIKE 'afc/%' OR public.hi_managed_file(d.id) THEN
   RAISE EXCEPTION 'Keep the source workflow classification' USING ERRCODE='42501';
 END IF;
 IF p_updated_at IS NULL OR d.updated_at IS DISTINCT FROM p_updated_at OR p_version IS DISTINCT FROM d.organization_version THEN
   RAISE EXCEPTION 'Document changed. Refresh before organizing.' USING ERRCODE='40001';
 END IF;
 IF p_departments IS NULL OR p_tags IS NULL OR cardinality(p_departments)>3 OR cardinality(p_tags)>20
 OR coalesce(array_ndims(p_departments),1)<>1 OR coalesce(array_ndims(p_tags),1)<>1
 OR array_position(p_departments,NULL) IS NOT NULL OR array_position(p_tags,NULL) IS NOT NULL
 OR NOT p_departments <@ ARRAY['construction','electrical','general']::text[] THEN
   RAISE EXCEPTION 'Choose supported departments and at most 20 tags' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(array_agg(DISTINCT t ORDER BY t),'{}') INTO departments FROM unnest(p_departments)t;
 SELECT coalesce(array_agg(DISTINCT t ORDER BY t),'{}') INTO tags
 FROM (SELECT lower(btrim(regexp_replace(v,'\s+',' ','g')))t FROM unnest(p_tags)v)s;
 IF EXISTS(SELECT 1 FROM unnest(tags)t WHERE length(t) NOT BETWEEN 1 AND 48 OR t ~ '[[:cntrl:]]') THEN
   RAISE EXCEPTION 'Each tag must contain 1–48 printable characters' USING ERRCODE='22023';
 END IF;
 IF coalesce(d.department_tags,CASE WHEN d.document_section IS NULL THEN '{}'::text[] ELSE ARRAY[d.document_section] END)=departments AND d.custom_tags=tags THEN RETURN d; END IF;
 prior:=to_jsonb(d); PERFORM set_config('northgate.document_workflow','classify',true);
 UPDATE public.documents SET department_tags=departments,custom_tags=tags,
   document_section=departments[1],organization_version=organization_version+1,updated_at=clock_timestamp()
 WHERE id=p_id RETURNING * INTO d;
 PERFORM public.hi_audit('documents',d.id,prior,to_jsonb(d),'Document organization tags updated');
 PERFORM set_config('northgate.document_workflow',coalesce(workflow,''),true);
 RETURN d;
END $$;
REVOKE ALL ON FUNCTION public.set_document_tags(uuid,text[],text[],timestamptz,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_document_tags(uuid,text[],text[],timestamptz,integer) TO authenticated;

-- A cached older client may still call the old RPC. Never silently erase multiple
-- departments. Preserve custom tags and route through the same audited mutation.
CREATE OR REPLACE FUNCTION public.set_document_section(p_id uuid,p_section text,p_updated_at timestamptz)
RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents;
BEGIN
 PERFORM public.hi_actor();
 SELECT * INTO d FROM public.documents WHERE id=p_id FOR UPDATE;
 IF cardinality(d.department_tags)>1 THEN RAISE EXCEPTION 'Refresh the app to edit multiple department tags'; END IF;
 RETURN public.set_document_tags(p_id,CASE WHEN p_section IS NULL THEN '{}'::text[] ELSE ARRAY[p_section] END,
   coalesce(d.custom_tags,'{}'),p_updated_at,d.organization_version);
END $$;
REVOKE ALL ON FUNCTION public.set_document_section(uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_document_section(uuid,text,timestamptz) TO authenticated;

COMMENT ON COLUMN public.documents.department_tags IS 'Organization only, never authorization. NULL inherits legacy document_section; empty array is intentionally unclassified.';
COMMENT ON COLUMN public.documents.custom_tags IS 'Searchable organization tags; document_type and source/file ownership remain authoritative.';
