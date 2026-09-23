-- Informational owner slots. Deliberately separate from job_user_assignments,
-- whose rows grant project visibility and affect existing access decisions.
CREATE TABLE public.job_responsibilities (
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  responsibility text NOT NULL CHECK (responsibility IN ('superintendent', 'construction_pm', 'electrical_pm', 'electrical_lead')),
  user_id text NOT NULL REFERENCES public.user_permissions(clerk_user_id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (job_id, responsibility)
);
CREATE INDEX job_responsibilities_user_idx ON public.job_responsibilities(user_id);
ALTER TABLE public.job_responsibilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_responsibilities FROM PUBLIC, anon, authenticated;
-- No direct client table access. Reads and mutations use narrowly checked RPCs.

CREATE FUNCTION public.read_job_responsibilities(p_job_id uuid)
RETURNS TABLE (responsibility text, user_id text, display_name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
BEGIN
  IF p_job_id IS NULL OR NOT public.current_user_can_access_job(p_job_id) THEN
    RAISE EXCEPTION 'Job access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT r.responsibility, r.user_id, p.display_name, p.email
    FROM public.job_responsibilities r
    JOIN public.user_permissions p ON p.clerk_user_id = r.user_id
    WHERE r.job_id = p_job_id;
END
$function$;
REVOKE ALL ON FUNCTION public.read_job_responsibilities(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_job_responsibilities(uuid) TO authenticated;

CREATE FUNCTION public.set_job_responsibility(p_job_id uuid, p_responsibility text, p_user_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
  actor_id text := auth.jwt()->>'sub';
  actor public.user_permissions%ROWTYPE;
  previous public.job_responsibilities%ROWTYPE;
  next_row public.job_responsibilities%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id = actor_id AND is_active;
  IF actor.id IS NULL OR actor.business_role NOT IN ('Manager', 'Director')
     OR NOT public.current_user_can_edit_job(p_job_id, 'can_manage_jobs') THEN
    RAISE EXCEPTION 'Manager-level job management is required' USING ERRCODE = '42501';
  END IF;
  IF p_responsibility NOT IN ('superintendent', 'construction_pm', 'electrical_pm', 'electrical_lead') THEN
    RAISE EXCEPTION 'Unknown project responsibility' USING ERRCODE = '22023';
  END IF;
  IF p_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_permissions target WHERE target.clerk_user_id = p_user_id AND target.is_active
      AND (target.division IS NULL OR public.current_user_can_read_division(target.division))
  ) THEN RAISE EXCEPTION 'Selected employee is unavailable' USING ERRCODE = '42501'; END IF;
  SELECT * INTO previous FROM public.job_responsibilities
    WHERE job_id = p_job_id AND responsibility = p_responsibility FOR UPDATE;
  IF previous.user_id IS NOT DISTINCT FROM p_user_id THEN RETURN; END IF;
  IF p_user_id IS NULL THEN
    DELETE FROM public.job_responsibilities WHERE job_id = p_job_id AND responsibility = p_responsibility;
  ELSE
    INSERT INTO public.job_responsibilities(job_id, responsibility, user_id, updated_by)
    VALUES (p_job_id, p_responsibility, p_user_id, actor_id)
    ON CONFLICT (job_id, responsibility) DO UPDATE
      SET user_id = EXCLUDED.user_id, updated_at = now(), updated_by = actor_id
    RETURNING * INTO next_row;
  END IF;
  INSERT INTO public.change_logs(user_id, user_name, table_name, record_id, action, before_data, after_data, note)
  VALUES (actor_id, COALESCE(actor.display_name, actor.email, actor_id), 'job_responsibilities',
    p_job_id::text || ':' || p_responsibility, CASE WHEN previous.job_id IS NULL THEN 'create' WHEN p_user_id IS NULL THEN 'delete' ELSE 'update' END,
    CASE WHEN previous.job_id IS NULL THEN NULL ELSE to_jsonb(previous) END,
    CASE WHEN p_user_id IS NULL THEN NULL ELSE to_jsonb(next_row) END,
    'Project ' || p_job_id::text || ' / ' || p_responsibility || ': ' || COALESCE(previous.user_id, 'unassigned') || ' → ' || COALESCE(p_user_id, 'unassigned'));
END
$function$;
REVOKE ALL ON FUNCTION public.set_job_responsibility(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_job_responsibility(uuid, text, text) TO authenticated;
