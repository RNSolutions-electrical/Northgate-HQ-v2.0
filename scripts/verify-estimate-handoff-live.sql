-- Authorized release smoke. All synthetic rows and audit entries are rolled back.
-- Run as the administrative SQL connection; workflow calls switch to authenticated.
BEGIN;
SET LOCAL statement_timeout='25s';
SET LOCAL lock_timeout='3s';
CREATE TEMP TABLE handoff_smoke_result(result jsonb);
DO $$
DECLARE actor text; doc jsonb; w public.estimate_workbenches; w2 public.estimate_workbenches;
 j public.jobs; b uuid; h public.estimate_workflow_handoffs; again public.estimate_workflow_handoffs;
 job_h public.estimate_workflow_handoffs; call_h public.estimate_workflow_handoffs;
 n text:='HANDOFF-SMOKE-'||gen_random_uuid()::text; amount numeric; blocked boolean;
BEGIN
 SELECT clerk_user_id INTO STRICT actor FROM public.user_permissions WHERE lower(email)='crncmk@gmail.com' AND is_active;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 doc:='{"name":"ROLLBACK ONLY estimate handoff smoke","customer":"Release verification","rate":75,"materialMarkup":30,"feePercent":30,"proposal":{"scope":"Synthetic lighting scope"},"entries":[{"id":"entry","number":1,"items":[{"id":"one","number":1,"name":"Install light","qty":2,"lines":[{"qty":1,"price":10.05,"hours":0.15}]},{"id":"two","number":2,"name":"Labor","qty":1,"lines":[{"qty":1,"price":0,"hours":0.1}]}]}]}';
 SET LOCAL ROLE authenticated;
 j:=public.create_job('Electrical',n,'ROLLBACK ONLY destination','on_hold',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'job',NULL,actor);
 w:=public.save_estimate_workbench(NULL,'Electrical',doc,NULL,'[]');
 RESET ROLE;
 -- Fixture setup only; all workflow invocation below uses the real authenticated role.
 INSERT INTO public.job_budget_lines(job_id,division,cost_code,description,category,created_by)
 VALUES(j.id,'Electrical','16.CO','Electrical Change Orders','other',actor) RETURNING id INTO b;
 SET LOCAL ROLE authenticated;
 blocked:=false;
 BEGIN
  PERFORM public.submit_estimate_for_review(w.estimate_id,0,'change_order',j.id,NULL,NULL,jsonb_build_object('entry:one',b,'entry:two',b));
 EXCEPTION WHEN serialization_failure THEN blocked:=true; END;
 ASSERT blocked,'Stale revision was accepted';
 h:=public.submit_estimate_for_review(w.estimate_id,w.revision,'change_order',j.id,NULL,NULL,jsonb_build_object('entry:one',b,'entry:two',b));
 again:=public.submit_estimate_for_review(w.estimate_id,w.revision,'change_order',j.id,NULL,NULL,jsonb_build_object('entry:one',b,'entry:two',b));
 ASSERT h.id=again.id,'Retry created another handoff';
 ASSERT EXISTS(SELECT 1 FROM public.change_orders WHERE id=h.change_order_id AND status='draft' AND approved_at IS NULL AND submitted_at IS NULL),'Not a normal draft CO';
 SELECT sum(line_total) INTO amount FROM public.change_order_lines WHERE change_order_id=h.change_order_id;
 ASSERT amount=(h.pricing->>'total')::numeric,'Line totals do not reconcile';
 ASSERT amount=72.97,'Unexpected material/labor/fee result';
 ASSERT (SELECT budget_change_amount=0 FROM public.job_budget_lines WHERE id=b),'Draft posted to budget';
 ASSERT (SELECT count(*)=1 FROM public.estimate_workflow_handoffs WHERE id=h.id),'Authenticated source read failed';
 w2:=public.save_estimate_workbench(NULL,'Electrical',doc,NULL,'[]');
 job_h:=public.submit_estimate_for_review(w2.estimate_id,w2.revision,'job',NULL,jsonb_build_object('number',n||'-JOB','name','ROLLBACK ONLY new job'),NULL,'{}');
 ASSERT (SELECT status='on_hold' FROM public.jobs WHERE id=job_h.job_id),'New job review state';
 w2:=public.save_estimate_workbench(NULL,'Electrical',doc,NULL,'[]');
 call_h:=public.submit_estimate_for_review(w2.estimate_id,w2.revision,'service_call',NULL,jsonb_build_object('number',n||'-CALL','name','ROLLBACK ONLY new call'),NULL,'{}');
 RESET ROLE;
 ASSERT (SELECT work_stage='pursuit' AND quote_amount IS NULL FROM public.svc_service_profiles WHERE job_id=call_h.job_id),'New service call state or automatic quote write';
 ASSERT NOT EXISTS(SELECT 1 FROM public.svc_invoices WHERE job_id=call_h.job_id),'Unexpected invoice';
 SET LOCAL ROLE authenticated;
 w2:=public.save_estimate_workbench(NULL,'Electrical',doc,NULL,'[]');
 again:=public.submit_estimate_for_review(w2.estimate_id,w2.revision,'job',j.id,NULL,NULL,'{}');
 ASSERT again.job_id=j.id,'Existing job attachment';
 w2:=public.save_estimate_workbench(NULL,'Electrical',doc,NULL,'[]');
 again:=public.submit_estimate_for_review(w2.estimate_id,w2.revision,'service_call',call_h.job_id,NULL,NULL,'{}');
 ASSERT again.job_id=call_h.job_id,'Existing call attachment';
 RESET ROLE;
 blocked:=false;
 BEGIN UPDATE public.estimate_workflow_handoffs SET source_revision=999 WHERE id=h.id;
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 ASSERT blocked,'Snapshot was mutable';
 ASSERT NOT has_table_privilege('authenticated','public.estimate_workflow_handoffs','INSERT'),'Direct insert exposed';
 ASSERT NOT has_function_privilege('anon','public.submit_estimate_for_review(uuid,integer,text,uuid,jsonb,text,jsonb)','EXECUTE'),'Anonymous RPC exposed';
 PERFORM set_config('request.jwt.claims','{"sub":"handoff-unauthorized-fixture","role":"authenticated"}',true);
 SET LOCAL ROLE authenticated;
 ASSERT NOT EXISTS(SELECT 1 FROM public.estimate_workflow_handoffs),'Unauthorized source read';
 blocked:=false;
 BEGIN PERFORM public.submit_estimate_for_review(w.estimate_id,w.revision,'job',j.id,NULL,NULL,'{}');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 ASSERT blocked,'Unauthorized handoff';
 RESET ROLE;
 INSERT INTO handoff_smoke_result VALUES(jsonb_build_object('pass',true,'total',amount,'checks',
 'authenticated estimate save; CO draft and retry; stale rejection; new/existing job and service call; no budget/invoice/quote posting; exact cents; immutable source; unauthorized denial/RLS; all test data rolled back'));
END $$;
SELECT result FROM handoff_smoke_result;
ROLLBACK;
