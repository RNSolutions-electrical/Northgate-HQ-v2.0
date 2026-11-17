-- Daybook staging pilot. Shared scope rows, never one table per user.
-- Developer-only pilot until operational/financial permission policy is approved.
BEGIN;
CREATE SCHEMA daybook_private;
REVOKE ALL ON SCHEMA daybook_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA daybook_private TO authenticated;

CREATE FUNCTION daybook_private.allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT nullif(auth.jwt()->>'sub','') IS NOT NULL
 AND coalesce(auth.jwt()->>'is_anonymous','false')='false'
 AND EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active)
 AND coalesce(public.current_user_has_developer_access(),false)
$$;
REVOKE ALL ON FUNCTION daybook_private.allowed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION daybook_private.allowed() TO authenticated;
CREATE TABLE daybook_private.documents (
 scope text NOT NULL CHECK(scope IN ('personal','northgate')),
 owner_id text NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 version integer NOT NULL CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL,
 PRIMARY KEY(scope,owner_id),
 CHECK ((scope='northgate' AND owner_id='company') OR (scope='personal' AND length(owner_id)>0))
);
CREATE TABLE daybook_private.history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 operation_id uuid NOT NULL,
 scope text NOT NULL,
 owner_id text NOT NULL,
 actor_id text NOT NULL,
 action text NOT NULL CHECK(action IN ('save','restore')),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 before_version integer NOT NULL,
 after_version integer NOT NULL,
 before_data jsonb,
 after_data jsonb NOT NULL,
 snapshot_kind text CHECK(snapshot_kind='pre-restore'),
 FOREIGN KEY(scope,owner_id) REFERENCES daybook_private.documents(scope,owner_id)
);
ALTER TABLE daybook_private.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE daybook_private.history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON daybook_private.documents,daybook_private.history FROM PUBLIC,anon,authenticated;
CREATE POLICY daybook_doc_owner ON daybook_private.documents FOR SELECT TO authenticated
 USING(daybook_private.allowed() AND (scope='northgate' OR owner_id=auth.jwt()->>'sub'));
CREATE POLICY daybook_history_owner ON daybook_private.history FOR SELECT TO authenticated
 USING(daybook_private.allowed() AND (scope='northgate' OR owner_id=auth.jwt()->>'sub'));
CREATE INDEX daybook_history_scope_idx ON daybook_private.history(scope,owner_id,id DESC);
CREATE FUNCTION daybook_private.reject_history_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Daybook history is immutable' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION daybook_private.reject_history_mutation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER daybook_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON daybook_private.history
 FOR EACH STATEMENT EXECUTE FUNCTION daybook_private.reject_history_mutation();

CREATE FUNCTION daybook_private.validate_payload(p_scope text,p_payload jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text; item jsonb;
BEGIN
 IF p_scope NOT IN ('personal','northgate') OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
 OR octet_length(p_payload::text)>4000000 THEN RAISE EXCEPTION 'Invalid Daybook document' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) x WHERE x NOT IN
 ('version','instance','calendars','events','contacts','notes','pto','jobs','workers','assignments','tools','forecastDate','privacy'))
 THEN RAISE EXCEPTION 'Unknown Daybook field' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['calendars','events','contacts','notes','pto','jobs','workers','assignments'] LOOP
  IF p_payload ? k THEN
   IF jsonb_typeof(p_payload->k)<>'array' OR jsonb_array_length(p_payload->k)>10000 THEN RAISE EXCEPTION 'Invalid Daybook collection: %',k USING ERRCODE='22023'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(p_payload->k) LOOP
    IF jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string'
    OR length(item->>'id') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid Daybook record ID' USING ERRCODE='22023'; END IF;
    IF k='calendars' AND ((p_scope='northgate') IS DISTINCT FROM (item->>'id'='northgate')) THEN
     RAISE EXCEPTION 'Calendar is in the wrong Daybook scope' USING ERRCODE='22023'; END IF;
    IF k IN ('events','pto','jobs') AND ((p_scope='northgate') IS DISTINCT FROM (coalesce(item->>'calendar','')='northgate')) THEN
     RAISE EXCEPTION 'Record is in the wrong Daybook scope' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF (SELECT count(*)<>count(DISTINCT value->>'id') FROM jsonb_array_elements(p_payload->k)) THEN
    RAISE EXCEPTION 'Duplicate Daybook record IDs' USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
 IF p_scope='personal' AND jsonb_array_length(coalesce(p_payload->'workers','[]'))>0 THEN
  RAISE EXCEPTION 'Worker profiles belong to Northgate' USING ERRCODE='22023'; END IF;
 IF p_scope='northgate' AND (jsonb_array_length(coalesce(p_payload->'notes','[]'))>0 OR p_payload ? 'privacy' OR p_payload ? 'tools') THEN
  RAISE EXCEPTION 'Personal settings and notes cannot be shared' USING ERRCODE='22023'; END IF;
 IF p_payload ? 'version' AND p_payload->'version'<>'1'::jsonb THEN RAISE EXCEPTION 'Unsupported Daybook format' USING ERRCODE='22023'; END IF;
 IF p_payload ? 'tools' AND jsonb_typeof(p_payload->'tools')<>'object' THEN RAISE EXCEPTION 'Invalid Daybook tools' USING ERRCODE='22023'; END IF;
 IF p_payload ? 'privacy' AND jsonb_typeof(p_payload->'privacy') NOT IN ('object','null') THEN RAISE EXCEPTION 'Invalid privacy settings' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION daybook_private.validate_payload(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION daybook_private.workspace() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE personal jsonb; company jsonb;
BEGIN
 IF daybook_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Daybook pilot access denied' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('payload',payload,'version',version,'updated_at',updated_at) INTO personal
 FROM daybook_private.documents WHERE scope='personal' AND owner_id=auth.jwt()->>'sub';
 SELECT jsonb_build_object('payload',payload,'version',version,'updated_at',updated_at) INTO company
 FROM daybook_private.documents WHERE scope='northgate' AND owner_id='company';
 RETURN jsonb_build_object('personal',coalesce(personal,jsonb_build_object('payload',null,'version',0,'updated_at',null)),
 'northgate',coalesce(company,jsonb_build_object('payload',null,'version',0,'updated_at',null)),'can_manage_northgate',true);
END $$;
CREATE FUNCTION daybook_private.save_workspace(p_personal jsonb,p_northgate jsonb,p_personal_version integer,p_northgate_version integer,p_restore boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject text:=auth.jwt()->>'sub'; sc text; own text; incoming jsonb; expected integer; current_doc daybook_private.documents; old_version integer; operation uuid:=gen_random_uuid();
BEGIN
 IF daybook_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Daybook pilot access denied' USING ERRCODE='42501'; END IF;
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
CREATE FUNCTION daybook_private.list_history(p_scope text) RETURNS SETOF daybook_private.history
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF daybook_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Daybook pilot access denied' USING ERRCODE='42501'; END IF;
 IF p_scope NOT IN ('personal','northgate') OR p_scope IS NULL THEN RAISE EXCEPTION 'Invalid Daybook scope' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT h.* FROM daybook_private.history h WHERE h.scope=p_scope
 AND h.owner_id=CASE WHEN p_scope='personal' THEN auth.jwt()->>'sub' ELSE 'company' END ORDER BY h.id DESC LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION daybook_private.workspace(),daybook_private.save_workspace(jsonb,jsonb,integer,integer,boolean),daybook_private.list_history(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION daybook_private.workspace(),daybook_private.save_workspace(jsonb,jsonb,integer,integer,boolean),daybook_private.list_history(text) TO authenticated;
CREATE FUNCTION public.get_daybook_workspace() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT daybook_private.workspace() $$;
CREATE FUNCTION public.save_daybook_workspace(p_personal jsonb,p_northgate jsonb,p_personal_version integer,p_northgate_version integer,p_restore boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT daybook_private.save_workspace(p_personal,p_northgate,p_personal_version,p_northgate_version,p_restore) $$;
CREATE FUNCTION public.list_daybook_history(p_scope text) RETURNS SETOF daybook_private.history LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM daybook_private.list_history(p_scope) $$;
REVOKE ALL ON FUNCTION public.get_daybook_workspace(),public.save_daybook_workspace(jsonb,jsonb,integer,integer,boolean),public.list_daybook_history(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_daybook_workspace(),public.save_daybook_workspace(jsonb,jsonb,integer,integer,boolean),public.list_daybook_history(text) TO authenticated;
COMMIT;
