-- Standalone developer-accessible HQ work log. No writes or triggers on operational HQ records.
BEGIN;
CREATE SCHEMA hq_time_private;
REVOKE ALL ON SCHEMA hq_time_private FROM PUBLIC, anon, authenticated;

-- Empty by default. A separately authorized administrative migration can add
-- a tracker-only subject without changing any global HQ technical assignment.
CREATE TABLE hq_time_private.access_grants (subject text PRIMARY KEY CHECK (length(btrim(subject))>0));
ALTER TABLE hq_time_private.access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hq_time_private.access_grants FROM PUBLIC, anon, authenticated;
CREATE FUNCTION hq_time_private.can_track() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT nullif(auth.jwt()->>'sub','') IS NOT NULL
 AND coalesce(auth.jwt()->>'is_anonymous','false')='false'
 AND EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active)
 AND (coalesce(public.current_user_has_developer_access(),false)
      OR EXISTS(SELECT 1 FROM hq_time_private.access_grants WHERE subject=auth.jwt()->>'sub'))
$$;
REVOKE ALL ON FUNCTION hq_time_private.can_track() FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA hq_time_private TO authenticated;
GRANT EXECUTE ON FUNCTION hq_time_private.can_track() TO authenticated;

CREATE FUNCTION public.current_user_can_track_hq_time() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT hq_time_private.can_track()
$$;
REVOKE ALL ON FUNCTION public.current_user_can_track_hq_time() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_track_hq_time() TO authenticated;

-- Narrow binding lookup: only authorized technical developers can obtain the
-- performer used by this shared log; no direct binding-table grant is added.
CREATE FUNCTION public.hq_time_default_performer() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE performer text;
BEGIN
 IF public.current_user_can_track_hq_time() IS NOT TRUE THEN RAISE EXCEPTION 'HQ time access denied' USING ERRCODE='42501'; END IF;
 SELECT user_id INTO performer FROM public.protected_account_bindings WHERE account_key='primary';
 IF nullif(performer,'') IS NULL THEN RAISE EXCEPTION 'HQ time performer binding unavailable' USING ERRCODE='22023'; END IF;
 RETURN performer;
END $$;
REVOKE ALL ON FUNCTION public.hq_time_default_performer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_time_default_performer() TO authenticated;

CREATE TABLE public.hq_time_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 performed_by text NOT NULL DEFAULT public.hq_time_default_performer(),
 created_by text NOT NULL DEFAULT (auth.jwt()->>'sub'),
 updated_by text NOT NULL DEFAULT (auth.jwt()->>'sub'),
 entry_date date NOT NULL,
 activity text NOT NULL CHECK (length(btrim(activity)) BETWEEN 1 AND 200),
 started_at timestamptz NOT NULL,
 ended_at timestamptz,
 elapsed_minutes numeric GENERATED ALWAYS AS (extract(epoch FROM (ended_at - started_at)) / 60.0) STORED,
 classification text CHECK (classification IN ('scheduled','outside_hours')),
 focused_minutes numeric CHECK (focused_minutes IS NULL OR (focused_minutes >= 0 AND ended_at IS NOT NULL AND focused_minutes <= extract(epoch FROM (ended_at - started_at)) / 60.0)),
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
 accomplishments text NOT NULL DEFAULT '' CHECK (length(accomplishments)<=5000),
 next_steps text NOT NULL DEFAULT '' CHECK (length(next_steps)<=5000),
 work_items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(work_items)='array'),
 time_zone text NOT NULL DEFAULT 'UTC',
 archived_at timestamptz,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 -- Write-only compare-and-swap input, cleared by trigger before storage.
 write_version integer CHECK (write_version IS NULL),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (isfinite(entry_date)),
 CHECK (isfinite(started_at) AND (ended_at IS NULL OR (isfinite(ended_at) AND ended_at > started_at))),
 CHECK (ended_at IS NOT NULL OR archived_at IS NULL)
);
CREATE INDEX hq_time_entries_date_idx ON public.hq_time_entries(entry_date DESC, started_at DESC);
CREATE UNIQUE INDEX hq_time_one_active_performer ON public.hq_time_entries(performed_by) WHERE ended_at IS NULL;
CREATE TABLE public.hq_time_entry_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entry_id uuid NOT NULL REFERENCES public.hq_time_entries(id),
 performed_by text NOT NULL,
 actor_id text NOT NULL,
 action text NOT NULL CHECK (action IN ('backfill','update','correction','clock_in','clock_out','archive','restore')),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 before_data jsonb,
 after_data jsonb NOT NULL
);
CREATE INDEX hq_time_entry_audit_entry_idx ON public.hq_time_entry_audit(entry_id, recorded_at);
ALTER TABLE public.hq_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hq_time_entry_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hq_time_entries, public.hq_time_entry_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hq_time_entries, public.hq_time_entry_audit TO authenticated;
GRANT INSERT(id,entry_date,activity,started_at,ended_at,classification,focused_minutes,notes,accomplishments,next_steps,work_items,time_zone) ON public.hq_time_entries TO authenticated;
GRANT UPDATE(entry_date,activity,started_at,ended_at,classification,focused_minutes,notes,accomplishments,next_steps,work_items,time_zone,archived_at,write_version) ON public.hq_time_entries TO authenticated;
CREATE POLICY hq_time_entries_developer_select ON public.hq_time_entries FOR SELECT TO authenticated
 USING ((SELECT public.current_user_can_track_hq_time()));
CREATE POLICY hq_time_entries_developer_insert ON public.hq_time_entries FOR INSERT TO authenticated
 WITH CHECK ((SELECT public.current_user_can_track_hq_time()));
CREATE POLICY hq_time_entries_developer_update ON public.hq_time_entries FOR UPDATE TO authenticated
 USING ((SELECT public.current_user_can_track_hq_time()))
 WITH CHECK ((SELECT public.current_user_can_track_hq_time()));
CREATE POLICY hq_time_audit_developer_select ON public.hq_time_entry_audit FOR SELECT TO authenticated
 USING ((SELECT public.current_user_can_track_hq_time()));

CREATE FUNCTION hq_time_private.guard_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE item jsonb; item_id uuid;
BEGIN
 IF public.current_user_can_track_hq_time() IS NOT TRUE THEN
  RAISE EXCEPTION 'HQ time access denied' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=NEW.time_zone) THEN
  RAISE EXCEPTION 'Invalid time zone' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(NEW.work_items)<>'array' OR jsonb_array_length(NEW.work_items)>200 THEN
  RAISE EXCEPTION 'Invalid work items' USING ERRCODE='22023';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.work_items) LOOP
  IF jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR
    jsonb_typeof(item->'title') IS DISTINCT FROM 'string' OR length(btrim(item->>'title')) NOT BETWEEN 1 AND 200 OR
    coalesce(item->>'status','') NOT IN ('underway','completed','discarded') OR
    (item ? 'notes' AND (jsonb_typeof(item->'notes') IS DISTINCT FROM 'string' OR length(item->>'notes')>2000)) OR
    EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN ('id','title','status','notes')) THEN
   RAISE EXCEPTION 'Invalid work item' USING ERRCODE='22023';
  END IF;
  item_id:=(item->>'id')::uuid;
 END LOOP;
 IF (SELECT count(*)<>count(DISTINCT (value->>'id')::uuid) FROM jsonb_array_elements(NEW.work_items)) THEN
  RAISE EXCEPTION 'Duplicate work item IDs' USING ERRCODE='22023';
 END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.work_items) old_item
  WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.work_items) new_item WHERE (new_item->>'id')::uuid=(old_item->>'id')::uuid)) THEN
  RAISE EXCEPTION 'Preserve work items; mark discarded instead' USING ERRCODE='22023';
 END IF;
 IF TG_OP='INSERT' THEN
  NEW.performed_by:=public.hq_time_default_performer(); NEW.created_by:=auth.jwt()->>'sub'; NEW.updated_by:=auth.jwt()->>'sub';
  -- An open entry always starts on the server, never from a forged client clock.
  IF NEW.ended_at IS NULL THEN NEW.started_at:=clock_timestamp(); NEW.entry_date:=(NEW.started_at AT TIME ZONE NEW.time_zone)::date; END IF;
  NEW.version:=1; NEW.write_version:=NULL; NEW.created_at:=now(); NEW.updated_at:=now(); NEW.archived_at:=NULL;
 ELSE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.performed_by IS DISTINCT FROM OLD.performed_by OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.updated_by IS DISTINCT FROM OLD.updated_by OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.version IS DISTINCT FROM OLD.version THEN
   RAISE EXCEPTION 'Protected HQ time fields cannot change' USING ERRCODE='42501';
  END IF;
  IF NEW.write_version IS DISTINCT FROM OLD.version THEN
   RAISE EXCEPTION 'HQ time entry changed; reload before saving' USING ERRCODE='40001';
  END IF;
  IF OLD.ended_at IS NOT NULL AND NEW.ended_at IS NULL THEN RAISE EXCEPTION 'Completed sessions cannot be reopened; clock in a new session' USING ERRCODE='22023'; END IF;
  NEW.updated_by:=auth.jwt()->>'sub';
  NEW.version:=OLD.version+1; NEW.write_version:=NULL; NEW.updated_at:=now();
  IF NEW.archived_at IS NOT NULL THEN NEW.archived_at:=coalesce(OLD.archived_at,now()); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION hq_time_private.audit_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF public.current_user_can_track_hq_time() IS NOT TRUE THEN
  RAISE EXCEPTION 'HQ time audit access denied' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.hq_time_entry_audit(entry_id,performed_by,actor_id,action,before_data,after_data)
 VALUES(NEW.id,NEW.performed_by,auth.jwt()->>'sub',
 CASE WHEN TG_OP='INSERT' AND NEW.ended_at IS NULL THEN 'clock_in' WHEN TG_OP='INSERT' THEN 'backfill' WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN 'archive' WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN 'restore' WHEN OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL AND NEW.started_at=OLD.started_at THEN 'clock_out' WHEN NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.ended_at IS DISTINCT FROM OLD.ended_at OR NEW.entry_date IS DISTINCT FROM OLD.entry_date THEN 'correction' ELSE 'update' END,
 CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE FUNCTION hq_time_private.reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'HQ time audit is immutable' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION hq_time_private.guard_entry(),hq_time_private.audit_entry(),hq_time_private.reject_audit_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER hq_time_guard BEFORE INSERT OR UPDATE ON public.hq_time_entries FOR EACH ROW EXECUTE FUNCTION hq_time_private.guard_entry();
CREATE TRIGGER hq_time_audit AFTER INSERT OR UPDATE ON public.hq_time_entries FOR EACH ROW EXECUTE FUNCTION hq_time_private.audit_entry();
CREATE TRIGGER hq_time_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.hq_time_entry_audit FOR EACH STATEMENT EXECUTE FUNCTION hq_time_private.reject_audit_mutation();

CREATE FUNCTION public.list_hq_time_entries(p_include_archived boolean DEFAULT false)
RETURNS SETOF public.hq_time_entries LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT * FROM public.hq_time_entries WHERE coalesce(p_include_archived,false) OR archived_at IS NULL ORDER BY entry_date DESC, started_at DESC, id
$$;
CREATE FUNCTION public.save_hq_time_entry(p_id uuid, p_expected_version integer, p_payload jsonb)
RETURNS public.hq_time_entries LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result public.hq_time_entries; candidate public.hq_time_entries; target uuid:=coalesce(p_id,gen_random_uuid());
BEGIN
 IF public.current_user_can_track_hq_time() IS NOT TRUE THEN RAISE EXCEPTION 'HQ time access denied' USING ERRCODE='42501'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('entry_date','activity','started_at','ended_at','classification','focused_minutes','notes','accomplishments','next_steps','work_items','time_zone')) THEN
  RAISE EXCEPTION 'Invalid HQ time payload' USING ERRCODE='22023';
 END IF;
 candidate:=jsonb_populate_record(NULL::public.hq_time_entries,p_payload);
 candidate.notes:=coalesce(candidate.notes,''); candidate.accomplishments:=coalesce(candidate.accomplishments,''); candidate.next_steps:=coalesce(candidate.next_steps,''); candidate.work_items:=coalesce(candidate.work_items,'[]'::jsonb); candidate.time_zone:=coalesce(candidate.time_zone,'UTC');
 IF p_expected_version IS NULL THEN
  IF candidate.ended_at IS NULL THEN RAISE EXCEPTION 'Use clock in to start an active session' USING ERRCODE='22023'; END IF;
  INSERT INTO public.hq_time_entries(id,entry_date,activity,started_at,ended_at,classification,focused_minutes,notes,accomplishments,next_steps,work_items,time_zone)
  VALUES(target,candidate.entry_date,candidate.activity,candidate.started_at,candidate.ended_at,candidate.classification,candidate.focused_minutes,candidate.notes,candidate.accomplishments,candidate.next_steps,candidate.work_items,candidate.time_zone)
  ON CONFLICT(id) DO NOTHING RETURNING * INTO result;
  IF NOT FOUND THEN
   SELECT * INTO result FROM public.hq_time_entries WHERE id=target;
   IF NOT FOUND OR result.version<>1 OR result.archived_at IS NOT NULL OR
      ROW(result.entry_date,result.activity,result.started_at,result.ended_at,result.classification,result.focused_minutes,result.notes,result.accomplishments,result.next_steps,result.work_items,result.time_zone)
      IS DISTINCT FROM ROW(candidate.entry_date,candidate.activity,candidate.started_at,candidate.ended_at,candidate.classification,candidate.focused_minutes,candidate.notes,candidate.accomplishments,candidate.next_steps,candidate.work_items,candidate.time_zone) THEN
    RAISE EXCEPTION 'HQ time entry conflict; reload before saving' USING ERRCODE='40001';
   END IF;
  END IF;
 ELSE
  IF p_id IS NULL OR p_expected_version<1 THEN RAISE EXCEPTION 'ID and current version required' USING ERRCODE='22023'; END IF;
  SELECT * INTO result FROM public.hq_time_entries WHERE id=p_id FOR UPDATE;
  IF result.ended_at IS NULL AND (candidate.started_at IS DISTINCT FROM result.started_at OR candidate.ended_at IS NOT NULL) THEN RAISE EXCEPTION 'Stop the active timer before correcting its timestamps' USING ERRCODE='22023'; END IF;
  UPDATE public.hq_time_entries SET entry_date=candidate.entry_date,activity=candidate.activity,started_at=candidate.started_at,ended_at=candidate.ended_at,classification=candidate.classification,focused_minutes=candidate.focused_minutes,notes=candidate.notes,accomplishments=candidate.accomplishments,next_steps=candidate.next_steps,work_items=candidate.work_items,time_zone=candidate.time_zone,write_version=p_expected_version
  WHERE id=p_id AND version=p_expected_version AND archived_at IS NULL RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'HQ time entry unavailable or changed; reload before saving' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.set_hq_time_entry_archived(p_id uuid,p_expected_version integer,p_archived boolean)
RETURNS public.hq_time_entries LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result public.hq_time_entries;
BEGIN
 IF public.current_user_can_track_hq_time() IS NOT TRUE THEN RAISE EXCEPTION 'HQ time access denied' USING ERRCODE='42501'; END IF;
 IF p_archived IS NULL OR p_expected_version IS NULL OR p_expected_version<1 THEN RAISE EXCEPTION 'Archive state and current version required' USING ERRCODE='22023'; END IF;
 UPDATE public.hq_time_entries SET archived_at=CASE WHEN p_archived THEN coalesce(archived_at,now()) ELSE NULL END,write_version=p_expected_version
 WHERE id=p_id AND version=p_expected_version RETURNING * INTO result;
 IF NOT FOUND THEN RAISE EXCEPTION 'HQ time entry unavailable or changed; reload before saving' USING ERRCODE='40001'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.list_hq_time_entries(boolean),public.save_hq_time_entry(uuid,integer,jsonb),public.set_hq_time_entry_archived(uuid,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_hq_time_entries(boolean),public.save_hq_time_entry(uuid,integer,jsonb),public.set_hq_time_entry_archived(uuid,integer,boolean) TO authenticated;
CREATE FUNCTION public.list_hq_time_entry_history(p_id uuid)
RETURNS SETOF public.hq_time_entry_audit LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT * FROM public.hq_time_entry_audit WHERE entry_id=p_id ORDER BY recorded_at, (after_data->>'version')::integer, id
$$;
REVOKE ALL ON FUNCTION public.list_hq_time_entry_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_hq_time_entry_history(uuid) TO authenticated;
-- Serialize clock-in attempts across tabs/developers, with the unique index as
-- a second invariant for writes outside the RPC. Client UUID makes retries safe.
CREATE FUNCTION public.clock_in_hq_time_entry(p_id uuid,p_activity text DEFAULT 'HQ work',p_classification text DEFAULT NULL,p_time_zone text DEFAULT 'UTC')
RETURNS public.hq_time_entries LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result public.hq_time_entries; performer text; started timestamptz;
BEGIN
 IF public.current_user_can_track_hq_time() IS NOT TRUE THEN RAISE EXCEPTION 'HQ time access denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL THEN RAISE EXCEPTION 'Client session ID required' USING ERRCODE='22023'; END IF;
 performer:=public.hq_time_default_performer();
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hq_time:'||performer,0));
 SELECT * INTO result FROM public.hq_time_entries WHERE id=p_id;
 IF FOUND THEN RETURN result; END IF;
 SELECT * INTO result FROM public.hq_time_entries WHERE performed_by=performer AND ended_at IS NULL;
 IF FOUND THEN RETURN result; END IF;
 started:=clock_timestamp();
 INSERT INTO public.hq_time_entries(id,entry_date,activity,started_at,ended_at,classification,time_zone)
 VALUES(p_id,(started AT TIME ZONE p_time_zone)::date,p_activity,started,NULL,p_classification,p_time_zone) RETURNING * INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.clock_out_hq_time_entry(p_id uuid,p_expected_version integer)
RETURNS public.hq_time_entries LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result public.hq_time_entries;
BEGIN
 IF public.current_user_can_track_hq_time() IS NOT TRUE THEN RAISE EXCEPTION 'HQ time access denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 THEN RAISE EXCEPTION 'Session ID and version required' USING ERRCODE='22023'; END IF;
 SELECT * INTO result FROM public.hq_time_entries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HQ time session unavailable' USING ERRCODE='40001'; END IF;
 IF result.ended_at IS NOT NULL THEN RETURN result; END IF;
 IF result.version<>p_expected_version THEN RAISE EXCEPTION 'HQ time session changed; reload before stopping' USING ERRCODE='40001'; END IF;
 UPDATE public.hq_time_entries SET ended_at=greatest(clock_timestamp(),started_at+interval '1 microsecond'),write_version=p_expected_version WHERE id=p_id RETURNING * INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.clock_in_hq_time_entry(uuid,text,text,text),public.clock_out_hq_time_entry(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clock_in_hq_time_entry(uuid,text,text,text),public.clock_out_hq_time_entry(uuid,integer) TO authenticated;
COMMIT;
