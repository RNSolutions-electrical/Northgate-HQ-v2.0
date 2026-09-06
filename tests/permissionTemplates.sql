-- Run in a transaction and roll back. No fixtures or audit entries are retained.
INSERT INTO public.user_permissions(clerk_user_id,role,division,is_active)
VALUES ('__template_test_developer','Developer','Admin',true), ('__template_test_user','User','Electrical',true);
SELECT set_config('request.jwt.claims','{"sub":"__template_test_developer","role":"authenticated"}',true);
DO $$
DECLARE
  t jsonb;
  rights jsonb := public.default_permissions_for_role('User') - 'can_access_developer';
  saved_id uuid;
  n integer;
  baseline uuid;
BEGIN
  IF (SELECT count(*) FROM public.permission_templates WHERE default_role IS NOT NULL) <> 20 THEN RAISE EXCEPTION 'Missing default templates'; END IF;
  SELECT count(*) INTO n FROM public.change_logs;
  BEGIN
    PERFORM public.save_permission_template(null,'__test_missing_reason',rights,null,' ');
    RAISE EXCEPTION 'Blank reason accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Blank reason accepted' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.save_permission_template(null,'__test_escalation',rights || '{"can_access_developer":true}',null,'test');
    RAISE EXCEPTION 'Developer escalation accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Developer escalation accepted' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.save_permission_template(null,'__test_unknown',rights || '{"can_unknown":true}',null,'test');
    RAISE EXCEPTION 'Unknown flag accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Unknown flag accepted' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.save_permission_template(null,'__test_wrong_type',rights || '{"can_estimate":"true"}',null,'test');
    RAISE EXCEPTION 'Nonboolean flag accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Nonboolean flag accepted' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM public.change_logs) <> n THEN RAISE EXCEPTION 'Rejected save wrote audit'; END IF;

  t := public.save_permission_template(null,'__Test template',rights || '{"can_estimate":true,"can_view_project_financials":true}',null,'Create test template');
  saved_id := (t->>'id')::uuid;
  IF (SELECT count(*) FROM public.change_logs) <> n+1 THEN RAISE EXCEPTION 'Expected one template audit'; END IF;
  BEGIN
    PERFORM public.save_permission_template(null,' __test TEMPLATE ',rights,null,'Duplicate name');
    RAISE EXCEPTION 'Case insensitive duplicate accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.save_permission_template(saved_id,'__Test template',rights,99,'Stale edit');
    RAISE EXCEPTION 'Stale template edit accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;

  PERFORM public.save_user_permission_template('__template_test_user',saved_id,'{"can_estimate":false,"can_view_protected_project_financials":true}',
    '{"template_id":null,"overrides":{}}','Assign template with overrides');
  IF (SELECT count(*) FROM public.change_logs) <> n+2 THEN RAISE EXCEPTION 'Expected one batch user audit'; END IF;
  IF (SELECT (effective_permissions->>'can_estimate')::boolean FROM public.read_developer_permission_console() WHERE user_id='__template_test_user') THEN
    RAISE EXCEPTION 'Console did not honor target override'; END IF;
  BEGIN
    PERFORM public.save_user_permission_template('__template_test_user',saved_id,'{}','{"template_id":null,"overrides":{}}','Stale user save');
    RAISE EXCEPTION 'Stale user edit accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.save_user_permission_template('__template_test_developer',saved_id,'{}','{"template_id":null,"overrides":{}}','Target developer');
    RAISE EXCEPTION 'Developer override accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Developer override accepted' THEN RAISE; END IF; END;

  PERFORM set_config('request.jwt.claims','{"sub":"__template_test_user","role":"authenticated"}',true);
  rights := public.effective_permissions_for_user('User','Electrical','{}');
  IF (rights->>'can_estimate')::boolean OR NOT (rights->>'can_view_project_financials')::boolean OR NOT (rights->>'can_view_protected_project_financials')::boolean THEN
    RAISE EXCEPTION 'Caller inheritance or override precedence incorrect'; END IF;
  BEGIN
    PERFORM public.read_permission_templates(); RAISE EXCEPTION 'Nondeveloper could read templates';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.save_permission_template(null,'__unauthorized',rights - 'can_access_developer',null,'Unauthorized');
    RAISE EXCEPTION 'Nondeveloper could save template';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.save_user_permission_template('__template_test_user',null,'{}','{}','Unauthorized');
    RAISE EXCEPTION 'Nondeveloper could assign template';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.permission_template_base_for_user('__template_test_developer');
    RAISE EXCEPTION 'Nondeveloper could read another user base';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM set_config('request.jwt.claims','{"sub":"__template_test_developer","role":"authenticated"}',true);
  t := public.save_permission_template(saved_id,'__Renamed template',t->'permissions' || '{"can_manage_jobs":true}',1,'Update linked template');
  PERFORM set_config('request.jwt.claims','{"sub":"__template_test_user","role":"authenticated"}',true);
  rights := public.effective_permissions_for_user('User','Electrical','{}');
  IF NOT (rights->>'can_manage_jobs')::boolean OR (rights->>'can_estimate')::boolean THEN RAISE EXCEPTION 'Linked edit failed or overwrote individual deny'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"__template_test_developer","role":"authenticated"}',true);
  PERFORM public.save_user_permission_template('__template_test_user',null,'{}',jsonb_build_object('template_id',saved_id,'overrides','{"can_estimate":false,"can_view_protected_project_financials":true}'::jsonb),'Restore defaults');
  IF EXISTS(SELECT 1 FROM public.user_permission_overrides WHERE user_id='__template_test_user' AND is_active) THEN RAISE EXCEPTION 'Overrides not cleared'; END IF;
  SELECT id INTO baseline FROM public.permission_templates WHERE default_role='User' AND default_division='Electrical';
  SELECT permissions INTO rights FROM public.permission_templates WHERE id=baseline;
  PERFORM public.save_permission_template(baseline,'Electrical test default',rights || '{"can_estimate":true}',1,'Edit existing default');
  PERFORM set_config('request.jwt.claims','{"sub":"__template_test_user","role":"authenticated"}',true);
  IF NOT (public.effective_permissions_for_user('User','Electrical','{}')->>'can_estimate')::boolean THEN RAISE EXCEPTION 'Default template edit not inherited'; END IF;
  PERFORM set_config('request.jwt.claims','{}',true);
  BEGIN
    PERFORM public.read_permission_templates(); RAISE EXCEPTION 'Anonymous could read templates';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN PERFORM * FROM public.permission_templates; RAISE EXCEPTION 'Direct template table access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.permission_templates(name,permissions) VALUES ('bypass','{}'); RAISE EXCEPTION 'Direct write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.user_permission_templates; RAISE EXCEPTION 'Direct assignment table access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;
SELECT 'permission template regression checks passed' AS result;
