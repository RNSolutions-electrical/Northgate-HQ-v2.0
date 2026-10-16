-- Staging dependency reconciliation, not an incident pause/replay. No record writes.
-- Production's accepted v0.7.3 function is reached directly from the captured old
-- definition; an already-correct definition is a no-op. Preserve all existing ACLs.
DO $promotion_dependency$
DECLARE definition text:=pg_get_functiondef('public.apply_v5_estimate_promotion(uuid,integer,text,text)'::regprocedure);
 source_anchor text:='OR destination.proposed_payload IS DISTINCT FROM working_copy.payload THEN';
BEGIN
 IF md5(definition)='71bbbcef4ee5f7bffddccf9fa6ee5385' THEN RETURN; END IF;
 IF md5(definition)<>'742dcfe5660cc13392dbb870bb319d56' OR position(source_anchor IN definition)=0 THEN
  RAISE EXCEPTION 'Unexpected promotion definition; reconcile dependency before deployment';
 END IF;
 definition:=replace(definition,source_anchor,'OR destination.proposed_payload IS DISTINCT FROM (working_copy.payload-''reviewProposals'') THEN');
 definition:=replace(definition,'''40001''','''PT409''');
 EXECUTE definition;
 IF md5(pg_get_functiondef('public.apply_v5_estimate_promotion(uuid,integer,text,text)'::regprocedure))<>'71bbbcef4ee5f7bffddccf9fa6ee5385' THEN
  RAISE EXCEPTION 'Promotion dependency did not match accepted definition';
 END IF;
END $promotion_dependency$;

-- Only the known pre-charge or accepted charge definitions may be replaced.
DO $charge_dependency$
BEGIN
 IF md5(pg_get_functiondef('public.validate_workbench_structure(jsonb,boolean)'::regprocedure)) NOT IN ('61abaa9130b84504a62184500a547779','4479de72f4372b2d5d291b818e469e84')
 OR md5(pg_get_functiondef('public.workbench_handoff_pricing(jsonb)'::regprocedure)) NOT IN ('48bb49943b75bd5d3338e9d50aadd666','ce3bc1adc014248106252263420fff39')
 OR md5(pg_get_functiondef('public.approve_workbench_estimate_internal(uuid,text)'::regprocedure)) NOT IN ('ef67480f233feed4afdbeb66084aecd2','b9860bd3229bf5fa8fef7d7be71a9a3c') THEN
  RAISE EXCEPTION 'Unexpected proposal-charge dependency definition';
 END IF;
END $charge_dependency$;

-- Exact accepted source follows: 20261015135754_estimate_proposal_charges.sql.
-- Proposal-only charges. No historical documents or snapshots are rewritten.
-- Existing JSONB stores percentages and the immutable approval breakdown.
CREATE OR REPLACE FUNCTION public.workbench_proposal_charges(amount numeric, proposal jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE tax_rate numeric; card_rate numeric; tax numeric; card numeric; v text; k text;
BEGIN
 FOREACH k IN ARRAY ARRAY['salesTaxPercent','creditCardPercent'] LOOP
  v:=coalesce(proposal->>k,'0');
  IF length(v)>100 OR v !~ '^[0-9]+([.][0-9]{1,4})?$' THEN
   RAISE EXCEPTION 'Proposal percentages must be between 0 and 100 with at most four decimal places' USING ERRCODE='22023';
  END IF;
  IF v::numeric>100 THEN RAISE EXCEPTION 'Proposal percentages must be between 0 and 100' USING ERRCODE='22023'; END IF;
 END LOOP;
 tax_rate:=coalesce(proposal->>'salesTaxPercent','0')::numeric;
 card_rate:=coalesce(proposal->>'creditCardPercent','0')::numeric;
 amount:=round(amount,2);
 tax:=round(amount*tax_rate/100,2);
 card:=round((amount+tax)*card_rate/100,2);
 IF amount+tax+card>999999999999.99 THEN RAISE EXCEPTION 'Estimate total is outside the supported range' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('preTaxTotal',amount,'salesTax',tax,'creditCardFee',card,'price',amount+tax+card);
END $$;
REVOKE ALL ON FUNCTION public.workbench_proposal_charges(numeric,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.validate_workbench_structure(doc jsonb, complete boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e jsonb;i jsonb;c jsonb;l jsonb;groups jsonb;rate text;charge_key text;charge_value text;
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
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(i->'lines') x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(groups) g WHERE g->>'id'=x->>'componentId')) THEN RAISE EXCEPTION 'Resource has no matching component';END IF;
    IF complete THEN
     IF jsonb_array_length(groups)=0 AND nullif(i->>'quoteId','') IS NULL THEN RAISE EXCEPTION 'Add a component before finalizing';END IF;
     FOR c IN SELECT value FROM jsonb_array_elements(groups) LOOP
      IF nullif(btrim(c->>'name'),'') IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(i->'lines') x WHERE x->>'componentId'=c->>'id') THEN RAISE EXCEPTION 'Every component needs a name and material or labor before finalizing';END IF;
     END LOOP;
    END IF;
   END IF;
   IF nullif(i->>'quoteId','') IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(doc->'quotes','[]')) q WHERE q->>'id'=i->>'quoteId' AND nullif(q->>'archivedAt','') IS NOT NULL) THEN RAISE EXCEPTION 'Archived quotes cannot be priced';END IF;
  END LOOP;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(coalesce(doc->'quotes','[]')||coalesce(doc->'packages','[]')) LOOP
  IF nullif(c->>'archivedAt','') IS NOT NULL AND nullif(btrim(c->>'archiveReason'),'') IS NULL THEN RAISE EXCEPTION 'Pricing archive reason required';END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.workbench_handoff_pricing(doc jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE e jsonb; i jsonb; l jsonb; q jsonb; row_value jsonb; rows jsonb:='[]'; result jsonb:='[]';
 rate numeric; markup_rate numeric; fee_rate numeric; qty numeric; material numeric; hours numeric; labor numeric;
 other_cost numeric; markup numeric; subtotal numeric; all_subtotal numeric:=0; fee numeric; allocated numeric:=0;
 cumulative numeric:=0; next_allocated numeric; keys text[]:='{}'; k text;
BEGIN
 PERFORM public.validate_workbench_structure(doc,true);
 IF coalesce(doc->'proposal'->>'salesTaxPercent','0')::numeric<>0 OR coalesce(doc->'proposal'->>'creditCardPercent','0')::numeric<>0 THEN
  RAISE EXCEPTION 'Proposal charges require destination accounting review before estimate handoff' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(doc->'entries') IS DISTINCT FROM 'array' OR jsonb_array_length(doc->'entries')=0
 THEN RAISE EXCEPTION 'Add estimate entries before submitting for review' USING ERRCODE='22023'; END IF;
 rate:=public.workbench_handoff_number(doc->>'rate','labor rate');
 fee_rate:=public.workbench_handoff_number(coalesce(doc->>'feePercent',doc->>'overallMarkup','30'),'fee percentage');
 FOR e IN SELECT value FROM jsonb_array_elements(doc->'entries') LOOP
  IF jsonb_typeof(e->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid estimate entry' USING ERRCODE='22023'; END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(e->'items') LOOP
   k:=(e->>'id')||':'||(i->>'id');
   IF k IS NULL OR k=ANY(keys) OR nullif(btrim(i->>'name'),'') IS NULL THEN
    RAISE EXCEPTION 'Every work item needs a unique identifier and description' USING ERRCODE='22023';
   END IF;
   keys:=array_append(keys,k); material:=0; hours:=0; other_cost:=0; q:=NULL;
   qty:=public.workbench_handoff_number(i->>'qty','work item quantity');
   markup_rate:=public.workbench_handoff_number(coalesce(i->>'materialMarkupOverride',doc->>'materialMarkup','30'),'material markup');
   IF nullif(i->>'quoteId','') IS NOT NULL THEN
    IF (SELECT count(*) FROM jsonb_array_elements(coalesce(doc->'quotes','[]')) x WHERE x->>'id'=i->>'quoteId')<>1
    THEN RAISE EXCEPTION 'An awarded quote is missing or duplicated; review the estimate' USING ERRCODE='22023'; END IF;
    SELECT value INTO q FROM jsonb_array_elements(doc->'quotes') WHERE value->>'id'=i->>'quoteId';
    material:=public.workbench_handoff_number(q->>'materialAmount','quote material cost');
    other_cost:=public.workbench_handoff_number(q->>'otherAmount','quote other cost');
   ELSE
    IF jsonb_typeof(i->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(i->'lines')=0 THEN
     RAISE EXCEPTION 'Every work item needs components or an awarded quote' USING ERRCODE='22023'; END IF;
    FOR l IN SELECT value FROM jsonb_array_elements(i->'lines') LOOP
     material:=material+public.workbench_handoff_number(l->>'qty','component quantity')*
      CASE WHEN coalesce((l->>'fixed')::boolean,false) THEN 1 ELSE qty END * public.workbench_handoff_number(l->>'price','material price');
     hours:=hours+public.workbench_handoff_number(l->>'qty','component quantity')*
      CASE WHEN coalesce((l->>'fixed')::boolean,false) THEN 1 ELSE qty END * public.workbench_handoff_number(l->>'hours','labor hours');
    END LOOP;
   END IF;
   material:=round(material,2);labor:=round(hours*public.workbench_effective_labor_rate(i,doc),2);other_cost:=round(other_cost,2);
   markup:=round(material*markup_rate/100,2);subtotal:=material+labor+other_cost+markup;
   all_subtotal:=all_subtotal+subtotal;
   rows:=rows||jsonb_build_array(jsonb_build_object('key',k,'entry_id',e->>'id','item_id',i->>'id',
    'reference',coalesce(e->>'number','')||'.'||coalesce(i->>'number',''),'description',i->>'name',
    'section',e->>'section','location',e->>'location','material_amount',material,'labor_amount',labor,
    'other_amount',other_cost,'markup_amount',markup,'subtotal',subtotal));
  END LOOP;
 END LOOP;
 IF jsonb_array_length(rows)=0 OR jsonb_array_length(rows)>500 THEN RAISE EXCEPTION 'Use between 1 and 500 work items' USING ERRCODE='22023'; END IF;
 fee:=round(all_subtotal*fee_rate/100,2);
 FOR row_value IN SELECT value FROM jsonb_array_elements(rows) LOOP
  cumulative:=cumulative+(row_value->>'subtotal')::numeric;
  next_allocated:=CASE WHEN all_subtotal=0 THEN 0 ELSE round(fee*cumulative/all_subtotal,2) END;
  result:=result||jsonb_build_array(row_value||jsonb_build_object('fee_amount',next_allocated-allocated,
    'markup_amount',(row_value->>'markup_amount')::numeric+next_allocated-allocated,
    'line_total',(row_value->>'subtotal')::numeric+next_allocated-allocated));
  allocated:=next_allocated;
 END LOOP;
 IF all_subtotal+fee>999999999999.99 THEN RAISE EXCEPTION 'Estimate total is outside the supported range' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('lines',result,'subtotal',all_subtotal,'fee',fee,'total',all_subtotal+fee);
END $function$
;

CREATE OR REPLACE FUNCTION public.approve_workbench_estimate_internal(p_estimate_id uuid, p_approval_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  actor text := auth.jwt() ->> 'sub';
  target public.estimates;
  workbench public.estimate_workbenches;
  snapshot_id uuid;
  actor_name text;
  approved_document jsonb;
  pricing_lines jsonb := '[]'::jsonb;
  pricing_total numeric(14,2) := 0;
  pricing_line_count integer := 0;
  proposal_charges jsonb;
  row_value record;
  previous_approval_setting text := current_setting('northgate.workbench_approval', true);
BEGIN
  IF actor IS NULL OR btrim(actor) = '' THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;
  IF p_estimate_id IS NULL THEN
    RAISE EXCEPTION 'Estimate id is required' USING ERRCODE = '22004';
  END IF;

  SELECT * INTO target
  FROM public.estimates
  WHERE id = p_estimate_id AND archived_at IS NULL
  FOR UPDATE;
  IF target.id IS NULL OR target.editor_version <> 2 OR target.status <> 'draft' THEN
    RAISE EXCEPTION 'An editable Workbench draft is required' USING ERRCODE = '42501';
  END IF;
  IF public.current_user_can_edit_division(target.division, 'can_approve_estimates') IS NOT TRUE THEN
    RAISE EXCEPTION 'Estimate approval permission is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO workbench
  FROM public.estimate_workbenches
  WHERE estimate_id = target.id
  FOR UPDATE;
  IF workbench.estimate_id IS NULL
     OR jsonb_typeof(workbench.document) <> 'object'
     OR NULLIF(btrim(workbench.document ->> 'name'), '') IS NULL
     OR jsonb_typeof(workbench.document -> 'entries') <> 'array'
     OR jsonb_array_length(workbench.document -> 'entries') = 0 THEN
    RAISE EXCEPTION 'Save a named Workbench estimate with at least one entry before approval' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(workbench.document -> 'entries') AS entry_value(value),
         jsonb_array_elements(COALESCE(entry_value.value -> 'items', '[]'::jsonb)) AS item_value(value),
         jsonb_array_elements(COALESCE(item_value.value -> 'lines', '[]'::jsonb)) AS line_value(value)
    WHERE jsonb_typeof(entry_value.value -> 'items') <> 'array'
       OR jsonb_typeof(item_value.value -> 'lines') <> 'array'
       OR COALESCE(line_value.value ->> 'qty', '') !~ '^([0-9]+([.][0-9]*)?|[.][0-9]+)$'
       OR COALESCE(line_value.value ->> 'price', '') !~ '^([0-9]+([.][0-9]*)?|[.][0-9]+)$'
       OR COALESCE(line_value.value ->> 'hours', '') !~ '^([0-9]+([.][0-9]*)?|[.][0-9]+)$'
       OR COALESCE(item_value.value ->> 'qty', '') !~ '^([0-9]+([.][0-9]*)?|[.][0-9]+)$'
  ) THEN
    RAISE EXCEPTION 'Every Workbench component needs valid non-negative quantity, price, and labor values before approval' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(workbench.document ->> 'rate', '') !~ '^([0-9]+([.][0-9]*)?|[.][0-9]+)$'
     OR COALESCE(workbench.document ->> 'materialMarkup', '') !~ '^([0-9]+([.][0-9]*)?|[.][0-9]+)$'
     OR COALESCE(workbench.document ->> 'feePercent', '') !~ '^([0-9]+([.][0-9]*)?|[.][0-9]+)$' THEN
    RAISE EXCEPTION 'Valid labor rate, material markup, and fee values are required before approval' USING ERRCODE = '22023';
  END IF;

  PERFORM public.validate_workbench_structure(workbench.document,true);
  FOR row_value IN
    WITH document_values AS (
      SELECT workbench.document AS document,
             (workbench.document ->> 'rate')::numeric AS labor_rate,
             (workbench.document ->> 'materialMarkup')::numeric AS default_material_markup
    ), items AS (
      SELECT
        entry_value.value AS entry_value,
        item_value.value AS item_value,
        COALESCE((item_value.value ->> 'number')::integer, 0) AS item_number,
        COALESCE(entry_value.value ->> 'number', '') AS entry_number,
        COALESCE(entry_value.value ->> 'location', '') AS location,
        COALESCE(entry_value.value ->> 'section', '') AS section,
        COALESCE(item_value.value ->> 'name', '') AS description,
        COALESCE(item_value.value ->> 'qty', '0')::numeric AS item_qty,
        public.workbench_effective_labor_rate(item_value.value,document_values.document) AS labor_rate,
        document_values.default_material_markup,
        document_values.document
      FROM document_values,
           jsonb_array_elements(document_values.document -> 'entries') AS entry_value(value),
           jsonb_array_elements(entry_value.value -> 'items') AS item_value(value)
    ), item_values AS (
      SELECT
        items.*,
        quote_value,
        round(COALESCE(SUM(
          (line_value.value ->> 'qty')::numeric
          * CASE WHEN COALESCE((line_value.value ->> 'fixed')::boolean, false) THEN 1 ELSE items.item_qty END
          * (line_value.value ->> 'price')::numeric
        ) FILTER (WHERE line_value.value IS NOT NULL), 0), 2) AS direct_material,
        CASE WHEN items.document->>'laborRateVersion'='1' THEN COALESCE(SUM(
          (line_value.value ->> 'qty')::numeric
          * CASE WHEN COALESCE((line_value.value ->> 'fixed')::boolean, false) THEN 1 ELSE items.item_qty END
          * (line_value.value ->> 'hours')::numeric
        ) FILTER (WHERE line_value.value IS NOT NULL), 0) ELSE round(COALESCE(SUM(
          (line_value.value ->> 'qty')::numeric
          * CASE WHEN COALESCE((line_value.value ->> 'fixed')::boolean, false) THEN 1 ELSE items.item_qty END
          * (line_value.value ->> 'hours')::numeric
        ) FILTER (WHERE line_value.value IS NOT NULL), 0),4) END AS direct_hours
      FROM items
      LEFT JOIN LATERAL (
        SELECT quote_candidate.value AS quote_value
        FROM jsonb_array_elements(COALESCE(items.document -> 'quotes', '[]'::jsonb)) AS quote_candidate(value)
        WHERE quote_candidate.value ->> 'id' = items.item_value ->> 'quoteId'
        LIMIT 1
      ) AS quote_lookup ON true
      LEFT JOIN LATERAL jsonb_array_elements(items.item_value -> 'lines') AS line_value(value) ON true
      GROUP BY items.entry_value, items.item_value, items.item_number, items.entry_number,
               items.location, items.section, items.description, items.item_qty,
               items.labor_rate, items.default_material_markup, items.document, quote_value
    ), calculated AS (
      SELECT
        entry_number, location, section, description, item_number,
        round(CASE WHEN quote_value IS NULL THEN direct_material ELSE COALESCE((quote_value ->> 'materialAmount')::numeric, 0) END, 2) AS material,
        round(CASE WHEN quote_value IS NULL THEN direct_hours * labor_rate ELSE 0 END, 2) AS labor,
        round(CASE WHEN quote_value IS NULL THEN 0 ELSE COALESCE((quote_value ->> 'otherAmount')::numeric, 0) END, 2) AS other,
        round(CASE WHEN quote_value IS NULL THEN direct_hours ELSE 0 END, 4) AS hours,
        round(COALESCE(NULLIF(item_value ->> 'materialMarkupOverride', '')::numeric, default_material_markup), 4) AS material_markup_rate
      FROM item_values
    )
    SELECT
      entry_number, location, section, description, item_number, material, labor, other, hours,
      round(material + labor + other, 2) AS cost,
      material_markup_rate,
      round(material * material_markup_rate / 100, 2) AS material_markup,
      round(material + labor + other + round(material * material_markup_rate / 100, 2), 2) AS subtotal
    FROM calculated
    ORDER BY entry_number, item_number, description
  LOOP
    pricing_line_count := pricing_line_count + 1;
    pricing_total := pricing_total + row_value.subtotal;
    pricing_lines := pricing_lines || jsonb_build_array(jsonb_build_object(
      'entry_number', row_value.entry_number,
      'location', row_value.location,
      'section', row_value.section,
      'description', row_value.description,
      'item_number', row_value.item_number,
      'material', row_value.material,
      'labor', row_value.labor,
      'other', row_value.other,
      'hours', row_value.hours,
      'cost', row_value.cost,
      'material_markup_rate', row_value.material_markup_rate,
      'material_markup', row_value.material_markup,
      'subtotal', row_value.subtotal
    ));
  END LOOP;
  IF pricing_line_count = 0 THEN
    RAISE EXCEPTION 'Add at least one priced Workbench item before approval' USING ERRCODE = '22023';
  END IF;

  pricing_total := round(pricing_total * (1 + (workbench.document ->> 'feePercent')::numeric / 100), 2);
  approved_document := jsonb_set(public.workbench_finalization_snapshot(workbench.document), '{approvedAt}', to_jsonb(clock_timestamp()), true);
  proposal_charges:=public.workbench_proposal_charges(pricing_total,workbench.document->'proposal');
  pricing_total:=(proposal_charges->>'price')::numeric;
  approved_document:=jsonb_set(approved_document,'{proposalChargeSnapshot}',proposal_charges,true);
  actor_name := COALESCE((SELECT display_name FROM public.user_permissions WHERE clerk_user_id = actor),
                         (SELECT email FROM public.user_permissions WHERE clerk_user_id = actor), actor);

  PERFORM set_config('northgate.workbench_approval', 'yes', true);
  UPDATE public.estimates
  SET status = 'approved', submitted_at = COALESCE(submitted_at, clock_timestamp())
  WHERE id = target.id;

  INSERT INTO public.estimate_snapshots (
    estimate_id, division, approved_by, approval_note, estimate_number, title,
    customer_name, bid_due_at, submitted_at, scope_summary, pricing_total,
    pricing_line_count, estimate_data, pricing_lines, workbench_document
  ) VALUES (
    target.id, target.division, actor_name, NULLIF(btrim(COALESCE(p_approval_note, '')), ''),
    target.estimate_number, target.title, target.customer_name, target.bid_due_at,
    clock_timestamp(), target.scope_summary, pricing_total, pricing_line_count,
    (SELECT to_jsonb(e) FROM public.estimates e WHERE e.id = target.id), pricing_lines, approved_document
  ) RETURNING id INTO snapshot_id;

  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note)
  VALUES (
    actor, actor_name, 'estimates', target.id::text, 'update', to_jsonb(target),
    (SELECT to_jsonb(e) FROM public.estimates e WHERE e.id = target.id),
    COALESCE(NULLIF(btrim(COALESCE(p_approval_note, '')), ''), 'Workbench estimate approved and immutable snapshot created.')
  );

  PERFORM set_config('northgate.workbench_approval', COALESCE(previous_approval_setting, ''), true);
  RETURN snapshot_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('northgate.workbench_approval', COALESCE(previous_approval_setting, ''), true);
  RAISE;
END;
$function$
;
REVOKE ALL ON FUNCTION public.approve_workbench_estimate_internal(uuid,text),public.workbench_handoff_pricing(jsonb) FROM PUBLIC,anon,authenticated;
