-- LOCAL CANDIDATE: requires reviewed v2 evidence schema. NOT APPLIED.
-- No secret value is supplied. Bucket/policies below require separate scoped approval.
-- pgcrypto hmac must already exist in extensions schema (verify before applying).
BEGIN;
CREATE TABLE dwelling_private.photo_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 attestation_key_hex text NOT NULL CHECK(attestation_key_hex ~ '^[a-fA-F0-9]{64,128}$')
);
ALTER TABLE dwelling_private.photo_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dwelling_private.photo_config FROM PUBLIC,anon,authenticated;
-- Intentionally EMPTY. Configure a strong random key through an authorized secret-management step.
CREATE TABLE dwelling_private.photo_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL, study_id uuid NOT NULL,item_id uuid NOT NULL,
 nonce uuid NOT NULL DEFAULT gen_random_uuid(), object_key text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 finalized boolean NOT NULL DEFAULT false,
 FOREIGN KEY(owner_id,study_id) REFERENCES dwelling_private.documents(owner_id,id)
);
CREATE INDEX dwelling_photo_rate ON dwelling_private.photo_reservations(owner_id,created_at DESC);
ALTER TABLE dwelling_private.photo_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dwelling_private.photo_reservations FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dwelling_private.reserve_photo(p_study uuid,p_item uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject text:=auth.jwt()->>'sub'; identifier uuid:=gen_random_uuid(); r dwelling_private.photo_reservations;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Photo access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM dwelling_private.photo_config) THEN RAISE EXCEPTION 'Photo service not configured' USING ERRCODE='55000'; END IF;
 IF NOT EXISTS(SELECT 1 FROM dwelling_private.documents d,jsonb_array_elements(d.payload->'rows') item
 WHERE d.owner_id=subject AND d.id=p_study AND (item->>'id')::uuid=p_item) THEN RAISE EXCEPTION 'Save the equipment item before uploading' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dwelling-photo-quota:'||subject,0));
 -- Failed/pending attempts remain quota-charged; no unaudited deletion/garbage collector is exposed.
 IF (SELECT count(*) FROM dwelling_private.photo_reservations WHERE owner_id=subject AND created_at>now()-interval '1 minute')>=10
 OR (SELECT count(*) FROM dwelling_private.photo_reservations WHERE owner_id=subject AND created_at>now()-interval '1 day')>=100 THEN RAISE EXCEPTION 'Photo rate limit reached' USING ERRCODE='54000'; END IF;
 IF (SELECT count(*) FROM dwelling_private.photo_reservations WHERE owner_id=subject AND study_id=p_study)>=25
 OR (SELECT count(*) FROM dwelling_private.photo_reservations WHERE owner_id=subject)>=125 THEN RAISE EXCEPTION 'Photo quota reached; request a reviewed retention check' USING ERRCODE='54000'; END IF;
 INSERT INTO dwelling_private.photo_reservations(id,owner_id,study_id,item_id,object_key)
 VALUES(identifier,subject,p_study,p_item,subject||'/'||p_study::text||'/'||identifier::text) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'owner_id',r.owner_id,'study_id',r.study_id,'item_id',r.item_id,'nonce',r.nonce,'object_key',r.object_key);
END $$;
CREATE FUNCTION dwelling_private.photo_insert_allowed(p_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT dwelling_private.allowed() AND EXISTS(SELECT 1 FROM dwelling_private.photo_reservations r WHERE r.owner_id=auth.jwt()->>'sub' AND r.object_key=p_name AND NOT r.finalized AND r.expires_at>now())
$$;
CREATE FUNCTION dwelling_private.photo_read_allowed(p_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT dwelling_private.allowed() AND EXISTS(SELECT 1 FROM dwelling_private.evidence e WHERE e.owner_id=auth.jwt()->>'sub' AND e.object_key=p_name AND e.detected_mime='image/jpeg')
$$;
CREATE FUNCTION dwelling_private.finalize_photo(p_id uuid,p_sha256 text,p_size integer,p_proof text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r dwelling_private.photo_reservations; secret text; msg text; expected text;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Photo access denied' USING ERRCODE='42501'; END IF;
 IF p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 4194304 OR p_proof IS NULL OR p_proof !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid photo attestation' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM dwelling_private.photo_reservations WHERE id=p_id AND owner_id=auth.jwt()->>'sub' FOR UPDATE;
 IF NOT FOUND OR r.finalized OR r.expires_at<=now() THEN RAISE EXCEPTION 'Photo reservation unavailable' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM dwelling_private.documents d,jsonb_array_elements(d.payload->'rows') item WHERE d.owner_id=r.owner_id AND d.id=r.study_id AND (item->>'id')::uuid=r.item_id) THEN RAISE EXCEPTION 'Equipment item changed; photo not attached' USING ERRCODE='22023'; END IF;
 SELECT attestation_key_hex INTO secret FROM dwelling_private.photo_config WHERE singleton;
 IF secret IS NULL THEN RAISE EXCEPTION 'Photo service not configured' USING ERRCODE='55000'; END IF;
 msg:=concat_ws(E'\n','dwelling-photo-v1',r.owner_id,r.id::text,r.study_id::text,r.item_id::text,r.nonce::text,p_sha256,p_size::text,'image/jpeg');
 expected:=encode(extensions.hmac(convert_to(msg,'UTF8'),decode(secret,'hex'),'sha256'),'hex');
 IF expected<>p_proof THEN RAISE EXCEPTION 'Unverified photo attestation' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='dwelling-evidence-private' AND o.name=r.object_key AND (o.metadata->>'size')::bigint=p_size AND o.metadata->>'mimetype'='image/jpeg') THEN RAISE EXCEPTION 'Stored photo not verified' USING ERRCODE='22023'; END IF;
 INSERT INTO dwelling_private.evidence(owner_id,study_id,item_id,id,original_filename,detected_mime,byte_size,sha256,bucket_id,object_key,verified_by)
 VALUES(r.owner_id,r.study_id,r.item_id,r.id,'dwelling-photo.jpg','image/jpeg',p_size,p_sha256,'dwelling-evidence-private',r.object_key,'netlify:dwelling-photos:v1');
 UPDATE dwelling_private.photo_reservations SET finalized=true WHERE id=r.id;
 RETURN jsonb_build_object('id',r.id);
END $$;
CREATE FUNCTION dwelling_private.photo_access(p_study uuid,p_evidence uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Photo access denied' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('id',id,'object_key',object_key,'byte_size',byte_size,'sha256',sha256) INTO result FROM dwelling_private.evidence
 WHERE owner_id=auth.jwt()->>'sub' AND study_id=p_study AND id=p_evidence AND detected_mime='image/jpeg';
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION dwelling_private.reserve_photo(uuid,uuid),dwelling_private.photo_insert_allowed(text),dwelling_private.photo_read_allowed(text),dwelling_private.finalize_photo(uuid,text,integer,text),dwelling_private.photo_access(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dwelling_private.reserve_photo(uuid,uuid),dwelling_private.photo_insert_allowed(text),dwelling_private.photo_read_allowed(text),dwelling_private.finalize_photo(uuid,text,integer,text),dwelling_private.photo_access(uuid,uuid) TO authenticated;
CREATE FUNCTION public.reserve_dwelling_photo(p_study uuid,p_item uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.reserve_photo(p_study,p_item) $$;
CREATE FUNCTION public.finalize_dwelling_photo(p_id uuid,p_sha256 text,p_size integer,p_proof text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.finalize_photo(p_id,p_sha256,p_size,p_proof) $$;
CREATE FUNCTION public.get_dwelling_photo_access(p_study uuid,p_evidence uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.photo_access(p_study,p_evidence) $$;
REVOKE ALL ON FUNCTION public.reserve_dwelling_photo(uuid,uuid),public.finalize_dwelling_photo(uuid,text,integer,text),public.get_dwelling_photo_access(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_dwelling_photo(uuid,uuid),public.finalize_dwelling_photo(uuid,text,integer,text),public.get_dwelling_photo_access(uuid,uuid) TO authenticated;
INSERT INTO hq_tool_private.resource_map(resource_kind,resource_name,module_key) VALUES ('rpc','reserve_dwelling_photo','dwelling-load'),('rpc','finalize_dwelling_photo','dwelling-load'),('rpc','get_dwelling_photo_access','dwelling-load');
-- Deployment review must verify existing broad Storage policies cannot bypass these restrictive guards.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('dwelling-evidence-private','dwelling-evidence-private',false,4194304,ARRAY['image/jpeg']);
CREATE POLICY dwelling_photo_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='dwelling-evidence-private' AND dwelling_private.photo_insert_allowed(name));
CREATE POLICY dwelling_photo_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='dwelling-evidence-private' AND dwelling_private.photo_read_allowed(name));
CREATE POLICY dwelling_photo_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'dwelling-evidence-private' OR dwelling_private.photo_insert_allowed(name));
CREATE POLICY dwelling_photo_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'dwelling-evidence-private' OR dwelling_private.photo_read_allowed(name));
CREATE POLICY dwelling_photo_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'dwelling-evidence-private') WITH CHECK(bucket_id<>'dwelling-evidence-private');
CREATE POLICY dwelling_photo_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'dwelling-evidence-private');
-- Reject anonymous operations even if an unrelated permissive policy is broad.
CREATE POLICY dwelling_photo_anon_guard ON storage.objects AS RESTRICTIVE FOR ALL TO anon USING(bucket_id<>'dwelling-evidence-private') WITH CHECK(bucket_id<>'dwelling-evidence-private');
COMMIT;
