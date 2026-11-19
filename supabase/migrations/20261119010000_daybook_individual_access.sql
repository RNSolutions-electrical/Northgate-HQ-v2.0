-- Per-user Daybook access; shared edits remain developer-only.
-- Compensation requires an explicit individual grant, including developers.
BEGIN;
INSERT INTO public.tool_addons(addon_key,label,category,description) VALUES
 ('daybook','Daybook','general','Private personal planning and read-only Northgate schedule.'),
 ('daybook_pay','Daybook pay visibility','general','Explicit access to worker compensation; never implied by Developer access.')
ON CONFLICT(addon_key) DO UPDATE SET label=excluded.label,description=excluded.description;

CREATE OR REPLACE FUNCTION public.read_developer_addon_console()
RETURNS TABLE (
  user_id TEXT,
  display_name TEXT,
  email TEXT,
  role TEXT,
  division TEXT,
  addon_key TEXT,
  addon_label TEXT,
  addon_category TEXT,
  enabled BOOLEAN,
  access_reason TEXT,
  access_updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT up.clerk_user_id, up.display_name, up.email, up.role, up.division,
    addon.addon_key, addon.label, addon.category,
    COALESCE(access.enabled, FALSE), access.reason, access.updated_at
  FROM public.user_permissions up
  CROSS JOIN public.tool_addons addon
  LEFT JOIN public.tool_addon_access access
    ON access.clerk_user_id = up.clerk_user_id AND access.addon_key = addon.addon_key
  WHERE up.is_active = TRUE AND addon.is_active = TRUE
    AND (addon.addon_key <> 'daybook_pay' OR public.user_can_manage_developers(auth.jwt()->>'sub'))
  ORDER BY up.display_name NULLS LAST, up.email NULLS LAST, addon.label;
END;
$$;

REVOKE ALL ON FUNCTION public.read_developer_addon_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_developer_addon_console() TO authenticated;
ALTER POLICY tool_addon_access_developer_read ON public.tool_addon_access
 USING (public.current_user_has_developer_access() AND
 (addon_key <> 'daybook_pay' OR public.user_can_manage_developers(auth.jwt()->>'sub')));

CREATE OR REPLACE FUNCTION public.set_user_addon_access(
  p_user_id TEXT,
  p_addon_key TEXT,
  p_enabled BOOLEAN,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  previous_row public.tool_addon_access%ROWTYPE;
  saved_row public.tool_addon_access%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required' USING ERRCODE = '42501';
  END IF;
  -- Pay grants are a separate protected authority, never a developer self-upgrade.
  IF p_addon_key = 'daybook_pay' AND public.user_can_manage_developers(actor_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Primary authority is required to change Daybook pay access' USING ERRCODE = '42501';
  END IF;
  IF length(BTRIM(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_permissions WHERE clerk_user_id = p_user_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Active user was not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tool_addons WHERE addon_key = p_addon_key AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Active add-on was not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO previous_row FROM public.tool_addon_access
  WHERE clerk_user_id = p_user_id AND addon_key = p_addon_key;

  INSERT INTO public.tool_addon_access (addon_key, clerk_user_id, enabled, updated_by, reason)
  VALUES (p_addon_key, p_user_id, p_enabled, actor_id, BTRIM(p_reason))
  ON CONFLICT (addon_key, clerk_user_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    updated_by = EXCLUDED.updated_by,
    reason = EXCLUDED.reason,
    updated_at = NOW()
  RETURNING * INTO saved_row;

  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note)
  VALUES (actor_id, actor_id, 'tool_addon_access', saved_row.id::TEXT, 'permission_change',
    CASE WHEN previous_row.id IS NULL THEN NULL ELSE to_jsonb(previous_row) END,
    to_jsonb(saved_row), BTRIM(p_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_addon_access(TEXT,TEXT,BOOLEAN,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_user_addon_access(TEXT,TEXT,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_user_can_access_addon(p_addon_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((p_addon_key IS DISTINCT FROM 'daybook_pay' AND public.current_user_has_developer_access()) OR EXISTS (
 SELECT 1 FROM public.tool_addon_access a JOIN public.tool_addons t USING(addon_key)
 JOIN public.user_permissions u ON u.clerk_user_id=a.clerk_user_id
 WHERE a.addon_key=p_addon_key AND a.clerk_user_id=auth.jwt()->>'sub' AND a.enabled AND t.is_active AND u.is_active),false)
$$;
CREATE OR REPLACE FUNCTION daybook_private.allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT nullif(auth.jwt()->>'sub','') IS NOT NULL
 AND coalesce(auth.jwt()->>'is_anonymous','false')='false'
 AND EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active)
 AND public.current_user_can_access_addon('daybook')
$$;
CREATE FUNCTION daybook_private.can_pay() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT daybook_private.allowed() AND EXISTS (
 SELECT 1 FROM public.tool_addon_access a JOIN public.tool_addons t USING(addon_key)
 WHERE a.addon_key='daybook_pay' AND a.clerk_user_id=auth.jwt()->>'sub' AND a.enabled AND t.is_active)
$$;
CREATE FUNCTION daybook_private.pick(p jsonb,keys text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(p) WHERE key=ANY(keys)
$$;
-- Unknown worker fields are confidential by default. Keep this list synchronized
-- with preserve_workers; never copy arbitrary nested profile data to a reader.
CREATE FUNCTION daybook_private.worker_public_keys() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT ARRAY['id','name','role','hours','active','contactId','phone','email','company','ptoPlans','ptoWeekdays','ptoExcludeHolidays']::text[]
$$;
CREATE FUNCTION daybook_private.project(p jsonb,manager boolean,pay boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE outp jsonb:=p; k text; keys text[]; items jsonb; item jsonb; permitted_jobs text[]:=ARRAY[]::text[];
BEGIN
 IF p IS NULL THEN RETURN NULL; END IF;
 IF manager THEN
  IF NOT pay THEN
   SELECT coalesce(jsonb_agg(daybook_private.pick(value,daybook_private.worker_public_keys())),'[]') INTO items FROM jsonb_array_elements(coalesce(p->'workers','[]'));
   outp:=jsonb_set(outp,'{workers}',items);
  END IF;
  RETURN outp;
 END IF;
 outp:=jsonb_build_object('version',1,'notes','[]'::jsonb,'contacts','[]'::jsonb,'events','[]'::jsonb);
 FOREACH k IN ARRAY ARRAY['calendars','jobs','workers','assignments','pto'] LOOP
  keys:=CASE k
   WHEN 'calendars' THEN ARRAY['id','name','color']
   WHEN 'jobs' THEN ARRAY['id','calendar','name','number','hqJobId']
   WHEN 'workers' THEN ARRAY['id','name','role','hours','active','ptoWeekdays','ptoExcludeHolidays']
   WHEN 'assignments' THEN ARRAY['id','job','workers','start','end','hours','weekdays','excludeHolidays','status','color','dayExceptions']
   WHEN 'pto' THEN ARRAY['id','calendar','person','workerId','start','end','dailyHours','status'] END;
  IF k='workers' AND pay THEN keys:=keys||ARRAY['rate']; END IF;
  items:='[]';
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p->k,'[]')) LOOP
   IF k='pto' AND (item->>'status' IS DISTINCT FROM 'Approved' OR item->>'calendar' IS DISTINCT FROM 'northgate') THEN CONTINUE; END IF;
   IF k='jobs' AND item ? 'hqJobId' THEN
    -- Invalid identifiers and inaccessible canonical jobs fail closed.
    IF coalesce(item->>'hqJobId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN CONTINUE; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.jobs j WHERE j.id=(item->>'hqJobId')::uuid AND j.archived_at IS NULL AND public.current_user_can_access_job(j.id)) THEN CONTINUE; END IF;
   END IF;
   IF k='jobs' THEN permitted_jobs:=array_append(permitted_jobs,item->>'id'); END IF;
   IF k='assignments' AND NOT (item->>'job'=ANY(permitted_jobs)) THEN CONTINUE; END IF;
   item:=daybook_private.pick(item,keys);
   IF k='assignments' AND item ? 'dayExceptions' THEN
    item:=jsonb_set(item,'{dayExceptions}',(SELECT coalesce(jsonb_agg(daybook_private.pick(e,ARRAY['worker','date'])),'[]') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(item->'dayExceptions')='array' THEN item->'dayExceptions' ELSE '[]'::jsonb END) e WHERE jsonb_typeof(e)='object'));
   END IF;
   items:=items||jsonb_build_array(item);
  END LOOP;
  outp:=jsonb_set(outp,ARRAY[k],items);
 END LOOP;
 RETURN outp;
END $$;
-- Under the shared advisory/row lock, preserve every protected key blindly by
-- stable worker ID. A sanitized restore must not erase historical/current pay.
CREATE FUNCTION daybook_private.preserve_workers(incoming jsonb,stored jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE w jsonb; oldw jsonb; protected jsonb; workers jsonb:='[]'; keys text[]:=daybook_private.worker_public_keys();
BEGIN
 FOR oldw IN SELECT value FROM jsonb_array_elements(coalesce(stored->'workers','[]')) LOOP
  protected:=oldw-keys;
  IF protected<>'{}' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(incoming->'workers','[]')) v WHERE v->>'id'=oldw->>'id') THEN
   RAISE EXCEPTION 'Protected worker cannot be removed without explicit Daybook pay access' USING ERRCODE='42501';
  END IF;
 END LOOP;
 FOR w IN SELECT value FROM jsonb_array_elements(coalesce(incoming->'workers','[]')) LOOP
  SELECT value INTO oldw FROM jsonb_array_elements(coalesce(stored->'workers','[]')) WHERE value->>'id'=w->>'id';
  workers:=workers||jsonb_build_array(daybook_private.pick(w,keys)||coalesce(oldw-keys,'{}'));
 END LOOP;
 RETURN jsonb_set(incoming,'{workers}',workers);
END $$;
CREATE OR REPLACE FUNCTION daybook_private.workspace() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE personal jsonb; company jsonb; manager boolean:=public.current_user_has_developer_access(); pay boolean:=daybook_private.can_pay();
BEGIN
 IF daybook_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Daybook access denied' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('payload',payload,'version',version,'updated_at',updated_at) INTO personal
 FROM daybook_private.documents WHERE scope='personal' AND owner_id=auth.jwt()->>'sub';
 SELECT jsonb_build_object('payload',daybook_private.project(payload,manager,pay),'version',version,'updated_at',updated_at) INTO company
 FROM daybook_private.documents WHERE scope='northgate' AND owner_id='company';
 RETURN jsonb_build_object('personal',coalesce(personal,jsonb_build_object('payload',null,'version',0,'updated_at',null)),
 'northgate',coalesce(company,jsonb_build_object('payload',null,'version',0,'updated_at',null)),
 'can_manage_northgate',manager,'can_view_pay',pay);
END $$;
CREATE OR REPLACE FUNCTION daybook_private.save_workspace(p_personal jsonb,p_northgate jsonb,p_personal_version integer,p_northgate_version integer,p_restore boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject text:=auth.jwt()->>'sub'; sc text; own text; incoming jsonb; expected integer; current_doc daybook_private.documents; old_version integer; operation uuid:=gen_random_uuid();
BEGIN
 IF daybook_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Daybook pilot access denied' USING ERRCODE='42501'; END IF;
 IF p_northgate IS NOT NULL AND public.current_user_has_developer_access() IS NOT TRUE THEN RAISE EXCEPTION 'Shared Daybook is read-only' USING ERRCODE='42501'; END IF;
 IF p_restore IS NULL OR (p_personal IS NULL AND p_northgate IS NULL) THEN RAISE EXCEPTION 'No Daybook changes supplied' USING ERRCODE='22023'; END IF;
 -- Serialize the shared row first, then the user row: stable order and safe first-insert CAS.
 IF p_northgate IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('daybook:northgate:company',0)); END IF;
 IF p_personal IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('daybook:personal:'||subject,0)); END IF;
 FOREACH sc IN ARRAY ARRAY['northgate','personal'] LOOP
  incoming:=CASE sc WHEN 'personal' THEN p_personal ELSE p_northgate END;
  IF incoming IS NULL THEN CONTINUE; END IF;
  expected:=CASE sc WHEN 'personal' THEN p_personal_version ELSE p_northgate_version END;
  own:=CASE sc WHEN 'personal' THEN subject ELSE 'company' END;
  IF expected IS NULL OR expected<0 THEN RAISE EXCEPTION 'Current Daybook version required' USING ERRCODE='22023'; END IF;
  PERFORM daybook_private.validate_payload(sc,incoming);
  SELECT * INTO current_doc FROM daybook_private.documents WHERE scope=sc AND owner_id=own FOR UPDATE;
  old_version:=CASE WHEN FOUND THEN current_doc.version ELSE 0 END;
  IF old_version<>expected THEN RAISE EXCEPTION 'Daybook changed in another session; reload before saving' USING ERRCODE='40001'; END IF;
  IF sc='northgate' AND NOT daybook_private.can_pay() THEN incoming:=daybook_private.preserve_workers(incoming,current_doc.payload); END IF;
  IF old_version>0 AND incoming=current_doc.payload AND NOT p_restore THEN CONTINUE; END IF;
  INSERT INTO daybook_private.documents(scope,owner_id,payload,version,updated_by)
   VALUES(sc,own,incoming,old_version+1,subject)
   ON CONFLICT(scope,owner_id) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated_by=excluded.updated_by,updated_at=now();
  INSERT INTO daybook_private.history(operation_id,scope,owner_id,actor_id,action,before_version,after_version,before_data,after_data,snapshot_kind)
   VALUES(operation,sc,own,subject,CASE WHEN p_restore THEN 'restore' ELSE 'save' END,old_version,old_version+1,
   CASE WHEN old_version>0 THEN current_doc.payload ELSE NULL END,incoming,CASE WHEN p_restore THEN 'pre-restore' ELSE NULL END);
 END LOOP;
 RETURN daybook_private.workspace();
END $$;
CREATE OR REPLACE FUNCTION daybook_private.list_history(p_scope text) RETURNS SETOF daybook_private.history
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE h daybook_private.history;
BEGIN
 IF daybook_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Daybook access denied' USING ERRCODE='42501'; END IF;
 IF p_scope NOT IN ('personal','northgate') OR p_scope IS NULL THEN RAISE EXCEPTION 'Invalid Daybook scope' USING ERRCODE='22023'; END IF;
 IF p_scope='northgate' AND public.current_user_has_developer_access() IS NOT TRUE THEN RAISE EXCEPTION 'Shared Daybook history denied' USING ERRCODE='42501'; END IF;
 FOR h IN SELECT x.* FROM daybook_private.history x WHERE x.scope=p_scope
 AND x.owner_id=CASE WHEN p_scope='personal' THEN auth.jwt()->>'sub' ELSE 'company' END ORDER BY x.id DESC LIMIT 100 LOOP
  IF p_scope='northgate' THEN
   h.before_data:=daybook_private.project(h.before_data,true,daybook_private.can_pay());
   h.after_data:=daybook_private.project(h.after_data,true,daybook_private.can_pay());
  END IF;
  RETURN NEXT h;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION daybook_private.can_pay(),daybook_private.pick(jsonb,text[]),daybook_private.worker_public_keys(),daybook_private.project(jsonb,boolean,boolean),daybook_private.preserve_workers(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
-- No direct payload/history reads, even if table SELECT is accidentally granted
-- later. Security-definer RPCs return the caller-specific projection.
ALTER POLICY daybook_doc_owner ON daybook_private.documents USING (false);
ALTER POLICY daybook_history_owner ON daybook_private.history USING (false);
-- Table access remains revoked. RPC boundaries enforce all per-scope writes.
COMMIT;
