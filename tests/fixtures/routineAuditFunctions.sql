-- Read-only production function definitions inspected 2026-09-16; no business data.
CREATE OR REPLACE FUNCTION public.archive_estimate(p_estimate_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  target_estimate public.estimates%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
  reason_text TEXT := NULLIF(BTRIM(p_reason), '');
  archived_by_text TEXT;
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF p_estimate_id IS NULL THEN
    RAISE EXCEPTION 'estimate id is required'
      USING ERRCODE = '22004';
  END IF;

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO target_estimate
  FROM public.estimates
  WHERE id = p_estimate_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimate not found or already archived'
      USING ERRCODE = 'P0002';
  END IF;

  IF public.current_user_can_edit_division(target_estimate.division, 'can_estimate') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to archive this estimate'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Active user permission record is required'
      USING ERRCODE = '42501';
  END IF;

  caller_permissions := public.effective_permissions_for_user(
    caller.role,
    caller.division,
    caller.permission_overrides
  );

  IF COALESCE((caller_permissions ->> 'can_archive_records')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'can_archive_records permission is required to archive an estimate'
      USING ERRCODE = '42501';
  END IF;

  archived_by_text := jwt_subject;

  UPDATE public.estimates
  SET archived_at = now_stamp,
      archived_by = archived_by_text,
      archive_reason = reason_text,
      status = 'archived'
  WHERE id = p_estimate_id;

  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at)
  VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'estimates',
    p_estimate_id::TEXT,
    'archive',
    jsonb_strip_nulls(to_jsonb(target_estimate)),
    jsonb_strip_nulls(to_jsonb(target_estimate) || jsonb_build_object(
      'archived_at', now_stamp,
      'archived_by', archived_by_text,
      'archive_reason', reason_text,
      'status', 'archived'
    )),
    reason_text,
    now_stamp
  );
END;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.archive_job(p_job_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  target_job public.jobs%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
  reason_text TEXT := NULLIF(BTRIM(p_reason), '');
  archived_by_text TEXT;
BEGIN
  IF jwt_subject IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target_job
  FROM public.jobs
  WHERE id = p_job_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found or already archived' USING ERRCODE = 'P0002';
  END IF;

  IF public.current_user_can_edit_division(target_job.division, 'can_manage_jobs') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to archive this job' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Active user permission record is required' USING ERRCODE = '42501';
  END IF;

  archived_by_text := jwt_subject;

  UPDATE public.jobs
  SET archived_at = now_stamp,
      archived_by = archived_by_text,
      archive_reason = reason_text
  WHERE id = p_job_id;

  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at)
  VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'jobs',
    p_job_id::TEXT,
    'archive',
    jsonb_strip_nulls(to_jsonb(target_job)),
    jsonb_strip_nulls(to_jsonb(target_job) || jsonb_build_object('archived_at', now_stamp, 'archived_by', archived_by_text, 'archive_reason', reason_text)),
    reason_text,
    now_stamp
  );
END;
$function$;

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
  END $function$;

CREATE OR REPLACE FUNCTION public.archive_job_schedule_item(p_schedule_item_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  target_item public.job_schedule_items%ROWTYPE;
  now_stamp TIMESTAMPTZ := NOW();
  reason_text TEXT := NULLIF(BTRIM(p_reason), '');
  archived_by_text TEXT;
BEGIN
  IF jwt_subject IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Archive reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target_item
  FROM public.job_schedule_items
  WHERE id = p_schedule_item_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule item not found or already archived' USING ERRCODE = 'P0002';
  END IF;

  IF public.current_user_can_edit_division(target_item.division, 'can_manage_jobs') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to archive this schedule item' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Active user permission record is required' USING ERRCODE = '42501';
  END IF;

  archived_by_text := jwt_subject;

  UPDATE public.job_schedule_items
  SET archived_at = now_stamp,
      archived_by = archived_by_text,
      archive_reason = reason_text
  WHERE id = p_schedule_item_id;

  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at)
  VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'job_schedule_items',
    p_schedule_item_id::TEXT,
    'archive',
    jsonb_strip_nulls(to_jsonb(target_item)),
    jsonb_strip_nulls(to_jsonb(target_item) || jsonb_build_object('archived_at', now_stamp, 'archived_by', archived_by_text, 'archive_reason', reason_text)),
    reason_text,
    now_stamp
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_pending_employee_profile(p_profile_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  caller public.user_permissions%ROWTYPE;
  target public.employee_profiles%ROWTYPE;
  normalized_reason TEXT:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
BEGIN
  SELECT * INTO caller FROM public.user_permissions
  WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active=TRUE LIMIT 1;
  IF caller.id IS NULL OR COALESCE((public.effective_permissions_for_user(caller.role,caller.division,caller.permission_overrides)->>'can_manage_employees')::BOOLEAN,FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'employee management permission is required' USING ERRCODE='42501';
  END IF;
  IF p_profile_id IS NULL OR normalized_reason IS NULL THEN
    RAISE EXCEPTION 'profile and archive reason are required' USING ERRCODE='22004';
  END IF;
  SELECT * INTO target FROM public.employee_profiles
  WHERE id=p_profile_id AND clerk_user_id IS NULL AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL THEN
    RAISE EXCEPTION 'active pending employee profile not found' USING ERRCODE='P0002';
  END IF;
  UPDATE public.employee_profiles SET archived_at=NOW(),archived_by=auth.jwt()->>'sub',archive_reason=normalized_reason,updated_at=NOW()
  WHERE id=target.id;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(auth.jwt()->>'sub',COALESCE(caller.display_name,caller.email,auth.jwt()->>'sub'),'employee_profiles',target.id::TEXT,'archive',to_jsonb(target),to_jsonb(target)||jsonb_build_object('archived_at',NOW(),'archived_by',auth.jwt()->>'sub','archive_reason',normalized_reason),normalized_reason);
END $function$;

CREATE OR REPLACE FUNCTION public.edit_inventory_location(p_kind text, p_id uuid, p_code text, p_label text, p_position integer, p_expected_revision integer, p_reason text, p_details jsonb, p_parent_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor public.user_permissions; target_table text; code_field text; label_field text; parent_field text;
 dept text; destination_dept text; parent_id uuid; before_row jsonb; after_row jsonb; duplicate boolean; clean_code text:=upper(btrim(p_code));
BEGIN
 -- Serialize short hierarchy mutations against archive/restore and other moves.
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location-lifecycle',0));
 LOCK TABLE public.storage_units, public.shelves, public.bays, public.bins IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active;
 CASE p_kind
 WHEN 'unit' THEN target_table:='storage_units';code_field:='unit_code';label_field:='name';
 WHEN 'shelf' THEN target_table:='shelves';code_field:='shelf_code';label_field:='label';parent_field:='unit_id';
 WHEN 'bay' THEN target_table:='bays';code_field:='bay_code';label_field:='label';parent_field:='shelf_id';
 WHEN 'bin' THEN target_table:='bins';code_field:='bin_code';label_field:='label';parent_field:='bay_id';
 ELSE RAISE EXCEPTION 'Choose a valid location type'; END CASE;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',target_table) INTO before_row USING p_id;
 CASE p_kind
 WHEN 'unit' THEN dept:=before_row->>'division';
 WHEN 'shelf' THEN SELECT u.division INTO dept FROM public.shelves s JOIN public.storage_units u ON u.id=s.unit_id WHERE s.id=p_id;
 WHEN 'bay' THEN SELECT u.division INTO dept FROM public.bays b JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id WHERE b.id=p_id;
 WHEN 'bin' THEN SELECT u.division INTO dept FROM public.bins n JOIN public.bays b ON b.id=n.bay_id JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id WHERE n.id=p_id;
 END CASE;
 IF actor.clerk_user_id IS NULL OR before_row IS NULL OR public.current_user_can_edit_division(dept,'can_manage_inventory') IS NOT TRUE THEN
  RAISE EXCEPTION 'Inventory management permission for this department is required' USING ERRCODE='42501'; END IF;
 IF before_row->>'archived_at' IS NOT NULL THEN RAISE EXCEPTION 'Restore this location before editing it'; END IF;
 IF p_expected_revision IS DISTINCT FROM (before_row->>'revision')::integer THEN
  RAISE EXCEPTION 'Location changed. Refresh and review the latest version before saving.' USING ERRCODE='40001'; END IF;
 IF clean_code IS NULL OR clean_code !~ '^[A-Z0-9][A-Z0-9._/-]{0,59}$'
 OR coalesce(length(btrim(p_label)),0) NOT BETWEEN 1 AND 160 OR p_position IS NULL OR p_position<0 OR coalesce(btrim(p_reason),'')='' THEN
  RAISE EXCEPTION 'Enter a valid code, name, nonnegative sort position, and reason' USING ERRCODE='22023'; END IF;
 IF p_details IS NOT NULL AND (jsonb_typeof(p_details)<>'object' OR
 EXISTS(SELECT 1 FROM jsonb_object_keys(p_details) k WHERE k NOT IN ('physical_location','materials_summary')) OR
 EXISTS(SELECT 1 FROM jsonb_each(p_details) e WHERE jsonb_typeof(e.value) NOT IN ('string','null')) OR
 coalesce(length(p_details->>'physical_location'),0)>500 OR coalesce(length(p_details->>'materials_summary'),0)>500) THEN
 RAISE EXCEPTION 'Location details must be text of 500 characters or fewer' USING ERRCODE='22023'; END IF;
 IF parent_field IS NOT NULL THEN
  parent_id:=coalesce(p_parent_id,(before_row->>parent_field)::uuid);
  CASE p_kind
  WHEN 'shelf' THEN SELECT division INTO destination_dept FROM public.storage_units WHERE id=parent_id AND archived_at IS NULL;
  WHEN 'bay' THEN SELECT u.division INTO destination_dept FROM public.shelves s JOIN public.storage_units u ON u.id=s.unit_id
    WHERE s.id=parent_id AND s.archived_at IS NULL AND u.archived_at IS NULL;
  WHEN 'bin' THEN SELECT u.division INTO destination_dept FROM public.bays b JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id
    WHERE b.id=parent_id AND b.archived_at IS NULL AND s.archived_at IS NULL AND u.archived_at IS NULL;
  END CASE;
  IF destination_dept IS NULL OR public.current_user_can_edit_division(destination_dept,'can_manage_inventory') IS NOT TRUE THEN
   RAISE EXCEPTION 'Choose an active parent within your inventory management permissions' USING ERRCODE='42501'; END IF;
 ELSIF p_parent_id IS NOT NULL THEN RAISE EXCEPTION 'Storage units cannot have a parent' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location:'||p_kind||':'||coalesce(parent_id::text,'root')||':'||clean_code,0));
 IF parent_field IS NULL THEN
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id<>$1 AND upper(btrim(%I))=$2)',target_table,code_field) INTO duplicate USING p_id,clean_code;
 ELSE
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id<>$1 AND upper(btrim(%I))=$2 AND %I=$3)',target_table,code_field,parent_field) INTO duplicate USING p_id,clean_code,parent_id;
 END IF;
 IF duplicate THEN RAISE EXCEPTION 'This code already exists at this level. Choose another code.' USING ERRCODE='23505'; END IF;
 IF parent_field IS NULL THEN
  EXECUTE format('UPDATE public.%I SET %I=$2,%I=$3,physical_location=$4,materials_summary=$5,revision=revision+1 WHERE id=$1 RETURNING to_jsonb(%I)',target_table,code_field,label_field,target_table)
   INTO after_row USING p_id,clean_code,btrim(p_label),CASE WHEN p_details ? 'physical_location' THEN nullif(btrim(p_details->>'physical_location'),'') ELSE before_row->>'physical_location' END,CASE WHEN p_details ? 'materials_summary' THEN nullif(btrim(p_details->>'materials_summary'),'') ELSE before_row->>'materials_summary' END;
 ELSE
  EXECUTE format('UPDATE public.%I SET %I=$2,%I=$3,position=$4,%I=$5,physical_location=$6,materials_summary=$7,revision=revision+1 WHERE id=$1 RETURNING to_jsonb(%I)',target_table,code_field,label_field,parent_field,target_table)
   INTO after_row USING p_id,clean_code,btrim(p_label),p_position,parent_id,CASE WHEN p_details ? 'physical_location' THEN nullif(btrim(p_details->>'physical_location'),'') ELSE before_row->>'physical_location' END,CASE WHEN p_details ? 'materials_summary' THEN nullif(btrim(p_details->>'materials_summary'),'') ELSE before_row->>'materials_summary' END;
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.clerk_user_id),target_table,p_id::text,'update',before_row,after_row,btrim(p_reason));
 RETURN after_row;
END $function$;

CREATE OR REPLACE FUNCTION public.hi_job_register_save(p_request_id uuid, p_job_id uuid, p_kind text, p_id uuid, p_expected_version integer, p_data jsonb, p_action text DEFAULT 'save'::text, p_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.maintain_owner_document(p_document_id uuid, p_owner_type text, p_owner_id uuid, p_action text, p_changes jsonb, p_reason text, p_expected_updated_at timestamp with time zone)
 RETURNS documents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.map_material_to_inventory_bin(p_bin_id uuid, p_item_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor public.user_permissions; dept text; material public.items; binding public.bin_items; existing boolean;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('inventory-location-lifecycle',0));
 SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active;
 -- Same bin+item lock as intake to serialize retries and concurrent first counts.
 PERFORM pg_advisory_xact_lock(hashtext(p_bin_id::text||':'||p_item_id::text));
 SELECT u.division INTO dept FROM public.bins n JOIN public.bays b ON b.id=n.bay_id
 JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id
 WHERE n.id=p_bin_id AND n.archived_at IS NULL AND b.archived_at IS NULL AND s.archived_at IS NULL AND u.archived_at IS NULL FOR SHARE OF n;
 SELECT * INTO material FROM public.items WHERE id=p_item_id AND is_active AND NOT is_archived FOR SHARE;
 IF actor.clerk_user_id IS NULL OR dept IS NULL OR material.id IS NULL
 OR public.current_user_can_edit_division(dept,'can_manage_inventory') IS NOT TRUE
 OR public.current_user_can_read_catalog(material.division) IS NOT TRUE THEN
  RAISE EXCEPTION 'Choose an active material and a location within your inventory permissions' USING ERRCODE='42501';
 END IF;
 IF coalesce(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'A mapping reason is required' USING ERRCODE='22023'; END IF;
 SELECT * INTO binding FROM public.bin_items WHERE bin_id=p_bin_id AND item_id=p_item_id FOR UPDATE;
 IF binding.id IS NOT NULL THEN
  IF binding.archived_at IS NOT NULL THEN RAISE EXCEPTION 'This material link is retired. Ask a Developer to review its history; mapping cannot silently reactivate it.'; END IF;
  RETURN jsonb_build_object('bin_item_id',binding.id,'created',false);
 END IF;
 INSERT INTO public.bin_items(bin_id,item_id,min_quantity) VALUES(p_bin_id,p_item_id,0) RETURNING * INTO binding;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.clerk_user_id),'bin_items',binding.id::text,'create',
 to_jsonb(binding)||jsonb_build_object('workflow','location_mapping','quantity_recorded',false),btrim(p_reason));
 -- Deliberately no inventory balance / transaction write. Unknown is not zero.
 RETURN jsonb_build_object('bin_item_id',binding.id,'created',true);
END $function$;

CREATE OR REPLACE FUNCTION public.retire_bin_item(p_bin_item_id uuid, p_reason text)
 RETURNS TABLE(bin_item_id uuid, bin_id uuid, item_id uuid, bin_code text, material_code text, item_name text, ledger_balance numeric, archived_at timestamp with time zone, archived_by text, archive_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  jwt_subject TEXT;
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  target_record RECORD;
  latest_correction_sequence BIGINT;
  latest_correction_occurred_at TIMESTAMPTZ;
  latest_target_quantity NUMERIC;
  calculated_balance NUMERIC := 0;
  reason_text TEXT;
  now_stamp TIMESTAMPTZ := NOW();
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required';
  END IF;

  IF p_bin_item_id IS NULL THEN
    RAISE EXCEPTION 'bin_item_id is required';
  END IF;

  reason_text := NULLIF(trim(COALESCE(p_reason, '')), '');

  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'archive reason is required';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required';
  END IF;

  caller_permissions := public.effective_permissions_for_user(
    caller.role,
    caller.division,
    caller.permission_overrides
  );

  IF caller.role NOT IN ('Developer', 'Administrator', 'Admin') THEN
    RAISE EXCEPTION 'Developer or Administrator role is required to retire a bin item';
  END IF;

  IF COALESCE((caller_permissions ->> 'can_archive_records')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'can_archive_records permission is required to retire a bin item';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_bin_item_id::TEXT));

  SELECT
    bi.id AS bin_item_id,
    bi.bin_id,
    bi.item_id,
    bi.min_quantity,
    bi.created_at,
    bi.archived_at,
    bi.archived_by,
    bi.archive_reason,
    b.bin_code,
    i.material_code,
    i.name AS item_name
  INTO target_record
  FROM public.bin_items bi
  JOIN public.bins b ON b.id = bi.bin_id
  JOIN public.items i ON i.id = bi.item_id
  WHERE bi.id = p_bin_item_id
  FOR UPDATE OF bi;

  IF target_record.bin_item_id IS NULL THEN
    RAISE EXCEPTION 'valid bin_item_id is required';
  END IF;

  IF target_record.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'bin_item is already retired';
  END IF;

  SELECT ti.ledger_sequence, ti.occurred_at, ti.target_quantity
  INTO latest_correction_sequence, latest_correction_occurred_at, latest_target_quantity
  FROM public.transaction_items ti
  WHERE ti.bin_item_id = p_bin_item_id
    AND ti.status = 'approved'
    AND ti.transaction_type = 'physical_count_correction'
    AND ti.target_quantity IS NOT NULL
  ORDER BY ti.occurred_at DESC, ti.ledger_sequence DESC
  LIMIT 1;

  IF latest_correction_sequence IS NOT NULL THEN
    SELECT latest_target_quantity + COALESCE(SUM(
      CASE
        WHEN ti.transaction_type IN (
          'add_stock',
          'return_from_job',
          'return_from_vehicle'
        ) THEN ti.quantity

        WHEN ti.transaction_type IN (
          'remove_stock',
          'assign_to_job',
          'assign_to_vehicle',
          'scrap',
          'vendor_return',
          'mark_damaged'
        ) THEN -ti.quantity

        ELSE 0
      END
    ), 0)
    INTO calculated_balance
    FROM public.transaction_items ti
    WHERE ti.bin_item_id = p_bin_item_id
      AND ti.status = 'approved'
      AND ti.transaction_type <> 'physical_count_correction'
      AND (
        ti.occurred_at > latest_correction_occurred_at
        OR (
          ti.occurred_at = latest_correction_occurred_at
          AND ti.ledger_sequence > latest_correction_sequence
        )
      );
  ELSE
    SELECT COALESCE(SUM(
      CASE
        WHEN ti.transaction_type IN (
          'add_stock',
          'return_from_job',
          'return_from_vehicle'
        ) THEN ti.quantity

        WHEN ti.transaction_type IN (
          'remove_stock',
          'assign_to_job',
          'assign_to_vehicle',
          'scrap',
          'vendor_return',
          'mark_damaged'
        ) THEN -ti.quantity

        ELSE 0
      END
    ), 0)
    INTO calculated_balance
    FROM public.transaction_items ti
    WHERE ti.bin_item_id = p_bin_item_id
      AND ti.status = 'approved'
      AND ti.transaction_type <> 'physical_count_correction';
  END IF;

  calculated_balance := COALESCE(calculated_balance, 0);

  IF calculated_balance <> 0 THEN
    RAISE EXCEPTION 'bin_item balance is %. Use physical count correction to zero it before retirement.', calculated_balance;
  END IF;

  UPDATE public.bin_items bi
  SET archived_at = now_stamp,
      archived_by = jwt_subject,
      archive_reason = reason_text
  WHERE bi.id = p_bin_item_id;

  INSERT INTO public.change_logs (
    user_id,
    user_name,
    table_name,
    record_id,
    action,
    before_data,
    after_data,
    note,
    created_at
  )
  VALUES (
    jwt_subject,
    COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject),
    'bin_items',
    p_bin_item_id::TEXT,
    'archive',
    jsonb_build_object(
      'bin_item_id', target_record.bin_item_id,
      'bin_id', target_record.bin_id,
      'item_id', target_record.item_id,
      'archived_at', target_record.archived_at,
      'archived_by', target_record.archived_by,
      'archive_reason', target_record.archive_reason,
      'ledger_balance', calculated_balance
    ),
    jsonb_build_object(
      'bin_item_id', target_record.bin_item_id,
      'bin_id', target_record.bin_id,
      'item_id', target_record.item_id,
      'archived_at', now_stamp,
      'archived_by', jwt_subject,
      'archive_reason', reason_text,
      'ledger_balance', calculated_balance
    ),
    reason_text,
    now_stamp
  );

  RETURN QUERY
  SELECT
    target_record.bin_item_id,
    target_record.bin_id,
    target_record.item_id,
    target_record.bin_code,
    target_record.material_code,
    target_record.item_name,
    calculated_balance,
    now_stamp,
    jwt_subject,
    reason_text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_material_alias(p_item_id uuid, p_alias text, p_archived boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor public.user_permissions; material public.items; existing public.item_aliases; saved public.item_aliases;
 clean text:=regexp_replace(btrim(p_alias),'\s+',' ','g');
BEGIN
 SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active;
 SELECT * INTO material FROM public.items WHERE id=p_item_id FOR UPDATE;
 IF actor.clerk_user_id IS NULL OR material.id IS NULL OR material.is_active IS NOT TRUE OR material.is_archived IS NOT FALSE
 OR public.current_user_can_edit_division(material.division,'can_edit_catalog') IS NOT TRUE THEN
  RAISE EXCEPTION 'Active material and catalogue edit permission are required' USING ERRCODE='42501';
 END IF;
 IF clean IS NULL OR length(clean) NOT BETWEEN 1 AND 160 OR p_archived IS NULL OR coalesce(btrim(p_reason),'')='' THEN
  RAISE EXCEPTION 'Enter an alias (1–160 characters) and a valid reason' USING ERRCODE='22023';
 END IF;
 SELECT * INTO existing FROM public.item_aliases WHERE item_id=p_item_id AND alias_key=lower(clean) FOR UPDATE;
 IF existing.id IS NOT NULL AND (existing.archived_at IS NOT NULL)=p_archived THEN RETURN to_jsonb(existing); END IF;
 IF existing.id IS NULL THEN
  IF p_archived THEN RAISE EXCEPTION 'Alias not found'; END IF;
  INSERT INTO public.item_aliases(item_id,alias,created_by) VALUES(p_item_id,clean,actor.clerk_user_id) RETURNING * INTO saved;
 ELSE
  UPDATE public.item_aliases SET archived_at=CASE WHEN p_archived THEN clock_timestamp() END,
   archived_by=CASE WHEN p_archived THEN actor.clerk_user_id END,archive_reason=CASE WHEN p_archived THEN btrim(p_reason) END
   WHERE id=existing.id RETURNING * INTO saved;
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.clerk_user_id),'item_aliases',saved.id::text,
 CASE WHEN existing.id IS NULL THEN 'create' WHEN p_archived THEN 'archive' ELSE 'restore' END,
 CASE WHEN existing.id IS NULL THEN NULL ELSE to_jsonb(existing) END,to_jsonb(saved),btrim(p_reason));
 RETURN to_jsonb(saved);
END $function$;

CREATE OR REPLACE FUNCTION public.save_tool_catalogue(p_tool_id uuid, p_division text, p_changes jsonb, p_action text DEFAULT 'save'::text, p_reason text DEFAULT NULL::text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS tools
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE actor text := auth.jwt()->>'sub'; target public.tools; candidate public.tools; saved public.tools;
  reason text := NULLIF(regexp_replace(COALESCE(p_reason,''),'^\s+|\s+$','','g'),'');
  previous_workflow text := current_setting('northgate.tool_workflow',true);
  previous_reason text := current_setting('northgate.tool_reason',true);
  allowed text[] := ARRAY['tool_number','name','category','brand','model','serial_number','description',
    'condition','status','home_location','current_location','assigned_to','purchase_date','notes'];
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication is required' USING ERRCODE='28000'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('save','archive','restore') THEN RAISE EXCEPTION 'Invalid tool action' USING ERRCODE='22023'; END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'object' OR octet_length(p_changes::text)>65536 THEN
    RAISE EXCEPTION 'Tool changes must be an object under 64 KB' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_changes) k WHERE NOT k=ANY(allowed)) THEN
    RAISE EXCEPTION 'Unsupported tool field' USING ERRCODE='22023';
  END IF;
  IF length(reason)>4000 THEN RAISE EXCEPTION 'Reason must not exceed 4000 characters' USING ERRCODE='22023'; END IF;
  IF p_action<>'save' AND p_changes<>'{}'::jsonb THEN RAISE EXCEPTION 'Archive/restore cannot also edit catalogue fields' USING ERRCODE='22023'; END IF;
  IF p_tool_id IS NOT NULL THEN
    SELECT * INTO target FROM public.tools WHERE id=p_tool_id FOR UPDATE;
    IF target.id IS NULL OR public.current_user_can_edit_division(target.division,'can_manage_inventory') IS NOT TRUE THEN
      RAISE EXCEPTION 'Tool not found or management permission missing' USING ERRCODE='42501';
    END IF;
    IF p_expected_updated_at IS NULL OR target.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'This tool changed since you opened it. Refresh and review before saving' USING ERRCODE='40001';
    END IF;
    IF p_action='save' AND target.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Restore the tool before editing' USING ERRCODE='22023'; END IF;
    IF (p_action='archive' AND target.archived_at IS NOT NULL) OR (p_action='restore' AND target.archived_at IS NULL) THEN
      RAISE EXCEPTION 'Tool is no longer in the expected archive state' USING ERRCODE='40001';
    END IF;
    candidate := jsonb_populate_record(target,p_changes);
    IF p_action='save' AND to_jsonb(candidate)=to_jsonb(target) THEN RETURN target; END IF;
    IF reason IS NULL THEN RAISE EXCEPTION 'A reason is required for catalogue edits, archive and restore' USING ERRCODE='22023'; END IF;
  ELSE
    IF p_action<>'save' OR public.current_user_can_edit_division(p_division,'can_manage_inventory') IS NOT TRUE THEN
      RAISE EXCEPTION 'Tool catalogue management permission is required' USING ERRCODE='42501';
    END IF;
    candidate := jsonb_populate_record(NULL::public.tools,p_changes);
    candidate.status := COALESCE(candidate.status,'active');
    candidate.condition := COALESCE(candidate.condition,'unknown');
  END IF;
  IF p_action='save' AND NULLIF(btrim(candidate.name),'') IS NULL THEN RAISE EXCEPTION 'Tool name is required' USING ERRCODE='22023'; END IF;
  IF p_action='save' AND (candidate.status IS NULL OR candidate.status NOT IN ('active','inactive','retired','missing')
    OR candidate.condition IS NULL OR candidate.condition NOT IN ('unknown','good','fair','poor','damaged')) THEN
    RAISE EXCEPTION 'Invalid tool status or condition' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('northgate.tool_workflow',p_action,true);
  PERFORM set_config('northgate.tool_reason',COALESCE(reason,''),true);
  IF p_tool_id IS NULL THEN
    INSERT INTO public.tools(division,tool_number,name,category,brand,model,serial_number,description,condition,status,
      home_location,current_location,assigned_to,purchase_date,notes)
    VALUES(p_division,candidate.tool_number,btrim(candidate.name),candidate.category,candidate.brand,candidate.model,
      candidate.serial_number,candidate.description,candidate.condition,candidate.status,candidate.home_location,
      candidate.current_location,candidate.assigned_to,candidate.purchase_date,candidate.notes) RETURNING * INTO saved;
  ELSIF p_action='save' THEN
    UPDATE public.tools SET tool_number=candidate.tool_number,name=btrim(candidate.name),category=candidate.category,
      brand=candidate.brand,model=candidate.model,serial_number=candidate.serial_number,description=candidate.description,
      condition=candidate.condition,status=candidate.status,home_location=candidate.home_location,
      current_location=candidate.current_location,assigned_to=candidate.assigned_to,purchase_date=candidate.purchase_date,
      notes=candidate.notes WHERE id=target.id RETURNING * INTO saved;
  ELSE
    UPDATE public.tools SET archived_at=CASE WHEN p_action='archive' THEN clock_timestamp() ELSE NULL END,
      archived_by=CASE WHEN p_action='archive' THEN actor ELSE NULL END,
      archive_reason=CASE WHEN p_action='archive' THEN reason ELSE NULL END WHERE id=target.id RETURNING * INTO saved;
  END IF;
  PERFORM set_config('northgate.tool_workflow',COALESCE(previous_workflow,''),true);
  PERFORM set_config('northgate.tool_reason',COALESCE(previous_reason,''),true);
  RETURN saved;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_inventory_location_archived(p_kind text, p_id uuid, p_archived boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor public.user_permissions; target_table text; child_table text; child_fk text; dept text;
 before_row jsonb; after_row jsonb; has_children boolean;
BEGIN
 SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active;
 IF p_archived IS NULL OR coalesce(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'A valid archive/restore reason is required' USING ERRCODE='22023'; END IF;
 CASE p_kind
 WHEN 'unit' THEN target_table:='storage_units';child_table:='shelves';child_fk:='unit_id';
 WHEN 'shelf' THEN target_table:='shelves';child_table:='bays';child_fk:='shelf_id';
 WHEN 'bay' THEN target_table:='bays';child_table:='bins';child_fk:='bay_id';
 WHEN 'bin' THEN target_table:='bins';child_table:='bin_items';child_fk:='bin_id';
 ELSE RAISE EXCEPTION 'Choose a valid location type'; END CASE;
 -- Serialize lifecycle actions; parent-share locks in creation/mapping prevent races.
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location-lifecycle',0));
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',target_table) INTO before_row USING p_id;
 CASE p_kind
 WHEN 'unit' THEN dept:=before_row->>'division';
 WHEN 'shelf' THEN SELECT u.division INTO dept FROM public.shelves s JOIN public.storage_units u ON u.id=s.unit_id WHERE s.id=p_id;
 WHEN 'bay' THEN SELECT u.division INTO dept FROM public.bays b JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id WHERE b.id=p_id;
 WHEN 'bin' THEN SELECT u.division INTO dept FROM public.bins n JOIN public.bays b ON b.id=n.bay_id JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id WHERE n.id=p_id;
 END CASE;
 IF actor.clerk_user_id IS NULL OR before_row IS NULL
 OR public.current_user_can_edit_division(dept,'can_manage_inventory') IS NOT TRUE
 OR public.current_user_can_edit_division(dept,'can_archive_records') IS NOT TRUE THEN
  RAISE EXCEPTION 'Inventory management and archive permission for this department are required' USING ERRCODE='42501';
 END IF;
 IF (before_row->>'archived_at' IS NOT NULL)=p_archived THEN RETURN before_row; END IF;
 IF p_archived THEN
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE %I=$1 AND archived_at IS NULL)',child_table,child_fk) INTO has_children USING p_id;
  IF has_children THEN
   RAISE EXCEPTION 'Location has active child locations or material links. Resolve those explicitly before archiving.' USING ERRCODE='22023';
  END IF;
  IF p_kind='bin' AND EXISTS(SELECT 1 FROM public.bin_items bi JOIN public.inventory_balances ib ON ib.bin_item_id=bi.id WHERE bi.bin_id=p_id AND ib.quantity<>0) THEN
   RAISE EXCEPTION 'This location still has a nonzero inventory balance. Reconcile the stock before archiving.' USING ERRCODE='22023';
  END IF;
 END IF;
 EXECUTE format('UPDATE public.%I SET archived_at=$2,archived_by=$3,archive_reason=$4,revision=revision+1 WHERE id=$1 RETURNING to_jsonb(%I)',target_table,target_table)
 INTO after_row USING p_id,CASE WHEN p_archived THEN clock_timestamp() END,
 CASE WHEN p_archived THEN actor.clerk_user_id END,CASE WHEN p_archived THEN btrim(p_reason) END;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.clerk_user_id),target_table,p_id::text,
 CASE WHEN p_archived THEN 'archive' ELSE 'restore' END,before_row,after_row,btrim(p_reason));
 RETURN after_row;
END $function$;

CREATE OR REPLACE FUNCTION public.set_job_user_assignment(p_job_id uuid, p_user_id text, p_is_assigned boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE jwt_subject TEXT := auth.jwt() ->> 'sub'; normalized_user_id TEXT := NULLIF(trim(COALESCE(p_user_id, '')), ''); normalized_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), ''); caller public.user_permissions%ROWTYPE; target public.user_permissions%ROWTYPE; active_assignment public.job_user_assignments%ROWTYPE; BEGIN IF p_job_id IS NULL OR normalized_user_id IS NULL OR normalized_reason IS NULL THEN RAISE EXCEPTION 'job, user, and reason are required' USING ERRCODE = '22004'; END IF; IF NOT public.current_user_can_edit_job(p_job_id, 'can_manage_jobs') THEN RAISE EXCEPTION 'job management permission is required to change assignments' USING ERRCODE = '42501'; END IF; SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id = jwt_subject AND is_active = TRUE LIMIT 1; SELECT * INTO target FROM public.user_permissions WHERE clerk_user_id = normalized_user_id AND is_active = TRUE LIMIT 1; IF NOT FOUND OR (target.division IS NOT NULL AND NOT public.current_user_can_read_division(target.division)) THEN RAISE EXCEPTION 'user is not available in your approved scope' USING ERRCODE = '42501'; END IF; SELECT * INTO active_assignment FROM public.job_user_assignments WHERE job_id = p_job_id AND user_id = normalized_user_id AND unassigned_at IS NULL FOR UPDATE; IF p_is_assigned THEN IF active_assignment.id IS NULL THEN INSERT INTO public.job_user_assignments (job_id, user_id, assigned_by, note) VALUES (p_job_id, normalized_user_id, jwt_subject, normalized_reason) RETURNING * INTO active_assignment; INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, after_data, note) VALUES (jwt_subject, COALESCE(caller.display_name, caller.email, jwt_subject), 'job_user_assignments', active_assignment.id::TEXT, 'create', to_jsonb(active_assignment), normalized_reason); END IF; ELSIF active_assignment.id IS NOT NULL THEN UPDATE public.job_user_assignments SET unassigned_at = NOW(), updated_at = NOW(), note = normalized_reason WHERE id = active_assignment.id RETURNING * INTO active_assignment; INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note) VALUES (jwt_subject, COALESCE(caller.display_name, caller.email, jwt_subject), 'job_user_assignments', active_assignment.id::TEXT, 'archive', jsonb_build_object('assigned_at', active_assignment.assigned_at), to_jsonb(active_assignment), normalized_reason); END IF; END; $function$;

CREATE OR REPLACE FUNCTION public.svc_archive_call(p_job_id uuid, p_reason text, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE j public.jobs; actor text:=auth.jwt()->>'sub';
BEGIN
 SELECT * INTO j FROM public.jobs WHERE id=p_job_id AND job_type='service_call' AND archived_at IS NULL FOR UPDATE;
 IF actor IS NULL OR j.id IS NULL OR public.current_user_can_edit_job(j.id,'can_archive_records') IS NOT TRUE
  OR public.current_user_can_edit_job(j.id,'can_manage_jobs') IS NOT TRUE
  THEN RAISE EXCEPTION 'Service call archive permission is required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'An archive reason is required' USING ERRCODE='22023'; END IF;
 IF j.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'This call changed. Refresh before archiving.' USING ERRCODE='40001'; END IF;
 UPDATE public.jobs SET archived_at=now(),archived_by=actor,archive_reason=btrim(p_reason) WHERE id=j.id;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,coalesce((SELECT nullif(display_name,'') FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1),actor),'jobs',j.id::text,'update',to_jsonb(j),(SELECT to_jsonb(x) FROM public.jobs x WHERE id=j.id),btrim(p_reason));
 RETURN j.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.svc_save_stage(p_key text, p_label text, p_color text, p_reason text, p_expected_updated_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor text:=auth.jwt()->>'sub'; previous public.svc_stage_definitions; saved public.svc_stage_definitions; stage_key text:=p_key;
BEGIN
 IF actor IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN
  RAISE EXCEPTION 'Developer access required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_label,''))) NOT BETWEEN 1 AND 80 OR coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$'
  OR length(btrim(coalesce(p_reason,'')))<3 THEN
  RAISE EXCEPTION 'Enter a stage name, valid highlight color and audit reason (at least 3 characters)' USING ERRCODE='22023'; END IF;
 IF stage_key IS NULL THEN
  stage_key:='custom_'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.svc_stage_definitions(key,label,background_color,kind,job_status)
   VALUES(stage_key,btrim(p_label),upper(p_color),'work','active') RETURNING * INTO saved;
 ELSE
  SELECT * INTO previous FROM public.svc_stage_definitions WHERE key=stage_key FOR UPDATE;
  IF previous.key IS NULL THEN RAISE EXCEPTION 'Stage not found' USING ERRCODE='22023'; END IF;
  IF previous.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Stage changed. Refresh before saving.' USING ERRCODE='40001'; END IF;
  UPDATE public.svc_stage_definitions SET label=btrim(p_label),background_color=upper(p_color),updated_at=clock_timestamp()
   WHERE key=stage_key RETURNING * INTO saved;
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,coalesce((SELECT nullif(display_name,'') FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1),actor),
 'svc_stage_definitions',stage_key,CASE WHEN p_key IS NULL THEN 'create' ELSE 'update' END,to_jsonb(previous),to_jsonb(saved),btrim(p_reason));
 RETURN stage_key;
END; $function$;

CREATE OR REPLACE FUNCTION public.hi_action(p_request_id uuid, p_id uuid, p_expected_version integer, p_action text, p_data jsonb DEFAULT '{}'::jsonb, p_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.save_employee_profile(p_email text, p_display_name text, p_role text, p_division text, p_job_title text, p_phone text, p_notes text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  caller public.user_permissions%ROWTYPE;
  normalized_email TEXT := lower(NULLIF(trim(COALESCE(p_email, '')), ''));
  normalized_name TEXT := NULLIF(trim(COALESCE(p_display_name, '')), '');
  normalized_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  saved public.employee_profiles%ROWTYPE;
BEGIN
  SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND is_active LIMIT 1;
  IF NOT FOUND OR COALESCE((public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides)->>'can_manage_employees')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'employee management permission is required' USING ERRCODE = '42501';
  END IF;
  IF normalized_email IS NULL OR normalized_name IS NULL OR normalized_reason IS NULL THEN RAISE EXCEPTION 'email, name, and reason are required' USING ERRCODE = '22004'; END IF;
  IF normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'a valid email is required' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.employee_profiles (email, display_name, role, division, job_title, phone, notes, created_by)
  VALUES (normalized_email, normalized_name, COALESCE(NULLIF(trim(p_role), ''), 'User'), NULLIF(trim(p_division), ''), NULLIF(trim(p_job_title), ''), NULLIF(trim(p_phone), ''), NULLIF(trim(p_notes), ''), auth.jwt() ->> 'sub')
  ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, division = EXCLUDED.division, job_title = EXCLUDED.job_title, phone = EXCLUDED.phone, notes = EXCLUDED.notes, updated_at = NOW()
  RETURNING * INTO saved;
  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, after_data, note)
  VALUES (auth.jwt() ->> 'sub', COALESCE(caller.display_name, caller.email, auth.jwt() ->> 'sub'), 'employee_profiles', saved.id::TEXT, 'update', to_jsonb(saved), normalized_reason);
  RETURN saved.id;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_pending_employee_profile(p_profile_id uuid, p_email text, p_display_name text, p_role text, p_division text, p_job_title text, p_phone text, p_notes text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  caller public.user_permissions%ROWTYPE;
  before_row public.employee_profiles%ROWTYPE;
  saved public.employee_profiles%ROWTYPE;
  normalized_email TEXT:=lower(NULLIF(BTRIM(COALESCE(p_email,'')),''));
  normalized_name TEXT:=NULLIF(BTRIM(COALESCE(p_display_name,'')),'');
  normalized_reason TEXT:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
BEGIN
  SELECT * INTO caller FROM public.user_permissions
  WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active=TRUE LIMIT 1;
  IF caller.id IS NULL OR COALESCE((public.effective_permissions_for_user(caller.role,caller.division,caller.permission_overrides)->>'can_manage_employees')::BOOLEAN,FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'employee management permission is required' USING ERRCODE='42501';
  END IF;
  IF p_profile_id IS NULL OR normalized_email IS NULL OR normalized_name IS NULL OR normalized_reason IS NULL THEN
    RAISE EXCEPTION 'profile, email, name, and reason are required' USING ERRCODE='22004';
  END IF;
  IF normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'a valid email is required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO before_row FROM public.employee_profiles
  WHERE id=p_profile_id AND clerk_user_id IS NULL AND archived_at IS NULL FOR UPDATE;
  IF before_row.id IS NULL THEN
    RAISE EXCEPTION 'active pending employee profile not found' USING ERRCODE='P0002';
  END IF;
  UPDATE public.employee_profiles SET
    email=normalized_email, display_name=normalized_name,
    role=COALESCE(NULLIF(BTRIM(p_role),''),'User'), division=NULLIF(BTRIM(p_division),''),
    job_title=NULLIF(BTRIM(p_job_title),''), phone=NULLIF(BTRIM(p_phone),''),
    notes=NULLIF(BTRIM(p_notes),''), updated_at=NOW()
  WHERE id=before_row.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(auth.jwt()->>'sub',COALESCE(caller.display_name,caller.email,auth.jwt()->>'sub'),'employee_profiles',saved.id::TEXT,'update',to_jsonb(before_row),to_jsonb(saved),normalized_reason);
  RETURN saved.id;
END $function$;
