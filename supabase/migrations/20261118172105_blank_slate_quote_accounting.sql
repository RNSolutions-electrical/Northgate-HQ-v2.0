-- Staging candidate only. Pure calculator extension; no rows or historical snapshots changed.
-- Existing permission/audit gates remain; only complete-mode quote eligibility changes.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
DO $preflight$ DECLARE existing text;BEGIN
 SELECT replace(p.prosrc,E'\r\n',E'\n') INTO existing FROM pg_proc p WHERE p.oid='public.blank_slate_pricing(jsonb)'::regprocedure;
 IF md5(existing)<>'2d850768b4547c41582576e5c3aab3af' THEN RAISE EXCEPTION 'Blank-slate pricing definition drift; stop and re-review';END IF;
 IF public.blank_slate_accounting_version()<>1 THEN RAISE EXCEPTION 'Expected blank-slate accounting version 1';END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.blank_slate_pricing(doc jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE e jsonb;i jsonb;l jsonb;r jsonb;rows jsonb:='[]';result jsonb:='[]';approval_rows jsonb:='[]';
 keys text[]:='{}';resource_keys text[];k text;qty numeric;q numeric;rate numeric;hard_rate numeric;markup_rate numeric;
 material numeric;hours numeric;labor numeric;cost numeric;unit_cost numeric;resource_hours numeric;gross_material numeric;gross_labor numeric;
 md numeric;ld numeric;resource_discount numeric;all_resource_discount numeric:=0;selling numeric;subtotal numeric:=0;all_cost numeric:=0;
 fee numeric;overall_discount numeric;fee_cumulative numeric:=0;fee_allocated numeric:=0;next_fee numeric;
 discount_cumulative numeric:=0;discount_allocated numeric:=0;next_discount numeric;line_fee numeric;line_discount numeric;line_price numeric;
 charges jsonb;charge_key text;charge_value text;pre_tax numeric;tax numeric;card numeric;
 quote_row jsonb;quote_keys text[];quote_mode text;replacement_count integer;other numeric;quote_cost numeric;quote_markup numeric;
BEGIN
 IF doc->'blankSlateVersion' IS DISTINCT FROM '1'::jsonb THEN RAISE EXCEPTION 'Unsupported blank-slate schema' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(doc->'entries') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Estimate entries must be a list' USING ERRCODE='22023';END IF;
 PERFORM public.blank_slate_number(doc->>'rate','Sales labor rate');PERFORM public.blank_slate_number(coalesce(doc->>'blankSlateHardRate',doc->>'rate'),'Hard labor rate');PERFORM public.blank_slate_number(coalesce(doc->>'materialMarkup','0'),'Material markup');
 FOR e IN SELECT value FROM jsonb_array_elements(doc->'entries') LOOP
  IF nullif(e->>'id','') IS NULL OR jsonb_typeof(e->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid estimate entry' USING ERRCODE='22023';END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(e->'items') LOOP
   k:=(e->>'id')||':'||(i->>'id');IF nullif(i->>'id','') IS NULL OR k=ANY(keys) THEN RAISE EXCEPTION 'Work item identifiers must be unique' USING ERRCODE='22023';END IF;keys:=array_append(keys,k);
   IF nullif(i->>'quoteId','') IS NOT NULL THEN RAISE EXCEPTION 'Blank-slate quote pricing is not supported' USING ERRCODE='22023';END IF;
   IF jsonb_typeof(i->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Resource rows must be a list' USING ERRCODE='22023';END IF;
   qty:=public.blank_slate_number(i->>'qty','Work quantity');rate:=public.blank_slate_number(coalesce(i->>'laborRateOverride',doc->>'rate'),'Sales labor rate');
   hard_rate:=public.blank_slate_number(coalesce(i->>'blankSlateHardRate',doc->>'blankSlateHardRate',doc->>'rate'),'Hard labor rate');markup_rate:=public.blank_slate_number(coalesce(i->>'materialMarkupOverride',doc->>'materialMarkup','0'),'Material markup');
   material:=0;hours:=0;selling:=0;resource_discount:=0;resource_keys:='{}';other:=0;quote_keys:='{}';replacement_count:=0;
   IF i ? 'blankQuotes' AND jsonb_typeof(i->'blankQuotes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Quotes must be a list' USING ERRCODE='22023';END IF;
   IF jsonb_array_length(coalesce(i->'blankQuotes','[]'::jsonb))>500 THEN RAISE EXCEPTION 'Use at most 500 quotes per work item' USING ERRCODE='22023';END IF;
   FOR quote_row IN SELECT value FROM jsonb_array_elements(coalesce(i->'blankQuotes','[]'::jsonb)) LOOP
    IF jsonb_typeof(quote_row) IS DISTINCT FROM 'object' OR jsonb_typeof(quote_row->'id') IS DISTINCT FROM 'string' OR nullif(quote_row->>'id','') IS NULL OR (quote_row->>'id')=ANY(quote_keys) THEN RAISE EXCEPTION 'Quote identifiers must be nonempty and unique' USING ERRCODE='22023';END IF;
    quote_keys:=array_append(quote_keys,quote_row->>'id');quote_mode:=quote_row->>'mode';
    IF quote_mode IS NULL OR quote_mode NOT IN ('add','replace','reference') THEN RAISE EXCEPTION 'Choose additive, replacement, or reference quote mode' USING ERRCODE='22023';END IF;
    IF quote_mode='replace' THEN replacement_count:=replacement_count+1;END IF;
   END LOOP;
   IF replacement_count>1 THEN RAISE EXCEPTION 'Only one replacement quote is allowed per work item' USING ERRCODE='22023';END IF;
   -- A replacement excludes material/labor inputs entirely; they remain as reference.
   IF replacement_count=0 THEN
   FOR l IN SELECT value FROM jsonb_array_elements(i->'lines') LOOP
    IF nullif(l->>'id','') IS NULL OR (l->>'id')=ANY(resource_keys) THEN RAISE EXCEPTION 'Resource identifiers must be unique' USING ERRCODE='22023';END IF;resource_keys:=array_append(resource_keys,l->>'id');
    q:=public.blank_slate_number(l->>'qty','Resource quantity')*CASE WHEN coalesce((l->>'fixed')::boolean,false) THEN 1 ELSE qty END;
    unit_cost:=round(q*public.blank_slate_number(l->>'price','Material price'),2);resource_hours:=q*public.blank_slate_number(l->>'hours','Labor hours');
    gross_material:=round(unit_cost*(1+markup_rate/100),2);gross_labor:=round(resource_hours*rate,2);
    md:=public.blank_slate_discount(gross_material,l->'materialDiscount');ld:=public.blank_slate_discount(gross_labor,l->'laborDiscount');
    material:=material+unit_cost;hours:=hours+resource_hours;selling:=selling+gross_material+gross_labor-md-ld;resource_discount:=resource_discount+md+ld;
   END LOOP;
   END IF;
   FOR quote_row IN SELECT value FROM jsonb_array_elements(coalesce(i->'blankQuotes','[]'::jsonb)) LOOP
    IF quote_row->>'mode'='reference' THEN CONTINUE;END IF;
    quote_cost:=round(qty*public.blank_slate_number(quote_row->>'cost','Quote cost'),2);
    quote_markup:=public.blank_slate_number(coalesce(quote_row->>'markup',i->>'materialMarkupOverride',doc->>'materialMarkup','0'),'Quote markup');
    other:=other+quote_cost;selling:=selling+round(quote_cost*(1+quote_markup/100),2);
   END LOOP;
   labor:=round(hours*hard_rate,2);cost:=material+labor+other;all_cost:=all_cost+cost;IF all_cost>999999999999.99 THEN RAISE EXCEPTION 'Estimate cost is outside the supported range' USING ERRCODE='22023';END IF;
   selling:=round(selling,2);subtotal:=subtotal+selling;all_resource_discount:=all_resource_discount+resource_discount;
   rows:=rows||jsonb_build_array(jsonb_build_object('key',k,'entry_id',e->>'id','item_id',i->>'id','reference',lpad(coalesce(e->>'number',''),3,'0')||'.'||coalesce(i->>'number',''),'entry_number',e->>'number','item_number',i->'number','description',i->>'name','section',e->>'section','location',e->>'location','material_amount',material,'labor_amount',labor,'other_amount',other,'hours',hours,'cost',cost,'resource_discount',resource_discount,'subtotal',selling,'material_markup_rate',markup_rate));
  END LOOP;
 END LOOP;
 IF jsonb_array_length(rows)>500 THEN RAISE EXCEPTION 'Use at most 500 work items' USING ERRCODE='22023';END IF;
 fee:=round(subtotal*public.blank_slate_number(coalesce(doc->>'feePercent','0'),'Fee percentage')/100,2);
 IF subtotal+fee+all_resource_discount>999999999999.99 THEN RAISE EXCEPTION 'Estimate total is outside the supported range' USING ERRCODE='22023';END IF;
 overall_discount:=public.blank_slate_discount(subtotal+fee,doc->'estimateDiscount');
 FOR r IN SELECT value FROM jsonb_array_elements(rows) LOOP
  fee_cumulative:=fee_cumulative+(r->>'subtotal')::numeric;next_fee:=CASE WHEN subtotal=0 THEN 0 ELSE round(fee*fee_cumulative/subtotal,2) END;line_fee:=next_fee-fee_allocated;fee_allocated:=next_fee;
  discount_cumulative:=discount_cumulative+(r->>'subtotal')::numeric+line_fee;next_discount:=CASE WHEN subtotal+fee=0 THEN 0 ELSE round(overall_discount*discount_cumulative/(subtotal+fee),2) END;line_discount:=next_discount-discount_allocated;discount_allocated:=next_discount;
  line_price:=(r->>'subtotal')::numeric+line_fee-line_discount;r:=r||jsonb_build_object('fee_amount',line_fee,'estimate_discount',line_discount,'markup_amount',line_price-(r->>'cost')::numeric,'line_total',line_price);result:=result||jsonb_build_array(r);
  approval_rows:=approval_rows||jsonb_build_array(r||jsonb_build_object('material',(r->>'material_amount')::numeric,'labor',(r->>'labor_amount')::numeric,'other',(r->>'other_amount')::numeric,'material_markup',(r->>'markup_amount')::numeric,'subtotal',line_price));
 END LOOP;
 FOREACH charge_key IN ARRAY ARRAY['salesTaxPercent','creditCardPercent'] LOOP
  charge_value:=coalesce(doc->'proposal'->>charge_key,'0');IF length(charge_value)>100 OR charge_value !~ '^[0-9]+([.][0-9]{1,4})?$' OR charge_value::numeric>100 THEN RAISE EXCEPTION 'Proposal percentages must be between 0 and 100 with at most four decimal places' USING ERRCODE='22023';END IF;
 END LOOP;
 pre_tax:=subtotal+fee-overall_discount;tax:=round(pre_tax*coalesce(doc->'proposal'->>'salesTaxPercent','0')::numeric/100,2);card:=round((pre_tax+tax)*coalesce(doc->'proposal'->>'creditCardPercent','0')::numeric/100,2);
 IF pre_tax+tax+card>999999999999.99 THEN RAISE EXCEPTION 'Estimate total is outside the supported range' USING ERRCODE='22023';END IF;
 charges:=jsonb_build_object('preTaxTotal',pre_tax,'salesTax',tax,'creditCardFee',card,'price',pre_tax+tax+card);
 RETURN charges||jsonb_build_object('lines',result,'approvalLines',approval_rows,'subtotal',subtotal,'fee',fee,'total',pre_tax+tax+card,'resourceDiscount',all_resource_discount,'estimateDiscount',overall_discount,'totalDiscount',all_resource_discount+overall_discount,'grossPreDiscount',subtotal+fee+all_resource_discount);
END $$;
REVOKE ALL ON FUNCTION public.blank_slate_pricing(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.blank_slate_pricing(jsonb) TO authenticated;

-- Extend only the complete-mode resource/quote choice. Keep the surrounding
-- structure, names, quantity, component grouping, permissions and audits intact.
DO $guards$
DECLARE definition text;anchor text;replacement text;
BEGIN
 definition:=pg_get_functiondef('public.validate_workbench_structure(jsonb,boolean)'::regprocedure);
 anchor:=E'     PERFORM public.workbench_handoff_number(quoted_value->>''otherAmount'',''quote other cost'');\n    ELSE';
 replacement:=E'     PERFORM public.workbench_handoff_number(quoted_value->>''otherAmount'',''quote other cost'');\n    ELSIF doc->>''blankSlateVersion''=''1'' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(i->''blankQuotes'',''[]'')) q WHERE q->>''mode'' IN (''add'',''replace'')) THEN\n     -- Full exact quote/resource pricing was validated above. Replacement resources are references.\n     NULL;\n    ELSE';
 IF position(anchor IN definition)=0 OR position('PERFORM public.blank_slate_pricing(doc)' IN definition)=0 THEN RAISE EXCEPTION 'Blank-slate complete validation drift; stop and re-review';END IF;
 EXECUTE replace(definition,anchor,replacement);
 definition:=pg_get_functiondef('public.approve_workbench_estimate(uuid,text)'::regprocedure);
 anchor:='OR (jsonb_array_length(item_value.value -> ''lines'') = 0 AND nullif(item_value.value ->> ''quoteId'', '''') IS NULL)';
 replacement:='OR (jsonb_array_length(item_value.value -> ''lines'') = 0 AND nullif(item_value.value ->> ''quoteId'', '''') IS NULL AND NOT (coalesce(document->>''blankSlateVersion'','''')=''1'' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(item_value.value->''blankQuotes'',''[]'')) q WHERE q->>''mode'' IN (''add'',''replace''))))';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Blank-slate approval wrapper drift; stop and re-review';END IF;
 EXECUTE replace(definition,anchor,replacement);
END $guards$;
CREATE OR REPLACE FUNCTION public.blank_slate_accounting_version() RETURNS integer LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$SELECT 2$$;
REVOKE ALL ON FUNCTION public.blank_slate_accounting_version() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.blank_slate_accounting_version() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
