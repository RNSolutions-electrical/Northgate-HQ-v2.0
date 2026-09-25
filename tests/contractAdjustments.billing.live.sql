-- STAGING ONLY. Entire integration probe rolls back, including fixture audits.
-- Observations explicitly expose integration defects instead of hiding them.
BEGIN;
CREATE TEMP TABLE adjustment_results(test text, actual numeric, expected numeric) ON COMMIT DROP;
GRANT INSERT,SELECT ON adjustment_results TO authenticated;
INSERT INTO public.user_permissions(clerk_user_id,email,role,business_role,division,is_active)
 VALUES('__co_billing_test','co-billing@example.invalid','Director','Director','Electrical',true);
SELECT set_config('request.jwt.claims','{"sub":"__co_billing_test","role":"authenticated"}',true);
INSERT INTO public.jobs(name,division,status) VALUES('__co_billing_rollback','Electrical','active');
INSERT INTO public.job_pay_applications(job_id,pay_app_number,original_contract_value,created_by)
 SELECT id,1,1000,'__co_billing_test' FROM public.jobs WHERE name='__co_billing_rollback';
DO $test$
DECLARE j uuid; b uuid; app uuid; app_line uuid; revenue uuid; co public.change_orders; revision public.change_orders;
 zero_co public.change_orders; positive public.change_orders; denied boolean:=false;
BEGIN
 SELECT id INTO STRICT j FROM public.jobs WHERE name='__co_billing_rollback';
 SELECT id INTO STRICT app FROM public.job_pay_applications WHERE job_id=j;
 SET LOCAL ROLE authenticated;
 b:=(public.save_job_financial_batch(j,'[{"description":"Integration fixture","cost_code":"16.CO","budget_amount":1000}]','Rollback-only integration test')->0->>'id')::uuid;
 co:=public.save_contract_adjustment(jsonb_build_object('job_id',j,'record_type','credit','title','Credit','lines',
 jsonb_build_array(jsonb_build_object('job_budget_line_id',b,'description','Credit','material_amount',-110))));
 co:=public.set_contract_adjustment_status(co.id,'approved',NULL,co.updated_at);
 INSERT INTO adjustment_results VALUES('Credit financial posting',(SELECT sum(amount_delta) FROM public.change_order_financial_postings WHERE change_order_id=co.id),-110);
 RESET ROLE;
 INSERT INTO public.job_revenue_lines(job_id,division,description,scheduled_value_amount)
 VALUES(j,'Electrical','Fixture SOV',1000) RETURNING id INTO revenue;
 SET LOCAL ROLE authenticated;
 PERFORM public.save_change_order_sov_allocations(co.id,jsonb_build_array(jsonb_build_object('revenue_line_id',revenue,'amount',-110)),'Credit integration verification');
 INSERT INTO adjustment_results VALUES('Credit reduces SOV',(SELECT scheduled_value_amount+approved_change_amount FROM public.job_revenue_lines WHERE id=revenue),890);
 PERFORM public.sync_job_pay_application_change_orders(app);
 RESET ROLE;
 SELECT id INTO STRICT app_line FROM public.job_pay_application_change_orders WHERE pay_application_id=app AND change_order_id=co.id;
 SET LOCAL ROLE authenticated;
 PERFORM public.save_job_pay_application_change_order(app_line,50,NULL,NULL);
 RESET ROLE;
 INSERT INTO adjustment_results VALUES('Partial credit billing',(SELECT final_current_amount FROM public.job_pay_application_change_orders WHERE id=app_line),-55);
 INSERT INTO adjustment_results VALUES('Credit current contract',(SELECT current_contract_value FROM public.job_pay_applications WHERE id=app),890);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.save_job_pay_application_change_order(app_line,100,-111,'Overcredit attempt');
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%approved Change Order range%' THEN RAISE; END IF; denied:=true; END;
 INSERT INTO adjustment_results VALUES('Overcredit rejected',CASE WHEN denied THEN 1 ELSE 0 END,1);
 PERFORM public.save_job_pay_application_change_order(app_line,100,NULL,NULL);
 zero_co:=public.save_contract_adjustment(jsonb_build_object('job_id',j,'title','No cost','lines',
 jsonb_build_array(jsonb_build_object('job_budget_line_id',b,'description','No cost','material_amount',0))));
 zero_co:=public.set_contract_adjustment_status(zero_co.id,'approved',NULL,zero_co.updated_at);
 PERFORM public.sync_job_pay_application_change_orders(app);
 RESET ROLE;
 SELECT id INTO STRICT app_line FROM public.job_pay_application_change_orders WHERE pay_application_id=app AND change_order_id=zero_co.id;
 SET LOCAL ROLE authenticated;
 PERFORM public.save_job_pay_application_change_order(app_line,100,NULL,NULL);
 RESET ROLE;
 INSERT INTO adjustment_results VALUES('Zero CO billing',(SELECT final_current_amount FROM public.job_pay_application_change_orders WHERE id=app_line),0);
 SET LOCAL ROLE authenticated;
 revision:=public.revise_job_change_order(co.id,'Revise credit to 150');
 revision:=public.save_contract_adjustment(jsonb_build_object('id',revision.id,'job_id',j,'record_type','credit','co_number',revision.co_number,'title','Revised credit','expected_updated_at',revision.updated_at,'lines',
 jsonb_build_array(jsonb_build_object('job_budget_line_id',b,'description','Revised credit','material_amount',-150))));
 revision:=public.set_contract_adjustment_status(revision.id,'approved',NULL,revision.updated_at);
 INSERT INTO adjustment_results VALUES('Revision delta posting',(SELECT sum(amount_delta) FROM public.change_order_financial_postings WHERE change_order_id=revision.id),-40);
 INSERT INTO adjustment_results VALUES('Original Budget preserved',(SELECT budget_amount FROM public.job_budget_lines WHERE id=b),1000);
 PERFORM public.sync_job_pay_application_change_orders(app);
 RESET ROLE;
 INSERT INTO adjustment_results VALUES('Revised credit contract (no double counting)',(SELECT current_contract_value FROM public.job_pay_applications WHERE id=app),850);
 SET LOCAL ROLE authenticated;
 PERFORM public.void_approved_job_change_order(revision.id,'Rollback integration reversal',revision.co_number);
 INSERT INTO adjustment_results VALUES('Void reverses revision posting',(SELECT sum(amount_delta) FROM public.change_order_financial_postings WHERE change_order_id=revision.id),0);
 PERFORM public.sync_job_pay_application_change_orders(app);
 RESET ROLE;
 INSERT INTO adjustment_results VALUES('Voided revision removed from editable billing',(SELECT count(*) FROM public.job_pay_application_change_orders WHERE pay_application_id=app AND change_order_id=revision.id),0);
 INSERT INTO adjustment_results VALUES('Contract after revision void',(SELECT current_contract_value FROM public.job_pay_applications WHERE id=app),890);
END $test$;
RESET ROLE;
SELECT test,actual,expected,actual IS NOT DISTINCT FROM expected AS passed FROM adjustment_results ORDER BY test;
ROLLBACK;
