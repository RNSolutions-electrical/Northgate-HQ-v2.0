-- REVIEW CANDIDATE ONLY: requires separate release authorization. No data updates.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE signature regprocedure:='public.set_contract_adjustment_status(uuid,text,text,timestamptz)'::regprocedure;
BEGIN
 IF md5(pg_get_functiondef(signature))<>'089cea55b1f95d51a11c0f11f33d5105' THEN
  RAISE EXCEPTION 'Status RPC drifted from October 16 reviewed Production definition; stop and re-review';
 END IF;
 IF md5(pg_get_functiondef('public.current_user_can_read_project_change_order(uuid,uuid)'::regprocedure))<>'fa96d09a752f8dd18753b0151d3ea501' THEN
  RAISE EXCEPTION 'Financial-read helper drifted; stop and re-review';
 END IF;
 IF md5(pg_get_functiondef('public.current_scoped_authorization_decision(text,jsonb)'::regprocedure))<>'bc964e811ea657f661d2bc6780fefa8d' THEN
  RAISE EXCEPTION 'Canonical authorization evaluator drifted; stop and re-review';
 END IF;
 IF NOT has_function_privilege('authenticated',signature,'EXECUTE') OR has_function_privilege('anon',signature,'EXECUTE') THEN
  RAISE EXCEPTION 'Status RPC grants differ from reviewed baseline';
 END IF;
END $guard$;
-- Unapplied Production-based review candidate. Generate the release migration with
-- supabase migration new contract_adjustment_status_authorization after review.
-- Changes only this RPC; preserves existing signature, grants and financial writes.
CREATE OR REPLACE FUNCTION public.set_contract_adjustment_status(p_id uuid,p_status text,p_note text DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.change_orders; saved public.change_orders; actor text:=auth.jwt()->>'sub'; action_id text; required_permission text; decision jsonb;
BEGIN
 PERFORM 1 FROM public.jobs WHERE id=(SELECT job_id FROM public.change_orders WHERE id=p_id) FOR UPDATE;
 SELECT * INTO prior FROM public.change_orders WHERE id=p_id AND archived_at IS NULL FOR UPDATE;
 IF prior.id IS NULL OR public.current_user_can_access_job(prior.job_id) IS NOT TRUE THEN RAISE EXCEPTION 'Adjustment access required' USING ERRCODE='42501'; END IF;
 -- A definer return must obey the same financial visibility as table SELECT.
 IF public.current_user_can_read_project_change_order(prior.job_id,prior.id) IS NOT TRUE THEN
   RAISE EXCEPTION 'Adjustment financial read access required' USING ERRCODE='42501';
 END IF;
 IF p_status IS NULL OR (p_status NOT IN ('draft','potential','submitted','approved','denied','waived')
   AND NOT (p_status=prior.status AND p_status IN ('proposed','rejected','voided'))) THEN
   RAISE EXCEPTION 'Unsupported adjustment status';
 END IF;
 required_permission:=CASE p_status WHEN 'approved' THEN 'can_approve_change_orders'
   WHEN 'denied' THEN 'can_approve_change_orders' WHEN 'waived' THEN 'can_approve_change_orders'
   WHEN 'rejected' THEN 'can_approve_change_orders' WHEN 'voided' THEN 'can_revise_change_orders'
   WHEN 'submitted' THEN 'can_submit_change_orders' ELSE 'can_create_change_orders' END;
 IF public.current_user_can_edit_job(prior.job_id,required_permission) IS NOT TRUE THEN
   RAISE EXCEPTION 'Adjustment action authority required' USING ERRCODE='42501';
 END IF;
 IF p_status IN ('draft','potential') AND prior.status IN ('denied','waived','rejected')
   AND public.current_user_can_edit_job(prior.job_id,'can_approve_change_orders') IS NOT TRUE THEN
   RAISE EXCEPTION 'Manager authority required to reopen a final decision' USING ERRCODE='42501';
 END IF;
 -- Match enforce_v5_change_order_action; no-op retries do not fire its trigger.
 action_id:=CASE p_status WHEN 'approved' THEN 'CFG-009' WHEN 'submitted' THEN 'CFG-007'
   WHEN 'denied' THEN 'V3-001' WHEN 'waived' THEN 'V3-001'
   WHEN 'rejected' THEN 'V3-001' WHEN 'voided' THEN 'V3-005'
   ELSE CASE WHEN prior.status IN ('denied','waived','rejected') THEN 'V3-001' ELSE 'AUD-021' END END;
 decision:=public.current_scoped_authorization_decision(action_id,jsonb_build_object('job_id',prior.job_id));
 IF COALESCE((decision->>'allowed')::boolean,false) IS NOT TRUE THEN
   RAISE EXCEPTION 'This contract-adjustment action is not authorized' USING ERRCODE='42501',DETAIL=decision::text;
 END IF;
 IF p_expected_updated_at IS NOT NULL AND prior.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'Another user changed this adjustment. Refresh before continuing.' USING ERRCODE='40001'; END IF;
 -- Authorized retries preserve the row, postings, timestamps and audit history.
 IF p_status=prior.status THEN RETURN prior; END IF;
 IF p_status='approved' THEN RETURN public.approve_job_change_order(p_id,p_note); END IF;
 IF p_status='submitted' THEN RETURN public.submit_job_change_order(p_id,p_note); END IF;
 IF prior.status IN ('approved','voided') OR EXISTS(SELECT 1 FROM public.change_order_financial_postings WHERE change_order_id=p_id) THEN
   RAISE EXCEPTION 'Posted adjustments require a controlled revision or reversal';
 END IF;
 UPDATE public.change_orders SET status=p_status,updated_by=actor,updated_at=now(),
   denied_at=CASE WHEN p_status='denied' THEN now() ELSE denied_at END,
   denied_by=CASE WHEN p_status='denied' THEN actor ELSE denied_by END,
   denial_reason=CASE WHEN p_status='denied' THEN p_note ELSE denial_reason END,
   decision_name=CASE WHEN p_status IN ('denied','waived') THEN public.change_order_actor() ELSE decision_name END
 WHERE id=p_id RETURNING * INTO saved;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,public.change_order_actor(),'change_orders',p_id::text,'update',to_jsonb(prior),to_jsonb(saved),COALESCE(NULLIF(trim(p_note),''),'Status set to '||p_status||'. No financial posting.'));
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.set_contract_adjustment_status(uuid,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_contract_adjustment_status(uuid,text,text,timestamptz) TO authenticated;

-- Capture this fingerprint and full pg_get_functiondef output in release evidence.
SELECT md5(pg_get_functiondef('public.set_contract_adjustment_status(uuid,text,text,timestamptz)'::regprocedure)) AS deployed_definition_md5;
