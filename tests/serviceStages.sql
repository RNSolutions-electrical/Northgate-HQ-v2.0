-- Rollback-only stage catalogue and no-charge closeout integration tests.
BEGIN;
INSERT INTO public.user_permissions(clerk_user_id,email,display_name,role,division,is_active,permission_overrides)
VALUES('__svc_stage_dev','stage-dev@example.invalid','Stage Developer','Developer','Admin',true,'{}'),
('__svc_stage_user','stage-user@example.invalid','Stage User','User','Electrical',true,'{}');
SELECT set_config('request.jwt.claims','{"sub":"__svc_stage_dev","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE stage_key text; a uuid; b uuid; invoice_id uuid; req uuid; ts timestamptz; row jsonb; data jsonb; inv jsonb; k text;
BEGIN
 IF jsonb_array_length(public.svc_read_stages())<>12 THEN RAISE EXCEPTION 'Default stages missing'; END IF;
 stage_key:=public.svc_save_stage(NULL,'Awaiting permit','#123456','Stage fixture',NULL);
 SELECT value INTO row FROM jsonb_array_elements(public.svc_read_stages()) WHERE value->>'key'=stage_key;
 PERFORM public.svc_save_stage(stage_key,'Awaiting permit','#234567','Color fixture',(row->>'updated_at')::timestamptz);
 BEGIN
  PERFORM public.svc_save_stage(stage_key,'Stale edit','#345678','Stale fixture',(row->>'updated_at')::timestamptz);
  RAISE EXCEPTION 'Stale stage accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.svc_save_stage(NULL,'Awaiting permit','#123456','Duplicate fixture',NULL);
  RAISE EXCEPTION 'Duplicate label accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM public.svc_save_stage(NULL,'Bad color','red;url(x)','Invalid fixture',NULL);
  RAISE EXCEPTION 'Unsafe color accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{"sub":"__svc_stage_user","role":"authenticated"}',true);
 IF jsonb_array_length(public.svc_read_stages())<>13 THEN RAISE EXCEPTION 'Active user cannot read shared stages'; END IF;
 BEGIN
  PERFORM public.svc_save_stage(NULL,'Forbidden','#FFFFFF','Unauthorized fixture',NULL);
  RAISE EXCEPTION 'User created a stage';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{"sub":"__svc_stage_dev","role":"authenticated"}',true);
 data:=jsonb_build_object('service_call_number','__STAGE_CUSTOM','name','Custom stage test','division','Electrical','work_stage',stage_key,'billing_method','time_and_materials');
 a:=public.svc_save_call(NULL,data,NULL);
 IF (SELECT status FROM public.jobs WHERE id=a)<>'active' THEN RAISE EXCEPTION 'Custom stage lost active status'; END IF;
 BEGIN
  PERFORM public.svc_save_call(NULL,data||'{"service_call_number":"__STAGE_BAD","work_stage":"invoice_sent"}',NULL);
  RAISE EXCEPTION 'Derived stage selectable';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 FOREACH k IN ARRAY ARRAY['warranty','pro_bono','complete'] LOOP
  b:=public.svc_save_call(NULL,data||jsonb_build_object('service_call_number','__STAGE_'||k,'work_stage',k),NULL);
  SELECT updated_at INTO ts FROM public.jobs WHERE id=b;
  req:=gen_random_uuid();
  inv:=jsonb_build_object('invoice_number','__ZERO_'||k,'invoice_date','2026-09-14','total_revenue',0,'sales_tax',0,'sales_tax_percent',7.25,'credit_card_percent',3,'credit_card_fee',0,'certify_complete',true,
   'allocations',jsonb_build_array(jsonb_build_object('job_id',b,'amount',0,'expected_updated_at',ts)));
  IF k='complete' THEN
   BEGIN
    PERFORM public.svc_post_invoice(req,inv);
    RAISE EXCEPTION 'Ordinary call accepted zero invoice';
   EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  ELSE
   BEGIN
    PERFORM public.svc_post_invoice(req,inv||'{"certify_complete":false}');
    RAISE EXCEPTION 'Uncertified closeout accepted';
   EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
   PERFORM public.svc_post_invoice(req,inv);
   PERFORM public.svc_post_invoice(req,inv);
   SELECT value INTO row FROM jsonb_array_elements(public.svc_read_calls()) WHERE value->>'id'=b::text;
   IF row->>'status'<>'complete' OR row#>>'{profile,financially_closed_at}' IS NULL OR jsonb_array_length(row#>'{financials,invoices}')<>1 THEN RAISE EXCEPTION 'No-charge closeout incomplete or duplicated'; END IF;
   invoice_id:=(row#>>'{financials,invoices,0,id}')::uuid;
   IF row#>>'{financials,invoices,0,is_no_charge_closeout}'<>'true' OR jsonb_array_length(row#>'{financials,invoices,0,payments}')<>0 THEN RAISE EXCEPTION 'Closeout fabricated payment'; END IF;
   IF (SELECT outstanding FROM public.svc_call_financials WHERE job_id=b)<>0 THEN RAISE EXCEPTION 'No-charge balance nonzero'; END IF;
   BEGIN
    PERFORM public.svc_post_invoice(gen_random_uuid(),inv||jsonb_build_object('invoice_number','__DUP_'||k));
    RAISE EXCEPTION 'Second closeout accepted';
   EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
   -- Editing non-stage details must preserve completion.
   PERFORM public.svc_save_call(b,data||jsonb_build_object('service_call_number','__STAGE_'||k,'work_stage',k),(row->>'updated_at')::timestamptz);
   IF (SELECT status FROM public.jobs WHERE id=b)<>'complete' THEN RAISE EXCEPTION 'Detail edit reopened closeout'; END IF;
   SELECT updated_at INTO ts FROM public.jobs WHERE id=b;
   PERFORM public.svc_void_billing(b,'invoice',invoice_id,'Accidental closeout',ts);
   SELECT value INTO row FROM jsonb_array_elements(public.svc_read_calls()) WHERE value->>'id'=b::text;
   IF row->>'status'<>'active' OR row#>>'{profile,financially_closed_at}' IS NOT NULL THEN RAISE EXCEPTION 'Void did not reopen no-charge call'; END IF;
  END IF;
 END LOOP;
END; $test$;
RESET ROLE;
DO $security$
BEGIN
 IF has_function_privilege('anon','public.svc_save_stage(text,text,text,text,timestamptz)','EXECUTE')
 OR has_function_privilege('anon','public.svc_read_stages()','EXECUTE')
 OR has_table_privilege('authenticated','public.svc_stage_definitions','UPDATE') THEN RAISE EXCEPTION 'Unsafe stage grants'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.change_logs WHERE table_name='svc_stage_definitions' AND user_name='Stage Developer') THEN RAISE EXCEPTION 'Missing stage audit'; END IF;
END; $security$;
ROLLBACK;
