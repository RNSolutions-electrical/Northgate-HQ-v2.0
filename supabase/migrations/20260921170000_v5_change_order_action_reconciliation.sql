-- Reconcile authoritative Change Order mutations with the canonical v5 action
-- evaluator. Existing RPC permission checks, state guards, audit writes and
-- atomic financial posting behavior remain in force during the transition.

CREATE OR REPLACE FUNCTION public.read_job_assignment_directory_v5(p_job_id uuid)
RETURNS TABLE (user_id text, display_name text, email text, role text, business_role text,
  division text, assignment_id uuid, assignment_role text, assigned_at timestamptz, note text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_job_id IS NULL OR NOT public.current_user_can_edit_job(p_job_id, 'can_manage_jobs') THEN
    RAISE EXCEPTION 'job management permission is required to manage assignments' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT profile.clerk_user_id, profile.display_name, profile.email, profile.role,
    profile.business_role, profile.division, assignment.id, assignment.assignment_role,
    assignment.assigned_at, assignment.note
  FROM public.user_permissions profile
  LEFT JOIN public.job_user_assignments assignment ON assignment.user_id = profile.clerk_user_id
    AND assignment.job_id = p_job_id AND assignment.unassigned_at IS NULL
  WHERE profile.is_active AND (profile.division IS NULL OR public.current_user_can_read_division(profile.division))
  ORDER BY COALESCE(NULLIF(profile.display_name, ''), NULLIF(profile.email, ''), profile.clerk_user_id);
END
$function$;

CREATE OR REPLACE FUNCTION public.set_job_user_assignment_v5(p_job_id uuid, p_user_id text,
  p_is_assigned boolean, p_assignment_role text DEFAULT 'member', p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  actor_id text := auth.jwt()->>'sub';
  normalized_user_id text := NULLIF(BTRIM(COALESCE(p_user_id, '')), '');
  normalized_role text := LOWER(NULLIF(BTRIM(COALESCE(p_assignment_role, 'member')), ''));
  normalized_reason text := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  caller public.user_permissions%ROWTYPE; target public.user_permissions%ROWTYPE;
  before_assignment public.job_user_assignments%ROWTYPE; saved_assignment public.job_user_assignments%ROWTYPE;
  decision jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000'; END IF;
  IF p_job_id IS NULL OR normalized_user_id IS NULL THEN RAISE EXCEPTION 'job and user are required' USING ERRCODE = '22004'; END IF;
  IF normalized_role NOT IN ('member', 'lead', 'superintendent', 'project_manager') THEN
    RAISE EXCEPTION 'assignment role must be member, lead, superintendent, or project_manager' USING ERRCODE = '22023';
  END IF;
  decision := public.current_scoped_authorization_decision('V4-006', jsonb_build_object('job_id', p_job_id));
  IF COALESCE((decision->>'allowed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Project staffing is not authorized: %', COALESCE(decision->>'denial', 'authorization_denied')
      USING ERRCODE = '42501', DETAIL = decision::text;
  END IF;
  IF NOT public.current_user_can_edit_job(p_job_id, 'can_manage_jobs') THEN
    RAISE EXCEPTION 'job management permission is required to change assignments' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id = actor_id AND is_active LIMIT 1;
  SELECT * INTO target FROM public.user_permissions WHERE clerk_user_id = normalized_user_id AND is_active LIMIT 1;
  IF target.id IS NULL OR (target.division IS NOT NULL AND NOT public.current_user_can_read_division(target.division)) THEN
    RAISE EXCEPTION 'user is not available in your approved scope' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO before_assignment FROM public.job_user_assignments
  WHERE job_id = p_job_id AND user_id = normalized_user_id AND unassigned_at IS NULL FOR UPDATE;
  IF p_is_assigned THEN
    IF before_assignment.id IS NULL THEN
      INSERT INTO public.job_user_assignments (job_id,user_id,assigned_by,assignment_role,note)
      VALUES (p_job_id,normalized_user_id,actor_id,normalized_role,COALESCE(normalized_reason,'Project team assignment recorded.'))
      RETURNING * INTO saved_assignment;
      INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
      VALUES(actor_id,COALESCE(caller.display_name,caller.email,actor_id),'job_user_assignments',saved_assignment.id::text,
        'create',to_jsonb(saved_assignment),COALESCE(normalized_reason,'Project team assignment recorded.'));
    ELSIF before_assignment.assignment_role IS DISTINCT FROM normalized_role THEN
      IF normalized_reason IS NULL THEN RAISE EXCEPTION 'a reason is required to change a project assignment role' USING ERRCODE = '22023'; END IF;
      UPDATE public.job_user_assignments SET assignment_role=normalized_role,updated_at=now(),note=normalized_reason
      WHERE id=before_assignment.id RETURNING * INTO saved_assignment;
      INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
      VALUES(actor_id,COALESCE(caller.display_name,caller.email,actor_id),'job_user_assignments',saved_assignment.id::text,
        'update',to_jsonb(before_assignment),to_jsonb(saved_assignment),normalized_reason);
    END IF;
  ELSIF before_assignment.id IS NOT NULL THEN
    UPDATE public.job_user_assignments SET unassigned_at=now(),updated_at=now(),note=COALESCE(normalized_reason,'Removed from project team.')
    WHERE id=before_assignment.id RETURNING * INTO saved_assignment;
    INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
    VALUES(actor_id,COALESCE(caller.display_name,caller.email,actor_id),'job_user_assignments',saved_assignment.id::text,
      'archive',to_jsonb(before_assignment),to_jsonb(saved_assignment),COALESCE(normalized_reason,'Removed from project team.'));
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.read_job_assignment_directory_v5(uuid),
  public.set_job_user_assignment_v5(uuid,text,boolean,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_job_assignment_directory_v5(uuid),
  public.set_job_user_assignment_v5(uuid,text,boolean,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_v5_change_order_action()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  action_id text;
  decision jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_id := 'AUD-019'; -- create a Change Order or controlled revision draft
  ELSIF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
    action_id := 'AUD-017'; -- archive
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    action_id := CASE
      WHEN OLD.status = 'draft' AND NEW.status = 'submitted' THEN 'CFG-007'
      -- CFG-009 is intentionally staged until existing jobs have explicit
      -- project_manager assignments. The authoritative approval RPC retains
      -- its legacy permission/state/atomic-posting checks in the interim.
      WHEN OLD.status = 'submitted' AND NEW.status = 'approved' THEN NULL
      WHEN OLD.status = 'submitted' AND NEW.status = 'denied' THEN 'V3-001'
      WHEN OLD.status = 'approved' AND NEW.status = 'voided' THEN 'V3-005'
      ELSE 'AUD-021'
    END;
  ELSIF OLD.signed_document_id IS DISTINCT FROM NEW.signed_document_id
     OR OLD.certification_state IS DISTINCT FROM NEW.certification_state
     OR OLD.verification_name IS DISTINCT FROM NEW.verification_name
     OR OLD.decision_certification_state IS DISTINCT FROM NEW.decision_certification_state
     OR OLD.decision_name IS DISTINCT FROM NEW.decision_name THEN
    action_id := 'AUD-018'; -- certify signed authorization or decision
  ELSE
    action_id := 'AUD-021'; -- ordinary draft/revision metadata update
  END IF;

  IF action_id IS NULL THEN
    RETURN NEW;
  END IF;

  decision := public.current_scoped_authorization_decision(
    action_id,
    jsonb_build_object('job_id', NEW.job_id)
  );

  IF COALESCE((decision->>'allowed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Change Order action % is not authorized: %',
      action_id,
      COALESCE(decision->>'denial', 'authorization_denied')
      USING ERRCODE = '42501',
            DETAIL = decision::text,
            HINT = 'Confirm the employee business role, project assignment, Department scope, and applicable permission.';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS enforce_v5_change_order_action_trigger
  ON public.change_orders;

CREATE TRIGGER enforce_v5_change_order_action_trigger
  BEFORE INSERT OR UPDATE ON public.change_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_v5_change_order_action();

REVOKE ALL ON FUNCTION public.enforce_v5_change_order_action()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.enforce_v5_change_order_action() IS
  'Fail-closed v5 action/scope enforcement for Change Order mutations. Existing RPC authorization remains additive during reconciliation.';

NOTIFY pgrst, 'reload schema';
