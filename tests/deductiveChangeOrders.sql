-- Run only inside BEGIN/ROLLBACK. All users, documents, jobs and bills are fixtures.
INSERT INTO public.user_permissions(clerk_user_id,email,role,division,is_active)
VALUES ('__deductive_test','deductive@example.invalid','Developer','Admin',true),
('__deductive_denied','deductive-denied@example.invalid','User','Electrical',true);
SELECT set_config('request.jwt.claims','{"sub":"__deductive_test","role":"authenticated"}',true);
INSERT INTO public.jobs(name,division,status) VALUES ('__deductive_rollback_test','Admin','active');
INSERT INTO public.job_pay_applications(job_id,pay_app_number,original_contract_value,created_by)
  SELECT id,1,1000,'__deductive_test' FROM public.jobs WHERE name='__deductive_rollback_test';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE j uuid; b uuid; co public.change_orders; revision public.change_orders; doc uuid;
  revenue uuid; app uuid; app_line uuid; failed boolean;
BEGIN
  SELECT id INTO STRICT j FROM public.jobs WHERE name='__deductive_rollback_test';
  b := (public.save_job_financial_batch(j,'[{"description":"Lighting","budget_amount":1000}]',NULL)->0->>'id')::uuid;
  co := public.save_job_change_order_draft(NULL,j,'Admin','CREDIT-1','Deleted fixtures',NULL,CURRENT_DATE,NULL,
    jsonb_build_array(jsonb_build_object('job_budget_line_id',b,'description','Deleted fixtures','material_amount',-100,'markup_amount',-10)),NULL);
  IF co.price_amount<>-110 OR co.cost_amount<>-100 THEN RAISE EXCEPTION 'Signed price/cost not retained'; END IF;
  -- Saving and reloading mixed-sign amounts must not clamp the credit.
  co := public.save_job_change_order_draft(co.id,j,'Admin','CREDIT-1','Deleted fixtures',NULL,CURRENT_DATE,NULL,
    jsonb_build_array(jsonb_build_object('job_budget_line_id',b,'description','Deleted fixtures','material_amount',-120,'labor_amount',20,'markup_amount',-10)),NULL);
  IF co.price_amount<>-110 OR co.cost_amount<>-100 THEN RAISE EXCEPTION 'Mixed-sign amounts wrong'; END IF;
  BEGIN
    PERFORM public.save_job_change_order_draft(co.id,j,'Admin','CREDIT-1','Deleted fixtures',NULL,CURRENT_DATE,NULL,
      jsonb_build_array(jsonb_build_object('job_budget_line_id',b,'description','Invalid','material_amount','NaN')),NULL);
    RAISE EXCEPTION 'NaN was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF (SELECT price_amount FROM public.change_orders WHERE id=co.id)<>-110 THEN RAISE EXCEPTION 'Failed save changed draft'; END IF;
  co := public.submit_job_change_order(co.id,NULL);
  IF co.status<>'submitted' THEN RAISE EXCEPTION 'Negative submission failed'; END IF;
  failed := false;
  BEGIN PERFORM public.approve_job_change_order(co.id,NULL,'Tester',true);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%signed document and employee certification%' THEN RAISE; END IF;
    failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Missing signed authorization accepted'; END IF;
  INSERT INTO public.documents(division,owner_type,owner_id,change_order_id,document_type,storage_path,file_name)
  VALUES ('Admin','job',j,co.id,'change_orders','__deductive_fixture/signed.pdf','signed.pdf') RETURNING id INTO doc;
  PERFORM public.attach_signed_job_change_order_document(co.id,doc,'Tester',true);
  co := public.approve_job_change_order(co.id,NULL,'Tester',true);
  PERFORM public.approve_job_change_order(co.id,NULL,'Tester',true);
  IF (SELECT count(*) FROM public.change_order_financial_postings WHERE change_order_id=co.id)<>1
    OR (SELECT sum(amount_delta) FROM public.change_order_financial_postings WHERE change_order_id=co.id)<>-110
    THEN RAISE EXCEPTION 'Approval credit posting incorrect or duplicated'; END IF;
  INSERT INTO public.job_revenue_lines(job_id,division,description,scheduled_value_amount)
    VALUES (j,'Admin','Lighting',1000) RETURNING id INTO revenue;
  PERFORM public.save_change_order_sov_allocations(co.id,
    jsonb_build_array(jsonb_build_object('revenue_line_id',revenue,'amount',-110)),'Client credit allocation');
  IF (SELECT scheduled_value_amount+approved_change_amount FROM public.job_revenue_lines WHERE id=revenue)<>890
    THEN RAISE EXCEPTION 'SOV did not decrease'; END IF;
  BEGIN
    PERFORM public.save_change_order_sov_allocations(co.id,
      jsonb_build_array(jsonb_build_object('revenue_line_id',revenue,'amount',-110)),'Duplicate');
    RAISE EXCEPTION 'Duplicate SOV allocation accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  -- Billing tables are RPC-only. Use owner reads solely for fixture assertions.
  RESET ROLE;
  SELECT id INTO STRICT app FROM public.job_pay_applications WHERE job_id=j;
  SET LOCAL ROLE authenticated;
  PERFORM public.sync_job_pay_application_change_orders(app);
  RESET ROLE;
  SELECT id INTO STRICT app_line FROM public.job_pay_application_change_orders WHERE pay_application_id=app AND change_order_id=co.id;
  SET LOCAL ROLE authenticated;
  PERFORM public.save_job_pay_application_change_order(app_line,100,NULL,NULL);
  RESET ROLE;
  IF (SELECT final_current_amount FROM public.job_pay_application_change_orders WHERE id=app_line)<>-110
    OR (SELECT current_contract_value FROM public.job_pay_applications WHERE id=app)<>890
    THEN RAISE EXCEPTION 'Pay App lost credit'; END IF;
  SET LOCAL ROLE authenticated;
  revision := public.revise_job_change_order(co.id,'Increase credit');
  revision := public.save_job_change_order_draft(revision.id,j,'Admin',revision.co_number,'Larger credit',NULL,CURRENT_DATE,NULL,
    jsonb_build_array(jsonb_build_object('job_budget_line_id',b,'description','Deleted fixtures','material_amount',-140,'markup_amount',-10)),NULL);
  PERFORM public.submit_job_change_order(revision.id,NULL);
  INSERT INTO public.documents(division,owner_type,owner_id,change_order_id,document_type,storage_path,file_name)
    VALUES ('Admin','job',j,revision.id,'change_orders','__deductive_fixture/revised.pdf','revised.pdf') RETURNING id INTO doc;
  PERFORM public.attach_signed_job_change_order_document(revision.id,doc,'Tester',true);
  PERFORM public.approve_job_change_order(revision.id,NULL,'Tester',true);
  IF (SELECT sum(amount_delta) FROM public.change_order_financial_postings WHERE change_order_id=revision.id)<>-40
    THEN RAISE EXCEPTION 'Revision delta wrong'; END IF;
  PERFORM public.void_approved_job_change_order(revision.id,'Cancel revision',revision.co_number);
  IF (SELECT sum(amount_delta) FROM public.change_order_financial_postings WHERE change_order_id=revision.id)<>0
    THEN RAISE EXCEPTION 'Void did not reverse deduction'; END IF;
  -- Positive CO and zero-total submission guards remain unchanged.
  co := public.save_job_change_order_draft(NULL,j,'Admin','POSITIVE-1','Added fixtures',NULL,CURRENT_DATE,NULL,
    jsonb_build_array(jsonb_build_object('job_budget_line_id',b,'description','Added fixtures','material_amount',100,'markup_amount',10)),NULL);
  co := public.submit_job_change_order(co.id,NULL);
  IF co.price_amount<>110 OR co.cost_amount<>100 THEN RAISE EXCEPTION 'Positive regression'; END IF;
  co := public.save_job_change_order_draft(NULL,j,'Admin','ZERO-1','Zero',NULL,CURRENT_DATE,NULL,
    jsonb_build_array(jsonb_build_object('job_budget_line_id',b,'description','Zero','material_amount',-100,'labor_amount',100)),NULL);
  failed := false;
  BEGIN PERFORM public.submit_job_change_order(co.id,NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%nonzero total%' THEN RAISE; END IF;
    failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Zero total accepted'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"__deductive_denied","role":"authenticated"}',true);
  BEGIN
    PERFORM public.save_job_change_order_draft(NULL,j,'Admin','DENIED','No permission',NULL,CURRENT_DATE,NULL,'[]',NULL);
    RAISE EXCEPTION 'Unauthorized creation accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
DO $audit$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.change_logs WHERE user_id='__deductive_test'
    AND table_name='change_orders' AND (after_data->>'price_amount')::numeric=-110)
    THEN RAISE EXCEPTION 'Credit audit missing'; END IF;
END $audit$;
SELECT 'PASS: deductive/mixed draft, nonfinite rollback, submission, signed approval, idempotent credit posting, SOV, billing, revision delta, void, positive/zero guards, unauthorized rejection and audit' AS result;
