-- Explicitly reviewed routine workflows only. Financial posting/correction,
-- stock counts, permission changes, immutable revisions and permanent deletion
-- are deliberately absent. No authorization/validation/audit logic is removed.
DO $routine$
DECLARE entry record; definition text; start_decl integer; start_body integer; expression text;
BEGIN
 FOR entry IN SELECT * FROM (VALUES
  ('archive_estimate','uuid, text','Automatic audit: archive estimate.'),
  ('archive_estimate_document','uuid, text','Automatic audit: archive estimate document.'),
  ('archive_job','uuid, text','Automatic audit: archive job.'),
  ('archive_job_document','uuid, text','Automatic audit: archive job document.'),
  ('archive_job_schedule_item','uuid, text','Automatic audit: archive job schedule item.'),
  ('archive_pending_employee_profile','uuid, text','Automatic audit: archive pending employee profile.'),
  ('edit_inventory_location','text, uuid, text, text, integer, integer, text, jsonb, uuid','Automatic audit: edit inventory location.'),
  ('hi_job_register_save','uuid, uuid, text, uuid, integer, jsonb, text, text','Automatic audit: hi job register save.'),
  ('maintain_owner_document','uuid, text, uuid, text, jsonb, text, timestamp with time zone','Automatic audit: maintain owner document.'),
  ('map_material_to_inventory_bin','uuid, uuid, text','Automatic audit: map material to inventory bin.'),
  ('retire_bin_item','uuid, text','Automatic audit: retire bin item.'),
  ('save_material_alias','uuid, text, boolean, text','Automatic audit: save material alias.'),
  ('save_tool_catalogue','uuid, text, jsonb, text, text, timestamp with time zone','Automatic audit: save tool catalogue.'),
  ('set_inventory_location_archived','text, uuid, boolean, text','Automatic audit: set inventory location archived.'),
  ('set_job_user_assignment','uuid, text, boolean, text','Automatic audit: set job user assignment.'),
  ('svc_archive_call','uuid, text, timestamp with time zone','Automatic audit: svc archive call.'),
  ('svc_save_stage','text, text, text, text, timestamp with time zone','Automatic audit: svc save stage.')
 ) AS functions(name,args,note) LOOP
  SELECT pg_get_functiondef((format('public.%I(%s)',entry.name,entry.args))::regprocedure) INTO definition;
  IF definition NOT LIKE '%LANGUAGE plpgsql%' OR position('p_reason text' IN definition)=0 THEN
   RAISE EXCEPTION 'Review routine audit compatibility for %',entry.name;
  END IF;
  expression:=format('coalesce(nullif(btrim(p_reason),''''),%L)',entry.note);
  start_decl:=strpos(upper(definition),'DECLARE');
  start_body:=strpos(upper(definition),'BEGIN');
  IF start_body=0 THEN RAISE EXCEPTION 'Missing routine body: %',entry.name; END IF;
  -- Initialized reason variables must receive the same automatic note as the
  -- parameter; preserve explicitly supplied notes from older clients.
  IF start_decl>0 AND start_decl<start_body THEN
   definition:=left(definition,start_decl-1)
    ||replace(substring(definition FROM start_decl FOR start_body-start_decl),'p_reason',expression)
    ||substring(definition FROM start_body);
  END IF;
  definition:=regexp_replace(definition,'\mBEGIN\M','BEGIN'||chr(10)||' p_reason := '||expression||';','i');
  EXECUTE definition;
 END LOOP;
END $routine$;

-- Linking/assigning a draft inspection is operational. Issuing, revising and
-- altering technical evidence still use the original reason requirements.
DO $inspection$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.hi_action(uuid,uuid,integer,text,jsonb,text)'::regprocedure) INTO definition;
 definition:=regexp_replace(definition,'\mBEGIN\M',
  'BEGIN'||chr(10)||' IF p_action IN (''assign'',''link'',''create_call'') THEN p_reason:=coalesce(nullif(btrim(p_reason),''''),''Automatic audit: inspection ''||p_action||''.''); END IF;','i');
 EXECUTE definition;
END $inspection$;

-- Contact details are routine; identity and access changes keep explicit reasons.
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
  IF normalized_email IS NULL OR normalized_name IS NULL THEN RAISE EXCEPTION 'email and name are required' USING ERRCODE = '22004'; END IF;
  IF normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'a valid email is required' USING ERRCODE = '22023'; END IF;
  IF COALESCE(NULLIF(trim(p_role),''),'User') <> 'User' AND normalized_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required when granting an elevated role' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.employee_profiles (email, display_name, role, division, job_title, phone, notes, created_by)
  VALUES (normalized_email, normalized_name, COALESCE(NULLIF(trim(p_role), ''), 'User'), NULLIF(trim(p_division), ''), NULLIF(trim(p_job_title), ''), NULLIF(trim(p_phone), ''), NULLIF(trim(p_notes), ''), auth.jwt() ->> 'sub')
  ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, division = EXCLUDED.division, job_title = EXCLUDED.job_title, phone = EXCLUDED.phone, notes = EXCLUDED.notes, updated_at = NOW()
  WHERE normalized_reason IS NOT NULL OR (employee_profiles.role IS NOT DISTINCT FROM EXCLUDED.role AND employee_profiles.division IS NOT DISTINCT FROM EXCLUDED.division)
  RETURNING * INTO saved;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'A reason is required to change existing role or department access' USING ERRCODE='22023'; END IF;
  normalized_reason:=coalesce(normalized_reason,'Automatic audit: employee profile saved.');
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
  IF p_profile_id IS NULL OR normalized_email IS NULL OR normalized_name IS NULL THEN
    RAISE EXCEPTION 'profile, email, and name are required' USING ERRCODE='22004';
  END IF;
  IF normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'a valid email is required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO before_row FROM public.employee_profiles
  WHERE id=p_profile_id AND clerk_user_id IS NULL AND archived_at IS NULL FOR UPDATE;
  IF before_row.id IS NULL THEN
    RAISE EXCEPTION 'active pending employee profile not found' USING ERRCODE='P0002';
  END IF;
  IF (before_row.role IS DISTINCT FROM COALESCE(NULLIF(BTRIM(p_role),''),'User')
      OR before_row.division IS DISTINCT FROM NULLIF(BTRIM(p_division),'')
      OR before_row.email IS DISTINCT FROM normalized_email) AND normalized_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required for role, department or account-email changes' USING ERRCODE='22023';
  END IF;
  normalized_reason:=coalesce(normalized_reason,'Automatic audit: employee profile details updated.');
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
