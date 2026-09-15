-- Electrical health inspections. Local release candidate; apply only in the release step.
-- One versioned document per inspection makes multi-panel saves atomic. Immutable
-- revisions, files, imports and job permit/inspection attempts are relational.
DO $permission$
DECLARE definition text; flags text;
BEGIN
 SELECT pg_get_functiondef('public.default_permissions_for_role(text)'::regprocedure) INTO definition;
 IF position('RETURN base ||' IN definition)=0 THEN RAISE EXCEPTION 'Reconcile the permission resolver before this migration'; END IF;
 EXECUTE replace(definition,'RETURN base ||','RETURN jsonb_build_object(''can_review_electrical_inspections'',false) || base ||');
 SELECT string_agg(quote_literal(k),',') INTO flags FROM jsonb_object_keys(public.default_permissions_for_role('Developer')) k;
 ALTER TABLE public.user_permission_overrides DROP CONSTRAINT user_permission_overrides_permission_flag_check;
 EXECUTE 'ALTER TABLE public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_permission_flag_check CHECK(permission_flag IN ('||flags||'))';
END $permission$;
INSERT INTO public.tool_addons(addon_key,label,category,description,is_active)
VALUES('electrical_inspection','Electrical Systems Health Inspection','Electrical','Assigned field observations, review and issued reports.',true);

CREATE SEQUENCE public.health_inspection_numbers;
CREATE TABLE public.health_inspections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 inspection_number text NOT NULL UNIQUE DEFAULT ('HI-'||lpad(nextval('public.health_inspection_numbers')::text,6,'0')),
 division text NOT NULL, job_id uuid REFERENCES public.jobs(id) ON DELETE RESTRICT,
 assigned_to text NOT NULL REFERENCES public.user_permissions(clerk_user_id),
 workflow text NOT NULL DEFAULT 'draft' CHECK(workflow IN ('draft','in_progress','ready_for_review','issued')),
 document jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 archived_at timestamptz,archived_by text,archive_reason text
);
CREATE INDEX health_inspections_job_idx ON public.health_inspections(job_id);
CREATE INDEX health_inspections_assignee_idx ON public.health_inspections(assigned_to,updated_at DESC);
CREATE INDEX health_inspections_directory_idx ON public.health_inspections(division,workflow,updated_at DESC);
CREATE TABLE public.health_inspection_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),inspection_id uuid NOT NULL REFERENCES public.health_inspections(id) ON DELETE RESTRICT,
 revision integer NOT NULL,document jsonb NOT NULL,job_snapshot jsonb,issued_by text NOT NULL,reviewer_name text NOT NULL,
 assigned_to text NOT NULL,technician_name text NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),reason text NOT NULL,renderer_version integer NOT NULL DEFAULT 1,
 file_ids uuid[] NOT NULL DEFAULT '{}',UNIQUE(inspection_id,revision)
);
CREATE TABLE public.health_inspection_imports(
 inspection_id uuid PRIMARY KEY REFERENCES public.health_inspections(id) ON DELETE RESTRICT,
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),file_hash text NOT NULL CHECK(file_hash ~ '^[a-f0-9]{64}$'),
 filename text NOT NULL,source jsonb NOT NULL,imported_by text NOT NULL,imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX health_inspection_imports_hash_idx ON public.health_inspection_imports(source_hash);
CREATE TABLE public.inspection_action_requests(
 actor text NOT NULL,request_id uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor,request_id)
);
ALTER TABLE public.documents DROP CONSTRAINT documents_owner_type_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_owner_type_check CHECK(owner_type IN ('job','estimate','vehicle','tool','employee','change_order','report','snapshot','health_inspection'));
CREATE INDEX documents_inspection_storage_lookup_idx ON public.documents(storage_path);
CREATE TABLE public.health_inspection_files(
 id uuid PRIMARY KEY REFERENCES public.documents(id) ON DELETE RESTRICT,
 inspection_id uuid NOT NULL REFERENCES public.health_inspections(id) ON DELETE RESTRICT,
 revision_id uuid REFERENCES public.health_inspection_revisions(id) ON DELETE RESTRICT,
 destination_job_id uuid REFERENCES public.jobs(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('photo','source','report')),equipment_id text,finding_id text,caption text NOT NULL DEFAULT '',
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','archived')),
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='report' AND revision_id IS NOT NULL AND destination_job_id IS NOT NULL) OR (kind<>'report' AND revision_id IS NULL AND destination_job_id IS NULL))
);
CREATE UNIQUE INDEX health_inspection_files_report_idx ON public.health_inspection_files(revision_id,destination_job_id) WHERE status<>'archived';
CREATE INDEX health_inspection_files_parent_idx ON public.health_inspection_files(inspection_id);
CREATE INDEX health_inspection_files_job_idx ON public.health_inspection_files(destination_job_id);
CREATE TABLE public.job_permits(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
 permit_number text NOT NULL CHECK(length(btrim(permit_number)) BETWEEN 1 AND 150),portal_url text NOT NULL DEFAULT '',
 permit_type text NOT NULL DEFAULT '',jurisdiction text NOT NULL DEFAULT '',status text NOT NULL DEFAULT '',
 applied_date date,issued_date date,expiration_date date,notes text NOT NULL DEFAULT '',
 document_ids uuid[] NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL,updated_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 archived_at timestamptz,archive_reason text,
 CHECK(status IN ('','Applied','Issued','Closed','Expired','Cancelled')),
 CHECK(portal_url='' OR (portal_url ~* '^https?://[^[:space:]/@]+([/?#][^[:space:]]*)?$' AND length(portal_url)<=2048))
);
CREATE INDEX job_permits_job_idx ON public.job_permits(job_id);
CREATE TABLE public.job_inspections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
 permit_id uuid REFERENCES public.job_permits(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),kind text NOT NULL DEFAULT 'jurisdiction' CHECK(kind IN ('jurisdiction','other')),
 scheduled_at timestamptz,completed_date date,status text NOT NULL DEFAULT 'Not scheduled' CHECK(status IN ('Not scheduled','Scheduled','Completed','Cancelled')),
 result text CHECK(result IN ('Passed','Failed','Partial')),inspector text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',
 previous_attempt_id uuid REFERENCES public.job_inspections(id) ON DELETE RESTRICT,document_ids uuid[] NOT NULL DEFAULT '{}',
 version integer NOT NULL DEFAULT 1,created_by text NOT NULL,updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),archived_at timestamptz,archive_reason text,
 CHECK((result IS NULL) OR (status='Completed' AND completed_date IS NOT NULL))
);
CREATE INDEX job_inspections_job_idx ON public.job_inspections(job_id);
CREATE INDEX job_inspections_permit_idx ON public.job_inspections(permit_id);
CREATE INDEX job_inspections_previous_idx ON public.job_inspections(previous_attempt_id);

CREATE FUNCTION public.hi_actor() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE caller_id text:=auth.jwt()->>'sub';
BEGIN
 IF caller_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=caller_id AND is_active) THEN RAISE EXCEPTION 'Active sign-in required' USING ERRCODE='42501'; END IF;
 RETURN caller_id;
END $$;
CREATE FUNCTION public.hi_flag(p_flag text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((public.effective_permissions_for_user(u.role,u.division,u.permission_overrides)->>p_flag)::boolean,false)
 FROM public.user_permissions u WHERE u.clerk_user_id=auth.jwt()->>'sub' AND u.is_active
$$;
CREATE FUNCTION public.hi_scope(p_division text,p_job uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN p_job IS NULL THEN public.current_user_can_read_division(p_division) ELSE public.current_user_can_access_job(p_job) END
$$;
CREATE FUNCTION public.hi_can_read(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.health_inspections h JOIN public.user_permissions u ON u.clerk_user_id=auth.jwt()->>'sub' AND u.is_active
 WHERE h.id=p_id AND public.current_user_can_access_addon('electrical_inspection')
 AND public.hi_scope(h.division,h.job_id) AND (u.clerk_user_id IN(h.created_by,h.assigned_to)
 OR public.hi_flag('can_review_electrical_inspections') OR CASE WHEN h.job_id IS NULL THEN public.current_user_can_edit_division(h.division,'can_manage_jobs') ELSE public.current_user_can_edit_job(h.job_id,'can_manage_jobs') END))
$$;
CREATE FUNCTION public.hi_can_edit(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.health_inspections h WHERE h.id=p_id AND public.hi_can_read(h.id)
 AND h.archived_at IS NULL AND h.workflow IN('draft','in_progress') AND (h.job_id IS NULL OR EXISTS(SELECT 1 FROM public.jobs j WHERE j.id=h.job_id AND j.archived_at IS NULL)))
$$;
CREATE FUNCTION public.hi_target_eligible(p_user text,p_division text,p_job uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.user_permissions; flags jsonb;
BEGIN
 SELECT * INTO u FROM public.user_permissions WHERE clerk_user_id=p_user AND is_active;
 IF u.id IS NULL THEN RETURN false; END IF;
 SELECT public.permission_base_for_user(u.role,u.division,u.permission_overrides)||coalesce((SELECT t.permissions FROM public.user_permission_templates a JOIN public.permission_templates t ON t.id=a.template_id WHERE a.user_id=p_user),'{}'::jsonb)
 ||coalesce((SELECT jsonb_object_agg(s.permission_flag,s.granted) FROM(SELECT permission_flag,bool_and(granted) granted FROM public.user_permission_overrides WHERE user_id=p_user AND is_active AND permission_flag<>'can_access_developer' GROUP BY permission_flag)s),'{}'::jsonb) INTO flags;
 RETURN (coalesce((flags->>'can_access_developer')::boolean,false) OR EXISTS(SELECT 1 FROM public.tool_addon_access a JOIN public.tool_addons t USING(addon_key) WHERE a.clerk_user_id=p_user AND a.addon_key='electrical_inspection' AND a.enabled AND t.is_active))
 AND (coalesce((flags->>'can_view_all_divisions')::boolean,false) OR u.division=p_division OR EXISTS(SELECT 1 FROM public.job_sub_divisions s WHERE s.job_id=p_job AND s.division=u.division));
END $$;
CREATE FUNCTION public.hi_audit(p_table text,p_id uuid,p_before jsonb,p_after jsonb,p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller_id text:=public.hi_actor();
BEGIN
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(caller_id,(SELECT coalesce(nullif(display_name,''),caller_id) FROM public.user_permissions WHERE clerk_user_id=caller_id),p_table,p_id::text,CASE WHEN p_before IS NULL THEN 'create' ELSE 'update' END,p_before,p_after,p_note);
END $$;
CREATE FUNCTION public.hi_validate_document(p_document jsonb,p_issue boolean DEFAULT false) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE e jsonb;f jsonb;r jsonb;c jsonb;v jsonb;key text;seen text[]:='{}';equipment_ids text[]:='{}';missing boolean;readings jsonb;
BEGIN
 IF p_document IS NULL OR octet_length(p_document::text)>2000000 OR p_document->>'schemaVersion' IS DISTINCT FROM '1'
 OR jsonb_typeof(p_document->'client') IS DISTINCT FROM 'object' OR jsonb_typeof(p_document->'equipment') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_document->'findings') IS DISTINCT FROM 'array' OR jsonb_typeof(p_document->'importWarnings') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Invalid inspection document' USING ERRCODE='22023'; END IF;
 FOREACH key IN ARRAY ARRAY['visitDate','visitTime','timeZone','scope','optionalScope','limitations','conditions','technicianLegacy','reviewSummary','assessment'] LOOP
  IF jsonb_typeof(p_document->key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid inspection field %',key USING ERRCODE='22023'; END IF;
 END LOOP;
 FOREACH key IN ARRAY ARRAY['clientName','siteAddress','contactName','contactPhone','contactEmail','jobNumber','visitNotes'] LOOP
  IF jsonb_typeof(p_document->'client'->key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid client field %',key USING ERRCODE='22023'; END IF;
 END LOOP;
 IF jsonb_array_length(p_document->'equipment')>100 OR jsonb_array_length(p_document->'findings')>1000 THEN RAISE EXCEPTION 'Inspection record limit exceeded' USING ERRCODE='22023'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_document->'equipment') LOOP
  IF coalesce(e->>'id','')='' OR e->>'id'=ANY(seen) THEN RAISE EXCEPTION 'Unique equipment IDs required' USING ERRCODE='22023'; END IF;seen:=array_append(seen,e->>'id');equipment_ids:=array_append(equipment_ids,e->>'id');
  FOREACH key IN ARRAY ARRAY['designator','equipmentType','nominalVoltage','amperage','mainConfig','phaseConfig','phaseRotation','faultCurrent','faultCurrentDate','visitDate','visitTime','notes','thermalNotes','voltageNotes','unassessedReason'] LOOP
   IF jsonb_typeof(e->key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid equipment field %',key USING ERRCODE='22023'; END IF;
  END LOOP;
  FOREACH key IN ARRAY ARRAY['visual','labeling','feeders','readings','circuits'] LOOP
   IF jsonb_typeof(e->key) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid equipment section %',key USING ERRCODE='22023'; END IF;
  END LOOP;
  IF coalesce(e->>'circuitCount','')!~'^[0-9]+$' OR (e->>'circuitCount')::int NOT BETWEEN 1 AND 168 OR jsonb_array_length(e->'circuits')<>(e->>'circuitCount')::int THEN RAISE EXCEPTION 'Circuit count mismatch' USING ERRCODE='22023'; END IF;
  missing:=false;readings:=e->'readings';
  FOR f IN SELECT value FROM jsonb_array_elements(e->'feeders') LOOP
   IF jsonb_typeof(f->'readings') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid feeder readings' USING ERRCODE='22023'; END IF;
   FOREACH key IN ARRAY ARRAY['id','sets','size','material','insulation'] LOOP IF jsonb_typeof(f->key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid feeder field' USING ERRCODE='22023'; END IF; END LOOP;
   readings:=readings||(f->'readings');
  END LOOP;
  IF (SELECT count(DISTINCT value->>'number') FROM jsonb_array_elements(e->'circuits'))<>(e->>'circuitCount')::int THEN RAISE EXCEPTION 'Duplicate circuit positions' USING ERRCODE='22023'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(e->'circuits') LOOP
   IF coalesce(c->>'number','')!~'^[0-9]+$' OR (c->>'number')::int NOT BETWEEN 1 AND (e->>'circuitCount')::int THEN RAISE EXCEPTION 'Invalid circuit position' USING ERRCODE='22023'; END IF;
   FOREACH key IN ARRAY ARRAY['id','breakerAmps','wireSize','poles','description'] LOOP IF jsonb_typeof(c->key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid circuit field' USING ERRCODE='22023'; END IF; END LOOP;
   IF (c->>'breakerAmps'<>'' AND c->>'breakerAmps'!~'^\d+(\.\d+)?$') OR (c->>'poles'<>'' AND c->>'poles'!~'^[1-4]$') THEN RAISE EXCEPTION 'Invalid breaker rating or pole count' USING ERRCODE='22023'; END IF;
   readings:=readings||jsonb_build_array(c->'temperature');
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(readings) LOOP
   IF coalesce(r->>'id','')='' OR r->>'id'=ANY(seen) THEN RAISE EXCEPTION 'Unique reading IDs required' USING ERRCODE='22023';END IF;seen:=array_append(seen,r->>'id');
   FOREACH key IN ARRAY ARRAY['id','kind','label','conductor','unit','value','state','reason'] LOOP IF jsonb_typeof(r->key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid reading field' USING ERRCODE='22023'; END IF; END LOOP;
   IF length(r->>'value')>64 OR (r->>'kind'='temperature' AND r->>'unit' NOT IN('F','C')) OR (r->>'kind'='current' AND r->>'unit'<>'A') OR (r->>'kind'='voltage' AND r->>'unit'<>'V') OR r->>'kind' NOT IN('temperature','current','voltage') OR r->>'state' NOT IN('not_recorded','measured','not_measured','not_applicable','inaccessible') OR r->>'unit' NOT IN('F','C','A','V') THEN RAISE EXCEPTION 'Invalid reading kind, state or unit' USING ERRCODE='22023'; END IF;
   IF (r->>'value'<>'' AND r->>'value'!~'^[+-]?(\d+(\.\d*)?|\.\d+)$') OR ((r->>'state'='measured') IS DISTINCT FROM (btrim(r->>'value')<>'')) THEN RAISE EXCEPTION 'Measured values must be numeric; blanks are not zero' USING ERRCODE='22023'; END IF;
   IF r->>'state' NOT IN('not_recorded','measured') AND btrim(r->>'reason')='' THEN RAISE EXCEPTION 'Reading exceptions need a reason' USING ERRCODE='22023'; END IF;
   IF r->>'state'='not_recorded' THEN missing:=true; END IF;
   IF p_issue AND r->>'kind'='voltage' AND r->>'state'='measured' AND r->>'conductor'!~*'^[ABCLN123][[:alnum:]]*[[:space:]]*[-–][[:space:]]*[ABCLN123][[:alnum:]]*$' THEN RAISE EXCEPTION 'Measured voltage needs an explicit conductor pair' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements((e->'visual')||(e->'labeling')) LOOP
   FOREACH key IN ARRAY ARRAY['id','label','state','notes'] LOOP IF jsonb_typeof(r->key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid checklist field' USING ERRCODE='22023'; END IF; END LOOP;
   IF r->>'state' NOT IN('not_assessed','acceptable','attention','not_applicable','inaccessible') THEN RAISE EXCEPTION 'Invalid checklist state' USING ERRCODE='22023'; END IF;
   IF r->>'state' IN('not_applicable','inaccessible') AND btrim(r->>'notes')='' THEN RAISE EXCEPTION 'Checklist exceptions need a reason' USING ERRCODE='22023'; END IF;
   IF r->>'state'='not_assessed' THEN missing:=true; END IF;
  END LOOP;
  IF p_issue AND (btrim(e->>'designator')='' OR (missing AND btrim(e->>'unassessedReason')='')) THEN RAISE EXCEPTION 'Equipment designator and reasons for unassessed observations are required' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR f IN SELECT value FROM jsonb_array_elements(p_document->'findings') LOOP
  FOREACH key IN ARRAY ARRAY['id','equipmentId','checklistId','category','priority','legacySeverity','description','recommendation','codeReference','correctionEvidence'] LOOP IF jsonb_typeof(f->key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid finding field' USING ERRCODE='22023'; END IF; END LOOP;
  IF f->>'id'=ANY(seen) OR f->>'id'='' OR (f->>'equipmentId'<>'' AND NOT(f->>'equipmentId'=ANY(equipment_ids))) THEN RAISE EXCEPTION 'Finding identity or equipment link is invalid' USING ERRCODE='22023'; END IF;seen:=array_append(seen,f->>'id');
  IF jsonb_typeof(f->'completed') IS DISTINCT FROM 'boolean' OR f->>'category' NOT IN('','code','safety','repair') OR f->>'priority' NOT IN('','Low','Medium','High') THEN RAISE EXCEPTION 'Invalid finding disposition' USING ERRCODE='22023'; END IF;
  IF p_issue AND (btrim(f->>'description')='' OR f->>'category'='' OR f->>'priority'='' OR btrim(f->>'recommendation')='' OR (f->>'completed'='true' AND btrim(f->>'correctionEvidence')='')) THEN RAISE EXCEPTION 'Complete finding review before issue' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(p_document->'importWarnings') LOOP
  FOREACH key IN ARRAY ARRAY['id','path','message','resolution'] LOOP IF jsonb_typeof(r->key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid import warning' USING ERRCODE='22023'; END IF; END LOOP;
  IF p_issue AND btrim(r->>'resolution')='' THEN RAISE EXCEPTION 'Resolve import warnings before issue' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_issue AND (btrim(p_document#>>'{client,clientName}')='' OR btrim(p_document#>>'{client,siteAddress}')='' OR p_document->>'visitDate'='' OR btrim(p_document->>'scope')='' OR btrim(p_document->>'assessment')='' OR btrim(p_document->>'reviewSummary')='' OR jsonb_array_length(p_document->'equipment')=0) THEN RAISE EXCEPTION 'Complete client/site/date/equipment and reviewer summary before issue' USING ERRCODE='22023'; END IF;
 IF p_document->>'visitDate'<>'' THEN PERFORM (p_document->>'visitDate')::date; END IF;
END $$;

CREATE FUNCTION public.hi_read(p_id uuid DEFAULT NULL,p_search text DEFAULT '',p_archived boolean DEFAULT false,p_offset int DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
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
  SELECT h.id,h.inspection_number,h.division,h.job_id,h.assigned_to,u.display_name technician,h.workflow,h.version,h.updated_at,h.archived_at,
   h.document#>>'{client,clientName}' client_name,h.document#>>'{client,siteAddress}' site_address,h.document->>'visitDate' visit_date,
   (SELECT CASE max(CASE f->>'priority' WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 1 ELSE 0 END) WHEN 3 THEN 'High' WHEN 2 THEN 'Medium' WHEN 1 THEN 'Low' ELSE '' END FROM jsonb_array_elements(h.document->'findings') f WHERE f->>'completed'<>'true') priority
  FROM public.health_inspections h LEFT JOIN public.user_permissions u ON u.clerk_user_id=h.assigned_to
  WHERE public.hi_can_read(h.id) AND (h.archived_at IS NOT NULL)=p_archived
   AND (p_search='' OR concat_ws(' ',h.inspection_number,h.document#>>'{client,clientName}',h.document#>>'{client,siteAddress}',u.display_name,h.workflow) ILIKE '%'||left(p_search,200)||'%')
  ORDER BY h.updated_at DESC,h.id LIMIT 100 OFFSET greatest(0,p_offset))x;
 RETURN result;
END $$;
CREATE FUNCTION public.hi_people(p_id uuid DEFAULT NULL,p_division text DEFAULT 'Electrical') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE caller_id text:=public.hi_actor();h public.health_inspections;
BEGIN
 IF p_id IS NOT NULL THEN SELECT * INTO h FROM public.health_inspections WHERE id=p_id AND public.hi_can_read(id);IF h.id IS NULL THEN RAISE EXCEPTION 'Inspection unavailable' USING ERRCODE='42501';END IF;ELSE h.division:=p_division;END IF;
 IF NOT public.current_user_can_access_addon('electrical_inspection') OR NOT(CASE WHEN h.job_id IS NULL THEN public.current_user_can_edit_division(h.division,'can_manage_jobs') ELSE public.current_user_can_edit_job(h.job_id,'can_manage_jobs') END) THEN RETURN jsonb_build_array(jsonb_build_object('id',caller_id,'name','Me'));END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.clerk_user_id,'name',coalesce(nullif(u.display_name,''),u.clerk_user_id)) ORDER BY u.display_name) FROM public.user_permissions u WHERE public.hi_target_eligible(u.clerk_user_id,h.division,h.job_id)),'[]'::jsonb);
END $$;
CREATE FUNCTION public.hi_save(p_request_id uuid,p_id uuid,p_expected_version int,p_document jsonb,p_division text DEFAULT 'Electrical',p_import jsonb DEFAULT NULL,p_allow_duplicate boolean DEFAULT false,p_reason text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller_id text:=public.hi_actor();h public.health_inspections;prior jsonb;receipt public.inspection_action_requests;payload jsonb:=jsonb_build_object('id',p_id,'version',p_expected_version,'document',p_document,'division',p_division,'import',p_import,'duplicate',p_allow_duplicate,'reason',p_reason);
BEGIN
 IF p_request_id IS NULL OR NOT public.current_user_can_access_addon('electrical_inspection') THEN RAISE EXCEPTION 'Inspection access and request ID required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(caller_id||p_request_id::text,0));
 SELECT q.* INTO receipt FROM public.inspection_action_requests q WHERE q.actor=caller_id AND q.request_id=p_request_id;
 IF FOUND THEN IF receipt.action<>'save' OR receipt.payload IS DISTINCT FROM payload OR NOT public.hi_can_read((receipt.result->>'id')::uuid) THEN RAISE EXCEPTION 'Request replay differs or is no longer authorized' USING ERRCODE='22023';END IF;RETURN receipt.result;END IF;
 PERFORM public.hi_validate_document(p_document,false);
 IF p_id IS NULL THEN
  IF NOT public.current_user_can_read_division(p_division) THEN RAISE EXCEPTION 'Department unavailable' USING ERRCODE='42501';END IF;
  IF p_import IS NOT NULL THEN
   IF octet_length(p_import::text)>35000000 OR jsonb_typeof(p_import->'source') IS DISTINCT FROM 'object' OR coalesce(p_import->>'sourceHash','')!~'^[a-f0-9]{64}$' OR coalesce(p_import->>'fileHash','')!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid import provenance' USING ERRCODE='22023';END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('inspection-import:'||(p_import->>'sourceHash'),0));
   IF EXISTS(SELECT 1 FROM public.health_inspection_imports i WHERE i.source_hash=p_import->>'sourceHash' AND public.hi_can_read(i.inspection_id)) AND (NOT p_allow_duplicate OR btrim(p_reason)='') THEN RAISE EXCEPTION 'This source already has an inspection. Open it or explicitly confirm a separate import with a reason.' USING ERRCODE='23505';END IF;
  END IF;
  INSERT INTO public.health_inspections(division,assigned_to,document,created_by,updated_by)VALUES(p_division,caller_id,p_document,caller_id,caller_id)RETURNING * INTO h;
  IF p_import IS NOT NULL THEN INSERT INTO public.health_inspection_imports(inspection_id,source_hash,file_hash,filename,source,imported_by)VALUES(h.id,p_import->>'sourceHash',p_import->>'fileHash',p_import->>'filename',p_import->'source',caller_id);END IF;
 ELSE
  SELECT * INTO h FROM public.health_inspections WHERE id=p_id FOR UPDATE;
  IF h.id IS NULL OR NOT public.hi_can_edit(h.id) THEN RAISE EXCEPTION 'Inspection is not editable' USING ERRCODE='42501';END IF;
  IF h.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Inspection changed. Reload and review before saving.' USING ERRCODE='40001';END IF;
  IF EXISTS(SELECT 1 FROM public.health_inspection_files f WHERE f.inspection_id=h.id AND f.status<>'archived' AND ((f.equipment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_document->'equipment') e WHERE e->>'id'=f.equipment_id)) OR (f.finding_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_document->'findings') e WHERE e->>'id'=f.finding_id AND (f.equipment_id IS NULL OR e->>'equipmentId'=f.equipment_id))))) THEN RAISE EXCEPTION 'Preserve equipment and finding links referenced by evidence' USING ERRCODE='22023';END IF;
  prior:=to_jsonb(h);UPDATE public.health_inspections SET document=p_document,workflow='in_progress',version=version+1,updated_at=clock_timestamp(),updated_by=caller_id WHERE id=h.id RETURNING * INTO h;
 END IF;
 PERFORM public.hi_audit('health_inspections',h.id,prior,to_jsonb(h),CASE WHEN p_import IS NULL THEN 'Inspection saved.' ELSE 'Legacy inspection imported. '||p_reason END);
 INSERT INTO public.inspection_action_requests(actor,request_id,action,payload,result)VALUES(caller_id,p_request_id,'save',payload,jsonb_build_object('id',h.id,'version',h.version));
 RETURN jsonb_build_object('id',h.id,'version',h.version);
END $$;
CREATE FUNCTION public.hi_action(p_request_id uuid,p_id uuid,p_expected_version int,p_action text,p_data jsonb DEFAULT '{}',p_reason text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller_id text:=public.hi_actor();h public.health_inspections;prior jsonb;target public.jobs;r public.health_inspection_revisions;receipt public.inspection_action_requests;payload jsonb:=jsonb_build_object('id',p_id,'version',p_expected_version,'action',p_action,'data',p_data,'reason',p_reason);result jsonb;
BEGIN
 IF p_request_id IS NULL OR NOT public.hi_can_read(p_id) THEN RAISE EXCEPTION 'Inspection access required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(caller_id||p_request_id::text,0));
 SELECT q.* INTO receipt FROM public.inspection_action_requests q WHERE q.actor=caller_id AND q.request_id=p_request_id;
 IF FOUND THEN IF receipt.action<>'action' OR receipt.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Request replay differs' USING ERRCODE='22023';END IF;RETURN receipt.result;END IF;
 SELECT * INTO h FROM public.health_inspections WHERE id=p_id FOR UPDATE;prior:=to_jsonb(h);
 IF h.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Inspection changed. Reload before this action.' USING ERRCODE='40001';END IF;
 IF h.archived_at IS NOT NULL AND p_action<>'restore' THEN RAISE EXCEPTION 'Restore the inspection first' USING ERRCODE='22023';END IF;
 IF h.job_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=h.job_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'The linked job is archived' USING ERRCODE='22023';END IF;
 IF p_action<>'submit' AND (length(btrim(coalesce(p_reason,'')))<3 OR length(p_reason)>4000) THEN RAISE EXCEPTION 'An action reason of 3 to 4000 characters is required' USING ERRCODE='22023';END IF;
 CASE p_action
 WHEN 'submit' THEN
  IF NOT public.hi_can_edit(h.id) OR btrim(h.document#>>'{client,clientName}')='' OR jsonb_array_length(h.document->'equipment')=0 THEN RAISE EXCEPTION 'Add client and equipment before submitting an editable inspection' USING ERRCODE='22023';END IF;
  h.workflow:='ready_for_review';
 WHEN 'return' THEN
  IF NOT coalesce(public.hi_flag('can_review_electrical_inspections'),false) OR h.workflow<>'ready_for_review' THEN RAISE EXCEPTION 'Reviewer authority and submitted inspection required' USING ERRCODE='42501';END IF;h.workflow:='in_progress';
 WHEN 'issue' THEN
  IF NOT coalesce(public.hi_flag('can_review_electrical_inspections'),false) OR h.workflow<>'ready_for_review' THEN RAISE EXCEPTION 'Reviewer authority and submitted inspection required' USING ERRCODE='42501';END IF;
  h.document:=h.document||jsonb_build_object('assessment',coalesce(p_data->>'assessment',''),'reviewSummary',coalesce(p_data->>'reviewSummary',''));
  PERFORM public.hi_validate_document(h.document,true);
  IF EXISTS(SELECT 1 FROM public.health_inspection_files WHERE inspection_id=h.id AND status='pending') THEN RAISE EXCEPTION 'Finish or archive pending uploads before issue' USING ERRCODE='22023';END IF;
  INSERT INTO public.health_inspection_revisions(inspection_id,revision,document,job_snapshot,issued_by,reviewer_name,assigned_to,technician_name,reason,file_ids)
   VALUES(h.id,coalesce((SELECT max(revision) FROM public.health_inspection_revisions WHERE inspection_id=h.id),0)+1,h.document-'importWarnings',
   (SELECT jsonb_build_object('id',id,'name',name,'number',coalesce(service_call_number,job_number)) FROM public.jobs WHERE id=h.job_id),caller_id,
   (SELECT coalesce(nullif(display_name,''),caller_id) FROM public.user_permissions WHERE clerk_user_id=caller_id),h.assigned_to,
   (SELECT coalesce(nullif(display_name,''),clerk_user_id) FROM public.user_permissions WHERE clerk_user_id=h.assigned_to),p_reason,
   ARRAY(SELECT id FROM public.health_inspection_files WHERE inspection_id=h.id AND kind='photo' AND status='ready')) RETURNING * INTO r;
  h.workflow:='issued';
 WHEN 'revise' THEN
  IF NOT coalesce(public.hi_flag('can_review_electrical_inspections'),false) OR h.workflow<>'issued' THEN RAISE EXCEPTION 'Reviewer authority and issued inspection required' USING ERRCODE='42501';END IF;h.workflow:='in_progress';
 WHEN 'assign' THEN
  IF NOT public.hi_can_edit(h.id) OR NOT(CASE WHEN h.job_id IS NULL THEN public.current_user_can_edit_division(h.division,'can_manage_jobs') ELSE public.current_user_can_edit_job(h.job_id,'can_manage_jobs') END) OR NOT public.hi_target_eligible(p_data->>'assigned_to',h.division,h.job_id) THEN RAISE EXCEPTION 'Assignment is not authorized for that technician' USING ERRCODE='42501';END IF;h.assigned_to:=p_data->>'assigned_to';
 WHEN 'link' THEN
  IF NOT public.hi_can_edit(h.id) THEN RAISE EXCEPTION 'An editable inspection is required to change its call link' USING ERRCODE='42501';END IF;
  SELECT * INTO target FROM public.jobs WHERE id=(p_data->>'job_id')::uuid AND archived_at IS NULL;
  IF target.id IS NULL OR NOT public.current_user_can_access_job(target.id) OR NOT public.hi_target_eligible(h.assigned_to,target.division,target.id) THEN RAISE EXCEPTION 'The job/call or assigned technician is outside authorized scope' USING ERRCODE='42501';END IF;
  IF coalesce((p_data->>'confirmed_snapshot')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Confirm the historical client/site snapshot before linking' USING ERRCODE='22023';END IF;
  h.job_id:=target.id;h.division:=target.division;
 WHEN 'create_call' THEN
  IF NOT public.hi_can_edit(h.id) THEN RAISE EXCEPTION 'Editable inspection required' USING ERRCODE='42501';END IF;
  IF NOT public.hi_target_eligible(h.assigned_to,p_data#>>'{call,division}',NULL) THEN RAISE EXCEPTION 'The assigned technician cannot access the new call department' USING ERRCODE='42501';END IF;
  h.job_id:=public.svc_save_call(NULL,p_data->'call',NULL);SELECT * INTO target FROM public.jobs WHERE id=h.job_id;h.division:=target.division;
 WHEN 'archive' THEN
  IF NOT coalesce(public.hi_flag('can_archive_records'),false) THEN RAISE EXCEPTION 'Archive authority required' USING ERRCODE='42501';END IF;h.archived_at:=now();h.archived_by:=caller_id;h.archive_reason:=p_reason;
 WHEN 'restore' THEN
  IF NOT coalesce(public.hi_flag('can_archive_records'),false) THEN RAISE EXCEPTION 'Restore authority required' USING ERRCODE='42501';END IF;h.archived_at:=NULL;h.archived_by:=NULL;h.archive_reason:=NULL;
 ELSE RAISE EXCEPTION 'Unknown inspection action' USING ERRCODE='22023';
 END CASE;
 UPDATE public.health_inspections SET workflow=h.workflow,document=h.document,job_id=h.job_id,division=h.division,assigned_to=h.assigned_to,archived_at=h.archived_at,archived_by=h.archived_by,archive_reason=h.archive_reason,version=version+1,updated_at=clock_timestamp(),updated_by=caller_id WHERE id=h.id RETURNING * INTO h;
 PERFORM public.hi_audit('health_inspections',h.id,prior,to_jsonb(h),p_action||': '||p_reason);
 result:=jsonb_build_object('id',h.id,'version',h.version,'job_id',h.job_id,'revision_id',r.id);
 INSERT INTO public.inspection_action_requests(actor,request_id,action,payload,result)VALUES(caller_id,p_request_id,'action',payload,result);RETURN result;
END $$;

-- Files are reserved before upload. Immutable object paths and no UPDATE/DELETE
-- storage grants prevent a retry from replacing evidence already issued.
CREATE FUNCTION public.hi_file_access(p_path text,p_write boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.health_inspection_files f JOIN public.documents d ON d.id=f.id
 JOIN public.health_inspections h ON h.id=f.inspection_id
 WHERE d.storage_path=p_path AND d.archived_at IS NULL AND f.status<>'archived'
 AND CASE WHEN p_write THEN f.status='pending' AND f.created_by=auth.jwt()->>'sub' AND
   ((f.kind<>'report' AND public.hi_can_edit(h.id)) OR (f.kind='report' AND public.hi_can_read(h.id) AND public.hi_flag('can_review_electrical_inspections') AND public.current_user_can_edit_job(f.destination_job_id,'can_manage_jobs') AND h.archived_at IS NULL))
 ELSE ((public.hi_can_read(h.id) AND (f.status='ready' OR f.created_by=auth.jwt()->>'sub')) OR
   (f.kind='report' AND f.status='ready' AND EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active) AND public.current_user_can_access_job(f.destination_job_id))) END)
$$;
CREATE FUNCTION public.hi_file_reserve(p_id uuid,p_inspection_id uuid,p_expected_version integer,p_file jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller_id text:=public.hi_actor();h public.health_inspections;f public.health_inspection_files;d public.documents;r public.health_inspection_revisions;
 file_kind text:=p_file->>'kind';mime text:=p_file->>'mime_type';job uuid;path text;
BEGIN
 SELECT * INTO h FROM public.health_inspections WHERE id=p_inspection_id FOR UPDATE;
 IF h.id IS NULL OR NOT public.hi_can_read(h.id) OR h.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Inspection unavailable' USING ERRCODE='42501';END IF;
 IF p_id IS NULL OR file_kind IS NULL OR file_kind NOT IN('photo','source','report') OR coalesce(p_file->>'sha256','')!~'^[a-f0-9]{64}$'
 OR coalesce(p_file->>'file_size_bytes','')!~'^[0-9]+$' OR (p_file->>'file_size_bytes')::bigint NOT BETWEEN 1 AND 26214400
 OR coalesce(p_file->>'file_name','')='' OR length(p_file->>'file_name')>255 OR p_file->>'file_name' ~ '[\\/[:cntrl:]]'
 OR length(coalesce(p_file->>'caption',''))>4000 THEN RAISE EXCEPTION 'Invalid file metadata or size (maximum 25 MB)' USING ERRCODE='22023';END IF;
 IF (file_kind='photo' AND mime NOT IN('image/jpeg','image/png')) OR (file_kind='source' AND mime NOT IN('application/json','text/html')) OR (file_kind='report' AND mime<>'application/pdf') OR mime IS NULL THEN RAISE EXCEPTION 'Unsupported file format' USING ERRCODE='22023';END IF;
 IF file_kind='report' THEN
  SELECT * INTO r FROM public.health_inspection_revisions WHERE id=(p_file->>'revision_id')::uuid AND inspection_id=h.id;
  job:=(r.job_snapshot->>'id')::uuid;
  IF r.id IS NULL OR job IS NULL OR NOT coalesce(public.hi_flag('can_review_electrical_inspections'),false) OR NOT public.current_user_can_edit_job(job,'can_manage_jobs') OR NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=job AND archived_at IS NULL) THEN RAISE EXCEPTION 'Reviewer and destination job edit authority required' USING ERRCODE='42501';END IF;
 ELSE
  IF NOT public.hi_can_edit(h.id) THEN RAISE EXCEPTION 'Editable inspection required' USING ERRCODE='42501';END IF;
 END IF;
 SELECT * INTO f FROM public.health_inspection_files WHERE id=p_id OR (file_kind='report' AND revision_id=r.id AND destination_job_id=job AND status<>'archived');
 IF f.id IS NOT NULL THEN
  SELECT * INTO d FROM public.documents WHERE id=f.id;
  IF f.inspection_id<>h.id OR f.kind<>file_kind OR f.sha256 IS DISTINCT FROM p_file->>'sha256' OR d.file_size_bytes IS DISTINCT FROM (p_file->>'file_size_bytes')::bigint OR d.mime_type IS DISTINCT FROM mime OR f.status='archived' OR coalesce(f.equipment_id,'')<>coalesce(p_file->>'equipment_id','') OR coalesce(f.finding_id,'')<>coalesce(p_file->>'finding_id','') OR f.caption<>coalesce(p_file->>'caption','') THEN RAISE EXCEPTION 'File retry differs from its reservation' USING ERRCODE='22023';END IF;
  RETURN to_jsonb(f)||jsonb_build_object('storage_path',d.storage_path,'file_name',d.file_name);
 END IF;
 IF h.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Inspection changed; reload before adding files' USING ERRCODE='40001';END IF;
 IF nullif(p_file->>'equipment_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(h.document->'equipment') e WHERE e->>'id'=p_file->>'equipment_id') THEN RAISE EXCEPTION 'Unknown equipment photo link' USING ERRCODE='22023';END IF;
 IF nullif(p_file->>'finding_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(h.document->'findings') e WHERE e->>'id'=p_file->>'finding_id' AND (coalesce(p_file->>'equipment_id','')='' OR e->>'equipmentId'=p_file->>'equipment_id')) THEN RAISE EXCEPTION 'Unknown finding photo link' USING ERRCODE='22023';END IF;
 path:='documents/'||CASE WHEN file_kind='report' THEN 'job/'||job ELSE 'health_inspection/'||h.id END||'/'||p_id;
 INSERT INTO public.documents(id,division,owner_type,owner_id,storage_path,file_name,document_type,description,file_size_bytes,mime_type,created_by)
 VALUES(p_id,h.division,CASE WHEN file_kind='report' THEN 'job' ELSE 'health_inspection' END,coalesce(job,h.id),path,p_file->>'file_name',CASE WHEN file_kind='report' THEN 'service_inspections' WHEN file_kind='photo' THEN 'photos' ELSE 'misc' END,coalesce(p_file->>'caption',''),(p_file->>'file_size_bytes')::bigint,mime,caller_id);
 INSERT INTO public.health_inspection_files(id,inspection_id,revision_id,destination_job_id,kind,equipment_id,finding_id,caption,sha256,created_by)
 VALUES(p_id,h.id,r.id,job,file_kind,nullif(p_file->>'equipment_id',''),nullif(p_file->>'finding_id',''),coalesce(p_file->>'caption',''),p_file->>'sha256',caller_id) RETURNING * INTO f;
 PERFORM public.hi_audit('health_inspections',h.id,NULL,jsonb_build_object('file_id',f.id,'kind',file_kind),'File reserved: '||(p_file->>'file_name'));
 RETURN to_jsonb(f)||jsonb_build_object('storage_path',path,'file_name',p_file->>'file_name');
END $$;
CREATE FUNCTION public.hi_file_finish(p_id uuid,p_sha256 text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller_id text:=public.hi_actor();f public.health_inspection_files;d public.documents;meta jsonb;
BEGIN
 SELECT * INTO f FROM public.health_inspection_files WHERE id=p_id;
 PERFORM 1 FROM public.health_inspections WHERE id=f.inspection_id FOR UPDATE;
 SELECT * INTO f FROM public.health_inspection_files WHERE id=p_id FOR UPDATE;
 SELECT * INTO d FROM public.documents WHERE id=p_id;
 IF f.id IS NULL OR NOT public.hi_can_read(f.inspection_id) OR f.sha256 IS DISTINCT FROM p_sha256 THEN RAISE EXCEPTION 'File verification mismatch or access denied' USING ERRCODE='42501';END IF;
 IF f.status='ready' THEN RETURN to_jsonb(f);END IF;
 IF NOT public.hi_file_access(d.storage_path,true) THEN RAISE EXCEPTION 'Upload completion is not authorized' USING ERRCODE='42501';END IF;
 SELECT metadata INTO meta FROM storage.objects WHERE bucket_id='northgate-files' AND name=d.storage_path;
 IF meta IS NULL OR coalesce(meta->>'size',meta->>'contentLength') IS NULL OR coalesce(meta->>'size',meta->>'contentLength')::bigint<>d.file_size_bytes OR meta->>'mimetype' IS DISTINCT FROM d.mime_type THEN RAISE EXCEPTION 'Stored object is missing or its size/type differs from the reservation' USING ERRCODE='22023';END IF;
 UPDATE public.health_inspection_files SET status='ready',updated_at=clock_timestamp() WHERE id=f.id RETURNING * INTO f;
 PERFORM public.hi_audit('health_inspections',f.inspection_id,NULL,jsonb_build_object('file_id',f.id,'sha256',f.sha256),'File upload verified and finalized');RETURN to_jsonb(f);
END $$;
CREATE FUNCTION public.hi_file_archive(p_id uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller_id text:=public.hi_actor();f public.health_inspection_files;
BEGIN
 SELECT * INTO f FROM public.health_inspection_files WHERE id=p_id;
 PERFORM 1 FROM public.health_inspections WHERE id=f.inspection_id FOR UPDATE;
 SELECT * INTO f FROM public.health_inspection_files WHERE id=p_id FOR UPDATE;
 IF f.id IS NULL OR NOT public.hi_can_read(f.inspection_id) OR EXISTS(SELECT 1 FROM public.health_inspection_revisions WHERE f.id=ANY(file_ids)) THEN RAISE EXCEPTION 'Only unissued draft evidence can be archived' USING ERRCODE='42501';END IF;
 IF f.kind='report' THEN
  IF f.status NOT IN('pending','archived') OR NOT coalesce(public.hi_flag('can_review_electrical_inspections'),false) OR NOT public.current_user_can_edit_job(f.destination_job_id,'can_manage_jobs') THEN RAISE EXCEPTION 'Only a pending report upload can be cancelled by an authorized publisher' USING ERRCODE='42501';END IF;
 ELSIF NOT public.hi_can_edit(f.inspection_id) THEN RAISE EXCEPTION 'Only unissued draft evidence can be archived' USING ERRCODE='42501';END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 4000 THEN RAISE EXCEPTION 'Archive reason required' USING ERRCODE='22023';END IF;
 IF f.status='archived' THEN RETURN;END IF;
 UPDATE public.health_inspection_files SET status='archived',updated_at=clock_timestamp() WHERE id=f.id;
 UPDATE public.documents SET archived_at=now(),archive_reason=p_reason WHERE id=f.id;
 PERFORM public.hi_audit('health_inspections',f.inspection_id,to_jsonb(f),jsonb_build_object('file_id',f.id,'status','archived'),p_reason);
END $$;
CREATE FUNCTION public.hi_original(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.hi_actor();IF NOT public.hi_can_read(p_id) THEN RAISE EXCEPTION 'Inspection unavailable' USING ERRCODE='42501';END IF;
 RETURN (SELECT to_jsonb(i) FROM public.health_inspection_imports i WHERE inspection_id=p_id);
END $$;
CREATE FUNCTION public.hi_jobs(p_search text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.hi_actor();IF NOT public.current_user_can_access_addon('electrical_inspection') THEN RAISE EXCEPTION 'Inspection access required' USING ERRCODE='42501';END IF;
 RETURN coalesce((SELECT jsonb_agg(x) FROM(SELECT id,name,coalesce(service_call_number,job_number) number,job_type,division FROM public.jobs WHERE archived_at IS NULL AND public.current_user_can_access_job(id) AND concat_ws(' ',name,job_number,service_call_number) ILIKE '%'||left(p_search,200)||'%' ORDER BY updated_at DESC,id LIMIT 50)x),'[]'::jsonb);
END $$;

-- Shared permit and jurisdiction-inspection register. Health inspection references
-- are read from their canonical parent; they never set permit results or closure.
CREATE FUNCTION public.hi_job_register(p_job_id uuid,p_archived boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.hi_actor();IF NOT public.current_user_can_access_job(p_job_id) THEN RAISE EXCEPTION 'Job access required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('can_edit',EXISTS(SELECT 1 FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL) AND public.current_user_can_edit_job(p_job_id,'can_manage_jobs'),
 'permits',coalesce((SELECT jsonb_agg(p ORDER BY p.created_at,p.id) FROM public.job_permits p WHERE p.job_id=p_job_id AND (p.archived_at IS NOT NULL)=p_archived),'[]'::jsonb),
 'inspections',coalesce((SELECT jsonb_agg(i ORDER BY i.scheduled_at DESC NULLS LAST,i.created_at,i.id) FROM public.job_inspections i WHERE i.job_id=p_job_id AND (i.archived_at IS NOT NULL)=p_archived),'[]'::jsonb),
 'health',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'number',h.inspection_number,'workflow',h.workflow,'visit_date',h.document->>'visitDate') ORDER BY h.created_at) FROM public.health_inspections h WHERE h.job_id=p_job_id AND h.archived_at IS NULL AND public.hi_can_read(h.id)),'[]'::jsonb),
 'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.file_name,'type',d.document_type) ORDER BY d.created_at DESC) FROM public.documents d WHERE d.owner_type='job' AND d.owner_id=p_job_id AND d.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.health_inspection_files f WHERE f.id=d.id AND f.status<>'ready')),'[]'::jsonb));
END $$;
CREATE FUNCTION public.hi_job_register_save(p_request_id uuid,p_job_id uuid,p_kind text,p_id uuid,p_expected_version int,p_data jsonb,p_action text DEFAULT 'save',p_reason text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller_id text:=public.hi_actor();permit public.job_permits;attempt public.job_inspections;prior jsonb;result jsonb;ids uuid[];parent uuid;previous uuid;receipt public.inspection_action_requests;
 payload jsonb:=jsonb_build_object('job',p_job_id,'kind',p_kind,'id',p_id,'version',p_expected_version,'data',p_data,'action',p_action,'reason',p_reason);
BEGIN
 IF p_request_id IS NULL OR NOT public.current_user_can_edit_job(p_job_id,'can_manage_jobs') OR NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Active job edit authority required' USING ERRCODE='42501';END IF;
 IF p_kind NOT IN('permit','inspection') OR p_kind IS NULL OR p_action NOT IN('save','archive','restore') OR p_action IS NULL OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>50000 THEN RAISE EXCEPTION 'Invalid register request' USING ERRCODE='22023';END IF;
 IF p_action<>'save' AND (NOT coalesce(public.hi_flag('can_archive_records'),false) OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 4000) THEN RAISE EXCEPTION 'Archive authority and reason required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(caller_id||p_request_id::text,0));
 SELECT q.* INTO receipt FROM public.inspection_action_requests q WHERE q.actor=caller_id AND q.request_id=p_request_id;
 IF FOUND THEN IF receipt.action<>'register' OR receipt.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Request replay differs' USING ERRCODE='22023';END IF;RETURN receipt.result;END IF;
 -- Serialize parent changes and same-job reference checks.
 PERFORM 1 FROM public.jobs WHERE id=p_job_id FOR UPDATE;
 IF p_id IS NULL AND p_action<>'save' THEN RAISE EXCEPTION 'Existing register row required' USING ERRCODE='22023';END IF;
 IF p_action='save' THEN
  IF jsonb_typeof(coalesce(p_data->'document_ids','[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'Invalid document links' USING ERRCODE='22023';END IF;
  SELECT coalesce(array_agg(value::uuid),'{}') INTO ids FROM jsonb_array_elements_text(coalesce(p_data->'document_ids','[]'::jsonb));
  IF EXISTS(SELECT 1 FROM unnest(ids) v WHERE NOT EXISTS(SELECT 1 FROM public.documents d WHERE d.id=v AND d.owner_type='job' AND d.owner_id=p_job_id AND d.archived_at IS NULL)) THEN RAISE EXCEPTION 'Documents must belong to this job' USING ERRCODE='22023';END IF;
 END IF;
 IF p_kind='permit' THEN
  IF p_id IS NOT NULL THEN SELECT * INTO permit FROM public.job_permits WHERE id=p_id AND job_id=p_job_id FOR UPDATE;IF permit.id IS NULL THEN RAISE EXCEPTION 'Permit unavailable' USING ERRCODE='42501';END IF;
   IF permit.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Permit changed; reload before saving' USING ERRCODE='40001';END IF;prior:=to_jsonb(permit);
  END IF;
  IF p_action='save' THEN
   IF permit.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Restore the permit first' USING ERRCODE='22023';END IF;
   -- Whitelist fields; never accept client-supplied ownership or audit identities.
   permit.permit_number:=p_data->>'permit_number';permit.portal_url:=coalesce(p_data->>'portal_url','');permit.permit_type:=coalesce(p_data->>'permit_type','');permit.jurisdiction:=coalesce(p_data->>'jurisdiction','');permit.status:=coalesce(p_data->>'status','');permit.notes:=coalesce(p_data->>'notes','');
   permit.applied_date:=nullif(p_data->>'applied_date','')::date;permit.issued_date:=nullif(p_data->>'issued_date','')::date;permit.expiration_date:=nullif(p_data->>'expiration_date','')::date;
   IF p_id IS NULL THEN INSERT INTO public.job_permits(job_id,permit_number,portal_url,permit_type,jurisdiction,status,applied_date,issued_date,expiration_date,notes,document_ids,created_by,updated_by)
    VALUES(p_job_id,permit.permit_number,permit.portal_url,permit.permit_type,permit.jurisdiction,permit.status,permit.applied_date,permit.issued_date,permit.expiration_date,permit.notes,ids,caller_id,caller_id)RETURNING * INTO permit;
   ELSE UPDATE public.job_permits SET permit_number=permit.permit_number,portal_url=permit.portal_url,permit_type=permit.permit_type,jurisdiction=permit.jurisdiction,status=permit.status,applied_date=permit.applied_date,issued_date=permit.issued_date,expiration_date=permit.expiration_date,notes=permit.notes,document_ids=ids,version=version+1,updated_at=clock_timestamp(),updated_by=caller_id WHERE id=p_id RETURNING * INTO permit;END IF;
  ELSE UPDATE public.job_permits SET archived_at=CASE WHEN p_action='archive' THEN now() END,archive_reason=CASE WHEN p_action='archive' THEN p_reason END,version=version+1,updated_at=clock_timestamp(),updated_by=caller_id WHERE id=p_id RETURNING * INTO permit;END IF;
  result:=to_jsonb(permit);PERFORM public.hi_audit('job_permits',permit.id,prior,result,p_action||': '||p_reason);
 ELSE
  IF p_id IS NOT NULL THEN SELECT * INTO attempt FROM public.job_inspections WHERE id=p_id AND job_id=p_job_id FOR UPDATE;IF attempt.id IS NULL THEN RAISE EXCEPTION 'Inspection attempt unavailable' USING ERRCODE='42501';END IF;
   IF attempt.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Inspection attempt changed; reload before saving' USING ERRCODE='40001';END IF;prior:=to_jsonb(attempt);
  END IF;
  IF p_action='save' THEN
   IF attempt.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Restore the attempt first' USING ERRCODE='22023';END IF;
   parent:=nullif(p_data->>'permit_id','')::uuid;previous:=nullif(p_data->>'previous_attempt_id','')::uuid;
   IF parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.job_permits WHERE id=parent AND job_id=p_job_id AND (archived_at IS NULL OR parent=attempt.permit_id)) THEN RAISE EXCEPTION 'Permit must belong to this job' USING ERRCODE='22023';END IF;
   IF previous IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.job_inspections WHERE id=previous AND job_id=p_job_id AND archived_at IS NULL AND job_inspections.result IN('Failed','Partial') AND permit_id IS NOT DISTINCT FROM parent AND id IS DISTINCT FROM p_id) THEN RAISE EXCEPTION 'Choose a prior failed/partial attempt for the same permit and job' USING ERRCODE='22023';END IF;
   IF p_id IS NOT NULL AND previous IS DISTINCT FROM attempt.previous_attempt_id THEN RAISE EXCEPTION 'Create a new reinspection attempt to preserve its sequence' USING ERRCODE='22023';END IF;
   attempt.name:=p_data->>'name';attempt.kind:=coalesce(p_data->>'kind','jurisdiction');attempt.status:=coalesce(p_data->>'status','Not scheduled');attempt.result:=nullif(p_data->>'result','');attempt.inspector:=coalesce(p_data->>'inspector','');attempt.notes:=coalesce(p_data->>'notes','');attempt.scheduled_at:=nullif(p_data->>'scheduled_at','')::timestamptz;attempt.completed_date:=nullif(p_data->>'completed_date','')::date;
   IF p_id IS NULL THEN INSERT INTO public.job_inspections(job_id,permit_id,name,kind,status,result,inspector,notes,scheduled_at,completed_date,previous_attempt_id,document_ids,created_by,updated_by)
    VALUES(p_job_id,parent,attempt.name,attempt.kind,attempt.status,attempt.result,attempt.inspector,attempt.notes,attempt.scheduled_at,attempt.completed_date,previous,ids,caller_id,caller_id) RETURNING * INTO attempt;
   ELSE UPDATE public.job_inspections SET permit_id=parent,name=attempt.name,kind=attempt.kind,status=attempt.status,result=attempt.result,inspector=attempt.inspector,notes=attempt.notes,scheduled_at=attempt.scheduled_at,completed_date=attempt.completed_date,document_ids=ids,version=version+1,updated_at=clock_timestamp(),updated_by=caller_id WHERE id=p_id RETURNING * INTO attempt;END IF;
  ELSE UPDATE public.job_inspections SET archived_at=CASE WHEN p_action='archive' THEN now() END,archive_reason=CASE WHEN p_action='archive' THEN p_reason END,version=version+1,updated_at=clock_timestamp(),updated_by=caller_id WHERE id=p_id RETURNING * INTO attempt;END IF;
  result:=to_jsonb(attempt);PERFORM public.hi_audit('job_inspections',attempt.id,prior,result,p_action||': '||p_reason);
 END IF;
 INSERT INTO public.inspection_action_requests(actor,request_id,action,payload,result) VALUES(caller_id,p_request_id,'register',payload,result);RETURN result;
END $$;

-- No table write APIs. Keep original evidence and issued revisions immutable.
DO $security$
DECLARE t text;f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['health_inspections','health_inspection_revisions','health_inspection_imports','health_inspection_files','inspection_action_requests','job_permits','job_inspections'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
 REVOKE ALL ON SEQUENCE public.health_inspection_numbers FROM PUBLIC,anon,authenticated;
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'hi\_%' ESCAPE '\' LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated';
  IF f.proname IN ('hi_read','hi_people','hi_save','hi_action','hi_file_access','hi_file_reserve','hi_file_finish','hi_file_archive','hi_original','hi_jobs','hi_job_register','hi_job_register_save') THEN
   EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.signature||' TO authenticated';
  END IF;
 END LOOP;
END $security$;
-- Policies call definer helpers, avoiding recursive RLS and exposing no draft rows.
CREATE POLICY health_evidence_read ON public.documents FOR SELECT TO authenticated USING(owner_type='health_inspection' AND public.hi_file_access(storage_path));
-- Definer predicates keep the file catalogue private to its authorized APIs.
CREATE FUNCTION public.hi_managed_file(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.health_inspection_files WHERE id=p_id) $$;
REVOKE ALL ON FUNCTION public.hi_managed_file(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.hi_managed_file(uuid) TO authenticated;
CREATE POLICY health_documents_visibility ON public.documents AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT public.hi_managed_file(id) OR public.hi_file_access(storage_path));
CREATE POLICY health_documents_no_direct_update ON public.documents AS RESTRICTIVE FOR UPDATE TO authenticated USING(NOT public.hi_managed_file(id) AND owner_type<>'health_inspection') WITH CHECK(NOT public.hi_managed_file(id) AND owner_type<>'health_inspection');
CREATE POLICY health_documents_no_direct_insert ON public.documents AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(owner_type<>'health_inspection');
CREATE POLICY health_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='northgate-files' AND public.hi_file_access(name));
CREATE POLICY health_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='northgate-files' AND public.hi_file_access(name,true));
CREATE FUNCTION public.hi_managed_path(p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.health_inspection_files f JOIN public.documents d ON d.id=f.id WHERE d.storage_path=p_path) $$;
REVOKE ALL ON FUNCTION public.hi_managed_path(text) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.hi_managed_path(text) TO authenticated;
CREATE POLICY health_storage_visibility ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'northgate-files' OR NOT public.hi_managed_path(name) OR public.hi_file_access(name));
CREATE POLICY health_storage_reservation ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'northgate-files' OR NOT public.hi_managed_path(name) OR public.hi_file_access(name,true));
CREATE POLICY health_storage_no_replace ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'northgate-files' OR NOT public.hi_managed_path(name)) WITH CHECK(bucket_id<>'northgate-files' OR NOT public.hi_managed_path(name));
CREATE POLICY health_storage_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'northgate-files' OR NOT public.hi_managed_path(name));

-- Existing job-document maintenance RPCs are definers and bypass table RLS.
-- Guard inspection evidence here as well, including calls through those RPCs.
CREATE FUNCTION public.hi_guard_document() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.health_inspection_files;
BEGIN
 SELECT * INTO f FROM public.health_inspection_files WHERE id=OLD.id;
 IF f.id IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE' OR (f.kind='report' AND f.status<>'archived') OR EXISTS(SELECT 1 FROM public.health_inspection_revisions WHERE f.id=ANY(file_ids)) THEN RAISE EXCEPTION 'Issued inspection evidence is immutable; create a revised report' USING ERRCODE='42501';END IF;
 IF f.status<>'archived' OR OLD.archived_at IS NOT NULL OR NEW.archived_at IS NULL OR
 (to_jsonb(NEW)-ARRAY['archived_at','archived_by','archive_reason','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['archived_at','archived_by','archive_reason','updated_at']) THEN RAISE EXCEPTION 'Use the inspection evidence workflow' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hi_guard_document() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER hi_guard_document BEFORE UPDATE OR DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.hi_guard_document();
