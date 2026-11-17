-- Links-only developer pilot, owner-private. No global availability hook or photo bucket/secrets.
BEGIN;
CREATE SCHEMA dwelling_private;
REVOKE ALL ON SCHEMA dwelling_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA dwelling_private TO authenticated;
CREATE FUNCTION dwelling_private.allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT nullif(auth.jwt()->>'sub','') IS NOT NULL
 AND coalesce(auth.jwt()->>'is_anonymous','false')='false'
 AND coalesce(public.current_user_has_developer_access(),false)
 AND EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active)
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
ALTER FUNCTION dwelling_private.validate_payload(jsonb) RENAME TO validate_payload_v1;
CREATE FUNCTION dwelling_private.validate_payload(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; k text; item_id uuid; evidence_id jsonb; q jsonb; seen uuid[]:='{}'; plain_rows jsonb:='[]';
BEGIN
 IF p->'schema'='1'::jsonb THEN PERFORM dwelling_private.validate_payload_v1(p); RETURN; END IF;
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR p->'schema' IS DISTINCT FROM '2'::jsonb OR octet_length(p::text)>2000000 THEN RAISE EXCEPTION 'Unsupported or oversized worksheet' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid equipment list' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p->'rows')>500 THEN RAISE EXCEPTION 'Equipment list too long' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p->'rows') LOOP
  IF jsonb_typeof(r)<>'object' OR jsonb_typeof(r->'id') IS DISTINCT FROM 'string' OR (r->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'Stable equipment UUID required' USING ERRCODE='22023'; END IF;
  item_id:=(r->>'id')::uuid;
  IF item_id=ANY(seen) THEN RAISE EXCEPTION 'Duplicate equipment identity' USING ERRCODE='22023'; END IF;
  seen:=array_append(seen,item_id);
  FOREACH k IN ARRAY ARRAY['model','serial'] LOOP
   IF r ? k AND (jsonb_typeof(r->k) IS DISTINCT FROM 'string' OR length(r->>k)>200) THEN RAISE EXCEPTION 'Invalid equipment metadata: %',k USING ERRCODE='22023'; END IF;
  END LOOP;
  IF r ? 'provenance' THEN
   q:=r->'provenance';
   IF jsonb_typeof(q)<>'object' THEN RAISE EXCEPTION 'Invalid attributed provenance' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(q) x WHERE x NOT IN ('sourceType','reference','attributedTo','notes')) THEN RAISE EXCEPTION 'Unknown provenance field; verified actor is server-owned' USING ERRCODE='22023'; END IF;
   IF jsonb_typeof(q->'sourceType') IS DISTINCT FROM 'string' OR q->>'sourceType' NOT IN ('nameplate','drawing','manual','other') THEN RAISE EXCEPTION 'Invalid provenance source type' USING ERRCODE='22023'; END IF;
   FOREACH k IN ARRAY ARRAY['reference','attributedTo','notes'] LOOP
    IF q ? k AND (jsonb_typeof(q->k) IS DISTINCT FROM 'string' OR length(q->>k)>CASE k WHEN 'attributedTo' THEN 200 WHEN 'reference' THEN 1000 ELSE 4000 END) THEN RAISE EXCEPTION 'Invalid provenance text: %',k USING ERRCODE='22023'; END IF;
   END LOOP;
  END IF;
  IF r ? 'evidenceIds' THEN
   IF jsonb_typeof(r->'evidenceIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid evidence reference list' USING ERRCODE='22023'; END IF;
   IF jsonb_array_length(r->'evidenceIds')>20 THEN RAISE EXCEPTION 'At most 20 evidence references per equipment item' USING ERRCODE='22023'; END IF;
   FOR evidence_id IN SELECT value FROM jsonb_array_elements(r->'evidenceIds') LOOP
    IF jsonb_typeof(evidence_id) IS DISTINCT FROM 'string' OR (evidence_id #>> '{}') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'Invalid evidence UUID' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF (SELECT count(*)<>count(DISTINCT (value #>> '{}')::uuid) FROM jsonb_array_elements(r->'evidenceIds')) THEN RAISE EXCEPTION 'Duplicate evidence reference' USING ERRCODE='22023'; END IF;
  END IF;
  -- Strip only the reviewed v2 additions in a temporary copy. Original payload is never rewritten.
  plain_rows:=plain_rows||jsonb_build_array(r-ARRAY['id','model','serial','provenance','evidenceIds']);
 END LOOP;
 PERFORM dwelling_private.validate_payload_v1(jsonb_set(jsonb_set(p,ARRAY['schema'],'1'::jsonb),ARRAY['rows'],plain_rows));
END $$;
REVOKE ALL ON FUNCTION dwelling_private.validate_payload(jsonb) FROM PUBLIC,anon,authenticated;

CREATE TABLE dwelling_private.evidence (
 owner_id text NOT NULL, study_id uuid NOT NULL, item_id uuid NOT NULL, id uuid NOT NULL,
 original_filename text NOT NULL CHECK(length(original_filename) BETWEEN 1 AND 255),
 detected_mime text NOT NULL CHECK(detected_mime IN ('image/jpeg','image/png','image/webp','application/pdf')),
 byte_size bigint NOT NULL CHECK(byte_size>0 AND byte_size<=CASE WHEN detected_mime='application/pdf' THEN 20971520 ELSE 10485760 END),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 bucket_id text NOT NULL CHECK(bucket_id='dwelling-evidence-private'),
 object_key text NOT NULL,
 verified_by text NOT NULL CHECK(length(verified_by)>0),
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,study_id,id), UNIQUE(bucket_id,object_key),
 FOREIGN KEY(owner_id,study_id) REFERENCES dwelling_private.documents(owner_id,id),
 CHECK(object_key=owner_id||'/'||study_id::text||'/'||id::text)
);
CREATE INDEX dwelling_evidence_item ON dwelling_private.evidence(owner_id,study_id,item_id);
ALTER TABLE dwelling_private.evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dwelling_private.evidence FROM PUBLIC,anon,authenticated;
CREATE POLICY dwelling_evidence_owner ON dwelling_private.evidence FOR SELECT TO authenticated
 USING(dwelling_private.allowed() AND owner_id=auth.jwt()->>'sub');
CREATE TRIGGER dwelling_evidence_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON dwelling_private.evidence
 FOR EACH STATEMENT EXECUTE FUNCTION dwelling_private.reject_history_mutation();

CREATE FUNCTION dwelling_private.validate_evidence(p_id uuid,p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; eid jsonb;
BEGIN
 IF p->'schema'='1'::jsonb THEN RETURN; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p->'rows') LOOP
  FOR eid IN SELECT value FROM jsonb_array_elements(coalesce(r->'evidenceIds','[]'::jsonb)) LOOP
   IF NOT EXISTS(SELECT 1 FROM dwelling_private.evidence e WHERE e.owner_id=auth.jwt()->>'sub' AND e.study_id=p_id AND e.item_id=(r->>'id')::uuid AND e.id=(eid #>> '{}')::uuid) THEN
    RAISE EXCEPTION 'Evidence unavailable for this owner, study and item; attachment upload is pending' USING ERRCODE='22023';
   END IF;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION dwelling_private.validate_evidence(uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION dwelling_private.save_study(p_id uuid,p_payload jsonb,p_expected_version integer,p_restore boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject text:=auth.jwt()->>'sub'; old_doc dwelling_private.documents; old_version integer; k text;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_restore IS NULL THEN RAISE EXCEPTION 'Study ID, current version and operation required' USING ERRCODE='22023'; END IF;
 PERFORM dwelling_private.validate_payload(p_payload);
 PERFORM dwelling_private.validate_evidence(p_id,p_payload);
 -- Owner + UUID lock serializes first creates as well as existing-row saves.
 PERFORM pg_advisory_xact_lock(hashtextextended('dwelling:'||subject||':'||p_id::text,0));
 SELECT * INTO old_doc FROM dwelling_private.documents WHERE owner_id=subject AND id=p_id FOR UPDATE;
 old_version:=CASE WHEN FOUND THEN old_doc.version ELSE 0 END;
 IF old_version<>p_expected_version THEN RAISE EXCEPTION 'Worksheet changed in another session; export your edits and reload before saving' USING ERRCODE='40001'; END IF;
 IF old_version>0 AND old_doc.payload->'schema'='2'::jsonb AND p_payload->'schema'='1'::jsonb AND NOT p_restore THEN RAISE EXCEPTION 'This study uses equipment metadata; update the client before saving' USING ERRCODE='22023'; END IF;
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

CREATE FUNCTION dwelling_private.feeder_keys(j jsonb, keys text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(j)='object' THEN j ?& keys AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(j) k WHERE NOT k=ANY(keys)) ELSE false END
$$;
CREATE FUNCTION dwelling_private.feeder_text(j jsonb, lim integer) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT coalesce(jsonb_typeof(j)='string' AND length(j #>> '{}')<=lim,false) $$;
CREATE FUNCTION dwelling_private.feeder_uuid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT coalesce(jsonb_typeof(j)='string' AND (j #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false) $$;
CREATE FUNCTION dwelling_private.feeder_number(j jsonb, positive boolean DEFAULT false) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN j='null'::jsonb THEN true WHEN jsonb_typeof(j)='number' THEN (j #>> '{}')::numeric<=1.7976931348623157e308 AND CASE WHEN positive THEN (j #>> '{}')::numeric>0 ELSE (j #>> '{}')::numeric>=0 END ELSE false END
$$;
CREATE FUNCTION dwelling_private.feeder_uuid_list(j jsonb, lim integer) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(j) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 RETURN jsonb_array_length(j)<=lim AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j) x WHERE NOT dwelling_private.feeder_uuid(x)) AND (SELECT count(*)=count(DISTINCT x) FROM jsonb_array_elements(j) x);
END $$;
ALTER FUNCTION dwelling_private.validate_payload(jsonb) RENAME TO validate_payload_before_feeders;
CREATE FUNCTION dwelling_private.validate_payload(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f jsonb; panel jsonb; s jsonb; r jsonb; k text; ids text[]:='{}'; seen text[]:='{}';
 checks text[]:=ARRAY['codeBasis','methodEligibility','inventory','demandFactors','continuousLoads','motors','noncoincidentLoads','phaseAllocation','neutral','conductorBasis','terminals','installationConditions'];
BEGIN
 -- Existing v2 equipment/evidence shape validation always runs before extension logic.
 IF octet_length(p::text)>2000000 THEN RAISE EXCEPTION 'Worksheet exceeds size limit' USING ERRCODE='22023'; END IF;
 PERFORM dwelling_private.validate_payload_before_feeders(p-'feederStudies');
 IF NOT p ? 'feederStudies' THEN RETURN; END IF;
 IF p->'schema' IS DISTINCT FROM '2'::jsonb THEN RAISE EXCEPTION 'Feeder metadata requires schema 2' USING ERRCODE='22023'; END IF;
 f:=p->'feederStudies';
 IF NOT dwelling_private.feeder_keys(f,ARRAY['version','panels','studies']) OR f->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(f->'panels') IS DISTINCT FROM 'array' OR jsonb_typeof(f->'studies') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid feeder workspace' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(f->'panels')>50 OR jsonb_array_length(f->'panels')<>jsonb_array_length(f->'studies') THEN RAISE EXCEPTION 'Invalid feeder workspace size' USING ERRCODE='22023'; END IF;
 FOR panel IN SELECT value FROM jsonb_array_elements(f->'panels') LOOP
  IF NOT dwelling_private.feeder_keys(panel,ARRAY['id','label','parentId','loadIds']) OR NOT dwelling_private.feeder_uuid(panel->'id') OR (panel->>'id')=ANY(ids) OR NOT dwelling_private.feeder_text(panel->'label',200) OR (panel->'parentId' IS DISTINCT FROM 'null'::jsonb AND NOT dwelling_private.feeder_uuid(panel->'parentId')) OR NOT dwelling_private.feeder_uuid_list(panel->'loadIds',500) THEN RAISE EXCEPTION 'Invalid feeder panel' USING ERRCODE='22023'; END IF;
  ids:=array_append(ids,panel->>'id');
 END LOOP;
 FOR s IN SELECT value FROM jsonb_array_elements(f->'studies') LOOP
  IF NOT dwelling_private.feeder_keys(s,ARRAY['panelId','codeBasis','methodBasis','reviewer','reviewedAt','reviewSnapshot','system','lineToLineVoltage','systemVerified','designCurrentA','reviewedDemandVA','reviewedLoadIds','reviews','ratings','conductorBasis','terminalBasis','neutralBasis','conditionNote','conditionRecommendation']) OR NOT dwelling_private.feeder_uuid(s->'panelId') OR NOT (s->>'panelId')=ANY(ids) OR (s->>'panelId')=ANY(seen) THEN RAISE EXCEPTION 'Invalid feeder study identity' USING ERRCODE='22023'; END IF;
  seen:=array_append(seen,s->>'panelId');
  IF NOT dwelling_private.feeder_text(s->'reviewSnapshot',1000000) THEN RAISE EXCEPTION 'Invalid feeder review snapshot' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['codeBasis','methodBasis','reviewer','reviewedAt','conductorBasis','terminalBasis','neutralBasis','conditionNote','conditionRecommendation'] LOOP
   IF NOT dwelling_private.feeder_text(s->k,4000) THEN RAISE EXCEPTION 'Invalid feeder text' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF jsonb_typeof(s->'system') IS DISTINCT FROM 'string' OR s->>'system' NOT IN ('single-phase-3-wire','three-phase-4-wire','unknown') OR NOT dwelling_private.feeder_number(s->'lineToLineVoltage',true) OR jsonb_typeof(s->'systemVerified') IS DISTINCT FROM 'boolean' OR NOT dwelling_private.feeder_number(s->'reviewedDemandVA') OR jsonb_typeof(s->'designCurrentA') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid feeder system or demand' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(s->'designCurrentA') NOT BETWEEN 2 AND 3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(s->'designCurrentA') x WHERE NOT dwelling_private.feeder_number(x)) OR NOT dwelling_private.feeder_uuid_list(s->'reviewedLoadIds',500) OR NOT dwelling_private.feeder_keys(s->'reviews',checks) OR NOT dwelling_private.feeder_keys(s->'ratings',ARRAY['panelBus','upstreamOcpd','conductorAmpacity']) THEN RAISE EXCEPTION 'Invalid feeder currents or review fields' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY checks LOOP
   IF jsonb_typeof(s->'reviews'->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid feeder review flag' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR r IN SELECT value FROM jsonb_each(s->'ratings') LOOP
   IF NOT dwelling_private.feeder_keys(r,ARRAY['amps','verified','source']) OR NOT dwelling_private.feeder_number(r->'amps',true) OR jsonb_typeof(r->'verified') IS DISTINCT FROM 'boolean' OR NOT dwelling_private.feeder_text(r->'source',4000) THEN RAISE EXCEPTION 'Invalid feeder rating' USING ERRCODE='22023'; END IF;
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION dwelling_private.clear_feeder_reviews(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE studies jsonb:='[]'; s jsonb; flags jsonb;
BEGIN
 IF NOT p ? 'feederStudies' THEN RETURN p; END IF;
 flags:='{"codeBasis":false,"methodEligibility":false,"inventory":false,"demandFactors":false,"continuousLoads":false,"motors":false,"noncoincidentLoads":false,"phaseAllocation":false,"neutral":false,"conductorBasis":false,"terminals":false,"installationConditions":false}'::jsonb;
 FOR s IN SELECT value FROM jsonb_array_elements(p->'feederStudies'->'studies') LOOP
  studies:=studies||jsonb_build_array(s||jsonb_build_object('reviews',flags,'reviewedAt','','reviewSnapshot','','reviewedLoadIds','[]'::jsonb));
 END LOOP;
 RETURN jsonb_set(p,ARRAY['feederStudies','studies'],studies);
END $$;
ALTER FUNCTION dwelling_private.save_study(uuid,jsonb,integer,boolean) RENAME TO save_study_before_feeders;
REVOKE ALL ON FUNCTION dwelling_private.save_study_before_feeders(uuid,jsonb,integer,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dwelling_private.save_study(p_id uuid,p_payload jsonb,p_expected_version integer,p_restore boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject text:=auth.jwt()->>'sub'; prior jsonb;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_restore IS NULL THEN RAISE EXCEPTION 'Study ID, current version and operation required' USING ERRCODE='22023'; END IF;
 PERFORM dwelling_private.validate_payload(p_payload);
 PERFORM pg_advisory_xact_lock(hashtextextended('dwelling:'||subject||':'||p_id::text,0));
 SELECT payload INTO prior FROM dwelling_private.documents WHERE owner_id=subject AND id=p_id FOR UPDATE;
 IF prior ? 'feederStudies' AND NOT p_payload ? 'feederStudies' AND NOT p_restore THEN RAISE EXCEPTION 'This study uses feeder metadata; update the client before saving' USING ERRCODE='22023'; END IF;
 -- New imported studies cannot inherit review attestations; updates tagged with a
 -- changed import source also reset. Existing CAS, evidence checks and audit remain.
 IF p_restore OR prior IS NULL OR p_payload->'lastImport' IS DISTINCT FROM prior->'lastImport' THEN p_payload:=dwelling_private.clear_feeder_reviews(p_payload); END IF;
 RETURN dwelling_private.save_study_before_feeders(p_id,p_payload,p_expected_version,p_restore);
END $$;
REVOKE ALL ON FUNCTION dwelling_private.validate_payload(jsonb),dwelling_private.validate_payload_before_feeders(jsonb),dwelling_private.feeder_keys(jsonb,text[]),dwelling_private.feeder_text(jsonb,integer),dwelling_private.feeder_uuid(jsonb),dwelling_private.feeder_number(jsonb,boolean),dwelling_private.feeder_uuid_list(jsonb,integer),dwelling_private.clear_feeder_reviews(jsonb),dwelling_private.save_study(uuid,jsonb,integer,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.save_dwelling_study(p_id uuid,p_payload jsonb,p_expected_version integer,p_restore boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.save_study(p_id,p_payload,p_expected_version,p_restore) $$;
GRANT EXECUTE ON FUNCTION dwelling_private.save_study(uuid,jsonb,integer,boolean) TO authenticated;
ALTER FUNCTION dwelling_private.validate_payload(jsonb) RENAME TO validate_payload_before_nameplates;
CREATE FUNCTION dwelling_private.nameplate_keys(j jsonb,keys text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(j)='object' THEN j ?& keys AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(j) k WHERE NOT k=ANY(keys)) ELSE false END
$$;
CREATE FUNCTION dwelling_private.nameplate_uuid(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT coalesce(jsonb_typeof(j)='string' AND (j #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false) $$;
CREATE FUNCTION dwelling_private.validate_nameplates(r jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE plate jsonb; field jsonb; src jsonb; ids uuid[]:='{}'; fids uuid[]; k text;
BEGIN
 IF r ? 'nameplates' THEN
  IF jsonb_typeof(r->'nameplates') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid nameplate collection' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(r->'nameplates')>20 THEN RAISE EXCEPTION 'At most 20 nameplates per item' USING ERRCODE='22023'; END IF;
  FOR plate IN SELECT value FROM jsonb_array_elements(r->'nameplates') LOOP
   IF NOT dwelling_private.nameplate_keys(plate,ARRAY['id','label','sourceReference','notes','fields']) OR NOT dwelling_private.nameplate_uuid(plate->'id') OR (plate->>'id')::uuid=ANY(ids) THEN RAISE EXCEPTION 'Invalid or duplicate nameplate identity' USING ERRCODE='22023'; END IF;
   ids:=array_append(ids,(plate->>'id')::uuid);
   IF NOT dwelling_private.feeder_text(plate->'label',200) OR NOT dwelling_private.feeder_text(plate->'sourceReference',1000) OR NOT dwelling_private.feeder_text(plate->'notes',4000) OR jsonb_typeof(plate->'fields') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid nameplate text or fields' USING ERRCODE='22023'; END IF;
   IF jsonb_array_length(plate->'fields')>50 THEN RAISE EXCEPTION 'At most 50 raw fields per nameplate' USING ERRCODE='22023'; END IF;
   fids:='{}';
   FOR field IN SELECT value FROM jsonb_array_elements(plate->'fields') LOOP
    IF NOT dwelling_private.nameplate_keys(field,ARRAY['id','label','value','unit']) OR NOT dwelling_private.nameplate_uuid(field->'id') OR (field->>'id')::uuid=ANY(fids) OR NOT dwelling_private.feeder_text(field->'label',200) OR NOT dwelling_private.feeder_text(field->'value',2000) OR NOT dwelling_private.feeder_text(field->'unit',100) THEN RAISE EXCEPTION 'Invalid or duplicate nameplate field' USING ERRCODE='22023'; END IF;
    fids:=array_append(fids,(field->>'id')::uuid);
   END LOOP;
  END LOOP;
 END IF;
 IF r ? 'calculationSource' AND r->'calculationSource'<>'null'::jsonb THEN
  src:=r->'calculationSource';
  IF NOT dwelling_private.nameplate_keys(src,ARRAY['plateId','fieldId','mode','reviewedVA','basis','snapshot']) OR NOT dwelling_private.nameplate_uuid(src->'plateId') OR NOT dwelling_private.nameplate_uuid(src->'fieldId') OR src->>'mode' NOT IN ('direct-va','direct-kva','reviewed') OR jsonb_typeof(src->'mode') IS DISTINCT FROM 'string' OR NOT dwelling_private.feeder_text(src->'reviewedVA',2000) OR NOT dwelling_private.feeder_text(src->'basis',4000) OR NOT dwelling_private.feeder_text(src->'snapshot',1000000) THEN RAISE EXCEPTION 'Invalid selected calculation source' USING ERRCODE='22023'; END IF;
 END IF;
END $$;
CREATE FUNCTION dwelling_private.nameplate_trim(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT btrim(v,E' \t\n\r\f\v'||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))
$$;
CREATE FUNCTION dwelling_private.nameplate_scalar(v text, multiplier integer DEFAULT 1) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result numeric; floating double precision;
BEGIN
 IF v IS NULL OR dwelling_private.nameplate_trim(v) !~ '^(\d+(\.\d+)?|\.\d+)$' OR length(v)>2000 THEN RETURN NULL; END IF;
 result:=dwelling_private.nameplate_trim(v)::numeric*multiplier;
 IF result>9007199254740991 OR result<0 THEN RETURN NULL; END IF;
 floating:=result::double precision;
 IF result<>0 AND floating=0 THEN RETURN NULL; END IF;
 RETURN result;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN RETURN NULL;
END $$;
CREATE FUNCTION dwelling_private.nameplate_source_current(r jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE src jsonb:=r->'calculationSource'; plate jsonb; field jsonb; expected jsonb; context_plates jsonb; got jsonb; result numeric; current_va numeric;
BEGIN
 IF src IS NULL OR src='null'::jsonb THEN RETURN true; END IF;
 SELECT x INTO plate FROM jsonb_array_elements(coalesce(r->'nameplates','[]'::jsonb)) x WHERE (x->>'id')::uuid=(src->>'plateId')::uuid;
 IF plate IS NULL THEN RETURN false; END IF;
 SELECT x INTO field FROM jsonb_array_elements(plate->'fields') x WHERE (x->>'id')::uuid=(src->>'fieldId')::uuid;
 IF field IS NULL THEN RETURN false; END IF;
 -- Bind every plate and raw observation, with ordered arrays rather than JSON object key order.
 SELECT coalesce(jsonb_agg(jsonb_build_array(p.value->>'id',p.value->>'label',p.value->>'sourceReference',p.value->>'notes',
  (SELECT coalesce(jsonb_agg(jsonb_build_array(f.value->>'id',f.value->>'label',f.value->>'value',f.value->>'unit') ORDER BY f.ordinality),'[]'::jsonb)
   FROM jsonb_array_elements(p.value->'fields') WITH ORDINALITY f)) ORDER BY p.ordinality),'[]'::jsonb)
 INTO context_plates FROM jsonb_array_elements(r->'nameplates') WITH ORDINALITY p;
 expected:=jsonb_build_array(r->>'id',r->>'cat',r->>'qty',r->>'label',context_plates,plate->>'id',field->>'id',src->>'mode',src->>'reviewedVA',src->>'basis');
 BEGIN got:=(src->>'snapshot')::jsonb; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 IF got IS DISTINCT FROM expected THEN RETURN false; END IF;
 IF src->>'mode' IN ('direct-va','direct-kva') AND (src->>'reviewedVA'<>'' OR src->>'basis'<>'') THEN RETURN false; END IF;
 CASE src->>'mode'
 WHEN 'direct-va' THEN
  IF lower(dwelling_private.nameplate_trim(field->>'unit'))<>'va' THEN RETURN false; END IF;
  result:=dwelling_private.nameplate_scalar(field->>'value');
 WHEN 'direct-kva' THEN
  IF lower(dwelling_private.nameplate_trim(field->>'unit'))<>'kva' THEN RETURN false; END IF;
  result:=dwelling_private.nameplate_scalar(field->>'value',1000);
 WHEN 'reviewed' THEN
  IF dwelling_private.nameplate_trim(src->>'basis')='' THEN RETURN false; END IF;
  result:=dwelling_private.nameplate_scalar(src->>'reviewedVA');
 ELSE RETURN false;
 END CASE;
 IF result IS NULL THEN RETURN false; END IF;
 current_va:=dwelling_private.nameplate_scalar(r->>'va');
 RETURN current_va IS NOT NULL AND current_va=result;
END $$;
CREATE FUNCTION dwelling_private.validate_payload(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; plain_rows jsonb:='[]'; stale boolean:=false; feeder jsonb;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR octet_length(p::text)>2000000 OR jsonb_typeof(p->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid worksheet' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p->'rows') LOOP
  IF r ? 'nameplates' OR r ? 'calculationSource' THEN
   IF p->'schema' IS DISTINCT FROM '2'::jsonb THEN RAISE EXCEPTION 'Nameplates require schema 2' USING ERRCODE='22023'; END IF;
   PERFORM dwelling_private.validate_nameplates(r);
   stale:=stale OR NOT dwelling_private.nameplate_source_current(r);
  END IF;
  plain_rows:=plain_rows||jsonb_build_array(r-ARRAY['nameplates','calculationSource']);
 END LOOP;
 PERFORM dwelling_private.validate_payload_before_nameplates(jsonb_set(p,ARRAY['rows'],plain_rows));
 IF stale THEN
  IF p->'inventoryConfirmed'='true'::jsonb OR p->'motorConfirmed'='true'::jsonb OR p->'optionalReviewed'='true'::jsonb THEN RAISE EXCEPTION 'Selected nameplate source is stale; clear or reselect it before confirming results' USING ERRCODE='22023'; END IF;
  FOR feeder IN SELECT value FROM jsonb_array_elements(coalesce(p->'feederStudies'->'studies','[]'::jsonb)) LOOP
   IF EXISTS(SELECT 1 FROM jsonb_each(feeder->'reviews') x WHERE x.value='true'::jsonb) OR coalesce(feeder->>'reviewSnapshot','')<>'' OR coalesce(feeder->>'reviewedAt','')<>'' THEN RAISE EXCEPTION 'Selected nameplate source is stale; reset feeder reviews before saving' USING ERRCODE='22023'; END IF;
  END LOOP;
 END IF;
END $$;
ALTER FUNCTION dwelling_private.save_study(uuid,jsonb,integer,boolean) RENAME TO save_study_before_nameplates;
REVOKE ALL ON FUNCTION dwelling_private.save_study_before_nameplates(uuid,jsonb,integer,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dwelling_private.save_study(p_id uuid,p_payload jsonb,p_expected_version integer,p_restore boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject text:=auth.jwt()->>'sub'; prior jsonb; old_row jsonb; new_row jsonb; k text;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_restore IS NULL THEN RAISE EXCEPTION 'Study ID, current version and operation required' USING ERRCODE='22023'; END IF;
 -- Restoring stale raw observations is allowed only with review confirmations reset.
 IF p_restore THEN
  FOREACH k IN ARRAY ARRAY['basisConfirmed','inventoryConfirmed','motorConfirmed','optionalEligible','optionalReviewed'] LOOP p_payload:=jsonb_set(p_payload,ARRAY[k],'false'::jsonb); END LOOP;
  p_payload:=dwelling_private.clear_feeder_reviews(p_payload);
 END IF;
 PERFORM dwelling_private.validate_payload(p_payload);
 PERFORM pg_advisory_xact_lock(hashtextextended('dwelling:'||subject||':'||p_id::text,0));
 SELECT payload INTO prior FROM dwelling_private.documents WHERE owner_id=subject AND id=p_id FOR UPDATE;
 IF prior IS NOT NULL AND NOT p_restore THEN
  FOR old_row IN SELECT value FROM jsonb_array_elements(prior->'rows') LOOP
   SELECT x INTO new_row FROM jsonb_array_elements(p_payload->'rows') x WHERE lower(x->>'id')=lower(old_row->>'id');
   -- Explicit row deletion remains available. Surviving rows must explicitly clear metadata.
   IF new_row IS NOT NULL THEN
    IF old_row ? 'nameplates' AND NOT new_row ? 'nameplates' THEN RAISE EXCEPTION 'This equipment has nameplates; preserve them or explicitly clear the collection' USING ERRCODE='22023'; END IF;
    IF old_row ? 'calculationSource' AND old_row->'calculationSource'<>'null'::jsonb AND NOT new_row ? 'calculationSource' THEN RAISE EXCEPTION 'This equipment has a selected source; explicitly clear or reselect it' USING ERRCODE='22023'; END IF;
   END IF;
  END LOOP;
 END IF;
 RETURN dwelling_private.save_study_before_nameplates(p_id,p_payload,p_expected_version,p_restore);
END $$;
REVOKE ALL ON FUNCTION dwelling_private.nameplate_keys(jsonb,text[]),dwelling_private.nameplate_uuid(jsonb),dwelling_private.validate_nameplates(jsonb),dwelling_private.nameplate_trim(text),dwelling_private.nameplate_scalar(text,integer),dwelling_private.nameplate_source_current(jsonb),dwelling_private.validate_payload(jsonb),dwelling_private.validate_payload_before_nameplates(jsonb),dwelling_private.save_study(uuid,jsonb,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dwelling_private.save_study(uuid,jsonb,integer,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_dwelling_study(p_id uuid,p_payload jsonb,p_expected_version integer,p_restore boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.save_study(p_id,p_payload,p_expected_version,p_restore) $$;
COMMIT;
