-- Release regression: synthetic authenticated approved estimate -> draft CO.
-- All fixtures, handoffs and audit entries are rolled back.
BEGIN;
SET LOCAL statement_timeout='25s';
SET LOCAL lock_timeout='3s';
CREATE TEMP TABLE decimal_smoke_result(result jsonb);
DO $$
DECLARE actor text; doc jsonb; w public.estimate_workbenches; j public.jobs;
 b uuid; h public.estimate_workflow_handoffs; again public.estimate_workflow_handoffs;
 snapshot_id uuid; snapshot_before jsonb; total numeric;
BEGIN
 SELECT clerk_user_id INTO STRICT actor FROM public.user_permissions
 WHERE lower(email)='crncmk@gmail.com' AND is_active;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 doc:='{"name":"ROLLBACK ONLY decimal submission","customer":"Release verification","rate":75,"materialMarkup":30,"feePercent":30,"entries":[{"id":"entry","number":1,"items":[{"id":"one","number":1,"name":"Leading decimals","qty":2,"lines":[{"qty":1,"price":".20","hours":".04"}]}]}],"finalizationChecklist":{"answers":{"available_fault_current":{"version":1,"status":"not_applicable"},"estimating_labor":{"version":1,"status":"excluded"},"supervision_labor":{"version":1,"status":"excluded"}}}}';
 SET LOCAL ROLE authenticated;
 j:=public.create_job('Electrical','DECIMAL-SMOKE-'||gen_random_uuid()::text,'ROLLBACK ONLY destination','on_hold',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'job',NULL,actor);
 w:=public.save_estimate_workbench(NULL,'Electrical',doc,NULL,'[]');
 snapshot_id:=public.approve_workbench_estimate(w.estimate_id,'Rollback-only decimal regression');
 SELECT to_jsonb(s),s.pricing_total INTO STRICT snapshot_before,total FROM public.estimate_snapshots s WHERE id=snapshot_id;
 RESET ROLE;
 INSERT INTO public.job_budget_lines(job_id,division,cost_code,description,category,created_by)
 VALUES(j.id,'Electrical','16.CO','Electrical Change Orders','other',actor) RETURNING id INTO b;
 SET LOCAL ROLE authenticated;
 h:=public.submit_estimate_for_review(w.estimate_id,w.revision,'change_order',j.id,NULL,NULL,jsonb_build_object('entry:one',b));
 again:=public.submit_estimate_for_review(w.estimate_id,w.revision,'change_order',j.id,NULL,NULL,jsonb_build_object('entry:one',b));
 ASSERT h.id=again.id,'Retry duplicated handoff';
 ASSERT total=8.48 AND (h.pricing->>'total')::numeric=total,'Approval/handoff pricing differs';
 ASSERT (SELECT sum(line_total)=total FROM public.change_order_lines WHERE change_order_id=h.change_order_id),'CO total differs';
 ASSERT (SELECT status='draft' AND approved_at IS NULL FROM public.change_orders WHERE id=h.change_order_id),'CO is not draft';
 ASSERT (SELECT to_jsonb(s)=snapshot_before FROM public.estimate_snapshots s WHERE id=snapshot_id),'Snapshot changed';
 ASSERT (SELECT budget_change_amount=0 FROM public.job_budget_lines WHERE id=b),'Draft posted a budget';
 RESET ROLE;
 INSERT INTO decimal_smoke_result VALUES(jsonb_build_object('pass',true,'total',total,'checks','authenticated approval then draft CO; exact decimals; unchanged snapshot; idempotent retry; no budget posting; all fixtures rolled back'));
END $$;
SELECT result FROM decimal_smoke_result;
ROLLBACK;
