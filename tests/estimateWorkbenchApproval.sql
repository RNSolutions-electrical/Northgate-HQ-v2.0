-- Execute in a transaction after 20260914103331_estimate_workbench_approval.
-- Creates only rollback-only validation records.
INSERT INTO public.user_permissions(clerk_user_id,email,role,division,is_active,permission_overrides)
VALUES
 ('__workbench_approval_test','workbench-approval@example.invalid','Developer','Admin',true,'{}'),
 ('__workbench_approval_denied','workbench-approval-denied@example.invalid','User','Electrical',true,'{"can_estimate":true,"can_approve_estimates":false}');

SELECT set_config('request.jwt.claims','{"sub":"__workbench_approval_test","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE saved public.estimate_workbenches; snapshot_id uuid; snapshot public.estimate_snapshots; document jsonb;
BEGIN
  document:=jsonb_build_object(
    'name','Workbench approval validation','customer','Validation customer','rate',100,
    'materialMarkup',10,'feePercent',20,'entries',jsonb_build_array(
      jsonb_build_object('number',1,'location','Room 101','section','Power','items',jsonb_build_array(
        jsonb_build_object('number',1,'name','Receptacles','qty',2,'lines',jsonb_build_array(
          jsonb_build_object('qty',3,'price',10,'hours',0.5,'fixed',false)
        ))
      ))
    )
  );
  saved:=public.save_estimate_workbench(NULL,'Electrical',document,NULL,'[]');
  PERFORM set_config('northgate.workbench_test_estimate',saved.estimate_id::text,true);
  snapshot_id:=public.approve_workbench_estimate(saved.estimate_id,'controlled validation');
  SELECT * INTO snapshot FROM public.estimate_snapshots WHERE id=snapshot_id;
  IF snapshot.pricing_total<>439.20 OR snapshot.pricing_line_count<>1 OR snapshot.workbench_document->>'approvedAt' IS NULL THEN
    RAISE EXCEPTION 'Unexpected approved Workbench snapshot values';
  END IF;
  IF (SELECT status FROM public.estimates WHERE id=saved.estimate_id)<>'approved' THEN
    RAISE EXCEPTION 'Workbench estimate was not approved';
  END IF;
  BEGIN
    PERFORM public.save_estimate_workbench(saved.estimate_id,'Electrical',document,saved.revision,'[]');
    RAISE EXCEPTION 'Approved estimate remained writable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.estimate_snapshots SET pricing_total=1 WHERE id=snapshot_id;
    RAISE EXCEPTION 'Approved snapshot remained mutable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claims','{"sub":"__workbench_approval_test","role":"authenticated"}',true);
DO $$
DECLARE saved public.estimate_workbenches; incomplete jsonb;
BEGIN
  incomplete:=jsonb_build_object(
    'name','Incomplete Workbench approval validation','rate',100,'materialMarkup',10,'feePercent',20,
    'entries',jsonb_build_array(jsonb_build_object('number',1,'items',jsonb_build_array(
      jsonb_build_object('number',1,'name','Missing component','qty',1,'lines','[]'::jsonb)
    )))
  );
  saved:=public.save_estimate_workbench(NULL,'Electrical',incomplete,NULL,'[]');
  BEGIN
    PERFORM public.approve_workbench_estimate(saved.estimate_id,'must reject incomplete item');
    RAISE EXCEPTION 'Incomplete Workbench item was approved';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claims','{"sub":"__workbench_approval_denied","role":"authenticated"}',true);
DO $$
BEGIN
  BEGIN
    PERFORM public.approve_workbench_estimate(current_setting('northgate.workbench_test_estimate')::uuid,'must not approve');
    RAISE EXCEPTION 'Denied user approved Workbench estimate';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
