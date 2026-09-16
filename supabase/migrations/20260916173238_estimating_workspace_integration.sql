-- Additive integration of the approved estimating workspace. No production records are rewritten.
-- Existing RLS, revision checks, audit triggers and approval/revision endpoints remain authoritative.
ALTER TABLE public.assemblies ADD COLUMN component_groups jsonb;
ALTER TABLE public.assemblies ADD CONSTRAINT assemblies_component_groups_array CHECK(component_groups IS NULL OR jsonb_typeof(component_groups)='array');
ALTER TABLE public.assembly_items ADD COLUMN component_group_id text;
ALTER TABLE public.items ADD COLUMN catalogue_draft boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.items.catalogue_draft IS 'Temporary material code awaiting catalogue review; does not change existing estimate snapshots.';

CREATE FUNCTION public.validate_workbench_structure(doc jsonb, complete boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e jsonb;i jsonb;c jsonb;l jsonb;groups jsonb;rate text;
BEGIN
 FOR e IN SELECT value FROM jsonb_array_elements(coalesce(doc->'entries','[]')) LOOP
  FOR i IN SELECT value FROM jsonb_array_elements(coalesce(e->'items','[]')) LOOP
   rate:=nullif(i->>'laborRateOverride','');
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
REVOKE ALL ON FUNCTION public.validate_workbench_structure(jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validate_workbench_structure(jsonb,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_estimate_workbench(p_estimate_id uuid, p_division text, p_document jsonb, p_expected_revision integer, p_catalogue_updates jsonb DEFAULT '[]'::jsonb)
 RETURNS estimate_workbenches
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE target public.estimates; oldrow public.estimate_workbenches; saved public.estimate_workbenches;
 patch jsonb; previous text:=current_setting('northgate.workbench_save',true);
BEGIN
 PERFORM public.validate_workbench_structure(p_document,false);
 IF auth.jwt()->>'sub' IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='28000'; END IF;
 IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR octet_length(p_document::text)>2097152
 OR NULLIF(btrim(p_document->>'name'),'') IS NULL OR jsonb_typeof(p_document->'entries') IS DISTINCT FROM 'array'
 OR COALESCE(p_document->>'approvedAt','')<>'' THEN RAISE EXCEPTION 'Valid draft estimate required' USING ERRCODE='22023'; END IF;
 IF p_catalogue_updates IS NULL OR jsonb_typeof(p_catalogue_updates)<>'array' OR jsonb_array_length(p_catalogue_updates)>200 THEN
  RAISE EXCEPTION 'Invalid catalogue updates' USING ERRCODE='22023';
 END IF;
 PERFORM set_config('northgate.workbench_save','yes',true);
 IF p_estimate_id IS NULL THEN
  IF public.current_user_can_edit_division(p_division,'can_estimate') IS NOT TRUE THEN RAISE EXCEPTION 'Estimate permission required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.estimates(division,title,customer_name,created_by,editor_version)
  VALUES(p_division,btrim(p_document->>'name'),p_document->>'customer',auth.jwt()->>'sub',2) RETURNING * INTO target;
 ELSE
  SELECT * INTO target FROM public.estimates WHERE id=p_estimate_id AND editor_version=2 AND status='draft' AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR public.current_user_can_edit_division(target.division,'can_estimate') IS NOT TRUE THEN RAISE EXCEPTION 'Editable draft not found' USING ERRCODE='42501'; END IF;
  SELECT * INTO oldrow FROM public.estimate_workbenches WHERE estimate_id=target.id FOR UPDATE;
  IF oldrow.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Estimate changed. Reopen it before saving; your unsaved input has been retained' USING ERRCODE='40001'; END IF;
  UPDATE public.estimates SET title=btrim(p_document->>'name'),customer_name=p_document->>'customer' WHERE id=target.id;
 END IF;
 FOR patch IN SELECT value FROM jsonb_array_elements(p_catalogue_updates) LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_document->'entries') e
    CROSS JOIN LATERAL jsonb_array_elements(e->'items') i CROSS JOIN LATERAL jsonb_array_elements(i->'lines') l
    WHERE l->>'catalogueId'=patch->>'item_id'
    AND (NOT (patch->'changes'?'price_per_unit') OR (l->>'price')::numeric=(patch->'changes'->>'price_per_unit')::numeric)
    AND (NOT (patch->'changes'?'labor_rate_hrs') OR (l->>'hours')::numeric=(patch->'changes'->>'labor_rate_hrs')::numeric)) THEN
   RAISE EXCEPTION 'Catalogue changes must match a material in this estimate' USING ERRCODE='22023';
  END IF;
  PERFORM public.save_material_catalogue_values((patch->>'item_id')::uuid,patch->'changes',(patch->>'expected_updated_at')::timestamptz,target.id);
 END LOOP;
 IF oldrow.estimate_id IS NULL THEN
  INSERT INTO public.estimate_workbenches(estimate_id,revision,document)
  VALUES(target.id,1,p_document) RETURNING * INTO saved;
 ELSE
  UPDATE public.estimate_workbenches SET revision=oldrow.revision+1,document=p_document,updated_at=clock_timestamp()
  WHERE estimate_id=target.id RETURNING * INTO saved;
 END IF;
 PERFORM set_config('northgate.workbench_save',COALESCE(previous,''),true);
 RETURN saved;
END $function$
;

CREATE OR REPLACE FUNCTION public.save_assembly_library(p_division text, p_assembly jsonb, p_estimate_id uuid DEFAULT NULL::uuid)
 RETURNS assemblies
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE a public.assemblies; e public.estimates; component public.assembly_items;
 line jsonb; aid uuid; lid uuid; kept uuid[]:='{}'; position integer:=0;
 value numeric; k text; target_division text:=p_division; selected_categories text[];
BEGIN
 PERFORM public.validate_workbench_structure(jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('items',jsonb_build_array(p_assembly)))),false);
 IF auth.jwt()->>'sub' IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='28000'; END IF;
 IF p_estimate_id IS NOT NULL THEN
  SELECT * INTO e FROM public.estimates WHERE id=p_estimate_id AND archived_at IS NULL AND status='draft' AND editor_version=2;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Editable estimate required' USING ERRCODE='42501'; END IF;
  target_division:=e.division;
 END IF;
 IF public.current_user_can_edit_division(target_division,'can_estimate') IS NOT TRUE THEN
  RAISE EXCEPTION 'Assembly edit permission required' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_assembly) IS DISTINCT FROM 'object' OR COALESCE(btrim(p_assembly->>'name'),'')=''
 OR jsonb_typeof(p_assembly->'lines') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Assembly name and components required' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_assembly->'lines') NOT BETWEEN 1 AND 2000 THEN
  RAISE EXCEPTION 'Assembly must contain 1 to 2000 components' USING ERRCODE='22023';
 END IF;
 IF p_assembly?'categories' THEN
  IF jsonb_typeof(p_assembly->'categories') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Categories must be a list' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_assembly->'categories')>50 OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_assembly->'categories') c
   WHERE jsonb_typeof(c)<>'string' OR length(btrim(c#>>'{}')) NOT BETWEEN 1 AND 80
  ) THEN RAISE EXCEPTION 'Choose up to 50 categories, each 1 to 80 characters' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(array_agg(label ORDER BY label),'{}') INTO selected_categories
  FROM (SELECT min(btrim(cat.label)) AS label FROM jsonb_array_elements_text(p_assembly->'categories') AS cat(label) GROUP BY lower(btrim(cat.label))) c;
 END IF;
 aid:=NULLIF(p_assembly->>'id','')::uuid;
 PERFORM set_config('northgate.assembly_source',CASE WHEN p_estimate_id IS NOT NULL AND aid IS NULL THEN 'estimate' ELSE 'assembly_library' END,true);
 PERFORM set_config('northgate.assembly_estimate',COALESCE(e.id::text,''),true);
 IF aid IS NULL THEN
  INSERT INTO public.assemblies(division,name,description,unit,created_by,source_estimate_id,categories)
  VALUES(target_division,btrim(p_assembly->>'name'),COALESCE(p_assembly->>'notes',''),'EA',auth.jwt()->>'sub',e.id,COALESCE(selected_categories,'{}'))
  RETURNING * INTO a;
 ELSE
  SELECT * INTO a FROM public.assemblies WHERE id=aid AND archived_at IS NULL AND is_library_item FOR UPDATE;
  IF a.id IS NULL OR public.current_user_can_edit_division(a.division,'can_estimate') IS NOT TRUE THEN
   RAISE EXCEPTION 'Assembly unavailable or edit permission missing' USING ERRCODE='42501';
  END IF;
  IF a.updated_at IS DISTINCT FROM (p_assembly->>'updatedAt')::timestamptz THEN
   RAISE EXCEPTION 'Assembly changed. Refresh the library and review before saving' USING ERRCODE='40001';
  END IF;
  UPDATE public.assemblies SET name=btrim(p_assembly->>'name'),description=COALESCE(p_assembly->>'notes',''),categories=CASE WHEN p_assembly?'categories' THEN selected_categories ELSE categories END
   WHERE id=a.id;
 END IF;
 UPDATE public.assemblies SET component_groups=nullif(p_assembly->'components','null'::jsonb) WHERE id=a.id;
 FOR line IN SELECT v FROM jsonb_array_elements(p_assembly->'lines') v LOOP
  IF COALESCE(btrim(line->>'name'),'')='' THEN RAISE EXCEPTION 'Component description required' USING ERRCODE='22023'; END IF;
  FOR k IN SELECT unnest(ARRAY['qty','price','hours']) LOOP
   IF k='qty' OR (line->k IS NOT NULL AND line->k<>'null'::jsonb AND line->>k<>'') THEN
    value:=(line->>k)::numeric;
    IF value IS NULL OR value<0 OR value::text IN ('NaN','Infinity','-Infinity') THEN
     RAISE EXCEPTION 'Component quantities and values must be finite and nonnegative' USING ERRCODE='22023';
    END IF;
   END IF;
  END LOOP;
  IF NULLIF(line->>'catalogueId','') IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.items WHERE id=(line->>'catalogueId')::uuid AND is_active AND NOT is_archived AND estimating_enabled
  ) THEN RAISE EXCEPTION 'Linked catalogue material is unavailable' USING ERRCODE='42501'; END IF;
  lid:=NULLIF(line->>'libraryLineId','')::uuid;
  IF lid=ANY(kept) THEN RAISE EXCEPTION 'Duplicate component' USING ERRCODE='22023'; END IF;
  IF lid IS NOT NULL THEN
   SELECT * INTO component FROM public.assembly_items WHERE id=lid AND assembly_id=a.id AND archived_at IS NULL FOR UPDATE;
   IF component.id IS NULL THEN RAISE EXCEPTION 'Component no longer belongs to this assembly' USING ERRCODE='40001'; END IF;
   UPDATE public.assembly_items SET item_id=NULLIF(line->>'catalogueId','')::uuid,description=btrim(line->>'name'),
    quantity=(line->>'qty')::numeric,waste_percent=0,unit=COALESCE(NULLIF(line->>'unit',''),'EA'),
    unit_cost_snapshot=COALESCE(NULLIF(line->>'price','')::numeric,0),
    labor_rate_hrs_snapshot=COALESCE(NULLIF(line->>'hours','')::numeric,0),
    stage=COALESCE(NULLIF(line->>'stage',''),'Rough-in'),fixed_quantity=COALESCE((line->>'fixed')::boolean,false),
    price_missing=NULLIF(line->>'price','') IS NULL,labor_missing=NULLIF(line->>'hours','') IS NULL,
    note=COALESCE(line->>'notes',''),component_group_id=line->>'componentId',sort_order=position WHERE id=lid;
  ELSE
   INSERT INTO public.assembly_items(assembly_id,division,item_id,description,quantity,unit,
    unit_cost_snapshot,labor_rate_hrs_snapshot,stage,fixed_quantity,price_missing,labor_missing,note,sort_order,created_by,component_group_id)
   VALUES(a.id,a.division,NULLIF(line->>'catalogueId','')::uuid,btrim(line->>'name'),(line->>'qty')::numeric,
    COALESCE(NULLIF(line->>'unit',''),'EA'),COALESCE(NULLIF(line->>'price','')::numeric,0),
    COALESCE(NULLIF(line->>'hours','')::numeric,0),COALESCE(NULLIF(line->>'stage',''),'Rough-in'),
    COALESCE((line->>'fixed')::boolean,false),NULLIF(line->>'price','') IS NULL,NULLIF(line->>'hours','') IS NULL,
    COALESCE(line->>'notes',''),position,auth.jwt()->>'sub',line->>'componentId') RETURNING id INTO lid;
  END IF;
  kept:=array_append(kept,lid);position:=position+1;
 END LOOP;
 UPDATE public.assembly_items SET archived_at=clock_timestamp(),archived_by=auth.jwt()->>'sub',
  archive_reason='Removed during assembly composition update'
 WHERE assembly_id=a.id AND archived_at IS NULL AND NOT(id=ANY(kept));
 SELECT * INTO a FROM public.assemblies WHERE id=a.id;
 RETURN a;
END $function$
;

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
   material:=round(material,2);labor:=round(hours*CASE WHEN nullif(i->>'laborRateOverride','') IS NULL THEN rate ELSE public.workbench_handoff_number(i->>'laborRateOverride','work-item labor rate') END,2);other_cost:=round(other_cost,2);
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
        COALESCE(NULLIF(item_value.value->>'laborRateOverride','')::numeric,document_values.labor_rate) AS labor_rate,
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
        round(COALESCE(SUM(
          (line_value.value ->> 'qty')::numeric
          * CASE WHEN COALESCE((line_value.value ->> 'fixed')::boolean, false) THEN 1 ELSE items.item_qty END
          * (line_value.value ->> 'hours')::numeric
        ) FILTER (WHERE line_value.value IS NOT NULL), 0), 4) AS direct_hours
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

-- Existing function replacements retain ACLs. Reassert the internal-only endpoints.
REVOKE ALL ON FUNCTION public.approve_workbench_estimate_internal(uuid,text),public.workbench_handoff_pricing(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.save_estimating_catalogue_material(p_item_id uuid,p_division text,p_values jsonb,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS public.items LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.items;saved public.items;actor text:=auth.jwt()->>'sub';code text;price numeric;hours numeric;
BEGIN
 IF actor IS NULL OR p_item_id IS NULL THEN RAISE EXCEPTION 'Sign in and material identifier required' USING ERRCODE='42501';END IF;
 -- Serialize retries for the same candidate; never overwrite a previous successful create.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_item_id::text,0));
 SELECT * INTO previous FROM public.items WHERE id=p_item_id FOR UPDATE;
 IF public.current_user_can_edit_division(coalesce(previous.division,p_division),'can_edit_catalog') IS NOT TRUE THEN RAISE EXCEPTION 'Catalogue edit permission required' USING ERRCODE='42501';END IF;
 IF previous.id IS NOT NULL AND (NOT previous.is_active OR previous.is_archived) THEN RAISE EXCEPTION 'Material is archived';END IF;
 IF previous.id IS NOT NULL AND p_expected_updated_at IS NULL THEN RETURN previous;END IF;
 IF previous.id IS NOT NULL AND previous.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Catalogue changed. Refresh before saving' USING ERRCODE='40001';END IF;
 IF nullif(btrim(p_values->>'name'),'') IS NULL OR nullif(btrim(p_values->>'unit'),'') IS NULL THEN RAISE EXCEPTION 'Description and unit are required';END IF;
 price:=nullif(btrim(p_values->>'price'),'')::numeric;hours:=nullif(btrim(p_values->>'hours'),'')::numeric;
 IF price<0 OR hours<0 OR price::text IN ('NaN','Infinity','-Infinity') OR hours::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Cost and labor must be finite and nonnegative';END IF;
 code:=coalesce(nullif(btrim(p_values->>'material_code'),''),'DRAFT-'||p_item_id::text);
 PERFORM pg_advisory_xact_lock(hashtextextended('catalogue-code:'||upper(code),0));
 IF EXISTS(SELECT 1 FROM public.items WHERE upper(btrim(material_code))=upper(code) AND id<>p_item_id) THEN RAISE EXCEPTION 'Catalogue number already exists. Select the existing material';END IF;
 IF previous.id IS NULL THEN
  INSERT INTO public.items(id,material_code,name,division,unit_of_measure,price_per_unit,price_confirmed,labor_rate_hrs,labor_value_source,catalogue_draft)
  VALUES(p_item_id,code,btrim(p_values->>'name'),p_division,btrim(p_values->>'unit'),coalesce(price,0),price IS NOT NULL,hours,CASE WHEN hours IS NULL THEN 'unverified' ELSE 'internal' END,nullif(btrim(p_values->>'material_code'),'') IS NULL)
  RETURNING * INTO saved;
 ELSE
  UPDATE public.items SET material_code=code,name=btrim(p_values->>'name'),unit_of_measure=btrim(p_values->>'unit'),
   price_per_unit=coalesce(price,0),price_confirmed=price IS NOT NULL,labor_rate_hrs=hours,
   labor_value_source=CASE WHEN hours IS NULL THEN 'unverified' ELSE 'internal' END,
   catalogue_draft=nullif(btrim(p_values->>'material_code'),'') IS NULL,updated_at=clock_timestamp()
  WHERE id=p_item_id RETURNING * INTO saved;
  -- audit_material_values confirms changed prices; explicitly preserve an unconfirmed blank.
  IF price IS NULL AND saved.price_confirmed THEN
   UPDATE public.items SET price_confirmed=false WHERE id=p_item_id RETURNING * INTO saved;
  END IF;
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,public.change_order_actor(),'items',saved.id::text,CASE WHEN previous.id IS NULL THEN 'create' ELSE 'update' END,
 CASE WHEN previous.id IS NULL THEN NULL ELSE to_jsonb(previous) END,to_jsonb(saved),'Estimating catalogue details');
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.save_estimating_catalogue_material(uuid,text,jsonb,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_estimating_catalogue_material(uuid,text,jsonb,timestamptz) TO authenticated;

CREATE FUNCTION public.manage_estimate_checklist(p_key text,p_label text DEFAULT NULL,p_description text DEFAULT '',p_retire boolean DEFAULT false,p_reason text DEFAULT NULL)
RETURNS public.estimate_checklist_definitions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=auth.jwt()->>'sub';saved public.estimate_checklist_definitions;previous public.estimate_checklist_definitions;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=actor AND is_active) THEN RAISE EXCEPTION 'Active user required' USING ERRCODE='42501';END IF;
 IF p_retire THEN
  IF public.current_user_has_developer_access() IS NOT TRUE THEN RAISE EXCEPTION 'Developer permission required' USING ERRCODE='42501';END IF;
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Checklist removal reason required';END IF;
  SELECT * INTO previous FROM public.estimate_checklist_definitions WHERE key=p_key FOR UPDATE;
  IF previous.key IS NULL THEN RAISE EXCEPTION 'Checklist item not found';END IF;
  UPDATE public.estimate_checklist_definitions SET enabled=false WHERE key=p_key RETURNING * INTO saved;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=actor AND is_active AND public.current_user_can_edit_division(division,'can_edit_catalog')) THEN RAISE EXCEPTION 'Shared catalogue management permission required' USING ERRCODE='42501';END IF;
  IF nullif(btrim(p_label),'') IS NULL THEN RAISE EXCEPTION 'Checklist label required';END IF;
  INSERT INTO public.estimate_checklist_definitions(key,label,description,sort_order,options)
  VALUES(p_key,btrim(p_label),coalesce(p_description,''),1000,
  '[{"value":"included","label":"Included"},{"value":"excluded","label":"Considered and excluded"},{"value":"not_applicable","label":"Not applicable"}]') RETURNING * INTO saved;
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,public.change_order_actor(),'estimate_checklist_definitions',saved.key,CASE WHEN p_retire THEN 'archive' ELSE 'create' END,
 CASE WHEN previous.key IS NULL THEN NULL ELSE to_jsonb(previous) END,to_jsonb(saved),coalesce(nullif(btrim(p_reason),''),'Shared estimate checklist addition'));
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.manage_estimate_checklist(text,text,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_estimate_checklist(text,text,text,boolean,text) TO authenticated;
