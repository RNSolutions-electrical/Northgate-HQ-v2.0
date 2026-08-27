-- Northgate terminology normalization.
-- `division` remains the compatibility storage/API column for organizational
-- scope. Application copy calls it Department; project cost-code divisions
-- continue to live in job_budget_divisions.
COMMENT ON COLUMN public.user_permissions.division IS
  'Legacy storage name for the user primary Department (Electrical, Construction, Admin). Project cost-code Divisions are separate job_budget_divisions records.';
COMMENT ON COLUMN public.jobs.division IS
  'Legacy storage name for the owning Northgate Department. Project cost-code Divisions are separate job_budget_divisions records.';

-- Canonical application authority hierarchy. Existing values are normalized
-- rather than rejected so historical records remain readable.
UPDATE public.user_permissions
SET role = CASE role
  WHEN 'Administrator' THEN 'Director'
  WHEN 'Project Manager' THEN 'Manager'
  WHEN 'Field Supervisor' THEN 'Supervisor'
  WHEN 'Estimator' THEN 'User'
  ELSE role
END
WHERE role IN ('Administrator', 'Project Manager', 'Field Supervisor', 'Estimator');

ALTER TABLE public.user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_role_check;
ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_role_check
  CHECK (role = ANY (ARRAY['User', 'Supervisor', 'Manager', 'Director', 'Developer']));

-- Project finance is distinct from operational/asset cost information.
-- The legacy can_view_financials flag remains in defaults for compatibility
-- with existing Accounting surfaces while project read paths use the explicit
-- flags below.
CREATE OR REPLACE FUNCTION public.default_permissions_for_role(p_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  base JSONB;
  budget_approver BOOLEAN;
  full_project_financials BOOLEAN;
BEGIN
  CASE p_role
    WHEN 'Developer' THEN
      base := '{"can_access_developer":true,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Director' THEN
      base := '{"can_access_developer":false,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Manager' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Supervisor' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":true}'::jsonb;
    ELSE
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":false,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":false,"can_view_all_divisions":false,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
  END CASE;

  budget_approver := COALESCE((base ->> 'can_approve_budget')::BOOLEAN, FALSE);
  full_project_financials := p_role IN ('Manager', 'Director', 'Developer');

  RETURN base || jsonb_build_object(
    'can_view_asset_financials', TRUE,
    'can_view_project_financials', p_role IN ('Supervisor', 'Manager', 'Director', 'Developer'),
    'can_view_protected_project_financials', full_project_financials,
    'can_express_checkout', COALESCE((base ->> 'can_inventory_transactions')::BOOLEAN, FALSE),
    'can_approve_express_checkout', p_role IN ('Developer', 'Manager', 'Director'),
    'can_defer_completion', p_role = 'Developer',
    'can_create_change_orders', budget_approver,
    'can_submit_change_orders', budget_approver,
    'can_verify_change_orders', budget_approver,
    'can_approve_change_orders', budget_approver,
    'can_revise_change_orders', budget_approver
  );
END;
$$;

-- Explicit metadata prevents protected access from relying on description
-- matching. OH&P/fee is the existing protected category and is backfilled.
ALTER TABLE public.job_budget_lines
  ADD COLUMN IF NOT EXISTS is_protected_financial BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.job_revenue_lines
  ADD COLUMN IF NOT EXISTS is_protected_financial BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE public.job_budget_lines
SET is_protected_financial = TRUE
WHERE category = 'ohp_fee' AND is_protected_financial IS FALSE;
CREATE INDEX IF NOT EXISTS job_budget_lines_protected_scope_idx
  ON public.job_budget_lines (job_id, is_protected_financial)
  WHERE archived_at IS NULL;
COMMENT ON COLUMN public.job_budget_lines.is_protected_financial IS
  'When true, requires can_view_protected_project_financials. Used by RLS so protected rows and derived totals are not returned to unauthorized users.';

CREATE OR REPLACE FUNCTION public.enforce_protected_financial_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.is_protected_financial IS DISTINCT FROM OLD.is_protected_financial
    AND public.current_user_can_access_job(NEW.job_id, 'can_view_protected_project_financials') IS NOT TRUE THEN
    RAISE EXCEPTION 'Protected project financial permission is required to change financial access classification' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT'
    AND NEW.is_protected_financial IS TRUE
    AND public.current_user_can_access_job(NEW.job_id, 'can_view_protected_project_financials') IS NOT TRUE THEN
    RAISE EXCEPTION 'Protected project financial permission is required to create a protected financial line' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_protected_financial_write() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_protected_budget_financial_write_trigger ON public.job_budget_lines;
CREATE TRIGGER enforce_protected_budget_financial_write_trigger
  BEFORE INSERT OR UPDATE OF is_protected_financial ON public.job_budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_protected_financial_write();
DROP TRIGGER IF EXISTS enforce_protected_revenue_financial_write_trigger ON public.job_revenue_lines;
CREATE TRIGGER enforce_protected_revenue_financial_write_trigger
  BEFORE INSERT OR UPDATE OF is_protected_financial ON public.job_revenue_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_protected_financial_write();

-- Preserve individual overrides while expanding the canonical override set.
CREATE OR REPLACE FUNCTION public.set_permission_override(
  p_user_id TEXT,
  p_permission_flag TEXT,
  p_granted BOOLEAN,
  p_reason TEXT
)
RETURNS TABLE (
  id UUID, user_id TEXT, permission_flag TEXT, granted BOOLEAN,
  granted_by_user_id TEXT, granted_at TIMESTAMPTZ, reason TEXT, is_active BOOLEAN,
  previous_effective_permissions JSONB, new_effective_permissions JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  canonical_flags TEXT[] := ARRAY[
    'can_manage_users','can_view_reports','can_edit_catalog','can_manage_employees',
    'can_manage_vehicles','can_manage_tools','can_manage_inventory','can_inventory_transactions',
    'can_view_all_divisions','can_estimate','can_approve_estimates','can_create_jobs',
    'can_manage_jobs','can_approve_budget','can_view_financials','can_view_asset_financials',
    'can_view_project_financials','can_view_protected_project_financials','can_field_access',
    'can_archive_records','can_manage_change_orders','can_create_change_orders',
    'can_submit_change_orders','can_verify_change_orders','can_approve_change_orders',
    'can_revise_change_orders','can_express_checkout','can_approve_express_checkout','can_defer_completion'
  ];
  actor TEXT := auth.jwt() ->> 'sub';
  target public.user_permissions%ROWTYPE;
  actor_name TEXT;
  prior JSONB;
  next_permissions JSONB;
  saved public.user_permission_overrides%ROWTYPE;
BEGIN
  IF actor IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required to manage permission overrides' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(BTRIM(p_user_id), '') IS NULL OR NULLIF(BTRIM(p_permission_flag), '') IS NULL OR p_granted IS NULL OR NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'user, permission, grant state, and reason are required';
  END IF;
  IF p_permission_flag <> ALL(canonical_flags) THEN
    RAISE EXCEPTION 'permission_flag must be a canonical permission';
  END IF;
  SELECT * INTO target FROM public.user_permissions WHERE clerk_user_id = p_user_id AND is_active LIMIT 1 FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'active target user permission record is required'; END IF;
  IF COALESCE((public.effective_permissions_for_user(target.role, target.division, target.permission_overrides)->>'can_access_developer')::BOOLEAN,FALSE) THEN
    RAISE EXCEPTION 'Developer users cannot be targeted through this override system';
  END IF;
  prior := public.effective_permissions_for_user(target.role, target.division, target.permission_overrides);
  UPDATE public.user_permission_overrides SET is_active=FALSE
    WHERE user_id=p_user_id AND permission_flag=p_permission_flag AND is_active=TRUE;
  INSERT INTO public.user_permission_overrides (user_id,permission_flag,granted,granted_by_user_id,reason,is_active)
  VALUES (p_user_id,p_permission_flag,p_granted,actor,BTRIM(p_reason),TRUE) RETURNING * INTO saved;
  next_permissions := public.effective_permissions_for_user(target.role, target.division, target.permission_overrides);
  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor) INTO actor_name FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1;
  INSERT INTO public.change_logs (user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES (actor,actor_name,'user_permission_overrides',saved.id::TEXT,'permission_change',
    jsonb_build_object('affected_user_id',p_user_id,'permission_flag',p_permission_flag,'effective_permissions',prior),
    jsonb_build_object('affected_user_id',p_user_id,'permission_flag',p_permission_flag,'effective_permissions',next_permissions,'granted',p_granted),BTRIM(p_reason));
  RETURN QUERY SELECT saved.id,saved.user_id,saved.permission_flag,saved.granted,saved.granted_by_user_id,saved.granted_at,saved.reason,saved.is_active,prior,next_permissions;
END;
$$;

-- Server-side project-financial scope. Policies are mutually exclusive from
-- the legacy broad financial policies, so Postgres cannot OR them together.
DROP POLICY IF EXISTS job_budget_lines_read ON public.job_budget_lines;
DROP POLICY IF EXISTS job_budget_lines_read_linked ON public.job_budget_lines;
CREATE POLICY job_budget_lines_read_project_financials ON public.job_budget_lines
  FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    AND public.current_user_can_access_job(job_id, 'can_view_project_financials')
    AND (NOT is_protected_financial OR public.current_user_can_access_job(job_id, 'can_view_protected_project_financials'))
  );

DROP POLICY IF EXISTS job_budget_divisions_read ON public.job_budget_divisions;
CREATE POLICY job_budget_divisions_read_project_financials ON public.job_budget_divisions
  FOR SELECT TO authenticated
  USING (archived_at IS NULL AND public.current_user_can_access_job(job_id, 'can_view_project_financials'));

DROP POLICY IF EXISTS job_revenue_lines_read ON public.job_revenue_lines;
DROP POLICY IF EXISTS job_revenue_lines_read_linked ON public.job_revenue_lines;
CREATE POLICY job_revenue_lines_read_project_financials ON public.job_revenue_lines
  FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    AND public.current_user_can_access_job(job_id, 'can_view_project_financials')
    AND (NOT is_protected_financial OR public.current_user_can_access_job(job_id, 'can_view_protected_project_financials'))
  );

DROP POLICY IF EXISTS change_orders_read ON public.change_orders;
CREATE POLICY change_orders_read_project_financials ON public.change_orders
  FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    AND public.current_user_can_access_job(job_id, 'can_view_project_financials')
    AND (
      public.current_user_can_access_job(job_id, 'can_view_protected_project_financials')
      OR NOT EXISTS (
        SELECT 1 FROM public.change_order_allocations allocation
        JOIN public.job_budget_lines line ON line.id = allocation.budget_line_id
        WHERE allocation.change_order_id = change_orders.id
          AND line.is_protected_financial
      )
    )
  );

DROP POLICY IF EXISTS change_order_allocations_read ON public.change_order_allocations;
CREATE POLICY change_order_allocations_read_project_financials ON public.change_order_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.change_orders co
      JOIN public.job_budget_lines line ON line.id = change_order_allocations.budget_line_id
      WHERE co.id = change_order_allocations.change_order_id
        AND public.current_user_can_access_job(co.job_id, 'can_view_project_financials')
        AND (NOT line.is_protected_financial OR public.current_user_can_access_job(co.job_id, 'can_view_protected_project_financials'))
    )
  );

DROP POLICY IF EXISTS change_order_postings_read ON public.change_order_financial_postings;
CREATE POLICY change_order_postings_read_project_financials ON public.change_order_financial_postings
  FOR SELECT TO authenticated
  USING (
    public.current_user_can_access_job(job_id, 'can_view_project_financials')
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.job_budget_lines line
        WHERE line.id = change_order_financial_postings.job_budget_line_id
          AND line.is_protected_financial
      )
      OR public.current_user_can_access_job(job_id, 'can_view_protected_project_financials')
    )
  );

-- Directors are normal operational administrators, not Developers.
CREATE OR REPLACE FUNCTION public.current_user_can_edit_division(p_division TEXT, p_required_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
BEGIN
  IF jwt_subject IS NULL OR NULLIF(BTRIM(p_required_permission), '') IS NULL THEN RETURN FALSE; END IF;
  SELECT * INTO caller FROM public.user_permissions up WHERE up.clerk_user_id=jwt_subject AND up.is_active LIMIT 1;
  IF caller.id IS NULL THEN RETURN FALSE; END IF;
  caller_permissions := public.effective_permissions_for_user(caller.role,caller.division,caller.permission_overrides);
  RETURN COALESCE((caller_permissions ->> p_required_permission)::BOOLEAN,FALSE)
    AND (caller.role IN ('Developer','Director','Manager') OR (p_division IS NOT NULL AND caller.division=p_division));
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_permission_profile(
  p_user_id TEXT,
  p_role TEXT,
  p_division TEXT,
  p_reason TEXT
)
RETURNS TABLE (user_id TEXT, role TEXT, division TEXT, effective_permissions JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor TEXT := auth.jwt() ->> 'sub';
  target public.user_permissions%ROWTYPE;
  caller public.user_permissions%ROWTYPE;
  prior JSONB;
  next_permissions JSONB;
  actor_name TEXT;
  allowed_roles TEXT[] := ARRAY['User','Supervisor','Manager','Director','Developer'];
  allowed_departments TEXT[] := ARRAY['Electrical','Construction','Admin'];
BEGIN
  IF actor IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required to update permission profiles' USING ERRCODE='42501';
  END IF;
  IF NULLIF(BTRIM(p_user_id),'') IS NULL OR NULLIF(BTRIM(p_role),'') IS NULL OR NULLIF(BTRIM(p_reason),'') IS NULL THEN
    RAISE EXCEPTION 'target user, role, and reason are required';
  END IF;
  IF p_role <> ALL(allowed_roles) THEN RAISE EXCEPTION 'role is not supported'; END IF;
  IF p_division IS NOT NULL AND p_division <> ALL(allowed_departments) THEN RAISE EXCEPTION 'department is not supported'; END IF;
  SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id=actor AND is_active LIMIT 1;
  SELECT * INTO target FROM public.user_permissions WHERE clerk_user_id=p_user_id AND is_active LIMIT 1 FOR UPDATE;
  IF caller.id IS NULL OR target.id IS NULL THEN RAISE EXCEPTION 'active caller and target user permission records are required'; END IF;
  prior := public.effective_permissions_for_user(target.role,target.division,target.permission_overrides);
  UPDATE public.user_permissions SET role=p_role, division=p_division, updated_at=NOW()
    WHERE clerk_user_id=p_user_id AND is_active RETURNING * INTO target;
  next_permissions := public.effective_permissions_for_user(target.role,target.division,target.permission_overrides);
  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor) INTO actor_name FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,actor_name,'user_permissions',target.id::TEXT,'permission_profile_update',
    jsonb_build_object('affected_user_id',p_user_id,'effective_permissions',prior),
    jsonb_build_object('affected_user_id',p_user_id,'role',p_role,'department',p_division,'effective_permissions',next_permissions),BTRIM(p_reason));
  RETURN QUERY SELECT p_user_id,target.role,target.division,next_permissions;
END;
$$;

REVOKE ALL ON FUNCTION public.set_permission_override(TEXT,TEXT,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_permission_override(TEXT,TEXT,BOOLEAN,TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_permission_override(TEXT,TEXT,BOOLEAN,TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.update_user_permission_profile(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_permission_profile(TEXT,TEXT,TEXT,TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_user_permission_profile(TEXT,TEXT,TEXT,TEXT) FROM anon;
