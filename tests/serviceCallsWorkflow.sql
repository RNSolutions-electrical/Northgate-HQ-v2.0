-- Rollback-only integration test. Synthetic actors/calls, no historical import.
BEGIN;
INSERT INTO public.user_permissions(clerk_user_id,email,display_name,role,division,is_active,permission_overrides)
VALUES ('__svc_workflow_test','svc-test@example.invalid','Service Workflow Test','Developer','Admin',true,'{}'),
('__svc_viewer_test','svc-viewer@example.invalid','Service Viewer Test','User','Electrical',true,
'{"can_view_all_divisions":true,"can_view_project_financials":false,"can_approve_budget":false,"can_manage_jobs":false}');
SELECT set_config('request.jwt.claims','{"sub":"__svc_workflow_test","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE a uuid; b uuid; data jsonb; arow jsonb; brow jsonb; invoice_data jsonb; req uuid:=gen_random_uuid();
 payment_data jsonb; result jsonb; failed_request uuid; before_count int; bad text;
BEGIN
 data:='{"service_call_number":"__SVC_TEST_A","name":"Synthetic call A","division":"Electrical","work_stage":"complete","billing_method":"time_and_materials","service_date":"2026-09-14"}';
 a:=public.svc_save_call(NULL,data,NULL);
 b:=public.svc_save_call(NULL,jsonb_set(jsonb_set(jsonb_set(data,'{service_call_number}','"__SVC_TEST_B"'),'{name}','"Synthetic call B"'),'{related_job_id}',to_jsonb(a::text)),NULL);
 SELECT value INTO arow FROM jsonb_array_elements(public.svc_read_calls()) WHERE value->>'id'=a::text;
 SELECT value INTO brow FROM jsonb_array_elements(public.svc_read_calls()) WHERE value->>'id'=b::text;
 IF brow#>>'{profile,related_job_id}' IS DISTINCT FROM a::text THEN RAISE EXCEPTION 'Link missing'; END IF;
 BEGIN
  PERFORM public.svc_save_call(a,data||(jsonb_build_object('related_job_id',b)),(arow->>'updated_at')::timestamptz);
  RAISE EXCEPTION 'Cycle was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.svc_save_call(a,data,(arow->>'updated_at')::timestamptz-interval '1 second');
  RAISE EXCEPTION 'Stale edit accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.svc_save_call(NULL,data,NULL);
  RAISE EXCEPTION 'Duplicate number accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 PERFORM public.svc_save_commercial(a,'quote','{"quote_amount":"100.00","changes_amount":"-5"}',(arow->>'updated_at')::timestamptz);
 PERFORM public.svc_save_commercial(a,'cost','{"labor_hard_cost":20,"material_hard_cost":10,"other_hard_cost":0,"cost_through":"2026-09-14","source_note":"Synthetic cost test","reconciliation_status":"final"}',(arow->>'updated_at')::timestamptz);
 FOREACH bad IN ARRAY ARRAY['NaN','Infinity','0.001','-Infinity'] LOOP
  BEGIN
   PERFORM public.svc_save_commercial(a,'quote',jsonb_build_object('quote_amount',bad,'changes_amount',0),(arow->>'updated_at')::timestamptz);
   RAISE EXCEPTION 'Invalid amount accepted: %',bad;
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 invoice_data:=jsonb_build_object('invoice_number','__SVC_INVOICE_TEST','invoice_date','2026-09-14','due_date','2026-10-14',
   'total_revenue','100.00','sales_tax','7.01','allocations',jsonb_build_array(
   jsonb_build_object('job_id',a,'amount','60.00','expected_updated_at',arow->>'updated_at'),
   jsonb_build_object('job_id',b,'amount','40.00','expected_updated_at',brow->>'updated_at')));
 IF public.svc_post_invoice(req,invoice_data) IS DISTINCT FROM req THEN RAISE EXCEPTION 'Invoice failed'; END IF;
 PERFORM public.svc_post_invoice(req,invoice_data);
 SELECT value INTO arow FROM jsonb_array_elements(public.svc_read_calls()) WHERE value->>'id'=a::text;
 SELECT value INTO brow FROM jsonb_array_elements(public.svc_read_calls()) WHERE value->>'id'=b::text;
 IF jsonb_array_length(arow#>'{financials,invoices}')<>1 OR jsonb_array_length(brow#>'{financials,invoices}')<>1 THEN RAISE EXCEPTION 'Replay duplicated invoice'; END IF;
 IF (arow#>>'{financials,invoices,0,revenue_excluding_tax}')::numeric+(brow#>>'{financials,invoices,0,revenue_excluding_tax}')::numeric<>100
 OR (arow#>>'{financials,invoices,0,sales_tax}')::numeric+(brow#>>'{financials,invoices,0,sales_tax}')::numeric<>7.01 THEN RAISE EXCEPTION 'Allocation does not reconcile'; END IF;
 payment_data:=jsonb_build_object('request_id',gen_random_uuid(),'invoice_id',arow#>>'{financials,invoices,0,id}','amount',20,'payment_date','2026-09-14');
 PERFORM public.svc_save_commercial(a,'payment',payment_data,(arow->>'updated_at')::timestamptz);
 PERFORM public.svc_save_commercial(a,'payment',payment_data,(arow->>'updated_at')::timestamptz);
 SELECT value INTO arow FROM jsonb_array_elements(public.svc_read_calls()) WHERE value->>'id'=a::text;
 IF jsonb_array_length(arow#>'{financials,invoices,0,payments}')<>1 THEN RAISE EXCEPTION 'Duplicate payment replay'; END IF;
 BEGIN
  PERFORM public.svc_save_commercial(a,'payment',payment_data||jsonb_build_object('request_id',gen_random_uuid(),'amount',1000),(arow->>'updated_at')::timestamptz);
  RAISE EXCEPTION 'Overpayment accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.svc_post_invoice(gen_random_uuid(),invoice_data||'{"total_revenue":99}');
  RAISE EXCEPTION 'Unbalanced invoice accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.svc_post_invoice(gen_random_uuid(),jsonb_set(invoice_data,'{allocations,0,expected_updated_at}',to_jsonb('2000-01-01T00:00:00Z'::text))||'{"invoice_number":"__SVC_STALE"}');
  RAISE EXCEPTION 'Stale posting accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 -- Fail after group creation: incomplete second call must roll the whole RPC back.
 PERFORM public.svc_save_call(b,data||jsonb_build_object('service_call_number','__SVC_TEST_B','name','Synthetic call B','related_job_id',a,'work_stage','in_progress'),(brow->>'updated_at')::timestamptz);
 failed_request:=gen_random_uuid();
 BEGIN
  PERFORM public.svc_post_invoice(failed_request,invoice_data||'{"invoice_number":"__SVC_FAIL"}');
  RAISE EXCEPTION 'Incomplete call invoiced';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 SELECT value INTO result FROM jsonb_array_elements(public.svc_read_calls()) WHERE value->>'id'=a::text;
 IF jsonb_array_length(result#>'{financials,invoices}')<>1 THEN RAISE EXCEPTION 'Partial invoice survived failure'; END IF;
 -- Read-only user: no masked values or write access.
 PERFORM set_config('request.jwt.claims','{"sub":"__svc_viewer_test","role":"authenticated"}',true);
 SELECT value INTO result FROM jsonb_array_elements(public.svc_read_calls()) WHERE value->>'id'=a::text;
 IF result IS NULL OR result->'financials'<>'null'::jsonb OR (result->'profile') ? 'quote_amount' THEN RAISE EXCEPTION 'Financial masking failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.svc_invoices WHERE job_id=a) THEN RAISE EXCEPTION 'Invoice RLS leaked values'; END IF;
 BEGIN
  PERFORM public.svc_save_commercial(a,'quote','{"quote_amount":1}',(arow->>'updated_at')::timestamptz);
  RAISE EXCEPTION 'Reader changed financial values';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{"sub":"__svc_workflow_test","role":"authenticated"}',true);
 PERFORM public.svc_archive_call(a,'Synthetic archive regression',(arow->>'updated_at')::timestamptz);
 SELECT value INTO result FROM jsonb_array_elements(public.svc_read_calls(true)) WHERE value->>'id'=a::text;
 IF result IS NULL OR jsonb_array_length(result#>'{financials,invoices}')<>1 OR jsonb_array_length(result#>'{financials,invoices,0,payments}')<>1 THEN RAISE EXCEPTION 'Archive lost financial history'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.svc_read_calls()) WHERE value->>'id'=a::text) THEN RAISE EXCEPTION 'Archived call still active'; END IF;
END;
$test$;
RESET ROLE;
DO $security$
BEGIN
 IF EXISTS(SELECT 1 FROM public.svc_invoice_groups WHERE invoice_number IN ('__SVC_FAIL','__SVC_STALE')) THEN RAISE EXCEPTION 'Failed invoice retained group'; END IF;
 IF has_function_privilege('anon','public.svc_read_calls(boolean,integer,integer)','EXECUTE')
 OR has_table_privilege('authenticated','public.svc_invoice_groups','SELECT')
 OR has_table_privilege('authenticated','public.svc_invoices','INSERT')
 THEN RAISE EXCEPTION 'Service grants unsafe'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.change_logs WHERE user_id='__svc_workflow_test' AND user_name='Service Workflow Test') THEN RAISE EXCEPTION 'Missing actor display name'; END IF;
END; $security$;
ROLLBACK;

