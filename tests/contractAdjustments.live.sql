-- Staging only: all fixture records and audit entries roll back.
BEGIN;
INSERT INTO public.user_permissions(clerk_user_id,email,role,business_role,division,is_active) VALUES
 ('__co_state_director','co-director@example.invalid','Director','Director','Electrical',true),
 ('__co_state_manager','co-manager@example.invalid','Manager','Manager','Electrical',true),
 ('__co_state_supervisor','co-supervisor@example.invalid','Supervisor','Supervisor','Electrical',true),
 ('__co_state_user','co-user@example.invalid','User','User','Electrical',true);
SELECT set_config('request.jwt.claims','{"sub":"__co_state_director","role":"authenticated"}',true);
INSERT INTO public.jobs(name,division,status) VALUES('__co_state_rollback','Electrical','active');
SET LOCAL ROLE authenticated;
DO $test$
DECLARE j uuid; b uuid; co public.change_orders; zero_co public.change_orders; credit public.change_orders; r public.change_orders; payload jsonb;
 n integer; saved_original numeric; was_denied boolean; totals numeric;
BEGIN
 SELECT id INTO STRICT j FROM public.jobs WHERE name='__co_state_rollback';
 b:=(public.save_job_financial_batch(j,'[{"description":"Contract adjustment fixture","cost_code":"16.CO","budget_amount":1000}]','Isolated rollback-only verification')->0->>'id')::uuid;
 IF b IS NULL THEN RAISE EXCEPTION 'Fixture budget line missing'; END IF;
 SELECT budget_amount INTO saved_original FROM public.job_budget_lines WHERE id=b;
 PERFORM set_config('request.jwt.claims','{"sub":"__co_state_supervisor","role":"authenticated"}',true);
 co:=public.save_contract_adjustment(jsonb_build_object('job_id',j,'co_number','CO-001','lines','[]'::jsonb));
 IF co.price_amount IS NOT NULL OR co.title<>'' THEN RAISE EXCEPTION 'Incomplete draft coerced'; END IF;
 payload:=jsonb_build_object('id',co.id,'job_id',j,'expected_updated_at',co.updated_at,'co_number',co.co_number,'title','Mixed scope',
 'lines',jsonb_build_array(jsonb_build_object('job_budget_line_id',b,'description','Additions','material_amount',1000),
 jsonb_build_object('job_budget_line_id',b,'description','Credits','material_amount',-250)));
 co:=public.save_contract_adjustment(payload);
 IF co.price_amount<>750 THEN RAISE EXCEPTION 'Mixed signed value incorrect'; END IF;
 was_denied:=false;
 BEGIN PERFORM public.save_contract_adjustment(payload || jsonb_build_object('expected_updated_at',co.updated_at-interval '1 second','title','Stale overwrite'));
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT ILIKE '%changed%' AND SQLERRM NOT ILIKE '%reload%' THEN RAISE; END IF; was_denied:=true; END;
 IF NOT was_denied THEN RAISE EXCEPTION 'Stale save accepted'; END IF;
 was_denied:=false;
 BEGIN PERFORM public.approve_job_change_order(co.id,NULL); EXCEPTION WHEN insufficient_privilege THEN was_denied:=true; END;
 IF NOT was_denied THEN RAISE EXCEPTION 'Supervisor approved financial commitment'; END IF;
 co:=public.set_contract_adjustment_status(co.id,'submitted',NULL,co.updated_at);
 PERFORM set_config('request.jwt.claims','{"sub":"__co_state_user","role":"authenticated"}',true);
 IF EXISTS(SELECT 1 FROM public.change_order_lines WHERE change_order_id=co.id) THEN RAISE EXCEPTION 'Unassigned User read protected adjustment lines'; END IF;
 was_denied:=false;
 BEGIN PERFORM public.approve_job_change_order(co.id,NULL); EXCEPTION WHEN insufficient_privilege THEN was_denied:=true; END;
 IF NOT was_denied THEN RAISE EXCEPTION 'Ordinary User approved'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"__co_state_manager","role":"authenticated"}',true);
 co:=public.set_contract_adjustment_status(co.id,'approved','Verified test decision',co.updated_at);
 IF co.status<>'approved' OR co.signed_document_id IS NOT NULL THEN RAISE EXCEPTION 'Approval without signed doc failed'; END IF;
 PERFORM public.approve_job_change_order(co.id,NULL);
 SELECT count(*),sum(amount_delta) INTO n,totals FROM public.change_order_financial_postings WHERE change_order_id=co.id;
 IF n<>1 OR totals<>750 THEN RAISE EXCEPTION 'Posting duplicate or incorrect'; END IF;
 IF (SELECT budget_amount FROM public.job_budget_lines WHERE id=b) IS DISTINCT FROM saved_original THEN RAISE EXCEPTION 'Original Budget mutated'; END IF;
 credit:=public.save_contract_adjustment(jsonb_build_object('job_id',j,'record_type','credit','title','Independent credit','lines',
 jsonb_build_array(jsonb_build_object('job_budget_line_id',b,'description','Deduction','material_amount',-100))));
 IF credit.co_number<>'CR-001' THEN RAISE EXCEPTION 'Credit sequence not independent'; END IF;
 credit:=public.set_contract_adjustment_status(credit.id,'approved',NULL,credit.updated_at);
 zero_co:=public.save_contract_adjustment(jsonb_build_object('job_id',j,'title','No cost','lines',
 jsonb_build_array(jsonb_build_object('job_budget_line_id',b,'description','No cost','material_amount',0))));
 IF zero_co.co_number<>'CO-002' THEN RAISE EXCEPTION 'Credit consumed CO sequence'; END IF;
 zero_co:=public.set_contract_adjustment_status(zero_co.id,'approved',NULL,zero_co.updated_at);
 IF zero_co.price_amount<>0 THEN RAISE EXCEPTION 'Zero CO rejected'; END IF;
 IF (public.job_contract_closeout_counts(j)->>'missing_signed_documents')::int<>3 THEN RAISE EXCEPTION 'Missing signed docs not reported'; END IF;
 was_denied:=false;
 BEGIN UPDATE public.jobs SET status='complete' WHERE id=j; EXCEPTION WHEN OTHERS THEN
 IF SQLERRM NOT LIKE 'Job closeout requires%' THEN RAISE; END IF; was_denied:=true; END;
 IF NOT was_denied THEN RAISE EXCEPTION 'Incomplete closeout accepted'; END IF;
 r:=public.save_contract_adjustment(jsonb_build_object('job_id',j,'title','Potential','status','potential'));
 IF (public.job_contract_closeout_counts(j)->>'unresolved_adjustments')::int<>1 THEN RAISE EXCEPTION 'Potential not counted'; END IF;
 r:=public.set_contract_adjustment_status(r.id,'waived',NULL,r.updated_at);
 PERFORM public.archive_job_change_order(r.id,NULL);
END $test$;
RESET ROLE;
-- Audit storage is intentionally not directly readable by authenticated users.
DO $audit$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.change_logs l JOIN public.change_orders co ON l.record_id=co.id::text JOIN public.jobs j ON j.id=co.job_id
 WHERE j.name='__co_state_rollback' AND co.co_number='CO-001' AND l.user_id='__co_state_manager' AND l.note='Verified test decision') THEN
 RAISE EXCEPTION 'Decision audit missing'; END IF;
END $audit$;
-- A direct effective-permission deny must beat the otherwise eligible Manager role.
INSERT INTO public.user_permission_overrides(user_id,permission_flag,granted,granted_by_user_id,reason)
 VALUES('__co_state_manager','can_approve_change_orders',false,'__co_state_director','Rollback-only explicit-deny verification');
SELECT set_config('request.jwt.claims','{"sub":"__co_state_manager","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE j uuid; co public.change_orders; denied boolean:=false;
BEGIN
 SELECT id INTO j FROM public.jobs WHERE name='__co_state_rollback';
 co:=public.save_contract_adjustment(jsonb_build_object('job_id',j,'title','Denied permission check'));
 BEGIN PERFORM public.set_contract_adjustment_status(co.id,'denied',NULL,co.updated_at); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Explicit deny was bypassed'; END IF;
END $test$;
RESET ROLE;
SELECT jsonb_build_object(
 'new_rpc_anon_denied',NOT has_function_privilege('anon','public.save_contract_adjustment(jsonb)','EXECUTE'),
 'private_validator_auth_denied',NOT has_function_privilege('authenticated','public.validate_contract_adjustment(uuid)','EXECUTE'),
 'result','PASS: real Supervisor/Manager/User/explicit-deny gates, protected line exclusion, stale save rejection, incomplete drafts, mixed signs, zero, credits, idempotent posting, unchanged original, closeout, audit') result;
ROLLBACK;
