-- LOCAL CANDIDATE ONLY. No bucket, object, upload URL or storage policy is created.
-- Attachment transport remains pending a separate server validation implementation.
BEGIN;
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

-- Registry describes immutable server-validated bytes, NOT client claims or uploaded files.
-- No application role may create/update/delete records. A future narrow trusted ingestion
-- service must verify actual bytes before inserting; this migration supplies no such endpoint.
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

COMMIT;
