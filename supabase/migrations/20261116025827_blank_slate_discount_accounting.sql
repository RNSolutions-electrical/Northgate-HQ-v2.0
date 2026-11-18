-- Staging-only candidate: additive pricing, no historical records rewritten.
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
DO $preflight$ BEGIN
 IF md5(pg_get_functiondef('public.validate_workbench_structure(jsonb,boolean)'::regprocedure))<>'7ef7cb4b8bd6b53e22a8d745b094dddd'
 OR md5(pg_get_functiondef('public.workbench_handoff_pricing(jsonb)'::regprocedure))<>'ce3bc1adc014248106252263420fff39'
 OR md5(pg_get_functiondef('public.approve_workbench_estimate_internal(uuid,text)'::regprocedure))<>'b9860bd3229bf5fa8fef7d7be71a9a3c'
 OR md5(pg_get_functiondef('public.submit_estimate_for_review_v2(uuid,integer,text,uuid,jsonb,text,jsonb,jsonb)'::regprocedure))<>'8df663760aa3fb2802c6d01db696401e'
 THEN RAISE EXCEPTION 'Estimate accounting definition drift; stop and re-review';END IF;
END $preflight$;
CREATE FUNCTION public.blank_slate_number(v text,label text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$DECLARE n numeric;BEGIN
 IF v IS NULL OR length(v)>100 OR v !~ '^([0-9]+([.][0-9]*)?|[.][0-9]+)$' THEN RAISE EXCEPTION '% is required and must be nonnegative',label USING ERRCODE='22023';END IF;
 n:=v::numeric;IF n>1000000000 THEN RAISE EXCEPTION '% is outside the supported range',label USING ERRCODE='22023';END IF;RETURN n;
END $$;
CREATE FUNCTION public.blank_slate_discount(base numeric,d jsonb) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$DECLARE v numeric;result numeric;BEGIN
 IF d IS NULL OR d='null'::jsonb THEN RETURN 0;END IF;
 IF jsonb_typeof(d)<>'object' OR coalesce(d->>'type','') NOT IN ('percent','amount') THEN RAISE EXCEPTION 'Choose a percentage or amount discount' USING ERRCODE='22023';END IF;
 v:=public.blank_slate_number(d->>'value','Discount');IF d->>'type'='percent' AND v>100 THEN RAISE EXCEPTION 'Discount percentage cannot exceed 100' USING ERRCODE='22023';END IF;
 result:=round(CASE WHEN d->>'type'='percent' THEN base*v/100 ELSE v END,2);
 IF result>base THEN RAISE EXCEPTION 'Discount cannot exceed its selling amount' USING ERRCODE='22023';END IF;RETURN result;
END $$;
CREATE FUNCTION public.blank_slate_pricing(doc jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE e jsonb;i jsonb;l jsonb;r jsonb;rows jsonb:='[]';result jsonb:='[]';approval_rows jsonb:='[]';
 keys text[]:='{}';resource_keys text[];k text;qty numeric;q numeric;rate numeric;hard_rate numeric;markup_rate numeric;
 material numeric;hours numeric;labor numeric;cost numeric;unit_cost numeric;resource_hours numeric;gross_material numeric;gross_labor numeric;
 md numeric;ld numeric;resource_discount numeric;all_resource_discount numeric:=0;selling numeric;subtotal numeric:=0;all_cost numeric:=0;
 fee numeric;overall_discount numeric;fee_cumulative numeric:=0;fee_allocated numeric:=0;next_fee numeric;
 discount_cumulative numeric:=0;discount_allocated numeric:=0;next_discount numeric;line_fee numeric;line_discount numeric;line_price numeric;
 charges jsonb;charge_key text;charge_value text;pre_tax numeric;tax numeric;card numeric;
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
   material:=0;hours:=0;selling:=0;resource_discount:=0;resource_keys:='{}';
   FOR l IN SELECT value FROM jsonb_array_elements(i->'lines') LOOP
    IF nullif(l->>'id','') IS NULL OR (l->>'id')=ANY(resource_keys) THEN RAISE EXCEPTION 'Resource identifiers must be unique' USING ERRCODE='22023';END IF;resource_keys:=array_append(resource_keys,l->>'id');
    q:=public.blank_slate_number(l->>'qty','Resource quantity')*CASE WHEN coalesce((l->>'fixed')::boolean,false) THEN 1 ELSE qty END;
    unit_cost:=round(q*public.blank_slate_number(l->>'price','Material price'),2);resource_hours:=q*public.blank_slate_number(l->>'hours','Labor hours');
    gross_material:=round(unit_cost*(1+markup_rate/100),2);gross_labor:=round(resource_hours*rate,2);
    md:=public.blank_slate_discount(gross_material,l->'materialDiscount');ld:=public.blank_slate_discount(gross_labor,l->'laborDiscount');
    material:=material+unit_cost;hours:=hours+resource_hours;selling:=selling+gross_material+gross_labor-md-ld;resource_discount:=resource_discount+md+ld;
   END LOOP;
   labor:=round(hours*hard_rate,2);cost:=material+labor;all_cost:=all_cost+cost;IF all_cost>999999999999.99 THEN RAISE EXCEPTION 'Estimate cost is outside the supported range' USING ERRCODE='22023';END IF;
   selling:=round(selling,2);subtotal:=subtotal+selling;all_resource_discount:=all_resource_discount+resource_discount;
   rows:=rows||jsonb_build_array(jsonb_build_object('key',k,'entry_id',e->>'id','item_id',i->>'id','reference',lpad(coalesce(e->>'number',''),3,'0')||'.'||coalesce(i->>'number',''),'entry_number',e->>'number','item_number',i->'number','description',i->>'name','section',e->>'section','location',e->>'location','material_amount',material,'labor_amount',labor,'other_amount',0,'hours',hours,'cost',cost,'resource_discount',resource_discount,'subtotal',selling,'material_markup_rate',markup_rate));
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
  approval_rows:=approval_rows||jsonb_build_array(r||jsonb_build_object('material',(r->>'material_amount')::numeric,'labor',(r->>'labor_amount')::numeric,'other',0,'material_markup',(r->>'markup_amount')::numeric,'subtotal',line_price));
 END LOOP;
 FOREACH charge_key IN ARRAY ARRAY['salesTaxPercent','creditCardPercent'] LOOP
  charge_value:=coalesce(doc->'proposal'->>charge_key,'0');IF length(charge_value)>100 OR charge_value !~ '^[0-9]+([.][0-9]{1,4})?$' OR charge_value::numeric>100 THEN RAISE EXCEPTION 'Proposal percentages must be between 0 and 100 with at most four decimal places' USING ERRCODE='22023';END IF;
 END LOOP;
 pre_tax:=subtotal+fee-overall_discount;tax:=round(pre_tax*coalesce(doc->'proposal'->>'salesTaxPercent','0')::numeric/100,2);card:=round((pre_tax+tax)*coalesce(doc->'proposal'->>'creditCardPercent','0')::numeric/100,2);
 IF pre_tax+tax+card>999999999999.99 THEN RAISE EXCEPTION 'Estimate total is outside the supported range' USING ERRCODE='22023';END IF;
 charges:=jsonb_build_object('preTaxTotal',pre_tax,'salesTax',tax,'creditCardFee',card,'price',pre_tax+tax+card);
 RETURN charges||jsonb_build_object('lines',result,'approvalLines',approval_rows,'subtotal',subtotal,'fee',fee,'total',pre_tax+tax+card,'resourceDiscount',all_resource_discount,'estimateDiscount',overall_discount,'totalDiscount',all_resource_discount+overall_discount,'grossPreDiscount',subtotal+fee+all_resource_discount);
END $$;
-- Pure SECURITY INVOKER calculators: no table reads, credentials or write privileges.
REVOKE ALL ON FUNCTION public.blank_slate_number(text,text),public.blank_slate_discount(numeric,jsonb),public.blank_slate_pricing(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.blank_slate_number(text,text),public.blank_slate_discount(numeric,jsonb),public.blank_slate_pricing(jsonb) TO authenticated;
DO $patch$
DECLARE definition text;anchor text;replacement text;
BEGIN
 definition:=pg_get_functiondef('public.validate_workbench_structure(jsonb,boolean)'::regprocedure);anchor:=E'BEGIN\n';IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Validation definition drift';END IF;
 replacement:=E'BEGIN\n IF doc ? ''blankSlateVersion'' AND doc->''blankSlateVersion'' IS DISTINCT FROM ''1''::jsonb THEN RAISE EXCEPTION ''Unsupported blank-slate schema'' USING ERRCODE=''22023'';END IF;\n IF doc->>''blankSlateVersion''=''1'' THEN PERFORM public.blank_slate_pricing(doc);\n ELSIF doc ? ''estimateDiscount'' OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(doc->''entries'',''[]'')) scope_entry CROSS JOIN LATERAL jsonb_array_elements(coalesce(scope_entry->''items'',''[]'')) scope_item CROSS JOIN LATERAL jsonb_array_elements(coalesce(scope_item->''lines'',''[]'')) scope_resource WHERE scope_resource ? ''materialDiscount'' OR scope_resource ? ''laborDiscount'') THEN RAISE EXCEPTION ''Discounts require the blank-slate pricing schema'' USING ERRCODE=''22023'';END IF;\n';EXECUTE replace(definition,anchor,replacement);
 definition:=pg_get_functiondef('public.workbench_handoff_pricing(jsonb)'::regprocedure);anchor:=' PERFORM public.validate_workbench_structure(doc,true);';IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Handoff pricing definition drift';END IF;
 replacement:=anchor||E'\n IF doc->>''blankSlateVersion''=''1'' THEN\n IF coalesce(doc->''proposal''->>''salesTaxPercent'',''0'')::numeric<>0 OR coalesce(doc->''proposal''->>''creditCardPercent'',''0'')::numeric<>0 THEN RAISE EXCEPTION ''Proposal charges require destination accounting review before estimate handoff'' USING ERRCODE=''22023'';END IF;\n IF jsonb_array_length(doc->''entries'')=0 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(doc->''entries'') scope_entry CROSS JOIN LATERAL jsonb_array_elements(scope_entry->''items'') scope_item) THEN RAISE EXCEPTION ''Add priced work before handoff'' USING ERRCODE=''22023'';END IF;\n RETURN public.blank_slate_pricing(doc);END IF;';EXECUTE replace(definition,anchor,replacement);
 definition:=pg_get_functiondef('public.approve_workbench_estimate_internal(uuid,text)'::regprocedure);anchor:=E'  FOR row_value IN\n    WITH document_values AS (';IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Approval pricing definition drift';END IF;
 definition:=replace(definition,anchor,E'  IF workbench.document->>''blankSlateVersion''=''1'' THEN\n    proposal_charges:=public.blank_slate_pricing(workbench.document);pricing_lines:=proposal_charges->''approvalLines'';pricing_line_count:=jsonb_array_length(pricing_lines);pricing_total:=(proposal_charges->>''preTaxTotal'')::numeric;\n  ELSE\n'||anchor);
 anchor:='  pricing_total := round(pricing_total * (1 + (workbench.document ->> ''feePercent'')::numeric / 100), 2);';IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Approval fee definition drift';END IF;definition:=replace(definition,anchor,anchor||E'\n END IF;');
 anchor:='  proposal_charges:=public.workbench_proposal_charges(pricing_total,workbench.document->''proposal'');';IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Approval charges definition drift';END IF;definition:=replace(definition,anchor,anchor||E'\n IF workbench.document->>''blankSlateVersion''=''1'' THEN proposal_charges:=proposal_charges||(public.blank_slate_pricing(workbench.document)-ARRAY[''lines'',''approvalLines'']);END IF;');EXECUTE definition;
 definition:=pg_get_functiondef('public.submit_estimate_for_review_v2(uuid,integer,text,uuid,jsonb,text,jsonb,jsonb)'::regprocedure);anchor:='      IF amount <= 0 THEN CONTINUE; END IF;';IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Financial mapper amount drift';END IF;
 definition:=replace(definition,anchor,E'      IF amount = 0 THEN CONTINUE; END IF;\n      IF amount<0 AND (cost_kind<>''markup_amount'' OR saved.source_document->>''blankSlateVersion'' IS DISTINCT FROM ''1'') THEN RAISE EXCEPTION ''Only blank-slate selling margin adjustments may be negative'' USING ERRCODE=''22023'';END IF;');
 anchor:='  IF expected_total <= 0 OR expected_total IS DISTINCT FROM round((saved.pricing->>''total'')::numeric,2)';IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Financial mapper reconciliation drift';END IF;definition:=replace(definition,anchor,'  IF (expected_total < 0 OR (expected_total = 0 AND saved.source_document->>''blankSlateVersion'' IS DISTINCT FROM ''1'')) OR expected_total IS DISTINCT FROM round((saved.pricing->>''total'')::numeric,2)');
 anchor:='  PERFORM set_config(''northgate.financial_workflow'',''financial.save'',true);';IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Financial mapper zero allocation drift';END IF;
 definition:=replace(definition,anchor,E'  IF saved.source_document->>''blankSlateVersion''=''1'' AND (saved.pricing->>''total'')::numeric=0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(saved.pricing->''lines'') zero_line WHERE (zero_line->>''material_amount'')::numeric<>0 OR (zero_line->>''labor_amount'')::numeric<>0 OR (zero_line->>''other_amount'')::numeric<>0 OR (zero_line->>''markup_amount'')::numeric<>0) THEN RETURN saved;END IF;\n'||anchor);EXECUTE definition;
END $patch$;
ALTER TABLE public.estimate_handoff_financial_allocations DROP CONSTRAINT estimate_handoff_financial_allocations_amount_check;
ALTER TABLE public.estimate_handoff_financial_allocations ADD CONSTRAINT estimate_handoff_financial_allocations_amount_check CHECK(amount>0 OR (cost_kind='markup_amount' AND amount<0));
CREATE FUNCTION public.blank_slate_accounting_version() RETURNS integer LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$SELECT 1$$;
REVOKE ALL ON FUNCTION public.blank_slate_accounting_version() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.blank_slate_accounting_version() TO authenticated;
NOTIFY pgrst,'reload schema';
