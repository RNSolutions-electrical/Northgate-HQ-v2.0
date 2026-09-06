-- Named, live-linked defaults. Individual overrides remain the final layer.
CREATE TABLE public.permission_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 100),
  permissions jsonb NOT NULL CHECK (jsonb_typeof(permissions) = 'object' AND NOT permissions ? 'can_access_developer'),
  default_role text CHECK (default_role IN ('User','Supervisor','Manager','Director','Developer')),
  default_division text CHECK (default_division IN ('Electrical','Construction','Admin','Unassigned')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CHECK ((default_role IS NULL) = (default_division IS NULL)),
  UNIQUE (default_role, default_division)
);
CREATE UNIQUE INDEX permission_templates_name_unique ON public.permission_templates (lower(name));
CREATE TABLE public.user_permission_templates (
  user_id text PRIMARY KEY REFERENCES public.user_permissions(clerk_user_id),
  template_id uuid NOT NULL REFERENCES public.permission_templates(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL
);
CREATE INDEX user_permission_templates_template_idx ON public.user_permission_templates(template_id);
ALTER TABLE public.permission_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.permission_templates, public.user_permission_templates FROM PUBLIC, anon, authenticated;
CREATE POLICY deny_direct_permission_templates ON public.permission_templates FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY deny_direct_user_permission_templates ON public.user_permission_templates FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Seed from the deployed defaults before replacing the resolver; no access changes on migration.
INSERT INTO public.permission_templates (name, permissions, default_role, default_division)
SELECT d || ' / ' || r,
       public.permission_base_for_user(r, nullif(d, 'Unassigned'), '{}'::jsonb) - 'can_access_developer', r, d
FROM unnest(ARRAY['User','Supervisor','Manager','Director','Developer']) AS r
CROSS JOIN unnest(ARRAY['Electrical','Construction','Admin','Unassigned']) AS d;

CREATE OR REPLACE FUNCTION public.permission_base_for_user(p_role text, p_division text, p_permission_overrides jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.default_permissions_for_role(p_role)
    || CASE WHEN p_division = 'Admin' THEN '{"can_view_all_divisions":true}'::jsonb ELSE '{}'::jsonb END
    || coalesce((SELECT t.permissions FROM public.permission_templates t
                 WHERE t.default_role = p_role AND t.default_division = coalesce(p_division, 'Unassigned')), '{}'::jsonb)
    || CASE WHEN p_permission_overrides ? 'can_access_developer'
       THEN jsonb_build_object('can_access_developer', coalesce((p_permission_overrides->>'can_access_developer')::boolean, false))
       ELSE '{}'::jsonb END;
$$;

CREATE FUNCTION public.permission_template_base_for_user(p_user_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.effective_permissions_for_user(p_role text, p_division text, p_permission_overrides jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.permission_base_for_user(p_role, p_division, p_permission_overrides)
    || coalesce((SELECT t.permissions FROM public.user_permission_templates a
                 JOIN public.permission_templates t ON t.id = a.template_id
                 WHERE a.user_id = auth.jwt()->>'sub'), '{}'::jsonb)
    || coalesce((SELECT jsonb_object_agg(s.permission_flag, s.granted) FROM (
         SELECT o.permission_flag, bool_and(o.granted) AS granted FROM public.user_permission_overrides o
         WHERE o.user_id = auth.jwt()->>'sub' AND o.is_active AND o.permission_flag <> 'can_access_developer'
         GROUP BY o.permission_flag
       ) s), '{}'::jsonb);
$$;

-- Keep the console's existing return contract while resolving each target, not the caller.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.read_developer_permission_console()'::regprocedure) INTO definition;
  IF position('public.permission_base_for_user(up.role, up.division, up.permission_overrides)' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected permission console definition; reconcile before migrating';
  END IF;
  EXECUTE replace(definition, 'public.permission_base_for_user(up.role, up.division, up.permission_overrides)',
                             'public.permission_template_base_for_user(up.clerk_user_id)');
END;
$$;

CREATE FUNCTION public.read_permission_templates()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF nullif(auth.jwt()->>'sub', '') IS NULL OR NOT public.current_user_has_developer_access() THEN
    RAISE EXCEPTION 'Developer access is required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'templates', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.name) FROM (
      SELECT t.*, (SELECT count(*) FROM public.user_permissions up
                   LEFT JOIN public.user_permission_templates a ON a.user_id = up.clerk_user_id
                   WHERE up.is_active AND (a.template_id = t.id OR
                     (a.user_id IS NULL AND up.role = t.default_role AND coalesce(up.division,'Unassigned') = t.default_division))) AS linked_users
      FROM public.permission_templates t
    ) s), '[]'::jsonb),
    'assignments', coalesce((SELECT jsonb_object_agg(a.user_id, a.template_id) FROM public.user_permission_templates a), '{}'::jsonb));
END;
$$;

CREATE FUNCTION public.save_permission_template(p_id uuid, p_name text, p_permissions jsonb, p_expected_version integer, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor text := auth.jwt()->>'sub';
  prior public.permission_templates%ROWTYPE;
  saved public.permission_templates%ROWTYPE;
  allowed jsonb := public.default_permissions_for_role('Developer') - 'can_access_developer';
BEGIN
  IF nullif(actor, '') IS NULL OR NOT public.current_user_has_developer_access() THEN
    RAISE EXCEPTION 'Developer access is required' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL OR length(p_reason) > 500 THEN RAISE EXCEPTION 'An audit reason of 1 to 500 characters is required'; END IF;
  IF nullif(btrim(p_name), '') IS NULL OR length(btrim(p_name)) > 100 THEN RAISE EXCEPTION 'A unique template name of 1 to 100 characters is required'; END IF;
  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'object' THEN RAISE EXCEPTION 'Permissions must be an object'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_permissions) e WHERE NOT allowed ? e.key OR jsonb_typeof(e.value) <> 'boolean')
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(allowed) k WHERE NOT p_permissions ? k) THEN
    RAISE EXCEPTION 'Supply every editable permission as a boolean; Developer access is role-controlled';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.permission_templates(name, permissions, updated_by)
      VALUES (btrim(p_name), p_permissions, actor) RETURNING * INTO saved;
  ELSE
    SELECT * INTO prior FROM public.permission_templates WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Template no longer exists'; END IF;
    IF p_expected_version IS DISTINCT FROM prior.version THEN RAISE EXCEPTION 'Template changed since you opened it. Reload before saving.' USING ERRCODE = '40001'; END IF;
    UPDATE public.permission_templates SET name = btrim(p_name), permissions = p_permissions,
      version = version + 1, updated_at = clock_timestamp(), updated_by = actor
      WHERE id = p_id RETURNING * INTO saved;
  END IF;
  INSERT INTO public.change_logs(user_id, user_name, table_name, record_id, action, before_data, after_data, note)
    VALUES (actor, (SELECT coalesce(nullif(display_name,''),email,actor) FROM public.user_permissions WHERE clerk_user_id=actor),
      'permission_templates', saved.id::text, 'permission_change', to_jsonb(prior), to_jsonb(saved), btrim(p_reason));
  RETURN to_jsonb(saved);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A permission template with that name already exists' USING ERRCODE = '23505';
END;
$$;

-- The deployed override constraint omitted three existing financial flags.
ALTER TABLE public.user_permission_overrides DROP CONSTRAINT user_permission_overrides_permission_flag_check;
ALTER TABLE public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_permission_flag_check
  CHECK (permission_flag IN ('can_access_developer','can_manage_users','can_view_reports','can_edit_catalog',
    'can_manage_employees','can_manage_vehicles','can_manage_tools','can_manage_inventory','can_inventory_transactions',
    'can_view_all_divisions','can_estimate','can_approve_estimates','can_create_jobs','can_manage_jobs','can_approve_budget',
    'can_view_financials','can_view_asset_financials','can_view_project_financials','can_view_protected_project_financials',
    'can_field_access','can_archive_records','can_manage_change_orders','can_express_checkout','can_approve_express_checkout',
    'can_defer_completion','can_create_change_orders','can_submit_change_orders','can_verify_change_orders',
    'can_approve_change_orders','can_revise_change_orders'));

CREATE FUNCTION public.save_user_permission_template(p_user_id text, p_template_id uuid, p_overrides jsonb, p_expected_state jsonb, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
$$;

REVOKE ALL ON FUNCTION public.permission_template_base_for_user(text), public.read_permission_templates(),
  public.save_permission_template(uuid,text,jsonb,integer,text), public.save_user_permission_template(text,uuid,jsonb,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permission_template_base_for_user(text), public.read_permission_templates(),
  public.save_permission_template(uuid,text,jsonb,integer,text), public.save_user_permission_template(text,uuid,jsonb,jsonb,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
