CREATE OR REPLACE FUNCTION public.current_user_has_developer_access()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  jwt_subject TEXT;
  caller_permissions JSONB;
BEGIN
  jwt_subject := auth.jwt() ->> 'sub';

  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT public.default_permissions_for_role(up.role)
         || CASE
              WHEN up.division = 'Admin' THEN '{"can_view_all_divisions":true}'::jsonb
              ELSE '{}'::jsonb
            END
         || CASE
              WHEN up.permission_overrides ? 'can_access_developer' THEN jsonb_build_object(
                'can_access_developer',
                COALESCE((up.permission_overrides ->> 'can_access_developer')::BOOLEAN, FALSE)
              )
              ELSE '{}'::jsonb
            END
  INTO caller_permissions
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject
    AND up.is_active = TRUE
  LIMIT 1;

  RETURN COALESCE((caller_permissions ->> 'can_access_developer')::BOOLEAN, FALSE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.permission_template_base_for_user(p_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE result jsonb;
BEGIN
  IF nullif(auth.jwt()->>'sub', '') IS NULL OR
     (p_user_id IS DISTINCT FROM (auth.jwt()->>'sub') AND NOT public.current_user_has_developer_access()) THEN
    RAISE EXCEPTION 'Permission scope denied' USING ERRCODE = '42501';
  END IF;
  SELECT public.permission_base_for_user(up.role, up.division, up.permission_overrides) || coalesce(t.permissions, '{}'::jsonb)
    INTO result FROM public.user_permissions up
    LEFT JOIN public.user_permission_templates a ON a.user_id = up.clerk_user_id
    LEFT JOIN public.permission_templates t ON t.id = a.template_id
    WHERE up.clerk_user_id = p_user_id AND up.is_active;
  RETURN coalesce(result, '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_user_permission_template(p_user_id text, p_template_id uuid, p_overrides jsonb, p_expected_state jsonb, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  target public.user_permissions%ROWTYPE;
  prior_overrides jsonb;
  prior_template uuid;
  prior_permissions jsonb;
  next_permissions jsonb;
  allowed jsonb := public.default_permissions_for_role('Developer') - 'can_access_developer';
  entry record;
BEGIN
  IF nullif(actor, '') IS NULL OR NOT public.current_user_has_developer_access() THEN
    RAISE EXCEPTION 'Developer access is required' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL OR length(p_reason) > 500 THEN RAISE EXCEPTION 'An audit reason of 1 to 500 characters is required'; END IF;
  IF p_overrides IS NULL OR jsonb_typeof(p_overrides) <> 'object' THEN RAISE EXCEPTION 'Overrides must be an object'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_overrides) e WHERE NOT allowed ? e.key OR jsonb_typeof(e.value) <> 'boolean') THEN
    RAISE EXCEPTION 'Only editable boolean permission overrides are allowed';
  END IF;
  SELECT * INTO target FROM public.user_permissions WHERE clerk_user_id=p_user_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active user is required'; END IF;
  IF coalesce((public.permission_base_for_user(target.role,target.division,target.permission_overrides)->>'can_access_developer')::boolean,false) THEN
    RAISE EXCEPTION 'Developer users cannot be targeted through this override system';
  END IF;
  IF p_template_id IS NOT NULL THEN
    PERFORM 1 FROM public.permission_templates WHERE id=p_template_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Template no longer exists'; END IF;
  END IF;
  SELECT a.template_id INTO prior_template FROM public.user_permission_templates a WHERE a.user_id=p_user_id;
  SELECT coalesce(jsonb_object_agg(s.permission_flag,s.granted),'{}'::jsonb) INTO prior_overrides FROM (
    SELECT o.permission_flag, bool_and(o.granted) AS granted FROM public.user_permission_overrides o
    WHERE o.user_id=p_user_id AND o.is_active AND o.permission_flag <> 'can_access_developer' GROUP BY o.permission_flag
  ) s;
  IF p_expected_state IS DISTINCT FROM jsonb_build_object('template_id',prior_template,'overrides',prior_overrides) THEN
    RAISE EXCEPTION 'User permissions changed since you opened them. Reload before saving.' USING ERRCODE = '40001';
  END IF;
  prior_permissions := public.permission_template_base_for_user(p_user_id) || prior_overrides;
  IF p_template_id IS NULL THEN
    DELETE FROM public.user_permission_templates WHERE user_id=p_user_id;
  ELSE
    INSERT INTO public.user_permission_templates(user_id,template_id,updated_by) VALUES (p_user_id,p_template_id,actor)
      ON CONFLICT (user_id) DO UPDATE SET template_id=excluded.template_id, updated_at=clock_timestamp(), updated_by=actor;
  END IF;
  -- Preserve unchanged override rows and their review history.
  UPDATE public.user_permission_overrides o SET is_active=false
    WHERE o.user_id=p_user_id AND o.is_active AND o.permission_flag <> 'can_access_developer'
      AND (p_overrides->o.permission_flag IS DISTINCT FROM to_jsonb(o.granted));
  FOR entry IN SELECT key,value FROM jsonb_each(p_overrides) LOOP
    IF prior_overrides->entry.key IS DISTINCT FROM entry.value THEN
      INSERT INTO public.user_permission_overrides(user_id,permission_flag,granted,granted_by_user_id,reason)
        VALUES (p_user_id,entry.key,entry.value::boolean,actor,btrim(p_reason));
    END IF;
  END LOOP;
  next_permissions := public.permission_template_base_for_user(p_user_id) || p_overrides;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
    VALUES (actor,(SELECT coalesce(nullif(display_name,''),email,actor) FROM public.user_permissions WHERE clerk_user_id=actor),
      'user_permission_templates',p_user_id,'permission_change',
      jsonb_build_object('template_id',prior_template,'overrides',prior_overrides,'effective_permissions',prior_permissions),
      jsonb_build_object('template_id',p_template_id,'overrides',p_overrides,'effective_permissions',next_permissions),btrim(p_reason));
END;
$function$;
