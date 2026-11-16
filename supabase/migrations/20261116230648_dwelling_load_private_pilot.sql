-- Developer-only, owner-private dwelling worksheet staging pilot.
-- No hosted database changes are authorized by this file.
BEGIN;
CREATE SCHEMA dwelling_private;
REVOKE ALL ON SCHEMA dwelling_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA dwelling_private TO authenticated;
INSERT INTO hq_tool_private.tools(module_key,is_enabled) VALUES('dwelling-load',false);
CREATE FUNCTION dwelling_private.allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT nullif(auth.jwt()->>'sub','') IS NOT NULL
 AND coalesce(auth.jwt()->>'is_anonymous','false')='false'
 AND coalesce(public.current_user_has_developer_access(),false)
 AND coalesce(hq_tool_private.allowed('dwelling-load'),false)
$$;
CREATE TABLE dwelling_private.documents (
 owner_id text NOT NULL, id uuid NOT NULL, payload jsonb NOT NULL,
 version integer NOT NULL CHECK(version>0), updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL, PRIMARY KEY(owner_id,id), CHECK(length(owner_id)>0)
);
CREATE TABLE dwelling_private.history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 owner_id text NOT NULL, study_id uuid NOT NULL, actor_id text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(), action text NOT NULL CHECK(action IN ('create','save','restore')),
 before_version integer NOT NULL, after_version integer NOT NULL,
 before_data jsonb, after_data jsonb NOT NULL,
 source_import text NOT NULL DEFAULT '',
 snapshot_kind text CHECK(snapshot_kind='pre-restore'),
 FOREIGN KEY(owner_id,study_id) REFERENCES dwelling_private.documents(owner_id,id)
);
CREATE INDEX dwelling_history_owner_study ON dwelling_private.history(owner_id,study_id,id DESC);
ALTER TABLE dwelling_private.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE dwelling_private.history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA dwelling_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA dwelling_private FROM PUBLIC,anon,authenticated;
CREATE POLICY dwelling_doc_owner ON dwelling_private.documents FOR SELECT TO authenticated
 USING(dwelling_private.allowed() AND owner_id=auth.jwt()->>'sub');
CREATE POLICY dwelling_history_owner ON dwelling_private.history FOR SELECT TO authenticated
 USING(dwelling_private.allowed() AND owner_id=auth.jwt()->>'sub');
CREATE FUNCTION dwelling_private.reject_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
 BEGIN RAISE EXCEPTION 'Dwelling worksheet history is immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER dwelling_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON dwelling_private.history
 FOR EACH STATEMENT EXECUTE FUNCTION dwelling_private.reject_history_mutation();

-- Strict serialization validation, not code compliance certification. Empty in-progress fields are allowed.
CREATE FUNCTION dwelling_private.validate_payload(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text; r jsonb; v text; number_value numeric;
 text_keys text[]:=ARRAY['project','jurisdiction','preparedBy','basis','area','voltage','service','small','laundry','cookingDemand','cookingNote','dryerDemand','dryerNote','largestMotor','hvacStandard','hvacOptional','hvacNote','otherNote','notes','lastBackup','lastImport','updatedAt'];
 bool_keys text[]:=ARRAY['basisConfirmed','inventoryConfirmed','motorConfirmed','optionalEligible','optionalReviewed'];
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR octet_length(p::text)>2000000 THEN RAISE EXCEPTION 'Invalid worksheet document' USING ERRCODE='22023'; END IF;
 IF p->'schema' IS DISTINCT FROM '1'::jsonb THEN RAISE EXCEPTION 'Unsupported worksheet schema' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) x WHERE NOT(x=ANY(text_keys||bool_keys||ARRAY['schema','rows']))) THEN RAISE EXCEPTION 'Unknown worksheet field' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY text_keys LOOP
  IF jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR length(p->>k)>20000 THEN RAISE EXCEPTION 'Invalid worksheet text: %',k USING ERRCODE='22023'; END IF;
 END LOOP;
 FOREACH k IN ARRAY bool_keys LOOP
  IF jsonb_typeof(p->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid worksheet review flag: %',k USING ERRCODE='22023'; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['area','voltage','service','small','laundry','cookingDemand','dryerDemand','largestMotor','hvacStandard','hvacOptional'] LOOP
  v:=p->>k;
  IF v<>'' THEN
   IF length(v)>100 OR v !~ '^[+]?[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?$' THEN RAISE EXCEPTION 'Invalid worksheet number: %',k USING ERRCODE='22023'; END IF;
   number_value:=v::numeric;
   IF number_value<0 OR number_value>1e100 THEN RAISE EXCEPTION 'Worksheet number out of bounds: %',k USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
 IF jsonb_typeof(p->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid equipment list' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p->'rows')>500 THEN RAISE EXCEPTION 'Equipment list too long' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p->'rows') LOOP
  IF jsonb_typeof(r)<>'object' THEN RAISE EXCEPTION 'Invalid equipment row' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(r) x WHERE x NOT IN ('label','qty','va','cat')) OR jsonb_typeof(r->'label') IS DISTINCT FROM 'string' OR length(r->>'label')>500 OR coalesce(r->>'cat','') NOT IN ('fixed','cooking','dryer','motor','hvac','other') THEN RAISE EXCEPTION 'Invalid equipment row fields' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['qty','va'] LOOP
   IF jsonb_typeof(r->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid equipment numeric type' USING ERRCODE='22023'; END IF;
   v:=r->>k;
   IF v<>'' THEN
    IF length(v)>100 OR v !~ '^[+]?[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?$' THEN RAISE EXCEPTION 'Invalid equipment number' USING ERRCODE='22023'; END IF;
    number_value:=v::numeric;
    IF number_value<0 OR number_value>1e100 THEN RAISE EXCEPTION 'Equipment number out of bounds' USING ERRCODE='22023'; END IF;
   END IF;
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION dwelling_private.get_study(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL THEN RAISE EXCEPTION 'Study ID required' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object('id',id,'payload',payload,'version',version,'updated_at',updated_at) INTO result
 FROM dwelling_private.documents WHERE owner_id=auth.jwt()->>'sub' AND id=p_id;
 RETURN result;
END $$;
CREATE FUNCTION dwelling_private.list_studies() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'title',coalesce(nullif(payload->>'project',''),'Untitled worksheet'),'version',version,'updated_at',updated_at) ORDER BY updated_at DESC,id),'[]'::jsonb)
 INTO result FROM dwelling_private.documents WHERE owner_id=auth.jwt()->>'sub';
 RETURN result;
END $$;
CREATE FUNCTION dwelling_private.save_study(p_id uuid,p_payload jsonb,p_expected_version integer,p_restore boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject text:=auth.jwt()->>'sub'; old_doc dwelling_private.documents; old_version integer; k text;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_restore IS NULL THEN RAISE EXCEPTION 'Study ID, current version and operation required' USING ERRCODE='22023'; END IF;
 PERFORM dwelling_private.validate_payload(p_payload);
 -- Owner + UUID lock serializes first creates as well as existing-row saves.
 PERFORM pg_advisory_xact_lock(hashtextextended('dwelling:'||subject||':'||p_id::text,0));
 SELECT * INTO old_doc FROM dwelling_private.documents WHERE owner_id=subject AND id=p_id FOR UPDATE;
 old_version:=CASE WHEN FOUND THEN old_doc.version ELSE 0 END;
 IF old_version<>p_expected_version THEN RAISE EXCEPTION 'Worksheet changed in another session; export your edits and reload before saving' USING ERRCODE='40001'; END IF;
 IF p_restore AND old_version=0 THEN RAISE EXCEPTION 'Cannot restore a missing worksheet; import as new instead' USING ERRCODE='22023'; END IF;
 IF p_restore THEN
  FOREACH k IN ARRAY ARRAY['basisConfirmed','inventoryConfirmed','motorConfirmed','optionalEligible','optionalReviewed'] LOOP p_payload:=jsonb_set(p_payload,ARRAY[k],'false'::jsonb); END LOOP;
 END IF;
 INSERT INTO dwelling_private.documents(owner_id,id,payload,version,updated_by) VALUES(subject,p_id,p_payload,old_version+1,subject)
 ON CONFLICT(owner_id,id) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated_at=now(),updated_by=excluded.updated_by;
 INSERT INTO dwelling_private.history(owner_id,study_id,actor_id,action,before_version,after_version,before_data,after_data,source_import,snapshot_kind)
 VALUES(subject,p_id,subject,CASE WHEN p_restore THEN 'restore' WHEN old_version=0 THEN 'create' ELSE 'save' END,old_version,old_version+1,CASE WHEN old_version>0 THEN old_doc.payload END,p_payload,p_payload->>'lastImport',CASE WHEN p_restore THEN 'pre-restore' END);
 RETURN dwelling_private.get_study(p_id);
END $$;
CREATE FUNCTION dwelling_private.list_history(p_id uuid)
RETURNS TABLE(id bigint,recorded_at timestamptz,action text,before_version integer,after_version integer,has_snapshot boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL THEN RAISE EXCEPTION 'Study ID required' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT h.id,h.recorded_at,h.action,h.before_version,h.after_version,h.before_data IS NOT NULL
 FROM dwelling_private.history h WHERE h.owner_id=auth.jwt()->>'sub' AND h.study_id=p_id ORDER BY h.id DESC LIMIT 50;
END $$;
CREATE FUNCTION dwelling_private.get_snapshot(p_id uuid,p_history_id bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_history_id IS NULL THEN RAISE EXCEPTION 'Study and history IDs required' USING ERRCODE='22023'; END IF;
 SELECT h.before_data INTO result FROM dwelling_private.history h
 WHERE h.owner_id=auth.jwt()->>'sub' AND h.study_id=p_id AND h.id=p_history_id;
 RETURN result;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA dwelling_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dwelling_private.allowed(),dwelling_private.get_study(uuid),dwelling_private.list_studies(),dwelling_private.save_study(uuid,jsonb,integer,boolean),dwelling_private.list_history(uuid),dwelling_private.get_snapshot(uuid,bigint) TO authenticated;
CREATE FUNCTION public.list_dwelling_studies() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.list_studies() $$;
CREATE FUNCTION public.get_dwelling_study(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.get_study(p_id) $$;
CREATE FUNCTION public.save_dwelling_study(p_id uuid,p_payload jsonb,p_expected_version integer,p_restore boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.save_study(p_id,p_payload,p_expected_version,p_restore) $$;
CREATE FUNCTION public.list_dwelling_history(p_id uuid) RETURNS TABLE(id bigint,recorded_at timestamptz,action text,before_version integer,after_version integer,has_snapshot boolean) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM dwelling_private.list_history(p_id) $$;
CREATE FUNCTION public.get_dwelling_snapshot(p_id uuid,p_history_id bigint) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.get_snapshot(p_id,p_history_id) $$;
REVOKE ALL ON FUNCTION public.list_dwelling_studies(),public.get_dwelling_study(uuid),public.save_dwelling_study(uuid,jsonb,integer,boolean),public.list_dwelling_history(uuid),public.get_dwelling_snapshot(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_dwelling_studies(),public.get_dwelling_study(uuid),public.save_dwelling_study(uuid,jsonb,integer,boolean),public.list_dwelling_history(uuid),public.get_dwelling_snapshot(uuid,bigint) TO authenticated;
INSERT INTO hq_tool_private.resource_map(resource_kind,resource_name,module_key) VALUES
 ('rpc','list_dwelling_studies','dwelling-load'),('rpc','get_dwelling_study','dwelling-load'),
 ('rpc','save_dwelling_study','dwelling-load'),('rpc','list_dwelling_history','dwelling-load'),('rpc','get_dwelling_snapshot','dwelling-load');
COMMIT;
