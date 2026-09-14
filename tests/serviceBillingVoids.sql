-- Synthetic records only. Always roll back, including when staged with the migration.
BEGIN;
INSERT INTO public.user_permissions(clerk_user_id,email,display_name,role,division,is_active,permission_overrides)
VALUES('__svc_void_test','void@example.invalid','Void Test','Developer','Admin',true,'{}'),
('__svc_void_viewer','voidviewer@example.invalid','Void Viewer','User','Electrical',true,
'{"can_view_all_divisions":true,"can_view_project_financials":true,"can_approve_budget":false}');
SELECT set_config('request.jwt.claims','{"sub":"__svc_void_test","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE a uuid; b uuid; ia uuid; ip uuid; r jsonb; data jsonb; req uuid:=gen_random_uuid(); ts timestamptz; invoice_data jsonb;
BEGIN
 data:='{"service_call_number":"__VOID_A","name":"Void test A","division":"Electrical","work_stage":"complete","billing_method":"time_and_materials"}';
 a:=public.svc_save_call(NULL,data,NULL);
 b:=public.svc_save_call(NULL,data||'{"service_call_number":"__VOID_B","name":"Void test B"}',NULL);
 SELECT updated_at INTO ts FROM public.jobs WHERE id=a;
 invoice_data:=jsonb_build_object('invoice_number','__VOID_SHARED','invoice_date','2026-09-14','total_revenue',100,'sales_tax',7.25,'credit_card_fee',3.22,'sales_tax_percent',7.25,'credit_card_percent',3,'allocations',jsonb_build_array(
 jsonb_build_object('job_id',a,'amount',60,'expected_updated_at',ts),
 jsonb_build_object('job_id',b,'amount',40,'expected_updated_at',(SELECT updated_at FROM public.jobs WHERE id=b))));
 PERFORM public.svc_post_invoice(req,invoice_data);
 SELECT id INTO ia FROM public.svc_invoices WHERE job_id=a;
 SELECT updated_at INTO ts FROM public.jobs WHERE id=a;
 PERFORM public.svc_save_commercial(a,'payment',jsonb_build_object('request_id',gen_random_uuid(),'invoice_id',ia,'amount',66.28,'payment_date','2026-09-14'),ts);
 SELECT id INTO ip FROM public.svc_payments WHERE invoice_id=ia;
 BEGIN
  PERFORM public.svc_void_billing(a,'invoice',ia,'Duplicate invoice',ts);
  RAISE EXCEPTION 'Paid invoice was voided';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.svc_invoices WHERE invoice_group_id=req AND status<>'posted') THEN RAISE EXCEPTION 'Partial void survived failure'; END IF;
 BEGIN
  PERFORM public.svc_void_billing(a,'payment',ip,' ',ts);
  RAISE EXCEPTION 'Blank reason accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.svc_void_billing(a,'payment',ip,'Duplicate payment',ts-interval '1 second');
  RAISE EXCEPTION 'Stale void accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{"sub":"__svc_void_viewer","role":"authenticated"}',true);
 BEGIN
  PERFORM public.svc_void_billing(a,'payment',ip,'Unauthorized',ts);
  RAISE EXCEPTION 'Viewer voided payment';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{"sub":"__svc_void_test","role":"authenticated"}',true);
 PERFORM public.svc_void_billing(a,'payment',ip,'Duplicate payment',ts);
 PERFORM public.svc_void_billing(a,'payment',ip,'Duplicate payment',ts);
 IF (SELECT outstanding FROM public.svc_call_financials WHERE job_id=a)<>66.28 THEN RAISE EXCEPTION 'Voided payment still collected'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.svc_payments WHERE id=ip AND amount=66.28 AND voided_by='__svc_void_test' AND voided_at IS NOT NULL) THEN RAISE EXCEPTION 'Payment history missing'; END IF;
 -- Re-recording after void must use restored balance, not count the voided payment.
 SELECT updated_at INTO ts FROM public.jobs WHERE id=a;
 PERFORM public.svc_save_commercial(a,'payment',jsonb_build_object('request_id',gen_random_uuid(),'invoice_id',ia,'amount',66.28,'payment_date','2026-09-14'),ts);
 SELECT id INTO ip FROM public.svc_payments WHERE invoice_id=ia AND voided_at IS NULL;
 SELECT updated_at INTO ts FROM public.jobs WHERE id=a;
 PERFORM public.svc_void_billing(a,'payment',ip,'Second test correction',ts);
 SELECT updated_at INTO ts FROM public.jobs WHERE id=a;
 BEGIN
  PERFORM public.svc_void_billing(b,'invoice',ia,'Wrong call',ts);
  RAISE EXCEPTION 'Cross-call record accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- An archived member blocks the whole shared invoice; rollback this test archive.
 BEGIN
  PERFORM public.svc_archive_call(b,'Temporary test archive',(SELECT updated_at FROM public.jobs WHERE id=b));
  BEGIN
   PERFORM public.svc_void_billing(a,'invoice',ia,'Duplicate invoice',ts);
   RAISE EXCEPTION 'Archived shared member was ignored';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.svc_invoices WHERE invoice_group_id=req AND status<>'posted') THEN RAISE EXCEPTION 'Partial void after denied permission'; END IF;
  RAISE EXCEPTION 'Rollback temporary archive' USING ERRCODE='ZV001';
 EXCEPTION WHEN SQLSTATE 'ZV001' THEN NULL; END;
 PERFORM public.svc_void_billing(a,'invoice',ia,'Duplicate invoice',ts);
 PERFORM public.svc_void_billing(a,'invoice',ia,'Duplicate invoice',ts);
 IF (SELECT count(*) FROM public.svc_invoices WHERE invoice_group_id=req AND status='void')<>2 THEN RAISE EXCEPTION 'Shared invoice not voided atomically'; END IF;
 IF EXISTS(SELECT 1 FROM public.svc_call_financials WHERE job_id IN(a,b) AND (invoiced_revenue<>0 OR collected<>0 OR outstanding<>0)) THEN RAISE EXCEPTION 'Voided invoice affects totals'; END IF;
 SELECT value INTO r FROM jsonb_array_elements(public.svc_read_calls()) WHERE value->>'id'=a::text;
 IF jsonb_array_length(r#>'{financials,invoices,0,payments}')<>2 OR r#>>'{financials,invoices,0,status}'<>'void' THEN RAISE EXCEPTION 'Read RPC lost history'; END IF;
 BEGIN
  PERFORM public.svc_save_commercial(a,'payment',jsonb_build_object('request_id',gen_random_uuid(),'invoice_id',ia,'amount',1,'payment_date','2026-09-14'),(SELECT updated_at FROM public.jobs WHERE id=a));
  RAISE EXCEPTION 'Payment accepted on void invoice';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END; $test$;
RESET ROLE;
DO $security$
BEGIN
 IF has_function_privilege('anon','public.svc_void_billing(uuid,text,uuid,text,timestamptz)','EXECUTE')
 OR has_table_privilege('authenticated','public.svc_payments','UPDATE')
 OR has_table_privilege('authenticated','public.svc_invoices','DELETE') THEN RAISE EXCEPTION 'Unsafe grants'; END IF;
 IF (SELECT count(*) FROM public.change_logs WHERE user_id='__svc_void_test' AND note LIKE '%voided:%')<>4 THEN RAISE EXCEPTION 'Missing or duplicate void audit'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.svc_invoice_groups WHERE invoice_number='__VOID_SHARED' AND voided_by='__svc_void_test') THEN RAISE EXCEPTION 'Group history missing'; END IF;
END; $security$;
ROLLBACK;
