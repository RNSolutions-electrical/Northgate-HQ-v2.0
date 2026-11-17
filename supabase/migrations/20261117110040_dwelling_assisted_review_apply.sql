-- Owner-private guided drafts and narrow trusted Apply. No new storage, secrets or global hooks.
BEGIN;
-- LOCAL ONLY: apply after nameplate candidate. Persist unverified drafts, never apply calculations.
CREATE FUNCTION dwelling_private.assisted_context(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE c jsonb:=p-ARRAY['assistedReview','updatedAt','lastBackup','lastImport']; rows_out jsonb:='[]'; r jsonb;
BEGIN
 IF jsonb_typeof(c->'rows')='array' THEN
  FOR r IN SELECT value FROM jsonb_array_elements(c->'rows') LOOP
   IF jsonb_typeof(r->'calculationSource')='object' THEN r:=jsonb_set(r,'{calculationSource}',(r->'calculationSource')-'snapshot'); END IF;
   rows_out:=rows_out||jsonb_build_array(r);
  END LOOP;
  c:=jsonb_set(c,'{rows}',rows_out);
 END IF;
 RETURN c;
END $$;
CREATE FUNCTION dwelling_private.assisted_refs(j jsonb,lim integer) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE x jsonb; ids uuid[]:='{}';
BEGIN
 IF jsonb_typeof(j) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(j)>lim THEN RETURN false; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(j) LOOP
  IF NOT dwelling_private.nameplate_uuid(x) OR (x#>>'{}')::uuid=ANY(ids) THEN RETURN false; END IF;
  ids:=array_append(ids,(x#>>'{}')::uuid);
 END LOOP;
 RETURN true;
END $$;
CREATE FUNCTION dwelling_private.validate_assisted_review(a jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE x jsonb; ref jsonb; ids text[]; k text;
BEGIN
 IF a='null'::jsonb THEN RETURN; END IF;
 IF NOT dwelling_private.nameplate_keys(a,ARRAY['version','sourceContext','answers','systems','scenarios','proposal']) OR a->'version' IS DISTINCT FROM '1'::jsonb OR a->'proposal' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Invalid assisted review version or properties; proposals are unsupported' USING ERRCODE='22023'; END IF;
 IF a->'sourceContext'<>'null'::jsonb AND jsonb_typeof(a->'sourceContext') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid assisted source context' USING ERRCODE='22023'; END IF;
 IF octet_length((a->'sourceContext')::text)>524288 OR octet_length((a-'sourceContext')::text)>400000 THEN RAISE EXCEPTION 'Assisted draft exceeds context or answer size limit; source data was not changed' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['answers','systems','scenarios'] LOOP
  IF jsonb_typeof(a->k) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid assisted draft collection' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF jsonb_array_length(a->'answers')>100 OR jsonb_array_length(a->'systems')>20 OR jsonb_array_length(a->'scenarios')>20 THEN RAISE EXCEPTION 'Too many assisted draft entries' USING ERRCODE='22023'; END IF;
 ids:='{}';
 FOR x IN SELECT value FROM jsonb_array_elements(a->'answers') LOOP
  IF NOT dwelling_private.nameplate_keys(x,ARRAY['questionId','text','sourceReferences']) OR NOT dwelling_private.feeder_text(x->'questionId',150) OR btrim(x->>'questionId')='' OR (x->>'questionId')=ANY(ids) OR NOT dwelling_private.feeder_text(x->'text',4000) OR jsonb_typeof(x->'sourceReferences') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid assisted answer' USING ERRCODE='22023'; END IF;
  ids:=array_append(ids,x->>'questionId');
  IF jsonb_array_length(x->'sourceReferences')>10 THEN RAISE EXCEPTION 'Too many answer source references' USING ERRCODE='22023'; END IF;
  FOR ref IN SELECT value FROM jsonb_array_elements(x->'sourceReferences') LOOP
   IF NOT dwelling_private.feeder_text(ref,1000) THEN RAISE EXCEPTION 'Invalid answer source reference' USING ERRCODE='22023'; END IF;
  END LOOP;
 END LOOP;
 ids:='{}';
 FOR x IN SELECT value FROM jsonb_array_elements(a->'systems') LOOP
  IF NOT dwelling_private.nameplate_keys(x,ARRAY['id','label','rowIds','zone','controller','heatSource','notes']) OR NOT dwelling_private.nameplate_uuid(x->'id') OR lower(x->>'id')=ANY(ids) OR NOT dwelling_private.assisted_refs(x->'rowIds',500) OR NOT dwelling_private.feeder_text(x->'label',200) OR NOT dwelling_private.feeder_text(x->'zone',1000) OR NOT dwelling_private.feeder_text(x->'controller',1000) OR NOT dwelling_private.feeder_text(x->'heatSource',1000) OR NOT dwelling_private.feeder_text(x->'notes',4000) THEN RAISE EXCEPTION 'Invalid assisted system' USING ERRCODE='22023'; END IF;
  ids:=array_append(ids,lower(x->>'id'));
 END LOOP;
 ids:='{}';
 FOR x IN SELECT value FROM jsonb_array_elements(a->'scenarios') LOOP
  IF NOT dwelling_private.nameplate_keys(x,ARRAY['id','label','includedRowIds','excludedRowIds','systemIds','controlEvidence','ruleBasis','reviewClaim']) OR NOT dwelling_private.nameplate_uuid(x->'id') OR lower(x->>'id')=ANY(ids) OR NOT dwelling_private.feeder_text(x->'label',200) OR NOT dwelling_private.assisted_refs(x->'includedRowIds',500) OR NOT dwelling_private.assisted_refs(x->'excludedRowIds',500) OR NOT dwelling_private.assisted_refs(x->'systemIds',20) OR NOT dwelling_private.feeder_text(x->'controlEvidence',4000) OR NOT dwelling_private.feeder_text(x->'ruleBasis',4000) OR jsonb_typeof(x->'reviewClaim') IS DISTINCT FROM 'string' OR x->>'reviewClaim' NOT IN ('unreviewed','user-reviewed') THEN RAISE EXCEPTION 'Invalid assisted scenario' USING ERRCODE='22023'; END IF;
  ids:=array_append(ids,lower(x->>'id'));
  -- Contradictory, unknown or deleted references remain drafts for explicit issue reporting.
 END LOOP;
END $$;
ALTER FUNCTION dwelling_private.validate_payload(jsonb) RENAME TO validate_payload_before_assisted;
CREATE FUNCTION dwelling_private.validate_payload(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF p IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>2000000 THEN RAISE EXCEPTION 'Invalid or oversized worksheet' USING ERRCODE='22023'; END IF;
 IF p?'assistedReview' THEN
  IF p->'schema' IS DISTINCT FROM '2'::jsonb THEN RAISE EXCEPTION 'Assisted drafts require schema 2' USING ERRCODE='22023'; END IF;
  PERFORM dwelling_private.validate_assisted_review(p->'assistedReview');
 END IF;
 PERFORM dwelling_private.validate_payload_before_assisted(p-'assistedReview');
END $$;
ALTER FUNCTION dwelling_private.save_study(uuid,jsonb,integer,boolean) RENAME TO save_study_before_assisted;
REVOKE ALL ON FUNCTION dwelling_private.save_study_before_assisted(uuid,jsonb,integer,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dwelling_private.save_study(p_id uuid,p_payload jsonb,p_expected_version integer,p_restore boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject text:=auth.jwt()->>'sub'; prior jsonb;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_restore IS NULL THEN RAISE EXCEPTION 'Study ID, current version and operation required' USING ERRCODE='22023'; END IF;
 -- Validate metadata before sanitization, but allow preexisting restore-review reset behavior.
 IF p_payload?'assistedReview' THEN PERFORM dwelling_private.validate_assisted_review(p_payload->'assistedReview'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dwelling:'||subject||':'||p_id::text,0));
 SELECT payload INTO prior FROM dwelling_private.documents WHERE owner_id=subject AND id=p_id FOR UPDATE;
 IF prior IS NOT NULL AND NOT p_restore AND prior?'assistedReview' AND NOT p_payload?'assistedReview' THEN RAISE EXCEPTION 'This study has assisted draft data; preserve it or explicitly clear it' USING ERRCODE='22023'; END IF;
 IF (p_restore OR prior IS NULL) AND jsonb_typeof(p_payload->'assistedReview')='object' THEN p_payload:=jsonb_set(p_payload,'{assistedReview,sourceContext}','null'::jsonb); END IF;
 RETURN dwelling_private.save_study_before_assisted(p_id,p_payload,p_expected_version,p_restore);
END $$;
REVOKE ALL ON FUNCTION dwelling_private.assisted_context(jsonb),dwelling_private.assisted_refs(jsonb,integer),dwelling_private.validate_assisted_review(jsonb),dwelling_private.validate_payload(jsonb),dwelling_private.validate_payload_before_assisted(jsonb),dwelling_private.save_study(uuid,jsonb,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dwelling_private.save_study(uuid,jsonb,integer,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_dwelling_study(p_id uuid,p_payload jsonb,p_expected_version integer,p_restore boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.save_study(p_id,p_payload,p_expected_version,p_restore) $$;

-- LOCAL ONLY. Narrow independently recomputed application after assisted draft v1.
CREATE TABLE dwelling_private.assisted_applications (
 history_id bigint PRIMARY KEY REFERENCES dwelling_private.history(id),
 owner_id text NOT NULL, study_id uuid NOT NULL, actor_id text NOT NULL,
 applied_at timestamptz NOT NULL DEFAULT now(), rule_version text NOT NULL,
 changes jsonb NOT NULL
);
ALTER TABLE dwelling_private.assisted_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dwelling_private.assisted_applications FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dwelling_assisted_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON dwelling_private.assisted_applications FOR EACH STATEMENT EXECUTE FUNCTION dwelling_private.reject_history_mutation();
CREATE FUNCTION dwelling_private.assisted_fact(a jsonb,k text,choices text[]) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE answer jsonb;
BEGIN
 SELECT x INTO answer FROM jsonb_array_elements(a->'answers') x WHERE x->>'questionId'=k;
 IF answer IS NULL OR NOT (answer->>'text'=ANY(choices)) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(answer->'sourceReferences') r WHERE dwelling_private.nameplate_trim(r)<>'') THEN RAISE EXCEPTION 'Supported fact and source reference required: %',k USING ERRCODE='22023'; END IF;
 RETURN answer->>'text';
END $$;
CREATE FUNCTION dwelling_private.assisted_rating(r jsonb) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v numeric; q numeric;
BEGIN
 IF dwelling_private.nameplate_trim(r->>'va')!~'^\d+(\.\d+)?$' OR dwelling_private.nameplate_trim(r->>'qty')!~'^\d+$' THEN RAISE EXCEPTION 'Positive source VA and whole quantity required' USING ERRCODE='22023'; END IF;
 v:=dwelling_private.nameplate_scalar(r->>'va');q:=(r->>'qty')::numeric;
 IF v IS NULL OR v<=0 OR q<=0 OR q>9007199254740991 THEN RAISE EXCEPTION 'Unsupported source rating or quantity' USING ERRCODE='22023'; END IF;
 IF NOT dwelling_private.nameplate_source_current(r) THEN RAISE EXCEPTION 'Selected nameplate calculation source is stale' USING ERRCODE='22023'; END IF;
 RETURN v*q;
END $$;
CREATE FUNCTION dwelling_private.assisted_proposal(p jsonb,proposal_id text) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a jsonb:=p->'assistedReview'; row_data jsonb; scenario jsonb; source_ids jsonb:='[]'; assigned jsonb:='[]'; n integer; total numeric:=0; choice text; ref jsonb; ids text[]; seen text[]:='{}'; ident text; target text; rule_id text;
BEGIN
 PERFORM dwelling_private.validate_payload(p);
 IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR a->'sourceContext' IS DISTINCT FROM dwelling_private.assisted_context(p) THEN RAISE EXCEPTION 'Guided source context is missing or stale' USING ERRCODE='22023'; END IF;
 PERFORM dwelling_private.assisted_fact(a,'supported.guided.code-rule-set',ARRAY['nec2017-nc-confirmed']);
 PERFORM dwelling_private.assisted_fact(a,'supported.guided.scope',ARRAY['entire-one-family-dwelling-reviewed']);
 PERFORM dwelling_private.assisted_fact(a,'supported.guided.inventory',ARRAY['complete-inventory-reviewed']);
 IF p->>'voltage'<>'240' THEN RAISE EXCEPTION 'Only reviewed 120/240V dwelling scope supported' USING ERRCODE='22023'; END IF;
 IF proposal_id='supported.cooking.single-range-column-c' THEN
  PERFORM dwelling_private.assisted_fact(a,'supported.cooking.classification',ARRAY['single-household-range']);
  PERFORM dwelling_private.assisted_fact(a,'supported.cooking.rating-basis',ARRAY['applicable-nameplate-va-reviewed']);
  PERFORM dwelling_private.assisted_fact(a,'supported.cooking.complete-set',ARRAY['only-this-one-range-reviewed']);
  PERFORM dwelling_private.assisted_fact(a,'supported.cooking.table-exceptions',ARRAY['none-applicable-reviewed']);
  SELECT count(*) INTO n FROM jsonb_array_elements(p->'rows') r WHERE r->>'cat'='cooking';
  SELECT r INTO row_data FROM jsonb_array_elements(p->'rows') r WHERE r->>'cat'='cooking' LIMIT 1;
  IF n<>1 THEN RAISE EXCEPTION 'Exactly one cooking range required' USING ERRCODE='22023'; END IF;
  total:=dwelling_private.assisted_rating(row_data);
  IF (row_data->>'qty')::numeric<>1 OR total<=8750 OR total>12000 THEN RAISE EXCEPTION 'Supported cooking band is above8750 through12000VA, quantity1' USING ERRCODE='22023'; END IF;
  total:=8000;target:='cookingDemand';rule_id:='NEC2017-220.55-Table-ColumnC-1';source_ids:=jsonb_build_array(row_data->>'id');
 ELSIF proposal_id='optional.cooling-only' THEN
  PERFORM dwelling_private.assisted_fact(a,'supported.optional.supply-scope',ARRAY['single-120-240v-three-wire-entire-dwelling']);
  PERFORM dwelling_private.assisted_fact(a,'supported.optional.supply-ampacity',ARRAY['at-least-100a-independently-verified']);
  PERFORM dwelling_private.assisted_fact(a,'supported.hvac.supported-type',ARRAY['ac-cooling-only']);
  PERFORM dwelling_private.assisted_fact(a,'supported.hvac.other-categories',ARRAY['no-heatpump-electricheat-or-other-c-selection-reviewed']);
  PERFORM dwelling_private.assisted_fact(a,'supported.hvac.overlap',ARRAY['complete-nonoverlapping-nameplate-ratings-reviewed']);
  choice:=dwelling_private.assisted_fact(a,'supported.hvac.boiler-auxiliaries',ARRAY['none-present-reviewed','accounted-outside-cooling-reviewed']);
  PERFORM dwelling_private.assisted_fact(a,'supported.hvac.complete-cooling-set',ARRAY['all-cooling-components-included-no-exclusions']);
  SELECT coalesce(jsonb_agg(r),'[]') INTO assigned FROM jsonb_array_elements(a->'systems') s CROSS JOIN LATERAL jsonb_array_elements(s->'rowIds') r;
  FOR row_data IN SELECT r FROM jsonb_array_elements(p->'rows') r WHERE r->>'cat'='hvac' LOOP
   PERFORM dwelling_private.assisted_fact(a,'supported.hvac.role.'||(row_data->>'id'),ARRAY['complete-cooling-package','distinct-cooling-component']);
   PERFORM dwelling_private.assisted_fact(a,'supported.hvac.rating.'||(row_data->>'id'),ARRAY['applicable-cooling-nameplate-reviewed']);
   total:=total+dwelling_private.assisted_rating(row_data);source_ids:=source_ids||jsonb_build_array(row_data->>'id');
   SELECT count(*) INTO n FROM jsonb_array_elements_text(assigned) r WHERE lower(r)=lower(row_data->>'id');
   IF n<>1 THEN RAISE EXCEPTION 'Cooling row must belong to exactly one recorded system' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF jsonb_array_length(source_ids)=0 OR total>9007199254740991 THEN RAISE EXCEPTION 'Missing cooling inventory or unsupported total' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(assigned) r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rows') x WHERE lower(x->>'id')=lower(r))) THEN RAISE EXCEPTION 'System references missing equipment' USING ERRCODE='22023'; END IF;
  FOR scenario IN SELECT value FROM jsonb_array_elements(a->'scenarios') LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(scenario->'excludedRowIds') e JOIN jsonb_array_elements_text(source_ids) c ON lower(e)=lower(c)) THEN RAISE EXCEPTION 'Cooling exclusion unsupported in all-cooling proposal' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(scenario->'includedRowIds') i JOIN jsonb_array_elements_text(scenario->'excludedRowIds') e ON lower(i)=lower(e)) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text((scenario->'includedRowIds')||(scenario->'excludedRowIds')) r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rows') x WHERE lower(x->>'id')=lower(r))) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(scenario->'systemIds') r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a->'systems') x WHERE lower(x->>'id')=lower(r))) THEN RAISE EXCEPTION 'Contradictory or unknown scenario references' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF choice='accounted-outside-cooling-reviewed' THEN
   SELECT x INTO ref FROM jsonb_array_elements(a->'answers') x WHERE x->>'questionId'='supported.hvac.boiler-auxiliary-row-ids';
   IF ref IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(ref->'sourceReferences') r WHERE dwelling_private.nameplate_trim(r)<>'') THEN RAISE EXCEPTION 'Boiler auxiliary source references required' USING ERRCODE='22023'; END IF;
   ids:=string_to_array(ref->>'text',',');
   FOREACH ident IN ARRAY ids LOOP
    ident:=dwelling_private.nameplate_trim(ident);IF ident='' THEN CONTINUE;END IF;
    IF lower(ident)=ANY(seen) THEN RAISE EXCEPTION 'Duplicate boiler auxiliary reference' USING ERRCODE='22023'; END IF;
    seen:=array_append(seen,lower(ident));
    SELECT x INTO row_data FROM jsonb_array_elements(p->'rows') x WHERE lower(x->>'id')=lower(ident) AND x->>'cat' IN ('fixed','motor','other');
    IF row_data IS NULL THEN RAISE EXCEPTION 'Boiler auxiliary must reference existing non-HVAC load' USING ERRCODE='22023'; END IF;
    PERFORM dwelling_private.assisted_rating(row_data);
    source_ids:=source_ids||jsonb_build_array(row_data->>'id');
   END LOOP;
   IF cardinality(seen)=0 THEN RAISE EXCEPTION 'Boiler auxiliary references required' USING ERRCODE='22023'; END IF;
  END IF;
  target:='hvacOptional';rule_id:='NEC2017-220.82-C1';
 ELSE RAISE EXCEPTION 'Unsupported assisted proposal' USING ERRCODE='22023';
 END IF;
 RETURN jsonb_build_object('id',proposal_id,'target',target,'before',p->>target,'proposed',trim_scale(total)::text,'ruleId',rule_id,'ruleVersion','2017-nec-nc-supported-v1','sourceIds',source_ids,'qualification','Conditional on user-attested classification, applicability and evidence; not independent field/AHJ verification');
END $$;
CREATE FUNCTION dwelling_private.apply_assisted(p_id uuid,p_expected_version integer,p_proposal_ids text[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject text:=auth.jwt()->>'sub'; original jsonb; next_payload jsonb; version_now integer; proposal_id text; change jsonb; changes jsonb:='[]'; note_key text; note_text text; saved jsonb; event_id bigint; k text;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_proposal_ids IS NULL OR cardinality(p_proposal_ids) NOT BETWEEN 1 AND 2 OR EXISTS(SELECT 1 FROM unnest(p_proposal_ids) x WHERE x IS NULL) OR (SELECT count(*)<>count(DISTINCT x) FROM unnest(p_proposal_ids) x) THEN RAISE EXCEPTION 'Explicit saved version and unique supported selections required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dwelling:'||subject||':'||p_id::text,0));
 SELECT payload,version INTO original,version_now FROM dwelling_private.documents WHERE owner_id=subject AND id=p_id FOR UPDATE;
 IF original IS NULL THEN RAISE EXCEPTION 'Owned saved study required' USING ERRCODE='22023'; END IF;
 IF version_now<>p_expected_version THEN RAISE EXCEPTION 'Study changed; reload and review before applying' USING ERRCODE='40001'; END IF;
 next_payload:=original;
 -- Evaluate every selected change against the same immutable before-state before any write.
 FOREACH proposal_id IN ARRAY p_proposal_ids LOOP
  change:=dwelling_private.assisted_proposal(original,proposal_id);
  IF dwelling_private.nameplate_scalar(change->>'before')=dwelling_private.nameplate_scalar(change->>'proposed') THEN RAISE EXCEPTION 'Selected proposal already matches the manual value; no changes applied' USING ERRCODE='22023'; END IF;
  changes:=changes||jsonb_build_array(change);
  next_payload:=jsonb_set(next_payload,ARRAY[change->>'target'],change->'proposed');
  note_key:=CASE change->>'target' WHEN 'cookingDemand' THEN 'cookingNote' WHEN 'hvacOptional' THEN 'hvacNote' END;
  note_text:=coalesce(next_payload->>note_key,'')||CASE WHEN coalesce(next_payload->>note_key,'')='' THEN '' ELSE E'\n' END||'Assisted conditional application: '||(change->>'ruleId')||' ['||(change->>'ruleVersion')||']; '||(change->>'proposed')||' VA. User-attested facts and source references retained in application history; applicability still requires review.';
  next_payload:=jsonb_set(next_payload,ARRAY[note_key],to_jsonb(note_text));
 END LOOP;
 FOREACH k IN ARRAY ARRAY['basisConfirmed','inventoryConfirmed','motorConfirmed','optionalEligible','optionalReviewed'] LOOP next_payload:=jsonb_set(next_payload,ARRAY[k],'false'::jsonb);END LOOP;
 next_payload:=dwelling_private.clear_feeder_reviews(next_payload);
 next_payload:=jsonb_set(next_payload,'{assistedReview,sourceContext}','null'::jsonb);
 saved:=dwelling_private.save_study(p_id,next_payload,p_expected_version,false);
 SELECT id INTO event_id FROM dwelling_private.history WHERE owner_id=subject AND study_id=p_id AND after_version=(saved->>'version')::integer ORDER BY id DESC LIMIT 1;
 INSERT INTO dwelling_private.assisted_applications(history_id,owner_id,study_id,actor_id,rule_version,changes) VALUES(event_id,subject,p_id,subject,'2017-nec-nc-supported-v1',changes);
 RETURN saved||jsonb_build_object('application',jsonb_build_object('historyId',event_id,'changes',changes));
END $$;
REVOKE ALL ON FUNCTION dwelling_private.assisted_fact(jsonb,text,text[]),dwelling_private.assisted_rating(jsonb),dwelling_private.assisted_proposal(jsonb,text),dwelling_private.apply_assisted(uuid,integer,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dwelling_private.apply_assisted(uuid,integer,text[]) TO authenticated;
CREATE FUNCTION public.apply_dwelling_assisted_proposals(p_id uuid,p_expected_version integer,p_proposal_ids text[]) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.apply_assisted(p_id,p_expected_version,p_proposal_ids) $$;
REVOKE ALL ON FUNCTION public.apply_dwelling_assisted_proposals(uuid,integer,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_dwelling_assisted_proposals(uuid,integer,text[]) TO authenticated;
CREATE FUNCTION dwelling_private.get_assisted_application(p_id uuid,p_history_id bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('historyId',history_id,'studyId',study_id,'actorId',actor_id,'appliedAt',applied_at,'ruleVersion',rule_version,'changes',changes)
 INTO result FROM dwelling_private.assisted_applications WHERE owner_id=auth.jwt()->>'sub' AND study_id=p_id AND history_id=p_history_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION dwelling_private.get_assisted_application(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dwelling_private.get_assisted_application(uuid,bigint) TO authenticated;
CREATE FUNCTION public.get_dwelling_assisted_application(p_id uuid,p_history_id bigint) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.get_assisted_application(p_id,p_history_id) $$;
REVOKE ALL ON FUNCTION public.get_dwelling_assisted_application(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_dwelling_assisted_application(uuid,bigint) TO authenticated;
COMMIT;
