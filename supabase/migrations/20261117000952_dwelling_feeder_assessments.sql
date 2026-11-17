-- LOCAL CANDIDATE ONLY. Apply after dwelling-load-v2-evidence-candidate.sql.
-- No remote mutation performed. Photo pipeline is independent of these wrappers.
BEGIN;
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
COMMIT;
