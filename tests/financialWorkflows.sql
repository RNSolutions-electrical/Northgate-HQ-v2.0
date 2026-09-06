-- Run together with the migration in BEGIN/ROLLBACK for preflight, or alone in
-- BEGIN/ROLLBACK after deployment. No fixtures or financial changes are retained.
INSERT INTO public.user_permissions(clerk_user_id, email, role, division, is_active)
VALUES ('__financial_workflow_test','workflow-test@example.invalid','Developer','Admin',true),
  ('__financial_workflow_denied','workflow-denied@example.invalid','User','Electrical',true);
SELECT set_config('request.jwt.claims','{"sub":"__financial_workflow_test","role":"authenticated"}',true);
INSERT INTO public.jobs(name,division,status) VALUES ('__workflow_rollback_test','Admin','active');
INSERT INTO public.job_budget_divisions(job_id,code,name)
SELECT id,'99','Test division' FROM public.jobs WHERE name='__workflow_rollback_test';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  j uuid;
  d uuid;
  line jsonb;
  line2 jsonb;
  result jsonb;
  logs_before bigint;
  co public.change_orders;
  v uuid;
  assignment_id bigint;
BEGIN
  SELECT id INTO STRICT j FROM public.jobs WHERE name='__workflow_rollback_test';
  SELECT id INTO STRICT d FROM public.job_budget_divisions WHERE job_id=j AND code='99';
  result := public.save_job_financial_batch(j,jsonb_build_array(
    jsonb_build_object('description','Test line','project_division_id',d,'budget_amount',100),
    jsonb_build_object('description','Second line','project_division_id',d,'budget_amount',200)),NULL);
  line := result->0; line2 := result->1;
  IF (line->>'forecast_final_amount')::numeric <> 100 THEN RAISE EXCEPTION 'Initial forecast default wrong'; END IF;
  result := public.save_job_financial_batch(j,jsonb_build_array(
    jsonb_build_object('id',line->>'id','forecast_final_amount',120,'current_budget_override_amount',0)),NULL);
  IF (result->0->>'current_budget_override_amount')::numeric <> 0 THEN RAISE EXCEPTION 'Zero override lost'; END IF;
  IF (result->0->>'budget_amount')::numeric <> 100 THEN RAISE EXCEPTION 'Override changed original'; END IF;
  BEGIN
    PERFORM public.save_job_financial_batch(j,jsonb_build_array(jsonb_build_object('id',line->>'id','budget_amount',300)),NULL);
    RAISE EXCEPTION 'Missing reason accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    UPDATE public.job_budget_lines SET budget_amount=999 WHERE id=(line->>'id')::uuid;
    RAISE EXCEPTION 'Direct original change accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    UPDATE public.job_budget_lines SET current_budget_override_amount=999 WHERE id=(line->>'id')::uuid;
    RAISE EXCEPTION 'Direct override accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  result := public.save_job_financial_batch(j,jsonb_build_array(
    jsonb_build_object('id',line->>'id','budget_amount',150,'reason','Line justification'),
    jsonb_build_object('id',line2->>'id','budget_amount',250)), 'Batch justification');

  IF COALESCE(current_setting('northgate.financial_reason',true),'') <> '' THEN RAISE EXCEPTION 'Reason leaked past batch'; END IF;
  PERFORM public.save_job_financial_batch(j,jsonb_build_array(
    jsonb_build_object('id',line->>'id','budget_amount',150,'reason','One line'),
    jsonb_build_object('id',line2->>'id','budget_amount',250,'reason','Another line')),NULL);
  BEGIN
    PERFORM public.save_job_financial_batch(j,jsonb_build_array(
      jsonb_build_object('id',line->>'id','budget_amount',151,'reason','First only'),
      jsonb_build_object('id',line2->>'id','budget_amount',251)),NULL);
    RAISE EXCEPTION 'Partial reason coverage accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  IF (SELECT budget_amount FROM public.job_budget_lines WHERE id=(line->>'id')::uuid) <> 150 THEN RAISE EXCEPTION 'Partial batch saved'; END IF;
  result := public.save_job_financial_batch(j,jsonb_build_array(
    jsonb_build_object('id',line->>'id','current_budget_override_amount',NULL,'actual_cost_amount',75,
      'source',jsonb_build_object('file_name','test-report.pdf'))),NULL);
  IF result->0->>'current_budget_override_amount' IS NOT NULL THEN RAISE EXCEPTION 'Reset failed'; END IF;
  BEGIN
    PERFORM public.save_job_financial_batch(j,jsonb_build_array(
      jsonb_build_object('id',line->>'id','expected_updated_at','2000-01-01','actual_cost_amount',80)),NULL);
    RAISE EXCEPTION 'Stale write accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
  BEGIN
    PERFORM public.save_job_financial_batch(j,jsonb_build_array(
      jsonb_build_object('id',line->>'id','current_budget_override_amount',-1)),NULL);
    RAISE EXCEPTION 'Negative override accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  -- Existing clients cannot erase the separately stored manual override.
  PERFORM public.save_job_financial_batch(j,jsonb_build_array(jsonb_build_object('id',line->>'id','current_budget_override_amount',175)),NULL);
  PERFORM public.save_job_financial_line(j,(line->>'id')::uuid,d,'other',false,NULL,'Test line',150,0,75,0,50,120,0,NULL,NULL);
  IF (SELECT current_budget_override_amount FROM public.job_budget_lines WHERE id=(line->>'id')::uuid) <> 175 THEN RAISE EXCEPTION 'Legacy save erased override'; END IF;
  -- Routine contact, fleet creation and draft CO preserve audit without reasons.
  PERFORM public.update_current_employee_profile('Workflow test',NULL,NULL);
  v := public.create_vehicle('__workflow_test',NULL,'Other',NULL,false,NULL);
  assignment_id := public.assign_vehicle_to_user(v,'__financial_workflow_denied',NULL);
  PERFORM public.release_vehicle_assignment(assignment_id,NULL);

  co := public.save_job_change_order_draft(NULL,j,'Admin','TEST-1','Test CO',NULL,CURRENT_DATE,NULL,'[]',NULL);
  IF co.id IS NULL OR v IS NULL THEN RAISE EXCEPTION 'Routine create failed'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"__financial_workflow_denied","role":"authenticated"}',true);
  BEGIN
    PERFORM public.save_job_financial_batch(j,jsonb_build_array(jsonb_build_object('id',line->>'id','actual_cost_amount',1)),NULL);
    RAISE EXCEPTION 'Unauthorized write accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  -- No-auth requests cannot use privileged financial writes.
  PERFORM set_config('request.jwt.claims','{}',true);
  BEGIN
    PERFORM public.save_job_financial_batch(j,jsonb_build_array(jsonb_build_object('id',line->>'id','actual_cost_amount',1)),NULL);
    RAISE EXCEPTION 'Unauthenticated write accepted';
  EXCEPTION WHEN SQLSTATE '28000' THEN NULL; END;
END;
$test$;


RESET ROLE;
DO $audit$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.change_logs WHERE user_id='__financial_workflow_test'
    AND after_data->'_audit'->>'line_reason'='Line justification'
    AND after_data->'_audit'->>'batch_reason'='Batch justification'
    AND user_id='__financial_workflow_test' AND created_at IS NOT NULL
    AND before_data->>'budget_amount'='100') THEN RAISE EXCEPTION 'Reason or audit context lost'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.change_logs WHERE table_name='vehicle_assignments'
    AND action='update' AND user_id='__financial_workflow_test')
    THEN RAISE EXCEPTION 'Routine vehicle release audit missing'; END IF;
END;
$audit$;
