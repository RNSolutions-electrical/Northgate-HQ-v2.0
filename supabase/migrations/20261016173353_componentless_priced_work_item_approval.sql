-- Ryan-authorized Production hotfix: optional component grouping, required pricing.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
BEGIN
 IF md5(pg_get_functiondef('public.validate_workbench_structure(jsonb,boolean)'::regprocedure))<>'4479de72f4372b2d5d291b818e469e84'
 OR md5(pg_get_functiondef('public.approve_workbench_estimate(uuid,text)'::regprocedure))<>'90ca819a837307993e6d03a90e8761f4'
 OR md5(pg_get_functiondef('public.workbench_handoff_pricing(jsonb)'::regprocedure))<>'ce3bc1adc014248106252263420fff39'
 OR md5(pg_get_functiondef('public.approve_workbench_estimate_internal(uuid,text)'::regprocedure))<>'b9860bd3229bf5fa8fef7d7be71a9a3c' THEN
  RAISE EXCEPTION 'Estimate validation/pricing definition drift; stop and re-review';
 END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.validate_workbench_structure(doc jsonb, complete boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e jsonb;i jsonb;c jsonb;l jsonb;quoted_value jsonb;quote_count integer;groups jsonb;rate text;charge_key text;charge_value text;
BEGIN
 FOREACH charge_key IN ARRAY ARRAY['salesTaxPercent','creditCardPercent'] LOOP
  charge_value:=coalesce(doc->'proposal'->>charge_key,'0');
  IF length(charge_value)>100 OR charge_value !~ '^[0-9]+([.][0-9]{1,4})?$' THEN
   RAISE EXCEPTION 'Proposal percentages must be between 0 and 100 with at most four decimal places' USING ERRCODE='22023';
  END IF;
  IF charge_value::numeric>100 THEN RAISE EXCEPTION 'Proposal percentages must be between 0 and 100' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF doc->>'laborRateVersion'='1' THEN
  PERFORM public.assembly_rate_number(doc->>'libraryDefaultRateSnapshot');
  IF doc->>'estimateLaborRateOverride' IS NOT NULL THEN PERFORM public.assembly_rate_number(doc->>'estimateLaborRateOverride'); END IF;
  IF (doc->>'rate')::numeric IS DISTINCT FROM COALESCE((doc->>'estimateLaborRateOverride')::numeric,(doc->>'libraryDefaultRateSnapshot')::numeric) THEN RAISE EXCEPTION 'Estimate labor rate does not match its override or snapshot'; END IF;
 END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(coalesce(doc->'entries','[]')) LOOP
  FOR i IN SELECT value FROM jsonb_array_elements(coalesce(e->'items','[]')) LOOP
   rate:=nullif(i->>'laborRateOverride','');
   IF rate IS NOT NULL THEN PERFORM public.assembly_rate_number(rate); END IF;
   IF i->>'libraryLaborRateSnapshot' IS NOT NULL THEN PERFORM public.assembly_rate_number(i->>'libraryLaborRateSnapshot'); END IF;
   IF rate IS NOT NULL AND (rate !~ '^([0-9]+([.][0-9]*)?|[.][0-9]+)$' OR length(rate)>100) THEN
    RAISE EXCEPTION 'Work-item labor rate must be a finite nonnegative number'; END IF;
   groups:=i->'components';
   IF groups IS NOT NULL AND groups<>'null'::jsonb THEN
    IF jsonb_typeof(groups)<>'array' THEN RAISE EXCEPTION 'Invalid component groups';END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(groups) x WHERE coalesce(x->>'id','')='')
      OR (SELECT count(*)<>count(DISTINCT x->>'id') FROM jsonb_array_elements(groups) x) THEN RAISE EXCEPTION 'Component identifiers must be unique';END IF;
    IF jsonb_array_length(groups)>0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(i->'lines') x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(groups) g WHERE g->>'id'=x->>'componentId')) THEN RAISE EXCEPTION 'Resource has no matching component';END IF;
   END IF;
   IF nullif(i->>'quoteId','') IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(doc->'quotes','[]')) q WHERE q->>'id'=i->>'quoteId' AND nullif(q->>'archivedAt','') IS NOT NULL) THEN RAISE EXCEPTION 'Archived quotes cannot be priced';END IF;
   IF complete THEN
    IF nullif(btrim(i->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Work item name is required' USING ERRCODE='22023'; END IF;
    PERFORM public.workbench_handoff_number(i->>'qty','work item quantity');
    IF nullif(i->>'quoteId','') IS NOT NULL THEN
     SELECT count(*) INTO quote_count FROM jsonb_array_elements(coalesce(doc->'quotes','[]')) x WHERE x->>'id'=i->>'quoteId';
     IF quote_count<>1 THEN RAISE EXCEPTION 'Link one active quote with valid costs' USING ERRCODE='22023'; END IF;
     SELECT value INTO quoted_value FROM jsonb_array_elements(doc->'quotes') x WHERE x->>'id'=i->>'quoteId';
     PERFORM public.workbench_handoff_number(quoted_value->>'materialAmount','quote material cost');
     PERFORM public.workbench_handoff_number(quoted_value->>'otherAmount','quote other cost');
    ELSE
     IF jsonb_typeof(i->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(i->'lines')=0 THEN
      RAISE EXCEPTION 'Enter priced material/labor rows or link a quote' USING ERRCODE='22023';
     END IF;
     FOR l IN SELECT value FROM jsonb_array_elements(i->'lines') LOOP
      PERFORM public.workbench_handoff_number(l->>'qty','resource quantity');
      PERFORM public.workbench_handoff_number(l->>'price','material price');
      PERFORM public.workbench_handoff_number(l->>'hours','labor hours');
     END LOOP;
    END IF;
   END IF;
  END LOOP;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(coalesce(doc->'quotes','[]')||coalesce(doc->'packages','[]')) LOOP
  IF nullif(c->>'archivedAt','') IS NOT NULL AND nullif(btrim(c->>'archiveReason'),'') IS NULL THEN RAISE EXCEPTION 'Pricing archive reason required';END IF;
 END LOOP;
 -- Groups are optional organization; pricing, taxes, fees and snapshots retain
 -- their existing calculators and destination accounting guard.
END $$;


-- The older outer approval wrapper required resource rows even for linked quotes.
-- Keep its authentication/entry checks and the unchanged internal approval engine.
DO $wrapper$
DECLARE definition text:=pg_get_functiondef('public.approve_workbench_estimate(uuid,text)'::regprocedure);
 anchor text:='OR jsonb_array_length(item_value.value -> ''lines'') = 0';
BEGIN
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Approval wrapper anchor changed'; END IF;
 definition:=replace(definition,anchor,'OR (jsonb_array_length(item_value.value -> ''lines'') = 0 AND nullif(item_value.value ->> ''quoteId'', '''') IS NULL)');
 definition:=replace(definition,'Every Workbench entry needs at least one item and every item needs at least one component before approval','Every Workbench entry needs at least one item; every work item needs priced rows or a linked quote before approval');
 EXECUTE definition;
END $wrapper$;
NOTIFY pgrst,'reload schema';
