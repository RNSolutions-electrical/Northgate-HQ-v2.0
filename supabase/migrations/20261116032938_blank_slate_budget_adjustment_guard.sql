-- Preserve nonnegative job budgets and forecasts; retain signed source allocations.
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $patch$
DECLARE definition text; anchor text;
BEGIN
 definition:=pg_get_functiondef('public.submit_estimate_for_review_v2(uuid,integer,text,uuid,jsonb,text,jsonb,jsonb)'::regprocedure);
 IF md5(definition)<>'cec36c179607dde729e3b429556e1223' THEN RAISE EXCEPTION 'Estimate financial mapper drift; stop and review'; END IF;
 anchor:='  previous_reason text :=';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Mapper declaration drift'; END IF;
 definition:=replace(definition,anchor,'  adjustment_pass integer;'||chr(10)||anchor);
 anchor:='  FOR pricing_line IN SELECT value FROM jsonb_array_elements(COALESCE(saved.pricing->''lines'',''[]''::jsonb)) LOOP';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Mapper loop drift'; END IF;
 definition:=replace(definition,anchor,'  FOR adjustment_pass IN 0..CASE WHEN saved.source_document->>''blankSlateVersion''=''1'' THEN 1 ELSE 0 END LOOP'||chr(10)||anchor);
 anchor:='      expected_total := expected_total + amount;';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Mapper amount drift'; END IF;
 definition:=replace(definition,anchor,'      IF (amount<0) IS DISTINCT FROM (adjustment_pass=1) THEN CONTINUE; END IF;'||chr(10)||anchor);
 anchor:='      INSERT INTO public.estimate_handoff_financial_allocations(';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Mapper allocation drift'; END IF;
 definition:=replace(definition,anchor,'      IF amount<0 AND (target_line.budget_amount+amount<0 OR target_line.forecast_final_amount+amount<0) THEN'||chr(10)||
 '        RAISE EXCEPTION ''Discount mapping would make financial code % negative. Choose an existing margin line with enough original budget and forecast, or explicitly map the adjustment with positive allocations. Source costs and discounts remain unchanged.'',target_line.cost_code USING ERRCODE=''22023'';'||chr(10)||
 '      END IF;'||chr(10)||anchor);
 anchor:='  IF (expected_total < 0 OR (expected_total = 0 AND saved.source_document->>''blankSlateVersion'' IS DISTINCT FROM ''1''))';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Mapper reconciliation drift'; END IF;
 definition:=replace(definition,anchor,'  END LOOP;'||chr(10)||anchor);
 EXECUTE definition;
END $patch$;
NOTIFY pgrst,'reload schema';
