-- Pure calculator regression, rollback only. Run after the quote-accounting migration.
BEGIN;
DO $test$
DECLARE doc jsonb := '{"blankSlateVersion":1,"rate":60,"blankSlateHardRate":35,"materialMarkup":20,"entries":[{"id":"e","number":1,"items":[{"id":"i","number":1,"name":"Fixture","qty":2,"lines":[{"id":"l","qty":1,"price":10,"hours":0.5}]}]}],"proposal":{"salesTaxPercent":10,"creditCardPercent":3}}';
 p jsonb;bad jsonb;quotes jsonb;
BEGIN
 p:=public.blank_slate_pricing(doc);
 IF (p->>'total')::numeric<>95.17 THEN RAISE EXCEPTION 'Legacy total changed: %',p;END IF;
 quotes:='[{"id":"q","mode":"add","cost":100,"markup":15},{"id":"r","mode":"reference","cost":null,"markup":null}]';
 p:=public.blank_slate_pricing(jsonb_set(doc,'{entries,0,items,0,blankQuotes}',quotes));
 IF (p->>'subtotal')::numeric<>314 OR (p->'lines'->0->>'other_amount')::numeric<>200 OR (p->'approvalLines'->0->>'other')::numeric<>200 OR (p->>'total')::numeric<>355.76 THEN RAISE EXCEPTION 'Additive quote did not reconcile: %',p;END IF;
 quotes:='[{"id":"q","mode":"replace","cost":100,"markup":15},{"id":"a","mode":"add","cost":10,"markup":0}]';
 bad:=jsonb_set(jsonb_set(doc,'{entries,0,items,0,blankQuotes}',quotes),'{entries,0,items,0,lines,0,price}','null');
 p:=public.blank_slate_pricing(bad);
 IF (p->>'subtotal')::numeric<>250 OR (p->'lines'->0->>'other_amount')::numeric<>220 OR (p->'lines'->0->>'hours')::numeric<>0 OR (p->'lines'->0->>'material_amount')::numeric<>0 OR (p->'lines'->0->>'labor_amount')::numeric<>0 OR (p->>'resourceDiscount')::numeric<>0 THEN RAISE EXCEPTION 'Replacement did not exclude resource inputs: %',p;END IF;
 p:=public.blank_slate_pricing(jsonb_set(doc,'{entries,0,items,0,blankQuotes}','[{"id":"q","mode":"add","cost":0.335,"markup":7}]'));
 IF (p->'lines'->0->>'other_amount')::numeric<>0.67 OR (p->>'subtotal')::numeric<>84.72 THEN RAISE EXCEPTION 'Exact quote cents failed: %',p;END IF;
 FOREACH quotes IN ARRAY ARRAY[
  '[{"id":"a","mode":"replace","cost":1},{"id":"b","mode":"replace","cost":1}]'::jsonb,
  '[{"id":"a","mode":"add","cost":null}]'::jsonb,
  '[{"id":"a","mode":"add","cost":-1}]'::jsonb,
  '[{"id":"a","mode":"invalid","cost":1}]'::jsonb,
  '[{"id":"a","mode":"add","cost":1},{"id":"a","mode":"reference"}]'::jsonb,
  '[{"mode":"reference"}]'::jsonb,
  'null'::jsonb
 ] LOOP
  BEGIN
   PERFORM public.blank_slate_pricing(jsonb_set(doc,'{entries,0,items,0,blankQuotes}',quotes));
   RAISE EXCEPTION 'Accepted invalid quote input %',quotes;
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
 END LOOP;
 IF public.blank_slate_accounting_version()<>2 THEN RAISE EXCEPTION 'Wrong capability version';END IF;
 IF has_function_privilege('anon','public.blank_slate_pricing(jsonb)','EXECUTE') OR NOT has_function_privilege('authenticated','public.blank_slate_pricing(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Pricing ACL changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.blank_slate_pricing(jsonb)'::regprocedure AND prosecdef) THEN RAISE EXCEPTION 'Calculator must be invoker';END IF;
END $test$;
ROLLBACK;
