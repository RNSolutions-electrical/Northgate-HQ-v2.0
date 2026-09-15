-- Avoid a PL/pgSQL row-variable/table-alias collision in the list/search branch.
CREATE OR REPLACE FUNCTION public.hi_read(p_id uuid DEFAULT NULL,p_search text DEFAULT '',p_archived boolean DEFAULT false,p_offset int DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE caller_id text:=public.hi_actor();h public.health_inspections;result jsonb;
BEGIN
 IF NOT public.current_user_can_access_addon('electrical_inspection') THEN RAISE EXCEPTION 'Inspection add-on access required' USING ERRCODE='42501'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO h FROM public.health_inspections WHERE id=p_id AND public.hi_can_read(id);
  IF h.id IS NULL THEN RAISE EXCEPTION 'Inspection unavailable' USING ERRCODE='42501'; END IF;
  RETURN to_jsonb(h)||jsonb_build_object('can_edit',public.hi_can_edit(h.id),'can_review',coalesce(public.hi_flag('can_review_electrical_inspections'),false),'can_assign',CASE WHEN h.job_id IS NULL THEN public.current_user_can_edit_division(h.division,'can_manage_jobs') ELSE public.current_user_can_edit_job(h.job_id,'can_manage_jobs') END,
  'job',(SELECT jsonb_build_object('id',j.id,'name',j.name,'number',coalesce(j.service_call_number,j.job_number),'job_type',j.job_type) FROM public.jobs j WHERE j.id=h.job_id),
  'files',coalesce((SELECT jsonb_agg(to_jsonb(f)||jsonb_build_object('file_name',d.file_name,'mime_type',d.mime_type,'file_size_bytes',d.file_size_bytes,'storage_path',d.storage_path) ORDER BY f.created_at) FROM public.health_inspection_files f JOIN public.documents d ON d.id=f.id WHERE f.inspection_id=h.id AND f.status<>'archived'),'[]'::jsonb),
  'revisions',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.revision DESC) FROM public.health_inspection_revisions r WHERE r.inspection_id=h.id),'[]'::jsonb),
  'history',coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM(SELECT c.created_at,c.user_name,c.note FROM public.change_logs c WHERE c.table_name='health_inspections' AND c.record_id=h.id::text ORDER BY c.created_at DESC LIMIT 100)x),'[]'::jsonb));
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM(
  SELECT listed.id,listed.inspection_number,listed.division,listed.job_id,listed.assigned_to,u.display_name technician,listed.workflow,listed.version,listed.updated_at,listed.archived_at,
   listed.document#>>'{client,clientName}' client_name,listed.document#>>'{client,siteAddress}' site_address,listed.document->>'visitDate' visit_date,
   (SELECT CASE max(CASE f->>'priority' WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 1 ELSE 0 END) WHEN 3 THEN 'High' WHEN 2 THEN 'Medium' WHEN 1 THEN 'Low' ELSE '' END FROM jsonb_array_elements(listed.document->'findings') f WHERE f->>'completed'<>'true') priority
  FROM public.health_inspections listed LEFT JOIN public.user_permissions u ON u.clerk_user_id=listed.assigned_to
  WHERE public.hi_can_read(listed.id) AND (listed.archived_at IS NOT NULL)=p_archived
   AND (p_search='' OR concat_ws(' ',listed.inspection_number,listed.document#>>'{client,clientName}',listed.document#>>'{client,siteAddress}',u.display_name,listed.workflow) ILIKE '%'||left(p_search,200)||'%')
  ORDER BY listed.updated_at DESC,listed.id LIMIT 100 OFFSET greatest(0,p_offset))x;
 RETURN result;
END $$;
