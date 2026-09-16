-- Shared AFC drafts and immutable server-recalculated releases. No account grants.
DO $permissions$
DECLARE definition text; prior_check text;
BEGIN
 SELECT pg_get_functiondef('public.default_permissions_for_role(text)'::regprocedure) INTO definition;
 IF position('''can_review_electrical_inspections'',false' IN definition)=0 THEN RAISE EXCEPTION 'Reconcile permission defaults before AFC migration'; END IF;
 EXECUTE replace(definition,'''can_review_electrical_inspections'',false','''can_review_afc_studies'',false,''can_review_electrical_inspections'',false');
 -- Some explicitly granted capabilities intentionally have no role default.
 -- Extend the existing constraint; rebuilding it from defaults would erase them.
 SELECT pg_get_expr(conbin,conrelid) INTO prior_check FROM pg_constraint
 WHERE conrelid='public.user_permission_overrides'::regclass AND conname='user_permission_overrides_permission_flag_check';
 IF prior_check IS NULL THEN RAISE EXCEPTION 'Reconcile the existing permission override constraint before AFC migration';END IF;
 ALTER TABLE public.user_permission_overrides DROP CONSTRAINT user_permission_overrides_permission_flag_check;
 EXECUTE 'ALTER TABLE public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_permission_flag_check CHECK(('||prior_check||') OR permission_flag=''can_review_afc_studies'')';
END $permissions$;
DO $reviewer_editor$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.save_user_permission_template(text,uuid,jsonb,jsonb,text)'::regprocedure) INTO definition;
 IF position('(p_overrides - ''can_review_electrical_inspections'')' IN definition)=0 OR position('(prior_overrides - ''can_review_electrical_inspections'')' IN definition)=0 THEN
 RAISE EXCEPTION 'Reconcile the reviewer permission editor before AFC migration';END IF;
 definition:=replace(definition,'(p_overrides - ''can_review_electrical_inspections'')','(p_overrides - ARRAY[''can_review_electrical_inspections'',''can_review_afc_studies''])');
 definition:=replace(definition,'(prior_overrides - ''can_review_electrical_inspections'')','(prior_overrides - ARRAY[''can_review_electrical_inspections'',''can_review_afc_studies''])');
 EXECUTE replace(definition,'Only inspection reviewer permission may be changed for Developer users','Only inspection and AFC reviewer permissions may be changed for Developer users');
END $reviewer_editor$;
INSERT INTO public.tool_addons(addon_key,label,category,description,is_active)
VALUES('available_fault_current','Available Fault Current','Electrical','Shared radial studies, reviewed reports and fault-current labels.',true);
CREATE TABLE public.afc_studies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), division text NOT NULL CHECK(division IN('Electrical','Construction','Admin')),
 job_id uuid REFERENCES public.jobs(id) ON DELETE RESTRICT,
 document jsonb NOT NULL, original_import jsonb, version integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','reviewed')),
 created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 archived_at timestamptz, archive_reason text
);
CREATE INDEX afc_studies_job_idx ON public.afc_studies(job_id);
CREATE INDEX afc_studies_directory_idx ON public.afc_studies(division,updated_at DESC);
CREATE TABLE public.afc_revisions(
 id uuid PRIMARY KEY,study_id uuid NOT NULL REFERENCES public.afc_studies(id) ON DELETE RESTRICT,
 revision integer NOT NULL,document jsonb NOT NULL,results jsonb NOT NULL,
 engine_version text NOT NULL,data_version text NOT NULL,
 job_id uuid REFERENCES public.jobs(id) ON DELETE RESTRICT,job_snapshot jsonb,
 reviewed_by text NOT NULL,reviewer_name text NOT NULL,reviewed_at timestamptz NOT NULL,
 review_note text NOT NULL, UNIQUE(study_id,revision)
);
CREATE TABLE public.afc_files(
 id uuid PRIMARY KEY REFERENCES public.documents(id) ON DELETE RESTRICT,
 revision_id uuid NOT NULL REFERENCES public.afc_revisions(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN('report','labels','label','source')),
 node_id text,sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),
 UNIQUE(revision_id,kind,node_id)
);
CREATE TABLE public.afc_requests(
 actor text NOT NULL,request_id uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor,request_id)
);
-- Standalone generated files still use the one canonical Documents table.
ALTER TABLE public.documents DROP CONSTRAINT documents_owner_type_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_owner_type_check CHECK(owner_type IN('job','estimate','vehicle','tool','employee','change_order','report','snapshot','health_inspection','afc_study'));

CREATE FUNCTION public.afc_can_read(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.afc_studies s WHERE s.id=p_id
 AND public.current_user_can_access_addon('available_fault_current')
 AND public.hi_scope(s.division,s.job_id)
 AND (s.created_by=auth.jwt()->>'sub' OR public.hi_flag('can_review_afc_studies')
 OR CASE WHEN s.job_id IS NULL THEN public.current_user_can_edit_division(s.division,'can_manage_jobs') ELSE public.current_user_can_edit_job(s.job_id,'can_manage_jobs') END)
 AND EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active))
$$;
CREATE FUNCTION public.afc_validate_draft(p_document jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n jsonb;ids text[];root_count int;k text;arr jsonb;entry jsonb;reached int;
BEGIN
 IF jsonb_typeof(p_document) IS DISTINCT FROM 'object' OR octet_length(p_document::text)>1500000
 OR p_document->>'schemaVersion' IS DISTINCT FROM '2' OR jsonb_typeof(p_document->'nodes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid study format' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_document->'nodes') NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'Use 1–250 equipment nodes' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['title','reference','date','preparedBy'] LOOP
 IF p_document?k AND (jsonb_typeof(p_document->k)<>'string' OR length(p_document->>k)>500)THEN RAISE EXCEPTION 'Invalid study metadata';END IF;
 END LOOP;
 IF p_document?'layers' AND (jsonb_typeof(p_document->'layers')<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_document->'layers')key WHERE key NOT IN('generators','motors')))THEN RAISE EXCEPTION 'Invalid optional layers';END IF;
 SELECT array_agg(x->>'id'),count(*)FILTER(WHERE x->>'kind'='source') INTO ids,root_count FROM jsonb_array_elements(p_document->'nodes') x;
 IF root_count<>1 OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids)x) THEN RAISE EXCEPTION 'One source and unique equipment IDs are required';END IF;
 FOR n IN SELECT value FROM jsonb_array_elements(p_document->'nodes') LOOP
 IF coalesce(n->>'id','')!~'^[A-Za-z0-9_-]{1,80}$' OR n->>'id' IN('__proto__','constructor','prototype')
 OR coalesce(n->>'kind','') NOT IN('source','disconnect','panel','transformer','equipment') THEN RAISE EXCEPTION 'Invalid equipment identity or kind';END IF;
 IF n->>'kind'<>'source' AND NOT coalesce(n->>'parent'=ANY(ids),false) THEN RAISE EXCEPTION 'Missing upstream equipment';END IF;
 IF n->>'kind'='source' AND nullif(n->>'parent','') IS NOT NULL THEN RAISE EXCEPTION 'Utility source cannot have a parent';END IF;
 FOREACH k IN ARRAY ARRAY['name','fault','sourceReference']LOOP
 IF n?k AND(jsonb_typeof(n->k)NOT IN('string','null')OR length(n->>k)>2000)THEN RAISE EXCEPTION 'Invalid equipment text';END IF;
 END LOOP;
 IF n?'ln' AND jsonb_typeof(n->'ln')<>'object'THEN RAISE EXCEPTION 'Invalid L-N source configuration';END IF;
 FOREACH k IN ARRAY ARRAY['segments','external']LOOP
 arr:=coalesce(n->k,'[]'::jsonb);
 IF jsonb_typeof(arr)<>'array' OR jsonb_array_length(arr)>30 THEN RAISE EXCEPTION 'Invalid equipment input list';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(arr)LOOP
 IF jsonb_typeof(entry)<>'object' OR coalesce(entry->>'id','')!~'^[A-Za-z0-9_-]{1,80}$' OR entry->>'id' IN('__proto__','constructor','prototype')THEN RAISE EXCEPTION 'Invalid equipment input identity';END IF;
 IF entry?'neutral' AND jsonb_typeof(entry->'neutral')<>'object'THEN RAISE EXCEPTION 'Invalid neutral configuration';END IF;
 END LOOP;
 IF jsonb_array_length(arr)<>(SELECT count(DISTINCT x->>'id')FROM jsonb_array_elements(arr)x)THEN RAISE EXCEPTION 'Duplicate equipment input identity';END IF;
 END LOOP;
 END LOOP;
 WITH RECURSIVE connected(id,path)AS(
 SELECT x->>'id',ARRAY[x->>'id']FROM jsonb_array_elements(p_document->'nodes')x WHERE x->>'kind'='source'
 UNION ALL SELECT child.value->>'id',c.path||(child.value->>'id')FROM connected c JOIN jsonb_array_elements(p_document->'nodes')child ON child.value->>'parent'=c.id WHERE NOT(child.value->>'id'=ANY(c.path)))
 SELECT count(*)INTO reached FROM connected;
 IF reached<>cardinality(ids)THEN RAISE EXCEPTION 'Equipment connections must form a radial tree';END IF;
 FOREACH k IN ARRAY ARRAY['generators','motors']LOOP
 arr:=coalesce(p_document#>ARRAY['layers',k],'[]'::jsonb);
 IF jsonb_typeof(arr)<>'array' OR jsonb_array_length(arr)>50 THEN RAISE EXCEPTION 'Invalid optional case list';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(arr)LOOP
 IF jsonb_typeof(entry)<>'object' OR coalesce(entry->>'id','')!~'^[A-Za-z0-9_-]{1,80}$' OR entry->>'id' IN('__proto__','constructor','prototype','utility')THEN RAISE EXCEPTION 'Invalid optional case identity';END IF;
 IF entry?'name' AND jsonb_typeof(entry->'name')NOT IN('string','null')THEN RAISE EXCEPTION 'Invalid optional case name';END IF;
 IF entry?'feeder' AND jsonb_typeof(entry->'feeder')<>'object'THEN RAISE EXCEPTION 'Invalid generator feeder';END IF;
 END LOOP;
 IF jsonb_array_length(arr)<>(SELECT count(DISTINCT x->>'id')FROM jsonb_array_elements(arr)x)THEN RAISE EXCEPTION 'Duplicate optional case identity';END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.afc_read(p_id uuid DEFAULT NULL,p_job uuid DEFAULT NULL,p_search text DEFAULT '',p_offset integer DEFAULT 0,p_archived boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.afc_studies;
BEGIN
 PERFORM public.hi_actor();
 IF NOT public.current_user_can_access_addon('available_fault_current') THEN RAISE EXCEPTION 'AFC access required' USING ERRCODE='42501';END IF;
 IF p_id IS NOT NULL THEN
 SELECT * INTO s FROM public.afc_studies WHERE id=p_id AND public.afc_can_read(id);
 IF s.id IS NULL THEN RAISE EXCEPTION 'Study unavailable' USING ERRCODE='42501';END IF;
 RETURN to_jsonb(s)||jsonb_build_object('can_review',coalesce(public.hi_flag('can_review_afc_studies'),false),
 'revisions',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('superseded',r.revision<(SELECT max(revision)FROM public.afc_revisions WHERE study_id=s.id),
 'files',coalesce((SELECT jsonb_agg(to_jsonb(f)||jsonb_build_object('file_name',d.file_name,'storage_path',d.storage_path)) FROM public.afc_files f JOIN public.documents d ON d.id=f.id WHERE f.revision_id=r.id),'[]'::jsonb)) ORDER BY r.revision DESC) FROM public.afc_revisions r WHERE r.study_id=s.id),'[]'::jsonb));
 END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(q))FROM(SELECT id,division,job_id,document->>'title' title,document->>'reference' location,version,status,updated_at FROM public.afc_studies
 WHERE public.afc_can_read(id) AND (p_job IS NULL OR job_id=p_job) AND (archived_at IS NOT NULL)=p_archived
 AND (coalesce(document->>'title','')||' '||coalesce(document->>'reference','')) ILIKE '%'||left(p_search,200)||'%'
 ORDER BY updated_at DESC LIMIT 50 OFFSET greatest(0,p_offset))q),'[]'::jsonb);
END $$;
CREATE FUNCTION public.afc_save(p_request uuid,p_id uuid,p_version int,p_document jsonb,p_division text DEFAULT 'Electrical',p_job uuid DEFAULT NULL,p_import jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller text:=public.hi_actor();s public.afc_studies;receipt public.afc_requests;prior jsonb;payload jsonb:=jsonb_build_object('id',p_id,'version',p_version,'document',p_document,'division',p_division,'job',p_job,'import',p_import);
BEGIN
 IF p_request IS NULL OR NOT public.current_user_can_access_addon('available_fault_current') THEN RAISE EXCEPTION 'AFC access required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(caller||p_request::text,0));
 SELECT * INTO receipt FROM public.afc_requests WHERE actor=caller AND request_id=p_request;
 IF FOUND THEN
 IF receipt.action<>'save' OR receipt.payload IS DISTINCT FROM payload OR NOT public.afc_can_read((receipt.result->>'id')::uuid) THEN RAISE EXCEPTION 'Request replay differs or is unauthorized';END IF;
 RETURN receipt.result;END IF;
 PERFORM public.afc_validate_draft(p_document);
 IF NOT public.hi_scope(p_division,p_job) THEN RAISE EXCEPTION 'Study division unavailable' USING ERRCODE='42501';END IF;
 IF p_id IS NOT NULL THEN
 SELECT * INTO s FROM public.afc_studies WHERE id=p_id FOR UPDATE;
 IF s.id IS NULL OR NOT public.afc_can_read(s.id) OR s.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Study unavailable' USING ERRCODE='42501';END IF;
 IF s.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Study changed. Reload before saving.' USING ERRCODE='40001';END IF;
 IF s.division IS DISTINCT FROM p_division OR p_import IS DISTINCT FROM s.original_import THEN RAISE EXCEPTION 'Keep the original division and import evidence';END IF;
 prior:=to_jsonb(s);
 END IF;
 IF p_job IS DISTINCT FROM s.job_id THEN
 IF (s.job_id IS NOT NULL AND NOT public.current_user_can_edit_job(s.job_id,'can_manage_jobs'))
 OR (p_job IS NOT NULL AND NOT public.current_user_can_edit_job(p_job,'can_manage_jobs')) THEN RAISE EXCEPTION 'Job management authority required to attach or reassign' USING ERRCODE='42501';END IF;
 END IF;
 IF p_job IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=p_job AND archived_at IS NULL) THEN RAISE EXCEPTION 'Choose an active job or service call';END IF;
 IF p_import IS NOT NULL AND octet_length(p_import::text)>1500000 THEN RAISE EXCEPTION 'Import exceeds supported size';END IF;
 IF p_id IS NULL THEN
 INSERT INTO public.afc_studies(division,job_id,document,original_import,created_by,updated_by) VALUES(p_division,p_job,p_document,p_import,caller,caller) RETURNING * INTO s;
 ELSE
 UPDATE public.afc_studies SET document=p_document,job_id=p_job,version=version+1,status='draft',updated_by=caller,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO s;
 END IF;
 PERFORM public.hi_audit('afc_studies',s.id,prior,to_jsonb(s),'Saved AFC draft');
 INSERT INTO public.afc_requests VALUES(caller,p_request,'save',payload,to_jsonb(s),now());
 RETURN to_jsonb(s);
END $$;
CREATE FUNCTION public.afc_release_context(p_id uuid,p_version integer,p_request uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.afc_studies;caller text:=public.hi_actor();receipt public.afc_requests;
BEGIN
 IF p_request IS NULL OR NOT public.afc_can_read(p_id) OR NOT coalesce(public.hi_flag('can_review_afc_studies'),false) THEN RAISE EXCEPTION 'AFC reviewer authority required' USING ERRCODE='42501';END IF;
 SELECT * INTO receipt FROM public.afc_requests WHERE actor=caller AND request_id=p_request;
 IF FOUND THEN
 IF receipt.action<>'release' OR receipt.payload IS DISTINCT FROM jsonb_build_object('id',p_id,'version',p_version) THEN RAISE EXCEPTION 'Request replay differs';END IF;
 RETURN jsonb_build_object('receipt',receipt.result);END IF;
 SELECT * INTO s FROM public.afc_studies WHERE id=p_id;
 IF s.archived_at IS NOT NULL OR s.version IS DISTINCT FROM p_version OR s.status<>'draft' THEN RAISE EXCEPTION 'Study changed or is already reviewed. Reload.' USING ERRCODE='40001';END IF;
 IF s.job_id IS NOT NULL AND NOT public.current_user_can_edit_job(s.job_id,'can_manage_jobs') THEN RAISE EXCEPTION 'Job management authority required to publish documents' USING ERRCODE='42501';END IF;
 RETURN to_jsonb(s)||jsonb_build_object('actor',caller,'reviewer_name',(SELECT coalesce(display_name,clerk_user_id)FROM public.user_permissions WHERE clerk_user_id=caller),
 'reviewed_at',now(),'revision',1+coalesce((SELECT max(revision)FROM public.afc_revisions WHERE study_id=s.id),0),
 'job_snapshot',(SELECT jsonb_build_object('id',id,'name',name,'number',coalesce(service_call_number,job_number),'division',division,'job_type',job_type)FROM public.jobs WHERE id=s.job_id));
END $$;
CREATE FUNCTION public.afc_jobs(p_search text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.hi_actor();
 IF NOT public.current_user_can_access_addon('available_fault_current') THEN RAISE EXCEPTION 'AFC access required' USING ERRCODE='42501';END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT id,name,coalesce(service_call_number,job_number) number,division,job_type
 FROM public.jobs WHERE archived_at IS NULL AND public.current_user_can_access_job(id) AND public.current_user_can_edit_job(id,'can_manage_jobs')
 AND (coalesce(name,'')||' '||coalesce(service_call_number,job_number,'')) ILIKE '%'||left(p_search,200)||'%' ORDER BY name LIMIT 50)q),'[]'::jsonb);
END $$;
-- Only the trusted Edge Function can call this endpoint. It rechecks the actual
-- active user's authority and the locked input version immediately before commit.
CREATE FUNCTION public.afc_finalize_release(p_actor text,p_id uuid,p_version integer,p_request uuid,p_results jsonb,p_files jsonb,p_note text,p_reviewed_at timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb;s public.afc_studies;r public.afc_revisions;f jsonb;did uuid;path text;prior_claims text:=current_setting('request.jwt.claims',true);file_count int:=0;
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor||p_request::text,0));
 SELECT * INTO s FROM public.afc_studies WHERE id=p_id FOR UPDATE;
 context:=public.afc_release_context(p_id,p_version,p_request);
 IF context?'receipt' THEN RETURN context->'receipt';END IF;
 IF p_results#>>'{releaseContext,reviewerName}' IS DISTINCT FROM context->>'reviewer_name'
 OR p_results#>'{releaseContext,jobSnapshot}' IS DISTINCT FROM context->'job_snapshot'
 OR (p_results#>>'{releaseContext,reviewedAt}')::timestamptz IS DISTINCT FROM p_reviewed_at THEN
 RAISE EXCEPTION 'Review context changed. Retry review.' USING ERRCODE='40001';END IF;
 IF jsonb_typeof(p_results) IS DISTINCT FROM 'object' OR p_results->>'engineVersion' IS DISTINCT FROM 'northgate-afc/1.0.0'
 OR p_results->>'dataVersion' IS DISTINCT FROM 'eaton-2014-table4-600v-single-conductors'
 OR p_results->'errors' IS DISTINCT FROM '[]'::jsonb OR octet_length(p_results::text)>5000000
 OR length(btrim(coalesce(p_note,''))) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Validated calculations and reviewer scope note required';END IF;
 IF jsonb_typeof(p_files) IS DISTINCT FROM 'array' OR jsonb_array_length(p_files) NOT BETWEEN 3 AND 253 THEN RAISE EXCEPTION 'Report, labels and source archive required';END IF;
 INSERT INTO public.afc_revisions(id,study_id,revision,document,results,engine_version,data_version,job_id,job_snapshot,reviewed_by,reviewer_name,reviewed_at,review_note)
 VALUES(p_request,s.id,(context->>'revision')::int,s.document,p_results,p_results->>'engineVersion',p_results->>'dataVersion',s.job_id,context->'job_snapshot',p_actor,context->>'reviewer_name',p_reviewed_at,p_note)RETURNING * INTO r;
 FOR f IN SELECT value FROM jsonb_array_elements(p_files) LOOP
 did:=(f->>'id')::uuid;path:=f->>'storage_path';
 IF path NOT LIKE 'afc/'||s.id::text||'/'||r.id::text||'/%'
 OR path LIKE '%..%' OR f->>'kind' NOT IN('report','labels','label','source')
 OR coalesce(f->>'sha256','')!~'^[a-f0-9]{64}$'
 OR (f->>'size')::bigint NOT BETWEEN 1 AND 25000000
 OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='northgate-files' AND name=path AND (metadata->>'size')::bigint=(f->>'size')::bigint) THEN RAISE EXCEPTION 'Released file is missing or invalid';END IF;
 INSERT INTO public.documents(id,division,owner_type,owner_id,storage_path,file_name,document_type,description,file_size_bytes,mime_type,created_by)
 VALUES(did,coalesce(context#>>'{job_snapshot,division}',s.division),CASE WHEN s.job_id IS NULL THEN 'afc_study' ELSE 'job' END,coalesce(s.job_id,s.id),path,f->>'file_name',
 CASE WHEN f->>'kind' IN('label','labels') THEN 'afc_labels' ELSE 'afc_calculations' END,
 (s.document->>'title')||' / revision '||r.revision||' / '||coalesce(f->>'equipment','Study')||' / '||r.engine_version,(f->>'size')::bigint,
 CASE WHEN f->>'kind'='source' THEN 'application/json' ELSE 'application/pdf' END,p_actor);
 INSERT INTO public.afc_files(id,revision_id,kind,node_id,sha256)VALUES(did,r.id,f->>'kind',f->>'node_id',f->>'sha256');
 file_count:=file_count+1;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.afc_files WHERE revision_id=r.id AND kind='report') OR NOT EXISTS(SELECT 1 FROM public.afc_files WHERE revision_id=r.id AND kind='labels') OR NOT EXISTS(SELECT 1 FROM public.afc_files WHERE revision_id=r.id AND kind='source') THEN RAISE EXCEPTION 'Incomplete release archive';END IF;
 UPDATE public.afc_studies SET status='reviewed',version=version+1,updated_by=p_actor,updated_at=clock_timestamp()WHERE id=s.id RETURNING * INTO s;
 PERFORM public.hi_audit('afc_studies',s.id,context,to_jsonb(s)||jsonb_build_object('revision_id',r.id,'file_count',file_count),'Reviewed AFC: '||p_note);
 INSERT INTO public.afc_requests VALUES(p_actor,p_request,'release',jsonb_build_object('id',p_id,'version',p_version),to_jsonb(s)||jsonb_build_object('revision_id',r.id),now());
 PERFORM set_config('request.jwt.claims',coalesce(prior_claims,''),true);
 RETURN to_jsonb(s)||jsonb_build_object('revision_id',r.id);
END $$;

CREATE FUNCTION public.afc_file_access(p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.afc_files f JOIN public.documents d ON d.id=f.id JOIN public.afc_revisions r ON r.id=f.revision_id
 WHERE d.storage_path=p_path AND CASE WHEN r.job_id IS NOT NULL THEN public.current_user_can_access_job(r.job_id) ELSE public.afc_can_read(r.study_id) END
 AND EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active))
$$;
CREATE FUNCTION public.afc_guard_document() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.storage_path LIKE 'afc/%' OR EXISTS(SELECT 1 FROM public.afc_files WHERE id=OLD.id) THEN RAISE EXCEPTION 'Released AFC files are immutable; create a new study revision' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER afc_guard_document BEFORE UPDATE OR DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.afc_guard_document();
DO $security$
DECLARE t text;f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['afc_studies','afc_revisions','afc_files','afc_requests'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND left(p.proname,4)='afc_' LOOP
 EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated';
 IF f.proname IN('afc_read','afc_save','afc_release_context','afc_file_access','afc_jobs') THEN EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.signature||' TO authenticated';END IF;
 END LOOP;
END $security$;
GRANT EXECUTE ON FUNCTION public.afc_finalize_release(text,uuid,integer,uuid,jsonb,jsonb,text,timestamptz) TO service_role;
CREATE POLICY afc_documents_read ON public.documents FOR SELECT TO authenticated USING(storage_path LIKE 'afc/%' AND public.afc_file_access(storage_path));
CREATE POLICY afc_documents_visibility ON public.documents AS RESTRICTIVE FOR SELECT TO authenticated USING(storage_path NOT LIKE 'afc/%' OR public.afc_file_access(storage_path));
CREATE POLICY afc_documents_insert_guard ON public.documents AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(storage_path NOT LIKE 'afc/%' AND owner_type<>'afc_study');
CREATE POLICY afc_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='northgate-files' AND name LIKE 'afc/%' AND public.afc_file_access(name));
CREATE POLICY afc_storage_visibility ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'northgate-files' OR name NOT LIKE 'afc/%' OR public.afc_file_access(name));
CREATE POLICY afc_storage_no_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'northgate-files' OR name NOT LIKE 'afc/%');
CREATE POLICY afc_storage_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'northgate-files' OR name NOT LIKE 'afc/%') WITH CHECK(bucket_id<>'northgate-files' OR name NOT LIKE 'afc/%');
CREATE POLICY afc_storage_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'northgate-files' OR name NOT LIKE 'afc/%');
