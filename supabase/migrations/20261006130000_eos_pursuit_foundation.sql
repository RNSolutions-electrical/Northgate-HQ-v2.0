-- EOS is opt-in for selected business managers. A technical Developer role alone
-- does not confer access. Only owner-approved, already-eligible accounts are
-- conditionally seeded at the end; no account is created or promoted.
CREATE TABLE public.eos_access_grants (
  user_id text PRIMARY KEY REFERENCES public.user_permissions(clerk_user_id),
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.eos_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eos_access_grants FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.current_user_can_manage_eos()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.eos_access_grants g
    JOIN public.user_permissions u ON u.clerk_user_id = g.user_id
    WHERE g.user_id = auth.jwt()->>'sub' AND u.is_active
      AND u.business_role IN ('Manager', 'Director')
  );
$$;
REVOKE ALL ON FUNCTION public.current_user_can_manage_eos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_eos() TO authenticated;

CREATE FUNCTION public.set_eos_access(p_user_id text, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor public.user_permissions%ROWTYPE; target public.user_permissions%ROWTYPE;
  was_enabled boolean;
BEGIN
  SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active;
  IF actor.id IS NULL OR public.current_user_has_developer_access() IS NOT TRUE
      OR actor.business_role <> 'Director' THEN
    RAISE EXCEPTION 'Director and developer authority is required to assign EOS access' USING ERRCODE='42501';
  END IF;
  SELECT * INTO target FROM public.user_permissions WHERE clerk_user_id=p_user_id AND is_active;
  IF target.id IS NULL OR target.business_role NOT IN ('Manager','Director') THEN
    RAISE EXCEPTION 'EOS access requires an active Manager or Director';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.eos_access_grants WHERE user_id=p_user_id)
    INTO was_enabled;
  IF was_enabled = p_enabled THEN RETURN; END IF;
  IF p_enabled THEN
    INSERT INTO public.eos_access_grants(user_id,granted_by) VALUES(p_user_id,actor.clerk_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM public.eos_access_grants WHERE user_id=p_user_id;
  END IF;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.email,actor.clerk_user_id),
    'eos_access_grants',p_user_id,'permission_change',jsonb_build_object('enabled',was_enabled),
    jsonb_build_object('enabled',p_enabled),
    'EOS access changed');
END $$;
REVOKE ALL ON FUNCTION public.set_eos_access(text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_eos_access(text,boolean) TO authenticated;

CREATE FUNCTION public.read_eos_access_directory()
RETURNS TABLE(user_id text,display_name text,email text,business_role text,granted boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.user_permissions%ROWTYPE;
BEGIN
  SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active;
  IF actor.id IS NULL OR actor.business_role <> 'Director'
    OR public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Director and developer authority is required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT u.clerk_user_id,u.display_name,u.email,u.business_role,
    g.user_id IS NOT NULL FROM public.user_permissions u
  LEFT JOIN public.eos_access_grants g ON g.user_id=u.clerk_user_id
  WHERE u.is_active AND u.business_role IN ('Manager','Director')
  ORDER BY coalesce(u.display_name,u.email,u.clerk_user_id);
END $$;
REVOKE ALL ON FUNCTION public.read_eos_access_directory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_eos_access_directory() TO authenticated;

CREATE TABLE public.eos_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text, last_name text, display_name text NOT NULL,
  company text, phone text, email text, address text, notes text,
  source_label text, created_by text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eos_client_name_nonblank CHECK (btrim(display_name) <> '')
);
CREATE TABLE public.eos_pursuits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text NOT NULL CHECK (btrim(project_name) <> ''),
  client_id uuid REFERENCES public.eos_clients(id) ON DELETE SET NULL,
  discussion text, phase text CHECK (phase IN ('Pursuit','Estimate','Awarded')),
  planning_value numeric(16,2), probability numeric(6,3)
    CHECK (probability BETWEEN 0 AND 100),
  potential_start_date date, go_no_go text CHECK (go_no_go IN ('Go','No Go')),
  initial_meeting date, follow_up_7_day date, meeting_2_week date,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Dormant')),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  source_sheet text, source_row integer, source_batch text,
  source_manager_labels text[], original_stage text, original_job_number text,
  created_by text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
  deleted_by text,
  CONSTRAINT eos_award_not_dormant CHECK (phase <> 'Awarded' OR status = 'Active'),
  CONSTRAINT eos_source_identity UNIQUE (source_sheet,source_row)
);
CREATE TABLE public.eos_pursuit_managers (
  pursuit_id uuid NOT NULL REFERENCES public.eos_pursuits(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.user_permissions(clerk_user_id),
  PRIMARY KEY (pursuit_id,user_id)
);
CREATE TABLE public.eos_leadership_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_key text UNIQUE, text text NOT NULL CHECK (btrim(text) <> ''),
  reminder_type text NOT NULL CHECK (reminder_type IN ('quotation','original')),
  source_label text, book text, source_url text
    CHECK (source_url IS NULL OR source_url ~* '^https?://'),
  edition text, page text,
  enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX eos_clients_import_label_unique ON public.eos_clients(source_label)
  WHERE source_label IS NOT NULL;
CREATE INDEX eos_pursuits_active_idx ON public.eos_pursuits(source_sheet,phase,status)
  WHERE deleted_at IS NULL;
CREATE INDEX eos_pursuits_client_idx ON public.eos_pursuits(client_id);
CREATE INDEX eos_pursuits_job_idx ON public.eos_pursuits(job_id);
CREATE INDEX eos_pursuit_managers_user_idx ON public.eos_pursuit_managers(user_id);

CREATE FUNCTION public.eos_audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE actor text := auth.jwt()->>'sub'; actor_name text;
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
  SELECT coalesce(display_name,email,clerk_user_id) INTO actor_name
    FROM public.user_permissions WHERE clerk_user_id=actor;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data)
  VALUES(actor,coalesce(actor_name,actor),TG_TABLE_NAME,
    CASE WHEN TG_OP='DELETE' THEN coalesce(to_jsonb(OLD)->>'id',to_jsonb(OLD)->>'pursuit_id')
      ELSE coalesce(to_jsonb(NEW)->>'id',to_jsonb(NEW)->>'pursuit_id') END,
    CASE WHEN TG_OP='INSERT' THEN 'create' ELSE lower(TG_OP) END,
    CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.eos_audit_row() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER eos_clients_audit AFTER INSERT OR UPDATE OR DELETE ON public.eos_clients
  FOR EACH ROW EXECUTE FUNCTION public.eos_audit_row();
CREATE TRIGGER eos_pursuits_audit AFTER INSERT OR UPDATE OR DELETE ON public.eos_pursuits
  FOR EACH ROW EXECUTE FUNCTION public.eos_audit_row();
CREATE TRIGGER eos_reminders_audit AFTER INSERT OR UPDATE OR DELETE ON public.eos_leadership_reminders
  FOR EACH ROW EXECUTE FUNCTION public.eos_audit_row();
CREATE TRIGGER eos_managers_audit AFTER INSERT OR DELETE ON public.eos_pursuit_managers
  FOR EACH ROW EXECUTE FUNCTION public.eos_audit_row();

CREATE FUNCTION public.eos_touch() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.eos_touch() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER eos_clients_touch BEFORE UPDATE ON public.eos_clients FOR EACH ROW EXECUTE FUNCTION public.eos_touch();
CREATE TRIGGER eos_pursuits_touch BEFORE UPDATE ON public.eos_pursuits FOR EACH ROW EXECUTE FUNCTION public.eos_touch();
CREATE TRIGGER eos_reminders_touch BEFORE UPDATE ON public.eos_leadership_reminders FOR EACH ROW EXECUTE FUNCTION public.eos_touch();

CREATE FUNCTION public.eos_guard_pursuit() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.job_id IS NOT NULL AND (NEW.job_id IS DISTINCT FROM OLD.job_id
      OR NEW.phase IS DISTINCT FROM 'Awarded') THEN
      RAISE EXCEPTION 'Linked awards require a separately defined reversal workflow' USING ERRCODE='42501';
    END IF;
    IF NEW.job_id IS DISTINCT FROM OLD.job_id
      OR (NEW.phase='Awarded' AND OLD.phase IS DISTINCT FROM 'Awarded') THEN
      IF current_setting('app.eos_award_handoff',true) IS DISTINCT FROM 'yes' THEN
        RAISE EXCEPTION 'Use the atomic EOS award handoff' USING ERRCODE='42501';
      END IF;
    END IF;
    IF NEW.initial_meeting IS DISTINCT FROM OLD.initial_meeting THEN
      NEW.follow_up_7_day:=NEW.initial_meeting + 7;
      NEW.meeting_2_week:=NEW.initial_meeting + 14;
    END IF;
  ELSIF (NEW.phase='Awarded' OR NEW.job_id IS NOT NULL)
    AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Use the atomic EOS award handoff' USING ERRCODE='42501';
  ELSIF NEW.initial_meeting IS NOT NULL THEN
    NEW.follow_up_7_day:=NEW.initial_meeting + 7;
    NEW.meeting_2_week:=NEW.initial_meeting + 14;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.eos_guard_pursuit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER eos_pursuit_guard BEFORE INSERT OR UPDATE ON public.eos_pursuits
  FOR EACH ROW EXECUTE FUNCTION public.eos_guard_pursuit();

ALTER TABLE public.eos_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_pursuits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_pursuit_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_leadership_reminders ENABLE ROW LEVEL SECURITY;
-- Supabase may provision broad default table grants for exposed schemas.
-- Revoke those defaults before exposing only the intended operations.
REVOKE ALL ON public.eos_clients,public.eos_pursuits,
  public.eos_pursuit_managers,public.eos_leadership_reminders
  FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.eos_clients,public.eos_leadership_reminders TO authenticated;
GRANT SELECT ON public.eos_pursuits TO authenticated;
GRANT SELECT ON public.eos_pursuit_managers TO authenticated;

CREATE POLICY eos_clients_access ON public.eos_clients FOR ALL TO authenticated
  USING (public.current_user_can_manage_eos()) WITH CHECK (public.current_user_can_manage_eos());
CREATE POLICY eos_pursuits_access ON public.eos_pursuits FOR ALL TO authenticated
  USING (public.current_user_can_manage_eos()) WITH CHECK (public.current_user_can_manage_eos());
CREATE POLICY eos_managers_access ON public.eos_pursuit_managers FOR ALL TO authenticated
  USING (public.current_user_can_manage_eos()) WITH CHECK (public.current_user_can_manage_eos());
CREATE POLICY eos_reminders_access ON public.eos_leadership_reminders FOR ALL TO authenticated
  USING (public.current_user_can_manage_eos()) WITH CHECK (public.current_user_can_manage_eos());

CREATE FUNCTION public.eos_manager_directory()
RETURNS TABLE(user_id text, display_name text, is_active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.current_user_can_manage_eos() IS NOT TRUE THEN
    RAISE EXCEPTION 'EOS access required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT u.clerk_user_id,coalesce(nullif(u.display_name,''),u.email,u.clerk_user_id),u.is_active
    FROM public.user_permissions u ORDER BY 2;
END $$;
REVOKE ALL ON FUNCTION public.eos_manager_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eos_manager_directory() TO authenticated;

CREATE FUNCTION public.eos_save_pursuit(p_id uuid,p_data jsonb,p_manager_ids text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE saved public.eos_pursuits%ROWTYPE; name text;
BEGIN
  IF public.current_user_can_manage_eos() IS NOT TRUE THEN
    RAISE EXCEPTION 'EOS access required' USING ERRCODE='42501';
  END IF;
  name:=nullif(btrim(p_data->>'project_name'),'');
  IF name IS NULL THEN RAISE EXCEPTION 'Project Pursuit name is required'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(coalesce(p_manager_ids,ARRAY[]::text[])) AS manager_id(user_id)
    LEFT JOIN public.user_permissions u ON u.clerk_user_id=manager_id.user_id
    WHERE (u.is_active IS DISTINCT FROM true)
      AND NOT EXISTS (SELECT 1 FROM public.eos_pursuit_managers pm
        WHERE pm.pursuit_id=p_id AND pm.user_id=manager_id.user_id)
  ) THEN RAISE EXCEPTION 'Only active accounts can be newly assigned as pursuit managers'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.eos_pursuits(project_name,client_id,discussion,phase,planning_value,
      probability,potential_start_date,go_no_go,initial_meeting,follow_up_7_day,
      meeting_2_week,status,created_by)
    VALUES(name,(p_data->>'client_id')::uuid,p_data->>'discussion',p_data->>'phase',
      (p_data->>'planning_value')::numeric,(p_data->>'probability')::numeric,
      (p_data->>'potential_start_date')::date,p_data->>'go_no_go',
      (p_data->>'initial_meeting')::date,(p_data->>'follow_up_7_day')::date,
      (p_data->>'meeting_2_week')::date,coalesce(p_data->>'status','Active'),auth.jwt()->>'sub')
    RETURNING * INTO saved;
  ELSE
    SELECT * INTO saved FROM public.eos_pursuits WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
    IF saved.id IS NULL THEN RAISE EXCEPTION 'Pursuit not found'; END IF;
    UPDATE public.eos_pursuits SET project_name=name,client_id=(p_data->>'client_id')::uuid,
      discussion=p_data->>'discussion',phase=p_data->>'phase',
      planning_value=(p_data->>'planning_value')::numeric,
      probability=(p_data->>'probability')::numeric,
      potential_start_date=(p_data->>'potential_start_date')::date,
      go_no_go=p_data->>'go_no_go',initial_meeting=(p_data->>'initial_meeting')::date,
      follow_up_7_day=(p_data->>'follow_up_7_day')::date,
      meeting_2_week=(p_data->>'meeting_2_week')::date,
      status=coalesce(p_data->>'status','Active') WHERE id=p_id RETURNING * INTO saved;
  END IF;
  DELETE FROM public.eos_pursuit_managers WHERE pursuit_id=saved.id
    AND user_id <> ALL(coalesce(p_manager_ids,ARRAY[]::text[]));
  INSERT INTO public.eos_pursuit_managers(pursuit_id,user_id)
  SELECT saved.id,manager_id.user_id
  FROM unnest(coalesce(p_manager_ids,ARRAY[]::text[])) AS manager_id(user_id)
  ON CONFLICT DO NOTHING;
  RETURN saved.id;
END $$;
REVOKE ALL ON FUNCTION public.eos_save_pursuit(uuid,jsonb,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eos_save_pursuit(uuid,jsonb,text[]) TO authenticated;

CREATE FUNCTION public.eos_set_pursuit_removed(p_id uuid,p_removed boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE changed integer;
BEGIN
  IF public.current_user_can_manage_eos() IS NOT TRUE THEN
    RAISE EXCEPTION 'EOS access required' USING ERRCODE='42501';
  END IF;
  UPDATE public.eos_pursuits SET deleted_at=CASE WHEN p_removed THEN now() ELSE NULL END,
    deleted_by=CASE WHEN p_removed THEN auth.jwt()->>'sub' ELSE NULL END
  WHERE id=p_id AND (deleted_at IS NULL) = p_removed;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;
REVOKE ALL ON FUNCTION public.eos_set_pursuit_removed(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eos_set_pursuit_removed(uuid,boolean) TO authenticated;

-- One transaction/row lock makes repeated/concurrent award clicks idempotent.
-- Job creation still goes through HQ's existing create_job permission checks.
CREATE FUNCTION public.eos_award_pursuit(
  p_pursuit_id uuid,p_existing_job_id uuid DEFAULT NULL,
  p_division text DEFAULT NULL,p_job_number text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pursuit public.eos_pursuits%ROWTYPE; linked_job public.jobs%ROWTYPE;
BEGIN
  IF public.current_user_can_manage_eos() IS NOT TRUE THEN
    RAISE EXCEPTION 'EOS access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO pursuit FROM public.eos_pursuits WHERE id=p_pursuit_id AND deleted_at IS NULL FOR UPDATE;
  IF pursuit.id IS NULL THEN RAISE EXCEPTION 'Pursuit not found'; END IF;
  IF pursuit.job_id IS NOT NULL THEN RETURN pursuit.job_id; END IF;
  IF p_existing_job_id IS NOT NULL THEN
    SELECT * INTO linked_job FROM public.jobs WHERE id=p_existing_job_id AND archived_at IS NULL;
    IF linked_job.id IS NULL OR public.current_user_can_access_job(linked_job.id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Job is unavailable to this user' USING ERRCODE='42501';
    END IF;
  ELSE
    IF p_division IS NULL OR p_job_number IS NULL THEN
      RAISE EXCEPTION 'Division and job number are required to create a job';
    END IF;
    linked_job := public.create_job(p_division,p_job_number,pursuit.project_name,'active',
      pursuit.discussion,NULL,NULL,NULL,NULL,NULL,NULL,'job',NULL,NULL);
  END IF;
  PERFORM set_config('app.eos_award_handoff','yes',true);
  UPDATE public.eos_pursuits SET phase='Awarded',status='Active',job_id=linked_job.id
    WHERE id=p_pursuit_id;
  RETURN linked_job.id;
END $$;
REVOKE ALL ON FUNCTION public.eos_award_pursuit(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eos_award_pursuit(uuid,uuid,text,text) TO authenticated;

-- Initial named access is conditional: no rank promotion and no synthetic users.
WITH seeded AS (
  INSERT INTO public.eos_access_grants(user_id,granted_by)
  SELECT u.clerk_user_id,'eos-initial-approval-20261006'
  FROM public.user_permissions u
  WHERE lower(u.email) IN (
    'ryan@thenorthgategroup.com','eric@thenorthgategroup.com',
    'david@thenorthgategroup.com','tim@thenorthgategroup.com',
    'jason@thenorthgategroup.com','rick@thenorthgategroup.com'
  ) AND u.is_active AND u.business_role IN ('Manager','Director')
  ON CONFLICT (user_id) DO NOTHING RETURNING user_id
)
INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
SELECT 'eos-initial-approval-20261006','EOS migration','eos_access_grants',user_id,
  'permission_change',jsonb_build_object('enabled',true),
  'Owner-approved initial EOS access for selected management accounts'
FROM seeded;

INSERT INTO public.eos_leadership_reminders(seed_key,text,reminder_type,source_label,source_url,book)
VALUES
('eos-1','Discipline Equals Freedom.','quotation','Jocko Willink','https://echelonfront.com/how-does-discipline-equal-freedom/',NULL),
('eos-2','There are no bad teams; only bad leaders.','quotation','Jocko Willink and Leif Babin','https://www.linkedin.com/posts/echelon-front-llc_4-ways-to-become-a-leader-even-if-you-boss-activity-7466515017258143744-mxg5','Extreme Ownership'),
('eos-3','Own the outcome. Identify what you can change and act on it.','original','Northgate leadership reminder · paraphrase inspired by Extreme Ownership',NULL,NULL),
('eos-4','Make the plan clear enough that the team can explain it back.','original','Northgate leadership reminder · paraphrase inspired by Extreme Ownership',NULL,NULL),
('eos-5','Set the priority, give the team room to act, and support their decisions.','original','Northgate leadership reminder · paraphrase inspired by Extreme Ownership',NULL,NULL),
('eos-6','When pressure builds, pause, identify the next priority, and execute.','original','Northgate leadership reminder · paraphrase inspired by Extreme Ownership',NULL,NULL)
ON CONFLICT (seed_key) DO NOTHING;
