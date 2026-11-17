-- Owner-private structured guided methods, decision preservation and trusted atomic Apply.
-- No customer fixtures, data backfills, new storage, secrets or global authorization hooks.
BEGIN;
ALTER FUNCTION dwelling_private.assisted_proposal(jsonb,text) RENAME TO assisted_proposal_before_decisions;
REVOKE ALL ON FUNCTION dwelling_private.assisted_proposal_before_decisions(jsonb,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dwelling_private.assisted_proposal(p jsonb,proposal_id text) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE entry record; answer jsonb;
BEGIN
 PERFORM dwelling_private.validate_payload(p);
 FOR entry IN SELECT * FROM (VALUES
  ('decision.occupancy',ARRAY['one-family']::text[],'both'),
  ('decision.scope',ARRAY['entire-dwelling']::text[],'both'),
  ('decision.inventory',ARRAY['complete']::text[],'both'),
  ('decision.cooking',ARRAY['single-household-range']::text[],'cooking'),
  ('decision.hvac',ARRAY['cooling-only']::text[],'cooling'),
  ('decision.heating',ARRAY['none','combustion-with-reviewed-auxiliaries']::text[],'cooling'),
  ('decision.overlap',ARRAY['resolved']::text[],'cooling'),
  ('decision.noncoincidence',ARRAY['no-exclusions']::text[],'cooling')
 ) AS gates(question_id,allowed_values,rule_scope)
 WHERE rule_scope='both' OR (rule_scope='cooking' AND proposal_id='supported.cooking.single-range-column-c') OR (rule_scope='cooling' AND proposal_id='optional.cooling-only') LOOP
  SELECT x INTO answer FROM jsonb_array_elements(coalesce(p->'assistedReview'->'answers','[]'::jsonb)) x WHERE x->>'questionId'=entry.question_id;
  -- Absent choices preserve legacy drafts; present unknown/unsupported choices cannot be overruled by stale positive facts.
  IF answer IS NOT NULL AND NOT (answer->>'text'=ANY(entry.allowed_values)) THEN
   RAISE EXCEPTION 'Decision answer is unresolved or unsupported for this proposal: %',entry.question_id USING ERRCODE='22023';
  END IF;
 END LOOP;
 IF proposal_id='optional.cooling-only' THEN
  SELECT x INTO answer FROM jsonb_array_elements(p->'assistedReview'->'answers') x WHERE x->>'questionId'='decision.heating';
  IF answer->>'text'='combustion-with-reviewed-auxiliaries' THEN
   PERFORM dwelling_private.assisted_fact(p->'assistedReview','supported.hvac.boiler-auxiliaries',ARRAY['accounted-outside-cooling-reviewed']);
  ELSIF answer->>'text'='none' THEN
   PERFORM dwelling_private.assisted_fact(p->'assistedReview','supported.hvac.boiler-auxiliaries',ARRAY['none-present-reviewed']);
  END IF;
 END IF;
 RETURN dwelling_private.assisted_proposal_before_decisions(p,proposal_id);
END $$;
REVOKE ALL ON FUNCTION dwelling_private.assisted_proposal(jsonb,text) FROM PUBLIC,anon,authenticated;
ALTER FUNCTION dwelling_private.save_study(uuid,jsonb,integer,boolean) RENAME TO save_study_before_decisions;
REVOKE ALL ON FUNCTION dwelling_private.save_study_before_decisions(uuid,jsonb,integer,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dwelling_private.save_study(p_id uuid,p_payload jsonb,p_expected_version integer,p_restore boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject text:=auth.jwt()->>'sub'; prior jsonb; old_answer jsonb;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_restore IS NULL THEN RAISE EXCEPTION 'Study ID, current version and operation required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dwelling:'||subject||':'||p_id::text,0));
 SELECT payload INTO prior FROM dwelling_private.documents WHERE owner_id=subject AND id=p_id FOR UPDATE;
 IF prior IS NOT NULL AND NOT p_restore AND jsonb_typeof(p_payload->'assistedReview')='object' THEN
  FOR old_answer IN SELECT x FROM jsonb_array_elements(coalesce(prior->'assistedReview'->'answers','[]'::jsonb)) x WHERE x->>'questionId' IN ('decision.occupancy','decision.scope','decision.inventory','decision.cooking','decision.hvac','decision.heating','decision.overlap','decision.noncoincidence') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'assistedReview'->'answers','[]'::jsonb)) x WHERE x->>'questionId'=old_answer->>'questionId') THEN RAISE EXCEPTION 'Preserve recorded decision answers or explicitly clear the guided review: %',old_answer->>'questionId' USING ERRCODE='22023'; END IF;
  END LOOP;
 END IF;
 RETURN dwelling_private.save_study_before_decisions(p_id,p_payload,p_expected_version,p_restore);
END $$;
REVOKE ALL ON FUNCTION dwelling_private.save_study(uuid,jsonb,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dwelling_private.save_study(uuid,jsonb,integer,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_dwelling_study(p_id uuid,p_payload jsonb,p_expected_version integer,p_restore boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.save_study(p_id,p_payload,p_expected_version,p_restore) $$;

CREATE FUNCTION dwelling_private.plan_refs(a jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE x jsonb;
BEGIN
 IF jsonb_typeof(a) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(a)>10 THEN RETURN false; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(a) LOOP IF NOT dwelling_private.feeder_text(x,1000) THEN RETURN false; END IF; END LOOP;
 RETURN true;
END $$;
CREATE FUNCTION dwelling_private.validate_hvac_plan(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s jsonb;c jsonb;ids uuid[]:='{}'; rows_seen uuid[];
BEGIN
 IF p='null'::jsonb THEN RETURN;END IF;
 IF NOT dwelling_private.nameplate_keys(p,ARRAY['version','inventoryReviewed','classificationReviewed','sourceReferences','systems','standardMode','scenariosExhaustiveReviewed']) OR p->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'inventoryReviewed') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p->'classificationReviewed') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p->'scenariosExhaustiveReviewed') IS DISTINCT FROM 'boolean' OR NOT dwelling_private.plan_refs(p->'sourceReferences') OR jsonb_typeof(p->'systems') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'standardMode') IS DISTINCT FROM 'string' OR p->>'standardMode' NOT IN ('all-coincident','reviewed-scenarios','unknown') THEN RAISE EXCEPTION 'Invalid structured HVAC plan' USING ERRCODE='22023';END IF;
 IF jsonb_array_length(p->'systems')>20 THEN RAISE EXCEPTION 'At most20 HVAC systems' USING ERRCODE='22023';END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p->'systems') LOOP
  IF NOT dwelling_private.nameplate_keys(s,ARRAY['id','label','kind','components','controlUnitIds','compressorOperation','preventionEvidence','sourceReferences','coolingRowIds','coolingInventoryReviewed','controlsReviewed','heatingBranchCurrentA','heatingBranchFloorReviewed']) OR NOT dwelling_private.nameplate_uuid(s->'id') OR (s->>'id')::uuid=ANY(ids) OR NOT dwelling_private.feeder_text(s->'label',200) OR jsonb_typeof(s->'kind') IS DISTINCT FROM 'string' OR s->>'kind' NOT IN ('cooling','heat-pump','heat-pump-supplement','resistance','storage-continuous','other','unknown') OR jsonb_typeof(s->'components') IS DISTINCT FROM 'array' OR NOT dwelling_private.assisted_refs(s->'controlUnitIds',100) OR jsonb_typeof(s->'compressorOperation') IS DISTINCT FROM 'string' OR s->>'compressorOperation' NOT IN ('simultaneous','prevented','unknown') OR NOT dwelling_private.feeder_text(s->'preventionEvidence',4000) OR NOT dwelling_private.plan_refs(s->'sourceReferences') OR NOT dwelling_private.assisted_refs(s->'coolingRowIds',500) OR jsonb_typeof(s->'coolingInventoryReviewed') IS DISTINCT FROM 'boolean' OR jsonb_typeof(s->'controlsReviewed') IS DISTINCT FROM 'boolean' OR jsonb_typeof(s->'heatingBranchFloorReviewed') IS DISTINCT FROM 'boolean' OR NOT dwelling_private.feeder_text(s->'heatingBranchCurrentA',100) THEN RAISE EXCEPTION 'Invalid HVAC system fields or identity' USING ERRCODE='22023';END IF;
  ids:=array_append(ids,(s->>'id')::uuid);rows_seen:='{}';
  IF jsonb_array_length(s->'components')>500 THEN RAISE EXCEPTION 'At most500 HVAC component references' USING ERRCODE='22023';END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(s->'components') LOOP
   IF NOT dwelling_private.nameplate_keys(c,ARRAY['rowId','role']) OR NOT dwelling_private.nameplate_uuid(c->'rowId') OR (c->>'rowId')::uuid=ANY(rows_seen) OR jsonb_typeof(c->'role') IS DISTINCT FROM 'string' OR c->>'role' NOT IN ('total','compressor','supplement','auxiliary') THEN RAISE EXCEPTION 'Invalid HVAC component reference' USING ERRCODE='22023';END IF;
   rows_seen:=array_append(rows_seen,(c->>'rowId')::uuid);
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION dwelling_private.validate_motor_plan(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m jsonb;ids uuid[]:='{}';k text;
BEGIN
 IF p='null'::jsonb THEN RETURN;END IF;
 IF NOT dwelling_private.nameplate_keys(p,ARRAY['version','inventoryReviewed','standardBasisReviewed','noEmbeddedAdderReviewed','sourceReferences','motors']) OR p->'version' IS DISTINCT FROM '1'::jsonb OR NOT dwelling_private.plan_refs(p->'sourceReferences') OR jsonb_typeof(p->'motors') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid structured motor plan' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['inventoryReviewed','standardBasisReviewed','noEmbeddedAdderReviewed'] LOOP IF jsonb_typeof(p->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid motor review flag' USING ERRCODE='22023';END IF;END LOOP;
 IF jsonb_array_length(p->'motors')>500 THEN RAISE EXCEPTION 'At most500 motor entries' USING ERRCODE='22023';END IF;
 FOR m IN SELECT value FROM jsonb_array_elements(p->'motors') LOOP
  IF NOT dwelling_private.nameplate_keys(m,ARRAY['id','rowId','label','va','quantity','basis','sourceReferences','ratingSource']) OR NOT dwelling_private.nameplate_uuid(m->'id') OR (m->>'id')::uuid=ANY(ids) OR NOT dwelling_private.nameplate_uuid(m->'rowId') OR NOT dwelling_private.feeder_text(m->'label',200) OR NOT dwelling_private.feeder_text(m->'va',100) OR NOT dwelling_private.feeder_text(m->'quantity',100) OR jsonb_typeof(m->'basis') IS DISTINCT FROM 'string' OR m->>'basis' NOT IN ('430.6-reviewed','440.6-reviewed','unknown') OR NOT dwelling_private.plan_refs(m->'sourceReferences') THEN RAISE EXCEPTION 'Invalid motor entry' USING ERRCODE='22023';END IF;
  PERFORM dwelling_private.validate_nameplates(jsonb_build_object('calculationSource',m->'ratingSource'));
  ids:=array_append(ids,(m->>'id')::uuid);
 END LOOP;
END $$;
CREATE FUNCTION dwelling_private.validate_cooking_plan(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE x jsonb;k text;
BEGIN
 IF p='null'::jsonb THEN RETURN;END IF;
 IF NOT dwelling_private.nameplate_keys(p,ARRAY['version','inventoryReviewed','classificationReviewed','overlapReviewed','sourceReferences','method','appliances']) OR p->'version' IS DISTINCT FROM '1'::jsonb OR NOT dwelling_private.plan_refs(p->'sourceReferences') OR jsonb_typeof(p->'method') IS DISTINCT FROM 'string' OR p->>'method' NOT IN ('unknown','column-c','note-3') OR jsonb_typeof(p->'appliances') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid cooking plan' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['inventoryReviewed','classificationReviewed','overlapReviewed'] LOOP IF jsonb_typeof(p->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid cooking review acknowledgment' USING ERRCODE='22023';END IF;END LOOP;
 IF jsonb_array_length(p->'appliances')>500 THEN RAISE EXCEPTION 'Too many cooking rows' USING ERRCODE='22023';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p->'appliances') LOOP
  IF NOT dwelling_private.nameplate_keys(x,ARRAY['rowId','kind','eligibilityReviewed','sourceReferences']) OR NOT dwelling_private.nameplate_uuid(x->'rowId') OR jsonb_typeof(x->'kind') IS DISTINCT FROM 'string' OR x->>'kind' NOT IN ('household-range','household-wall-oven','household-counter-unit','other-household-cooking','commercial','warming','unknown') OR jsonb_typeof(x->'eligibilityReviewed') IS DISTINCT FROM 'boolean' OR NOT dwelling_private.plan_refs(x->'sourceReferences') THEN RAISE EXCEPTION 'Invalid cooking appliance classification' USING ERRCODE='22023';END IF;
 END LOOP;
END $$;
ALTER FUNCTION dwelling_private.validate_assisted_review(jsonb) RENAME TO validate_assisted_review_v1;
CREATE FUNCTION dwelling_private.validate_assisted_review(a jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF a->'version'='2'::jsonb THEN
  IF NOT dwelling_private.nameplate_keys(a,ARRAY['version','sourceContext','answers','systems','scenarios','proposal','hvacPlan','motorPlan','cookingPlan']) OR octet_length((a-'sourceContext')::text)>400000 THEN RAISE EXCEPTION 'Invalid or oversized guided v2 draft' USING ERRCODE='22023';END IF;
  PERFORM dwelling_private.validate_cooking_plan(a->'cookingPlan');PERFORM dwelling_private.validate_hvac_plan(a->'hvacPlan');PERFORM dwelling_private.validate_motor_plan(a->'motorPlan');
  PERFORM dwelling_private.validate_assisted_review_v1(jsonb_set(a-ARRAY['hvacPlan','motorPlan','cookingPlan'],'{version}','1'::jsonb));
 ELSE PERFORM dwelling_private.validate_assisted_review_v1(a);END IF;
END $$;
CREATE FUNCTION dwelling_private.clear_assisted_plan_reviews(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE a jsonb:=p->'assistedReview';h jsonb;m jsonb;c jsonb;s jsonb;out_systems jsonb:='[]';k text;
BEGIN
 IF a->'version' IS DISTINCT FROM '2'::jsonb THEN RETURN p;END IF;
 h:=a->'hvacPlan';m:=a->'motorPlan';
 IF jsonb_typeof(h)='object' THEN
  FOREACH k IN ARRAY ARRAY['inventoryReviewed','classificationReviewed','scenariosExhaustiveReviewed'] LOOP h:=jsonb_set(h,ARRAY[k],'false'::jsonb);END LOOP;
  FOR s IN SELECT value FROM jsonb_array_elements(h->'systems') LOOP
   FOREACH k IN ARRAY ARRAY['coolingInventoryReviewed','controlsReviewed','heatingBranchFloorReviewed'] LOOP s:=jsonb_set(s,ARRAY[k],'false'::jsonb);END LOOP;
   out_systems:=out_systems||jsonb_build_array(s);
  END LOOP;
  h:=jsonb_set(h,'{systems}',out_systems);a:=jsonb_set(a,'{hvacPlan}',h);
 END IF;
 IF jsonb_typeof(m)='object' THEN
  FOREACH k IN ARRAY ARRAY['inventoryReviewed','standardBasisReviewed','noEmbeddedAdderReviewed'] LOOP m:=jsonb_set(m,ARRAY[k],'false'::jsonb);END LOOP;
  a:=jsonb_set(a,'{motorPlan}',m);
 END IF;
 c:=a->'cookingPlan';IF jsonb_typeof(c)='object' THEN
  FOREACH k IN ARRAY ARRAY['inventoryReviewed','classificationReviewed','overlapReviewed'] LOOP c:=jsonb_set(c,ARRAY[k],'false'::jsonb);END LOOP;
  out_systems:='[]';FOR s IN SELECT value FROM jsonb_array_elements(c->'appliances') LOOP out_systems:=out_systems||jsonb_build_array(jsonb_set(s,'{eligibilityReviewed}','false'::jsonb));END LOOP;
  c:=jsonb_set(c,'{appliances}',out_systems);a:=jsonb_set(a,'{cookingPlan}',c);
 END IF;
 a:=jsonb_set(a,'{sourceContext}','null'::jsonb);
 RETURN jsonb_set(p,'{assistedReview}',a);
END $$;
ALTER FUNCTION dwelling_private.save_study(uuid,jsonb,integer,boolean) RENAME TO save_study_before_plans_v2;
REVOKE ALL ON FUNCTION dwelling_private.save_study_before_plans_v2(uuid,jsonb,integer,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dwelling_private.save_study(p_id uuid,p_payload jsonb,p_expected_version integer,p_restore boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject text:=auth.jwt()->>'sub';prior jsonb;k text;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501';END IF;
 IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_restore IS NULL THEN RAISE EXCEPTION 'Study ID, current version and operation required' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dwelling:'||subject||':'||p_id::text,0));
 SELECT payload INTO prior FROM dwelling_private.documents WHERE owner_id=subject AND id=p_id FOR UPDATE;
 IF prior IS NOT NULL AND NOT p_restore AND jsonb_typeof(p_payload->'assistedReview')='object' THEN
  FOREACH k IN ARRAY ARRAY['hvacPlan','motorPlan','cookingPlan'] LOOP
   IF jsonb_typeof(prior->'assistedReview'->k)='object' AND NOT (p_payload->'assistedReview')?k THEN RAISE EXCEPTION 'Preserve structured plan or explicitly clear it: %',k USING ERRCODE='22023';END IF;
  END LOOP;
 END IF;
 IF p_payload?'assistedReview' THEN PERFORM dwelling_private.validate_assisted_review(p_payload->'assistedReview');END IF;
 IF p_restore OR prior IS NULL THEN p_payload:=dwelling_private.clear_assisted_plan_reviews(p_payload);END IF;
 RETURN dwelling_private.save_study_before_plans_v2(p_id,p_payload,p_expected_version,p_restore);
END $$;
REVOKE ALL ON FUNCTION dwelling_private.clear_assisted_plan_reviews(jsonb),dwelling_private.validate_cooking_plan(jsonb),dwelling_private.plan_refs(jsonb),dwelling_private.validate_hvac_plan(jsonb),dwelling_private.validate_motor_plan(jsonb),dwelling_private.validate_assisted_review(jsonb),dwelling_private.validate_assisted_review_v1(jsonb),dwelling_private.save_study(uuid,jsonb,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dwelling_private.save_study(uuid,jsonb,integer,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_dwelling_study(p_id uuid,p_payload jsonb,p_expected_version integer,p_restore boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.save_study(p_id,p_payload,p_expected_version,p_restore) $$;
-- A structured plan must not be bypassed by the earlier cooling-only proposal path.
ALTER FUNCTION dwelling_private.assisted_proposal(jsonb,text) RENAME TO assisted_proposal_before_plans_v2;
REVOKE ALL ON FUNCTION dwelling_private.assisted_proposal_before_plans_v2(jsonb,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dwelling_private.assisted_proposal(p jsonb,proposal_id text) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF proposal_id='supported.cooking.single-range-column-c' AND jsonb_typeof(p->'assistedReview'->'cookingPlan')='object' THEN RAISE EXCEPTION 'Use structured cooking plan evaluator' USING ERRCODE='22023';END IF;
 IF proposal_id='optional.cooling-only' AND jsonb_typeof(p->'assistedReview'->'hvacPlan')='object' THEN RAISE EXCEPTION 'Use the structured HVAC plan evaluator; legacy cooling-only path cannot bypass this plan' USING ERRCODE='22023';END IF;
 RETURN dwelling_private.assisted_proposal_before_plans_v2(p,proposal_id);
END $$;
REVOKE ALL ON FUNCTION dwelling_private.assisted_proposal(jsonb,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION dwelling_private.guided_whole_total(p jsonb,method text) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text;r jsonb;v numeric;q numeric;g numeric;gd numeric;fixed numeric:=0;fixed_count numeric:=0;dryer_count numeric:=0;dryer_base numeric:=0;dryer_nameplate numeric:=0;cooking_count int:=0;cooking_nameplate numeric:=0;motor_base numeric:=0;max_motor numeric:=0;hvac_count int:=0;other_load numeric:=0;extra_motor numeric;hvac numeric:=0;cooking numeric:=0;dryer numeric:=0;pool numeric;result numeric;
BEGIN
 PERFORM dwelling_private.validate_payload(p);
 IF method NOT IN ('standard','optional') THEN RAISE EXCEPTION 'Unknown method' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['area','voltage','service','small','laundry','cookingDemand','dryerDemand','largestMotor','hvacStandard','hvacOptional'] LOOP
  IF p->>k<>'' AND dwelling_private.nameplate_scalar(p->>k) IS NULL THEN RAISE EXCEPTION 'Unsupported numeric input: %',k USING ERRCODE='22023';END IF;
 END LOOP;
 IF coalesce(dwelling_private.nameplate_scalar(p->>'area'),0)<=0 OR p->>'voltage'<>'240' OR coalesce(dwelling_private.nameplate_scalar(p->>'small'),0)<2 OR coalesce(dwelling_private.nameplate_scalar(p->>'laundry'),0)<1 OR (p->>'small')::numeric<>trunc((p->>'small')::numeric) OR (p->>'laundry')::numeric<>trunc((p->>'laundry')::numeric) OR jsonb_array_length(p->'rows')=0 THEN RAISE EXCEPTION 'Complete general inputs and inventory required' USING ERRCODE='22023';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p->'rows') LOOP
  IF dwelling_private.nameplate_trim(r->>'label')='' THEN RAISE EXCEPTION 'Equipment label required' USING ERRCODE='22023';END IF;
  v:=dwelling_private.assisted_rating(r);q:=(r->>'qty')::numeric;
  CASE r->>'cat'
   WHEN 'fixed' THEN fixed:=fixed+v;fixed_count:=fixed_count+q;
   WHEN 'dryer' THEN dryer_count:=dryer_count+q;dryer_base:=dryer_base+q*greatest(5000,(r->>'va')::numeric);dryer_nameplate:=dryer_nameplate+v;
   WHEN 'cooking' THEN cooking_count:=cooking_count+1;cooking_nameplate:=cooking_nameplate+v;
   WHEN 'motor' THEN motor_base:=motor_base+v;max_motor:=greatest(max_motor,(r->>'va')::numeric);
   WHEN 'hvac' THEN hvac_count:=hvac_count+1;
   WHEN 'other' THEN other_load:=other_load+v;
   ELSE RAISE EXCEPTION 'Unsupported equipment category' USING ERRCODE='22023';
  END CASE;
 END LOOP;
 IF cooking_count=0 AND p->>'cookingDemand'<>'' THEN RAISE EXCEPTION 'Cooking override without inventory' USING ERRCODE='22023';END IF;
 IF hvac_count=0 AND (p->>'hvacStandard'<>'' OR p->>'hvacOptional'<>'') THEN RAISE EXCEPTION 'HVAC override without inventory' USING ERRCODE='22023';END IF;
 IF other_load>0 AND dwelling_private.nameplate_trim(p->>'otherNote')='' THEN RAISE EXCEPTION 'Other load rationale required' USING ERRCODE='22023';END IF;
 g:=(p->>'area')::numeric*3+((p->>'small')::numeric+(p->>'laundry')::numeric)*1500;
 IF method='standard' THEN
  gd:=least(g,3000)+least(greatest(g-3000,0),117000)*0.35+greatest(g-120000,0)*0.25;
  dryer:=dryer_base;
  IF dryer_count<=4 AND p->>'dryerDemand'<>'' THEN RAISE EXCEPTION 'Unused dryer override' USING ERRCODE='22023';END IF;
  IF dryer_count>4 THEN IF p->>'dryerDemand'='' OR dwelling_private.nameplate_trim(p->>'dryerNote')='' THEN RAISE EXCEPTION 'Reviewed dryer demand and rationale required' USING ERRCODE='22023';END IF;dryer:=(p->>'dryerDemand')::numeric;END IF;
  IF cooking_count>0 THEN IF p->>'cookingDemand'='' OR dwelling_private.nameplate_trim(p->>'cookingNote')='' THEN RAISE EXCEPTION 'Reviewed cooking demand and rationale required' USING ERRCODE='22023';END IF;cooking:=(p->>'cookingDemand')::numeric;END IF;
  IF p->>'largestMotor'='' THEN RAISE EXCEPTION 'Explicit reviewed motor contribution required' USING ERRCODE='22023';END IF;
  extra_motor:=(p->>'largestMotor')::numeric;IF extra_motor<max_motor THEN RAISE EXCEPTION 'Largest motor below standalone item' USING ERRCODE='22023';END IF;
  IF hvac_count>0 THEN IF p->>'hvacStandard'='' OR dwelling_private.nameplate_trim(p->>'hvacNote')='' THEN RAISE EXCEPTION 'Reviewed standard HVAC input required' USING ERRCODE='22023';END IF;hvac:=(p->>'hvacStandard')::numeric;END IF;
  result:=gd+fixed*CASE WHEN fixed_count>=4 THEN 0.75 ELSE 1 END+dryer+cooking+motor_base+extra_motor*0.25+hvac+other_load;
 ELSE
  IF hvac_count>0 THEN IF p->>'hvacOptional'='' OR dwelling_private.nameplate_trim(p->>'hvacNote')='' THEN RAISE EXCEPTION 'Reviewed optional HVAC input required' USING ERRCODE='22023';END IF;hvac:=(p->>'hvacOptional')::numeric;END IF;
  pool:=g+fixed+cooking_nameplate+dryer_nameplate+motor_base;
  result:=least(pool,10000)+greatest(pool-10000,0)*0.4+hvac+other_load;
 END IF;
 IF result>9007199254740991 THEN RAISE EXCEPTION 'Whole-method total exceeds supported numeric range' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('method',method,'totalVA',trim_scale(result)::text,'amps',result/240,'finalReviewRequired',true);
END $$;
REVOKE ALL ON FUNCTION dwelling_private.guided_whole_total(jsonb,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dwelling_private.guided_evidence(refs jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM jsonb_array_elements_text(refs) x WHERE dwelling_private.nameplate_trim(x)<>'') $$;
CREATE FUNCTION dwelling_private.guided_positive(v text) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE n numeric;
BEGIN
 IF length(v)>100 OR dwelling_private.nameplate_trim(v)!~'^\d+(\.\d+)?$' THEN RAISE EXCEPTION 'Explicit positive decimal required' USING ERRCODE='22023';END IF;
 n:=dwelling_private.nameplate_scalar(v);IF n IS NULL OR n<=0 THEN RAISE EXCEPTION 'Positive supported amount required' USING ERRCODE='22023';END IF;RETURN n;
END $$;
CREATE FUNCTION dwelling_private.guided_cooking(p jsonb,classification_only boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a jsonb:=p->'assistedReview';plan jsonb:=a->'cookingPlan';app jsonb;r jsonb;seen text[]:='{}';id text;decision text;va numeric;q numeric;cnt numeric:=0;ca numeric:=0;cb numeric:=0;va_a numeric:=0;va_b numeric:=0;fa int;fb int;demand numeric:=0;steps jsonb:='[]';factors_a int[]:=ARRAY[80,75,70,66,62,59,56,53,51,49,47,45,43,41,40,39,38,37,36,35,34,33,32,31,30];factors_b int[]:=ARRAY[80,65,55,50,45,43,40,36,35,34,32,32,32,32,32,28,28,28,28,28,26,26,26,26,26];
BEGIN
 PERFORM dwelling_private.validate_payload(p);
 IF classification_only AND (plan IS NULL OR plan='null'::jsonb) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rows') x WHERE x->>'cat'='cooking') THEN RETURN jsonb_build_object('status','not-applicable','sourceIds','[]'::jsonb);END IF;
 IF jsonb_typeof(plan) IS DISTINCT FROM 'object' OR a->'sourceContext' IS DISTINCT FROM dwelling_private.assisted_context(p) THEN RAISE EXCEPTION 'Current cooking plan required' USING ERRCODE='22023';END IF;
 PERFORM dwelling_private.assisted_fact(a,'supported.guided.code-rule-set',ARRAY['nec2017-nc-confirmed']);PERFORM dwelling_private.assisted_fact(a,'supported.guided.scope',ARRAY['entire-one-family-dwelling-reviewed']);PERFORM dwelling_private.assisted_fact(a,'supported.guided.inventory',ARRAY['complete-inventory-reviewed']);
 FOR id,decision IN SELECT * FROM (VALUES('decision.occupancy','one-family'),('decision.scope','entire-dwelling'),('decision.inventory','complete'))x(id,value) LOOP
  SELECT x INTO app FROM jsonb_array_elements(a->'answers') x WHERE x->>'questionId'=id;IF app IS NOT NULL AND app->>'text'<>decision THEN RAISE EXCEPTION 'Conflicting cooking scope choice' USING ERRCODE='22023';END IF;
 END LOOP;
 IF p->>'voltage'<>'240' OR plan->'inventoryReviewed'<>'true'::jsonb OR plan->'classificationReviewed'<>'true'::jsonb OR plan->'overlapReviewed'<>'true'::jsonb OR NOT dwelling_private.guided_evidence(plan->'sourceReferences') OR (NOT classification_only AND plan->>'method'='unknown') OR jsonb_array_length(plan->'appliances')=0 THEN RAISE EXCEPTION 'Reviewed cooking classification/overlap/method required' USING ERRCODE='22023';END IF;
 FOR app IN SELECT value FROM jsonb_array_elements(plan->'appliances') LOOP
  id:=lower(app->>'rowId');IF id=ANY(seen) THEN RAISE EXCEPTION 'Cooking appliance counted twice' USING ERRCODE='22023';END IF;seen:=array_append(seen,id);
  SELECT x INTO r FROM jsonb_array_elements(p->'rows') x WHERE lower(x->>'id')=id AND x->>'cat'='cooking';
  IF r IS NULL OR app->>'kind' NOT IN ('household-range','household-wall-oven','household-counter-unit','other-household-cooking') OR app->'eligibilityReviewed'<>'true'::jsonb OR NOT dwelling_private.guided_evidence(app->'sourceReferences') THEN RAISE EXCEPTION 'Reviewed household cooking equipment required' USING ERRCODE='22023';END IF;
  PERFORM dwelling_private.assisted_rating(r);va:=dwelling_private.guided_positive(r->>'va');q:=(r->>'qty')::numeric;
  IF NOT classification_only AND (va<=1750 OR va>12000 OR (plan->>'method'='note-3' AND va>8750)) THEN RAISE EXCEPTION 'Cooking rating outside supported table method' USING ERRCODE='22023';END IF;
  cnt:=cnt+q;IF va<3500 THEN ca:=ca+q;va_a:=va_a+va*q;ELSE cb:=cb+q;va_b:=va_b+va*q;END IF;
  steps:=steps||jsonb_build_array(jsonb_build_object('rowId',r->>'id','quantity',q,'individualVA',va));
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rows') x WHERE x->>'cat'='cooking' AND NOT lower(x->>'id')=ANY(seen)) THEN RAISE EXCEPTION 'Cooking inventory incomplete' USING ERRCODE='22023';END IF;
 SELECT x INTO app FROM jsonb_array_elements(a->'answers') x WHERE x->>'questionId'='decision.cooking';
 IF app IS NOT NULL THEN
  decision:=app->>'text';
  IF decision='single-household-range' THEN
   IF cnt<>1 OR jsonb_array_length(plan->'appliances')<>1 OR plan->'appliances'->0->>'kind'<>'household-range' OR (SELECT count(*) FROM jsonb_array_elements(p->'rows') x WHERE x->>'cat'='cooking')<>1 THEN RAISE EXCEPTION 'Single-range decision conflicts with structured cooking inventory' USING ERRCODE='22023';END IF;
  ELSIF decision='multiple-household' THEN
   IF cnt<2 THEN RAISE EXCEPTION 'Multiple-appliance decision requires at least two eligible appliances' USING ERRCODE='22023';END IF;
  ELSE RAISE EXCEPTION 'Cooking decision is unresolved or unsupported' USING ERRCODE='22023';END IF;
 END IF;
 IF cnt>9007199254740991 THEN RAISE EXCEPTION 'Cooking count exceeds supported range' USING ERRCODE='22023';END IF;
 IF classification_only AND va_a+va_b>9007199254740991 THEN RAISE EXCEPTION 'Cooking connected nameplates exceed supported range' USING ERRCODE='22023';END IF;
 IF classification_only THEN RETURN jsonb_build_object('status','classified','sourceIds',to_jsonb(seen),'individualApplianceCount',cnt,'steps',steps,'note','Reviewed household cooking classification only; full nameplates remain in optional pool, no standard demand factors applied.');END IF;
 IF plan->>'method'='column-c' THEN
  demand:=CASE WHEN cnt<=5 THEN (ARRAY[8000,11000,14000,17000,20000])[cnt::int] WHEN cnt<=40 THEN 15000+1000*cnt ELSE 25000+750*cnt END;
  steps:=steps||jsonb_build_array(jsonb_build_object('column','C','count',cnt,'demandVA',demand));
 ELSE
  IF ca>0 THEN fa:=CASE WHEN ca<=25 THEN factors_a[ca::int] ELSE 30 END;demand:=demand+va_a*fa/100;steps:=steps||jsonb_build_array(jsonb_build_object('column','A','count',ca,'nameplateVA',va_a,'factorPercent',fa,'demandVA',va_a*fa/100));END IF;
  IF cb>0 THEN fb:=CASE WHEN cb<=25 THEN factors_b[cb::int] WHEN cb<=30 THEN 24 WHEN cb<=40 THEN 22 WHEN cb<=50 THEN 20 WHEN cb<=60 THEN 18 ELSE 16 END;demand:=demand+va_b*fb/100;steps:=steps||jsonb_build_array(jsonb_build_object('column','B','count',cb,'nameplateVA',va_b,'factorPercent',fb,'demandVA',va_b*fb/100));END IF;
 END IF;
 IF demand>9007199254740991 THEN RAISE EXCEPTION 'Cooking demand exceeds supported range' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('proposed',trim_scale(demand)::text,'sourceIds',to_jsonb(seen),'ruleId',CASE plan->>'method' WHEN 'column-c' THEN 'NEC2017-220.55-ColumnC' ELSE 'NEC2017-220.55-Note3-AB' END,'steps',steps,'note','Guided2017NEC220.55 '||(plan->>'method')||'; individual household cooking classification, source ratings and table arithmetic retained in application history. No branch-circuit grouping or optional-pool change.');
END $$;
REVOKE ALL ON FUNCTION dwelling_private.guided_cooking(jsonb,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dwelling_private.guided_method_proposal(p jsonb,method text) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_column
DECLARE a jsonb:=p->'assistedReview';h jsonb;m jsonb;s jsonb;c jsonb;r jsonb;mo jsonb;sc jsonb;answer jsonb; synthetic jsonb; assigned text[]:='{}';covered text[]:='{}';controls text[]:='{}';kinds text[]:='{}';source_ids jsonb:='[]';candidates jsonb:='[]';scenario_trace jsonb:='[]';parts jsonb;id text;kind text;role text;mode text;decision text;auxids text[];auxseen text[]:='{}';n int;category int;hvac_count int;resistance_count int:=0;v numeric;raw numeric;total_parts numeric;compressor numeric;supplement numeric;cooling numeric;all_hvac numeric:=0;floor_va numeric:=0;largest numeric:=0;motor_max numeric:=0;motor_total numeric;row_total numeric;chosen_hvac numeric;chosen_motor numeric;combined numeric;winner numeric:=-1;sum_hv numeric;sum_motor numeric;grouped jsonb:='[]';changes jsonb;candidate_payload jsonb;engine jsonb;cooking jsonb;prevention boolean;
BEGIN
 PERFORM dwelling_private.validate_payload(p);
 IF method NOT IN ('standard','optional') OR a->'version' IS DISTINCT FROM '2'::jsonb OR a->'sourceContext' IS DISTINCT FROM dwelling_private.assisted_context(p) THEN RAISE EXCEPTION 'Current structured guide and supported method required' USING ERRCODE='22023';END IF;
 PERFORM dwelling_private.assisted_fact(a,'supported.guided.code-rule-set',ARRAY['nec2017-nc-confirmed']);PERFORM dwelling_private.assisted_fact(a,'supported.guided.scope',ARRAY['entire-one-family-dwelling-reviewed']);PERFORM dwelling_private.assisted_fact(a,'supported.guided.inventory',ARRAY['complete-inventory-reviewed']);
 FOR id,decision IN SELECT * FROM (VALUES('decision.occupancy','one-family'),('decision.scope','entire-dwelling'),('decision.inventory','complete'))x(id,value) LOOP
  SELECT x INTO answer FROM jsonb_array_elements(a->'answers') x WHERE x->>'questionId'=id;
  IF answer IS NOT NULL AND answer->>'text'<>decision THEN RAISE EXCEPTION 'Conflicting scope decision: %',id USING ERRCODE='22023';END IF;
 END LOOP;
 IF p->>'voltage'<>'240' THEN RAISE EXCEPTION 'Only120/240V entire-dwelling scope supported' USING ERRCODE='22023';END IF;
 h:=a->'hvacPlan';m:=a->'motorPlan';SELECT count(*) INTO hvac_count FROM jsonb_array_elements(p->'rows') x WHERE x->>'cat'='hvac';
 IF hvac_count>0 AND jsonb_typeof(h) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Structured HVAC plan required' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(h)='object' THEN
  IF h->'inventoryReviewed'<>'true'::jsonb OR h->'classificationReviewed'<>'true'::jsonb OR NOT dwelling_private.guided_evidence(h->'sourceReferences') THEN RAISE EXCEPTION 'HVAC inventory/classification sources required' USING ERRCODE='22023';END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(h->'systems') LOOP
   kind:=s->>'kind';IF kind IN ('other','unknown') OR NOT dwelling_private.guided_evidence(s->'sourceReferences') OR jsonb_array_length(s->'components')=0 THEN RAISE EXCEPTION 'Unsupported or unreviewed HVAC system' USING ERRCODE='22023';END IF;
   IF NOT kind=ANY(kinds) THEN kinds:=array_append(kinds,kind);END IF;
   parts:='[]';total_parts:=0;compressor:=0;supplement:=0;cooling:=0;
   FOR c IN SELECT value FROM jsonb_array_elements(s->'components') LOOP
    id:=lower(c->>'rowId');IF id=ANY(assigned) THEN RAISE EXCEPTION 'Duplicate HVAC membership' USING ERRCODE='22023';END IF;assigned:=array_append(assigned,id);
    SELECT x INTO r FROM jsonb_array_elements(p->'rows') x WHERE lower(x->>'id')=id AND x->>'cat'='hvac';
    IF r IS NULL THEN RAISE EXCEPTION 'HVAC component must reference existing HVAC row' USING ERRCODE='22023';END IF;
    v:=dwelling_private.assisted_rating(r);total_parts:=total_parts+v;all_hvac:=all_hvac+v;source_ids:=source_ids||jsonb_build_array(r->>'id');role:=c->>'role';
    parts:=parts||jsonb_build_array(jsonb_build_object('rowId',r->>'id','role',role,'va',v));
    IF role='compressor' THEN compressor:=compressor+v;ELSIF role='supplement' THEN supplement:=supplement+v;END IF;
   END LOOP;
   IF method='standard' AND kind IN ('resistance','storage-continuous','heat-pump-supplement') THEN
    IF s->'heatingBranchFloorReviewed'<>'true'::jsonb THEN RAISE EXCEPTION 'Heating branch floor review required' USING ERRCODE='22023';END IF;
    floor_va:=greatest(floor_va,dwelling_private.guided_positive(s->>'heatingBranchCurrentA')*240);
   END IF;
   IF method='optional' THEN
    IF kind IN ('cooling','heat-pump','resistance','storage-continuous') THEN
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(parts) x WHERE x->>'role'<>'total') THEN RAISE EXCEPTION 'Resolve HVAC total versus component rating treatment' USING ERRCODE='22023';END IF;
     raw:=total_parts;category:=CASE kind WHEN 'cooling' THEN 1 WHEN 'heat-pump' THEN 2 WHEN 'resistance' THEN 4 ELSE 6 END;
     IF kind='resistance' THEN
      IF s->'controlsReviewed'<>'true'::jsonb OR jsonb_array_length(s->'controlUnitIds')=0 THEN RAISE EXCEPTION 'Reviewed distinct control unit count required' USING ERRCODE='22023';END IF;
      FOR id IN SELECT lower(value) FROM jsonb_array_elements_text(s->'controlUnitIds') LOOP IF id=ANY(controls) THEN RAISE EXCEPTION 'Duplicate controlled heating unit' USING ERRCODE='22023';END IF;controls:=array_append(controls,id);END LOOP;
     END IF;
    ELSE
     IF compressor=0 OR supplement=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(parts) x WHERE x->>'role' NOT IN ('compressor','supplement')) THEN RAISE EXCEPTION 'Separate complete compressor and supplement ratings required' USING ERRCODE='22023';END IF;
     IF s->'coolingInventoryReviewed'<>'true'::jsonb OR jsonb_array_length(s->'coolingRowIds')=0 THEN RAISE EXCEPTION 'Separate complete cooling candidate required' USING ERRCODE='22023';END IF;
     FOR id IN SELECT lower(value) FROM jsonb_array_elements_text(s->'coolingRowIds') LOOP
      SELECT x INTO c FROM jsonb_array_elements(parts) x WHERE lower(x->>'rowId')=id AND x->>'role'<>'supplement';IF c IS NULL THEN RAISE EXCEPTION 'Invalid cooling-mode membership' USING ERRCODE='22023';END IF;cooling:=cooling+(c->>'va')::numeric;
     END LOOP;
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(parts) x WHERE x->>'role'='compressor' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(s->'coolingRowIds') id WHERE lower(id)=lower(x->>'rowId'))) THEN RAISE EXCEPTION 'Cooling membership omits compressor' USING ERRCODE='22023';END IF;
     candidates:=candidates||jsonb_build_array(jsonb_build_object('category',1,'systemId',s->>'id','value',cooling));
     IF s->>'compressorOperation'='unknown' OR (s->>'compressorOperation'='prevented' AND dwelling_private.nameplate_trim(s->>'preventionEvidence')='') THEN RAISE EXCEPTION 'Compressor/supplement operation evidence required' USING ERRCODE='22023';END IF;
     raw:=CASE WHEN s->>'compressorOperation'='prevented' THEN 0 ELSE compressor END+supplement*0.65;category:=3;
    END IF;
    candidates:=candidates||jsonb_build_array(jsonb_build_object('category',category,'systemId',s->>'id','value',raw));
   END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rows') x WHERE x->>'cat'='hvac' AND NOT lower(x->>'id')=ANY(assigned)) THEN RAISE EXCEPTION 'Missing HVAC membership' USING ERRCODE='22023';END IF;
 END IF;
 -- Concise decisions cannot be bypassed with previously reviewed structured data.
 SELECT x->>'text' INTO decision FROM jsonb_array_elements(a->'answers') x WHERE x->>'questionId'='decision.overlap';IF decision IS NOT NULL AND decision<>'resolved' THEN RAISE EXCEPTION 'Unresolved overlap decision' USING ERRCODE='22023';END IF;
 SELECT x->>'text' INTO decision FROM jsonb_array_elements(a->'answers') x WHERE x->>'questionId'='decision.hvac';
 IF decision IS NOT NULL THEN
  IF decision NOT IN ('cooling-only','heat-pump','electric-heating') OR EXISTS(SELECT 1 FROM unnest(kinds) x WHERE NOT x=ANY(CASE decision WHEN 'cooling-only' THEN ARRAY['cooling'] WHEN 'heat-pump' THEN ARRAY['heat-pump','heat-pump-supplement'] ELSE ARRAY['resistance','storage-continuous'] END)) THEN RAISE EXCEPTION 'HVAC decision conflicts with plan' USING ERRCODE='22023';END IF;
 END IF;
 SELECT x->>'text' INTO decision FROM jsonb_array_elements(a->'answers') x WHERE x->>'questionId'='decision.heating';
 IF decision IS NOT NULL THEN
  IF decision NOT IN ('none','combustion-with-reviewed-auxiliaries','electric-or-heat-pump') OR (decision='none' AND EXISTS(SELECT 1 FROM unnest(kinds) x WHERE x<>'cooling')) OR (decision='electric-or-heat-pump' AND NOT EXISTS(SELECT 1 FROM unnest(kinds) x WHERE x<>'cooling')) THEN RAISE EXCEPTION 'Heating decision conflicts with plan' USING ERRCODE='22023';END IF;
  IF decision='combustion-with-reviewed-auxiliaries' THEN
   PERFORM dwelling_private.assisted_fact(a,'supported.hvac.boiler-auxiliaries',ARRAY['accounted-outside-cooling-reviewed']);
   SELECT x INTO answer FROM jsonb_array_elements(a->'answers') x WHERE x->>'questionId'='supported.hvac.boiler-auxiliary-row-ids';
   IF answer IS NULL OR NOT dwelling_private.guided_evidence(answer->'sourceReferences') THEN RAISE EXCEPTION 'Combustion auxiliary references required' USING ERRCODE='22023';END IF;
   auxids:=string_to_array(answer->>'text',',');FOREACH id IN ARRAY auxids LOOP
    id:=lower(dwelling_private.nameplate_trim(id));IF id='' THEN CONTINUE;END IF;IF id=ANY(auxseen) THEN RAISE EXCEPTION 'Duplicate auxiliary reference' USING ERRCODE='22023';END IF;auxseen:=array_append(auxseen,id);
    SELECT x INTO r FROM jsonb_array_elements(p->'rows') x WHERE lower(x->>'id')=id AND x->>'cat' IN ('fixed','motor','other');IF r IS NULL THEN RAISE EXCEPTION 'Separately accounted non-HVAC auxiliary required' USING ERRCODE='22023';END IF;
    PERFORM dwelling_private.assisted_rating(r);PERFORM dwelling_private.assisted_fact(a,'supported.hvac.auxiliary-treatment.'||(r->>'id'),ARRAY[CASE r->>'cat' WHEN 'fixed' THEN 'qualifying-fixed-appliance-not-space-heating' WHEN 'motor' THEN 'motor-basis-reviewed' ELSE 'separate-reviewed-full-demand' END]);source_ids:=source_ids||jsonb_build_array(r->>'id');
   END LOOP;IF cardinality(auxseen)=0 THEN RAISE EXCEPTION 'Explicit combustion auxiliary inventory required' USING ERRCODE='22023';END IF;
  END IF;
 END IF;
 SELECT x->>'text' INTO decision FROM jsonb_array_elements(a->'answers') x WHERE x->>'questionId'='decision.noncoincidence';
 IF (decision IS NOT NULL AND decision NOT IN ('no-exclusions','exclusions-requested')) OR (decision='exclusions-requested' AND h->>'standardMode' IS DISTINCT FROM 'reviewed-scenarios') OR (decision='no-exclusions' AND h->>'standardMode'='reviewed-scenarios') THEN RAISE EXCEPTION 'Operating mode decision conflict' USING ERRCODE='22023';END IF;
 IF method='optional' THEN
  cooking:=dwelling_private.guided_cooking(p,true);
  PERFORM dwelling_private.assisted_fact(a,'supported.optional.supply-scope',ARRAY['single-120-240v-three-wire-entire-dwelling']);PERFORM dwelling_private.assisted_fact(a,'supported.optional.supply-ampacity',ARRAY['at-least-100a-independently-verified']);
  IF (SELECT count(*) FROM jsonb_array_elements(coalesce(h->'systems','[]')) x WHERE x->>'kind'='heat-pump-supplement')>1 THEN RAISE EXCEPTION 'Multiple supplemental heat-pump aggregation unsupported' USING ERRCODE='22023';END IF;
  IF cardinality(kinds)>1 THEN RAISE EXCEPTION 'Mixed system aggregation requires further rule review' USING ERRCODE='22023';END IF;
  FOR category IN 1..6 LOOP
   SELECT coalesce(sum((x->>'value')::numeric),0) INTO raw FROM jsonb_array_elements(candidates) x WHERE (x->>'category')::int=category;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(candidates) x WHERE (x->>'category')::int=category) THEN
    n:=category;IF category=4 THEN n:=CASE WHEN cardinality(controls)>=4 THEN 5 ELSE 4 END;raw:=raw*CASE WHEN n=5 THEN 0.4 ELSE 0.65 END;END IF;
    grouped:=grouped||jsonb_build_array(jsonb_build_object('category',n,'value',trim_scale(raw)::text));largest:=greatest(largest,raw);
   END IF;
  END LOOP;
  changes:=jsonb_build_object('hvacOptional',CASE WHEN hvac_count>0 THEN trim_scale(largest)::text ELSE '' END,'hvacNote','Guided optional 220.82(C) aggregate candidates; largest reviewed category selected. No standard-method motor adder applied.');
 ELSE
  IF jsonb_typeof(m) IS DISTINCT FROM 'object' OR m->'inventoryReviewed'<>'true'::jsonb OR m->'standardBasisReviewed'<>'true'::jsonb OR m->'noEmbeddedAdderReviewed'<>'true'::jsonb OR NOT dwelling_private.guided_evidence(m->'sourceReferences') THEN RAISE EXCEPTION 'Exhaustive motor basis and no embedded adder review required' USING ERRCODE='22023';END IF;
  FOR mo IN SELECT value FROM jsonb_array_elements(m->'motors') LOOP
   SELECT x INTO r FROM jsonb_array_elements(p->'rows') x WHERE lower(x->>'id')=lower(mo->>'rowId');IF r IS NULL THEN RAISE EXCEPTION 'Motor linked equipment missing' USING ERRCODE='22023';END IF;PERFORM dwelling_private.assisted_rating(r);covered:=array_append(covered,lower(r->>'id'));
   v:=dwelling_private.guided_positive(mo->>'va');IF mo->>'quantity'!~'^\d+$' OR (mo->>'quantity')::numeric<=0 OR (mo->>'quantity')::numeric>9007199254740991 OR mo->>'basis'='unknown' OR NOT dwelling_private.guided_evidence(mo->'sourceReferences') THEN RAISE EXCEPTION 'Motor quantity/basis/source incomplete' USING ERRCODE='22023';END IF;
   IF mo->'ratingSource'<>'null'::jsonb THEN
    synthetic:=r||jsonb_build_object('id',mo->>'id','qty',mo->>'quantity','label',(r->>'id')||' / '||(r->>'label')||' / '||(mo->>'label'),'va',mo->>'va','calculationSource',mo->'ratingSource');
    IF NOT dwelling_private.nameplate_source_current(synthetic) THEN RAISE EXCEPTION 'Individual motor selected source stale' USING ERRCODE='22023';END IF;
   END IF;motor_max:=greatest(motor_max,v);source_ids:=source_ids||jsonb_build_array(r->>'id');
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rows') r WHERE r->>'cat'='motor' AND NOT lower(r->>'id')=ANY(covered)) OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(h->'systems','[]'::jsonb)) s CROSS JOIN LATERAL jsonb_array_elements(s->'components') c WHERE s->>'kind' IN ('cooling','heat-pump','heat-pump-supplement') AND c->>'role'<>'supplement' AND NOT lower(c->>'rowId')=ANY(covered)) THEN RAISE EXCEPTION 'Incomplete standalone/embedded motor coverage' USING ERRCODE='22023';END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p->'rows') LOOP
   SELECT sum((x->>'va')::numeric*(x->>'quantity')::numeric) INTO motor_total FROM jsonb_array_elements(m->'motors') x WHERE lower(x->>'rowId')=lower(r->>'id');
   IF motor_total IS NOT NULL THEN row_total:=dwelling_private.assisted_rating(r);IF (r->>'cat'='motor' AND motor_total<>row_total) OR (r->>'cat'<>'motor' AND motor_total>row_total) THEN RAISE EXCEPTION 'Motor basis does not reconcile with included equipment base' USING ERRCODE='22023';END IF;END IF;
  END LOOP;
  chosen_hvac:=all_hvac;chosen_motor:=motor_max;
  IF hvac_count>0 AND h->>'standardMode'='reviewed-scenarios' THEN
   IF h->'scenariosExhaustiveReviewed'<>'true'::jsonb OR jsonb_array_length(a->'scenarios')=0 THEN RAISE EXCEPTION 'Exhaustive reviewed scenarios required' USING ERRCODE='22023';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rows') r WHERE r->>'cat'='hvac' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a->'scenarios') sc CROSS JOIN LATERAL jsonb_array_elements_text(sc->'includedRowIds') id WHERE lower(id)=lower(r->>'id'))) THEN RAISE EXCEPTION 'A load is omitted from every scenario' USING ERRCODE='22023';END IF;
   FOR sc IN SELECT value FROM jsonb_array_elements(a->'scenarios') LOOP
    IF sc->>'reviewClaim'<>'user-reviewed' OR dwelling_private.nameplate_trim(sc->>'controlEvidence')='' OR sc->>'ruleBasis'<>'NEC2017-220.60+430.24-ex3' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(sc->'includedRowIds') i JOIN jsonb_array_elements_text(sc->'excludedRowIds') e ON lower(i)=lower(e)) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text((sc->'includedRowIds')||(sc->'excludedRowIds')) id WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rows') r WHERE lower(r->>'id')=lower(id) AND r->>'cat'='hvac')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rows') r WHERE r->>'cat'='hvac' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text((sc->'includedRowIds')||(sc->'excludedRowIds')) id WHERE lower(id)=lower(r->>'id'))) THEN RAISE EXCEPTION 'Invalid HVAC scenario partition or reviewed rule evidence' USING ERRCODE='22023';END IF;
    sum_hv:=0;sum_motor:=0;
    FOR r IN SELECT value FROM jsonb_array_elements(p->'rows') LOOP
     prevention:=EXISTS(SELECT 1 FROM jsonb_array_elements_text(sc->'includedRowIds') id WHERE lower(id)=lower(r->>'id'));
     IF r->>'cat'='hvac' AND prevention THEN sum_hv:=sum_hv+dwelling_private.assisted_rating(r);END IF;
     IF r->>'cat'<>'hvac' OR prevention THEN SELECT coalesce(max((x->>'va')::numeric),0) INTO v FROM jsonb_array_elements(m->'motors') x WHERE lower(x->>'rowId')=lower(r->>'id');sum_motor:=greatest(sum_motor,v);END IF;
    END LOOP;
    combined:=sum_hv+sum_motor*0.25;scenario_trace:=scenario_trace||jsonb_build_array(jsonb_build_object('id',sc->>'id','hvacVA',trim_scale(sum_hv)::text,'largestMotorVA',trim_scale(sum_motor)::text,'combinedVA',trim_scale(combined)::text));
    IF combined>winner THEN winner:=combined;chosen_hvac:=sum_hv;chosen_motor:=sum_motor;END IF;
   END LOOP;
  ELSIF hvac_count>0 AND h->>'standardMode'<>'all-coincident' THEN RAISE EXCEPTION 'Standard operating mode required' USING ERRCODE='22023';END IF;
  changes:=jsonb_build_object('hvacStandard',CASE WHEN hvac_count>0 THEN trim_scale(chosen_hvac)::text ELSE '' END,'largestMotor',trim_scale(chosen_motor)::text,'hvacNote','Guided standard equipment assessment with paired largest-motor selection. Heating branch floor is assessed against the whole service/feeder result, not added as HVAC load.');
  IF jsonb_typeof(a->'cookingPlan')='object' THEN
   cooking:=dwelling_private.guided_cooking(p);
  ELSE BEGIN cooking:=dwelling_private.assisted_proposal_before_plans_v2(p,'supported.cooking.single-range-column-c');EXCEPTION WHEN invalid_parameter_value THEN cooking:=NULL;END;END IF;
  IF cooking IS NOT NULL THEN changes:=changes||jsonb_build_object('cookingDemand',cooking->>'proposed','cookingNote',coalesce(cooking->>'note','Guided conditional NEC2017 Table220.55 ColumnC one-range demand; supported classification and source facts retained.'));END IF;
 END IF;
 candidate_payload:=p||changes;engine:=dwelling_private.guided_whole_total(candidate_payload,method);
 IF method='standard' AND (engine->>'totalVA')::numeric<floor_va THEN RAISE EXCEPTION 'Calculated whole-method result is below verified heating branch floor; explicit minimum-rating review required' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('id','guided.'||method||'.v2','method',method,'changes',changes,'ruleVersion','2017-nec-nc-guided-v2','sourceIds',source_ids,'categoryCandidates',grouped,'scenarioCandidates',scenario_trace,'cookingTrace',cooking,'heatingFloorVA',trim_scale(floor_va)::text,'wholeMethod',engine,'finalReviewRequired',true);
END $$;
REVOKE ALL ON FUNCTION dwelling_private.guided_evidence(jsonb),dwelling_private.guided_positive(text),dwelling_private.guided_method_proposal(jsonb,text) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION dwelling_private.apply_assisted(uuid,integer,text[]) RENAME TO apply_assisted_before_methods_v2;
REVOKE ALL ON FUNCTION dwelling_private.apply_assisted_before_methods_v2(uuid,integer,text[]) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION dwelling_private.apply_assisted(p_id uuid,p_expected_version integer,p_proposal_ids text[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE subject text:=auth.jwt()->>'sub';original jsonb;version_now int;method text;review jsonb;next_payload jsonb;changes jsonb:='[]';entry record;change jsonb;note text;saved jsonb;event_id bigint;has_numeric_change boolean:=false;k text;
BEGIN
 IF dwelling_private.allowed() IS NOT TRUE THEN RAISE EXCEPTION 'Dwelling worksheet pilot access denied' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM unnest(p_proposal_ids) x WHERE x LIKE 'guided.%') THEN RETURN dwelling_private.apply_assisted_before_methods_v2(p_id,p_expected_version,p_proposal_ids);END IF;
 IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR cardinality(p_proposal_ids)<>1 OR p_proposal_ids[1] NOT IN ('guided.standard.v2','guided.optional.v2') THEN RAISE EXCEPTION 'Select one saved whole method, not mixed or conflicting proposals' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dwelling:'||subject||':'||p_id::text,0));
 SELECT payload,version INTO original,version_now FROM dwelling_private.documents WHERE owner_id=subject AND id=p_id FOR UPDATE;
 IF original IS NULL THEN RAISE EXCEPTION 'Owned saved study required' USING ERRCODE='22023';END IF;
 IF version_now<>p_expected_version THEN RAISE EXCEPTION 'Study changed; reload and review before applying' USING ERRCODE='40001';END IF;
 method:=split_part(p_proposal_ids[1],'.',2);review:=dwelling_private.guided_method_proposal(original,method);next_payload:=original;
 FOR entry IN SELECT * FROM jsonb_each_text(review->'changes') LOOP
  IF entry.key NOT IN ('hvacStandard','hvacOptional','largestMotor','cookingDemand','hvacNote','cookingNote') THEN RAISE EXCEPTION 'Unsupported trusted field target' USING ERRCODE='22023';END IF;
  IF entry.key IN ('hvacNote','cookingNote') THEN
   note:=coalesce(original->>entry.key,'')||CASE WHEN coalesce(original->>entry.key,'')='' THEN '' ELSE E'\n' END||entry.value;
   next_payload:=jsonb_set(next_payload,ARRAY[entry.key],to_jsonb(note));
  ELSE
   IF dwelling_private.nameplate_scalar(original->>entry.key) IS DISTINCT FROM dwelling_private.nameplate_scalar(entry.value) THEN has_numeric_change:=true;END IF;
   next_payload:=jsonb_set(next_payload,ARRAY[entry.key],to_jsonb(entry.value));
  END IF;
  change:=jsonb_build_object('id',p_proposal_ids[1],'target',entry.key,'before',original->>entry.key,'proposed',next_payload->>entry.key,'ruleId','NEC2017-guided-'||method,'ruleVersion','2017-nec-nc-guided-v2','sourceIds',review->'sourceIds','qualification','User-reviewed conditional calculation, not field/AHJ verification');
  IF jsonb_array_length(changes)=0 THEN change:=change||jsonb_build_object('methodReview',review);END IF;
  changes:=changes||jsonb_build_array(change);
 END LOOP;
 IF NOT has_numeric_change THEN RAISE EXCEPTION 'Whole-method input values already match; no changes applied' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['basisConfirmed','inventoryConfirmed','motorConfirmed','optionalEligible','optionalReviewed'] LOOP next_payload:=jsonb_set(next_payload,ARRAY[k],'false'::jsonb);END LOOP;
 next_payload:=dwelling_private.clear_feeder_reviews(next_payload);next_payload:=dwelling_private.clear_assisted_plan_reviews(next_payload);
 saved:=dwelling_private.save_study(p_id,next_payload,p_expected_version,false);
 SELECT id INTO event_id FROM dwelling_private.history WHERE owner_id=subject AND study_id=p_id AND after_version=(saved->>'version')::integer ORDER BY id DESC LIMIT 1;
 INSERT INTO dwelling_private.assisted_applications(history_id,owner_id,study_id,actor_id,rule_version,changes) VALUES(event_id,subject,p_id,subject,'2017-nec-nc-guided-v2',changes);
 RETURN saved||jsonb_build_object('application',jsonb_build_object('historyId',event_id,'changes',changes,'methodReview',review));
END $$;
REVOKE ALL ON FUNCTION dwelling_private.apply_assisted(uuid,integer,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dwelling_private.apply_assisted(uuid,integer,text[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.apply_dwelling_assisted_proposals(p_id uuid,p_expected_version integer,p_proposal_ids text[]) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT dwelling_private.apply_assisted(p_id,p_expected_version,p_proposal_ids) $$;

COMMIT;
