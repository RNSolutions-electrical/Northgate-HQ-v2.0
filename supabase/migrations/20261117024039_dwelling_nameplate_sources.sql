-- Owner-private nameplate observations and explicit reviewed calculation sources.
-- Approved staging-only release; preserves existing studies and history.
BEGIN;
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
