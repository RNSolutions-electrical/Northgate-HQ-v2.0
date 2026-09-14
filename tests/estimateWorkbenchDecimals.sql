-- Rollback-only regression: no real estimate is approved or changed.
BEGIN;
INSERT INTO public.user_permissions(clerk_user_id,email,role,division,is_active,permission_overrides)
VALUES ('__decimal_approval_test','decimal-approval@example.invalid','Developer','Admin',true,'{}');
SELECT set_config('request.jwt.claims','{"sub":"__decimal_approval_test","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  doc jsonb := '{"name":"Decimal approval regression","rate":"100.","materialMarkup":"10.","feePercent":"20.","entries":[{"number":1,"items":[{"number":1,"name":"Decimal components","qty":"2.","lines":[{"qty":".5","price":".32","hours":".02","fixed":false}]}]}]}'::jsonb;
  saved public.estimate_workbenches;
  snapshot_id uuid;
  total numeric;
  invalid text;
  field text;
  bad jsonb;
BEGIN
  saved := public.save_estimate_workbench(NULL,'Electrical',doc,NULL,'[]');
  snapshot_id := public.approve_workbench_estimate(saved.estimate_id,'Decimal regression');
  SELECT pricing_total INTO total FROM public.estimate_snapshots WHERE id=snapshot_id;
  IF total IS DISTINCT FROM 2.82 THEN RAISE EXCEPTION 'Expected 2.82, got %',total; END IF;

  FOREACH invalid IN ARRAY ARRAY['','-1','.','abc','NaN','Infinity','1..2'] LOOP
    FOREACH field IN ARRAY ARRAY['qty','price','hours'] LOOP
      bad := jsonb_set(doc,ARRAY['entries','0','items','0','lines','0',field],to_jsonb(invalid));
      saved := public.save_estimate_workbench(NULL,'Electrical',bad,NULL,'[]');
      BEGIN
        PERFORM public.approve_workbench_estimate(saved.estimate_id,'Must reject invalid value');
        RAISE EXCEPTION 'Accepted invalid % value %',field,invalid;
      EXCEPTION WHEN invalid_parameter_value THEN NULL;
      END;
      IF EXISTS (SELECT 1 FROM public.estimate_snapshots WHERE estimate_id=saved.estimate_id)
        THEN RAISE EXCEPTION 'Failed approval retained a snapshot'; END IF;
    END LOOP;
  END LOOP;
  bad := jsonb_set(doc,'{entries,0,items,0,lines,0,price}','null');
  saved := public.save_estimate_workbench(NULL,'Electrical',bad,NULL,'[]');
  BEGIN
    PERFORM public.approve_workbench_estimate(saved.estimate_id,'Must reject missing value');
    RAISE EXCEPTION 'Accepted missing price';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$test$;
RESET ROLE;
DO $acl$
BEGIN
  IF has_function_privilege('anon','public.approve_workbench_estimate(uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.approve_workbench_estimate_internal(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.approve_workbench_estimate(uuid,text)','EXECUTE')
    THEN RAISE EXCEPTION 'Approval grants changed'; END IF;
END;
$acl$;
ROLLBACK;
