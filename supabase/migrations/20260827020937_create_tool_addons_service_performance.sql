-- Reusable Tool Add-Ons access framework and the first Electrical add-on.
CREATE TABLE public.tool_addons (
  addon_key TEXT PRIMARY KEY CHECK (addon_key ~ '^[a-z][a-z0-9_]*$'),
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.tool_addon_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_key TEXT NOT NULL REFERENCES public.tool_addons(addon_key) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(BTRIM(reason)) BETWEEN 3 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (addon_key, clerk_user_id)
);

CREATE TRIGGER set_tool_addons_updated_at BEFORE UPDATE ON public.tool_addons
FOR EACH ROW EXECUTE FUNCTION public.touch_user_permissions_updated_at();
CREATE TRIGGER set_tool_addon_access_updated_at BEFORE UPDATE ON public.tool_addon_access
FOR EACH ROW EXECUTE FUNCTION public.touch_user_permissions_updated_at();

INSERT INTO public.tool_addons (addon_key, label, category, description)
VALUES ('service_performance', 'Service Performance', 'electrical',
  'Electrical service-call billing, cumulative hard-cost snapshots, profitability, and collections.')
ON CONFLICT (addon_key) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  is_active = TRUE;

CREATE OR REPLACE FUNCTION public.current_user_can_access_addon(p_addon_key TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    public.current_user_has_developer_access()
    OR EXISTS (
      SELECT 1
      FROM public.tool_addon_access access
      JOIN public.tool_addons addon ON addon.addon_key = access.addon_key
      JOIN public.user_permissions up ON up.clerk_user_id = access.clerk_user_id
      WHERE access.addon_key = p_addon_key
        AND access.clerk_user_id = auth.jwt() ->> 'sub'
        AND access.enabled = TRUE
        AND addon.is_active = TRUE
        AND up.is_active = TRUE
    ), FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_can_access_addon(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_addon(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_current_user_addons()
RETURNS TABLE (addon_key TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT addon.addon_key
  FROM public.tool_addons addon
  WHERE addon.is_active = TRUE
    AND public.current_user_can_access_addon(addon.addon_key)
  ORDER BY addon.label;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_addons() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_user_addons() TO authenticated;

CREATE OR REPLACE FUNCTION public.read_developer_addon_console()
RETURNS TABLE (
  user_id TEXT,
  display_name TEXT,
  email TEXT,
  role TEXT,
  division TEXT,
  addon_key TEXT,
  addon_label TEXT,
  addon_category TEXT,
  enabled BOOLEAN,
  access_reason TEXT,
  access_updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT up.clerk_user_id, up.display_name, up.email, up.role, up.division,
    addon.addon_key, addon.label, addon.category,
    COALESCE(access.enabled, FALSE), access.reason, access.updated_at
  FROM public.user_permissions up
  CROSS JOIN public.tool_addons addon
  LEFT JOIN public.tool_addon_access access
    ON access.clerk_user_id = up.clerk_user_id AND access.addon_key = addon.addon_key
  WHERE up.is_active = TRUE AND addon.is_active = TRUE
  ORDER BY up.display_name NULLS LAST, up.email NULLS LAST, addon.label;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_addon_access(
  p_user_id TEXT,
  p_addon_key TEXT,
  p_enabled BOOLEAN,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  previous_row public.tool_addon_access%ROWTYPE;
  saved_row public.tool_addon_access%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required' USING ERRCODE = '42501';
  END IF;
  IF length(BTRIM(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_permissions WHERE clerk_user_id = p_user_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Active user was not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tool_addons WHERE addon_key = p_addon_key AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Active add-on was not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO previous_row FROM public.tool_addon_access
  WHERE clerk_user_id = p_user_id AND addon_key = p_addon_key;

  INSERT INTO public.tool_addon_access (addon_key, clerk_user_id, enabled, updated_by, reason)
  VALUES (p_addon_key, p_user_id, p_enabled, actor_id, BTRIM(p_reason))
  ON CONFLICT (addon_key, clerk_user_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    updated_by = EXCLUDED.updated_by,
    reason = EXCLUDED.reason,
    updated_at = NOW()
  RETURNING * INTO saved_row;

  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note)
  VALUES (actor_id, actor_id, 'tool_addon_access', saved_row.id::TEXT, 'permission_change',
    CASE WHEN previous_row.id IS NULL THEN NULL ELSE to_jsonb(previous_row) END,
    to_jsonb(saved_row), BTRIM(p_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.read_developer_addon_console() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_user_addon_access(TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_developer_addon_console() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_addon_access(TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

ALTER TABLE public.tool_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_addon_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY tool_addons_authorized_read ON public.tool_addons FOR SELECT TO authenticated
USING (public.current_user_can_access_addon(addon_key) OR public.current_user_has_developer_access());
CREATE POLICY tool_addon_access_developer_read ON public.tool_addon_access FOR SELECT TO authenticated
USING (public.current_user_has_developer_access());
REVOKE ALL ON public.tool_addons, public.tool_addon_access FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tool_addons, public.tool_addon_access TO authenticated;

-- Service Performance attaches to canonical public.jobs service-call records.
CREATE TABLE public.svc_service_profiles (
  job_id UUID PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  classification TEXT NOT NULL DEFAULT 'commercial' CHECK (classification IN ('residential','commercial','internal_northgate')),
  billing_method TEXT NOT NULL DEFAULT 'time_and_materials' CHECK (billing_method IN ('time_and_materials','quoted','warranty_no_charge')),
  call_kind TEXT NOT NULL DEFAULT 'original' CHECK (call_kind IN ('original','callback','warranty','return_visit')),
  related_job_id UUID REFERENCES public.jobs(id),
  completed_at TIMESTAMPTZ,
  financially_closed_at TIMESTAMPTZ,
  financially_closed_by TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.svc_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  summary TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE public.svc_labor_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES public.svc_visits(id) ON DELETE SET NULL,
  employee_profile_id UUID REFERENCES public.employee_profiles(id) ON DELETE SET NULL,
  employee_name_snapshot TEXT NOT NULL,
  classification_snapshot TEXT NOT NULL,
  worked_on DATE NOT NULL,
  hours NUMERIC(10,2) NOT NULL CHECK (hours >= 0),
  billable_rate_snapshot NUMERIC(12,2) NOT NULL CHECK (billable_rate_snapshot >= 0),
  billable_amount NUMERIC(14,2) GENERATED ALWAYS AS (ROUND(hours * billable_rate_snapshot, 2)) STORED,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.svc_cost_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual','import')),
  labor_hard_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (labor_hard_cost >= 0),
  material_hard_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (material_hard_cost >= 0),
  other_hard_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_hard_cost >= 0),
  total_hard_cost NUMERIC(14,2) GENERATED ALWAYS AS (labor_hard_cost + material_hard_cost + other_hard_cost) STORED,
  cost_through DATE NOT NULL,
  reconciliation_status TEXT NOT NULL DEFAULT 'preliminary' CHECK (reconciliation_status IN ('preliminary','final')),
  source_note TEXT NOT NULL CHECK (length(BTRIM(source_note)) BETWEEN 3 AND 1000),
  source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  activated_at TIMESTAMPTZ,
  activated_by TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX svc_cost_snapshots_one_active_idx ON public.svc_cost_snapshots(job_id) WHERE is_active;
CREATE INDEX svc_cost_snapshots_job_created_idx ON public.svc_cost_snapshots(job_id, created_at DESC);
CREATE INDEX svc_service_profiles_related_job_idx ON public.svc_service_profiles(related_job_id) WHERE related_job_id IS NOT NULL;
CREATE INDEX svc_visits_job_started_idx ON public.svc_visits(job_id, started_at DESC);
CREATE INDEX svc_labor_lines_job_worked_idx ON public.svc_labor_lines(job_id, worked_on DESC);
CREATE INDEX svc_labor_lines_visit_idx ON public.svc_labor_lines(visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX svc_labor_lines_employee_idx ON public.svc_labor_lines(employee_profile_id) WHERE employee_profile_id IS NOT NULL;
CREATE INDEX svc_cost_snapshots_source_document_idx ON public.svc_cost_snapshots(source_document_id) WHERE source_document_id IS NOT NULL;

CREATE TABLE public.svc_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  invoice_number TEXT,
  invoice_date DATE NOT NULL,
  revenue_excluding_tax NUMERIC(14,2) NOT NULL CHECK (revenue_excluding_tax >= 0),
  sales_tax NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sales_tax >= 0),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','void')),
  note TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.svc_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.svc_invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reference TEXT,
  note TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX svc_invoices_job_date_idx ON public.svc_invoices(job_id, invoice_date DESC);
CREATE INDEX svc_payments_invoice_date_idx ON public.svc_payments(invoice_id, payment_date DESC);

CREATE TRIGGER set_svc_service_profiles_updated_at BEFORE UPDATE ON public.svc_service_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_user_permissions_updated_at();
CREATE TRIGGER set_svc_visits_updated_at BEFORE UPDATE ON public.svc_visits FOR EACH ROW EXECUTE FUNCTION public.touch_user_permissions_updated_at();
CREATE TRIGGER set_svc_invoices_updated_at BEFORE UPDATE ON public.svc_invoices FOR EACH ROW EXECUTE FUNCTION public.touch_user_permissions_updated_at();

CREATE OR REPLACE FUNCTION public.svc_activate_cost_snapshot(p_snapshot_id UUID, p_mark_final BOOLEAN DEFAULT FALSE)
RETURNS public.svc_cost_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  target public.svc_cost_snapshots%ROWTYPE;
  saved public.svc_cost_snapshots%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR public.current_user_can_access_addon('service_performance') IS NOT TRUE THEN
    RAISE EXCEPTION 'Service Performance access is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.svc_cost_snapshots WHERE id = p_snapshot_id FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Cost snapshot was not found' USING ERRCODE = 'P0002'; END IF;
  IF public.current_user_can_access_service_job(target.job_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Service call access is required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.svc_cost_snapshots SET is_active = FALSE WHERE job_id = target.job_id AND is_active = TRUE AND id <> target.id;
  UPDATE public.svc_cost_snapshots SET
    is_active = TRUE,
    reconciliation_status = CASE WHEN p_mark_final THEN 'final' ELSE reconciliation_status END,
    activated_at = NOW(), activated_by = actor_id
  WHERE id = target.id RETURNING * INTO saved;
  INSERT INTO public.change_logs (user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES (actor_id,actor_id,'svc_cost_snapshots',saved.id::TEXT,'update',to_jsonb(target),to_jsonb(saved),'Activated cumulative service hard-cost snapshot.');
  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.svc_activate_cost_snapshot(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svc_activate_cost_snapshot(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.svc_create_manual_cost_snapshot(
  p_job_id UUID,
  p_labor_hard_cost NUMERIC,
  p_material_hard_cost NUMERIC,
  p_other_hard_cost NUMERIC,
  p_cost_through DATE,
  p_reconciliation_status TEXT,
  p_source_note TEXT
)
RETURNS public.svc_cost_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  saved public.svc_cost_snapshots%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR public.current_user_can_access_service_job(p_job_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Service call access is required' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_labor_hard_cost,-1)<0 OR COALESCE(p_material_hard_cost,-1)<0 OR COALESCE(p_other_hard_cost,-1)<0 THEN
    RAISE EXCEPTION 'Hard costs cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF p_cost_through IS NULL OR p_reconciliation_status NOT IN ('preliminary','final') OR length(BTRIM(COALESCE(p_source_note,'')))<3 THEN
    RAISE EXCEPTION 'Cost-through date, reconciliation status, and source note are required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.jobs WHERE id=p_job_id FOR UPDATE;
  UPDATE public.svc_cost_snapshots SET is_active=FALSE WHERE job_id=p_job_id AND is_active=TRUE;
  INSERT INTO public.svc_cost_snapshots (
    job_id,source_type,labor_hard_cost,material_hard_cost,other_hard_cost,cost_through,
    reconciliation_status,source_note,is_active,activated_at,activated_by,created_by
  ) VALUES (
    p_job_id,'manual',p_labor_hard_cost,p_material_hard_cost,p_other_hard_cost,p_cost_through,
    p_reconciliation_status,BTRIM(p_source_note),TRUE,NOW(),actor_id,actor_id
  ) RETURNING * INTO saved;

  INSERT INTO public.change_logs (user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES (actor_id,actor_id,'svc_cost_snapshots',saved.id::TEXT,'create',NULL,to_jsonb(saved),'Created and activated cumulative manual service hard-cost snapshot.');
  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.svc_create_manual_cost_snapshot(UUID, NUMERIC, NUMERIC, NUMERIC, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svc_create_manual_cost_snapshot(UUID, NUMERIC, NUMERIC, NUMERIC, DATE, TEXT, TEXT) TO authenticated;

ALTER TABLE public.svc_service_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svc_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svc_labor_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svc_cost_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svc_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svc_payments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_can_access_service_job(p_job_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    public.current_user_can_access_addon('service_performance')
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.user_permissions up ON up.clerk_user_id = auth.jwt() ->> 'sub'
      WHERE j.id = p_job_id
        AND j.job_type = 'service_call'
        AND j.archived_at IS NULL
        AND up.is_active = TRUE
        AND (
          public.current_user_has_developer_access()
          OR up.division = j.division
          OR COALESCE((public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)->>'can_view_all_divisions')::BOOLEAN, FALSE)
        )
    ), FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_can_access_service_job(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_service_job(UUID) TO authenticated;

CREATE POLICY svc_profiles_access ON public.svc_service_profiles FOR ALL TO authenticated
USING (public.current_user_can_access_service_job(job_id)) WITH CHECK (public.current_user_can_access_service_job(job_id));
CREATE POLICY svc_visits_access ON public.svc_visits FOR ALL TO authenticated
USING (public.current_user_can_access_service_job(job_id)) WITH CHECK (public.current_user_can_access_service_job(job_id));
CREATE POLICY svc_labor_select ON public.svc_labor_lines FOR SELECT TO authenticated
USING (public.current_user_can_access_service_job(job_id));
CREATE POLICY svc_labor_insert ON public.svc_labor_lines FOR INSERT TO authenticated
WITH CHECK (public.current_user_can_access_service_job(job_id));
CREATE POLICY svc_cost_snapshots_select ON public.svc_cost_snapshots FOR SELECT TO authenticated
USING (public.current_user_can_access_service_job(job_id));
CREATE POLICY svc_invoices_access ON public.svc_invoices FOR ALL TO authenticated
USING (public.current_user_can_access_service_job(job_id)) WITH CHECK (public.current_user_can_access_service_job(job_id));
CREATE POLICY svc_payments_select ON public.svc_payments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.svc_invoices i WHERE i.id=invoice_id AND public.current_user_can_access_service_job(i.job_id)));
CREATE POLICY svc_payments_insert ON public.svc_payments FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.svc_invoices i WHERE i.id=invoice_id AND public.current_user_can_access_service_job(i.job_id)));

CREATE VIEW public.svc_call_financials WITH (security_invoker = TRUE) AS
SELECT j.id AS job_id, j.job_number, j.service_call_number, j.name AS customer_name,
  CONCAT_WS(', ', NULLIF(j.city,''), NULLIF(j.state,'')) AS location,
  j.description AS scope, j.status AS job_status, j.created_at,
  profile.classification, profile.billing_method, profile.call_kind, profile.completed_at, profile.financially_closed_at,
  COALESCE(labor.billable_labor,0)::NUMERIC(14,2) AS billable_labor,
  COALESCE(invoice.invoiced_revenue,0)::NUMERIC(14,2) AS invoiced_revenue,
  COALESCE(payment.collected,0)::NUMERIC(14,2) AS collected,
  COALESCE(cost.labor_hard_cost,0)::NUMERIC(14,2) AS labor_hard_cost,
  COALESCE(cost.material_hard_cost,0)::NUMERIC(14,2) AS material_hard_cost,
  COALESCE(cost.other_hard_cost,0)::NUMERIC(14,2) AS other_hard_cost,
  COALESCE(cost.total_hard_cost,0)::NUMERIC(14,2) AS total_hard_cost,
  (COALESCE(invoice.invoiced_revenue,0)-COALESCE(cost.total_hard_cost,0))::NUMERIC(14,2) AS gross_profit,
  CASE WHEN COALESCE(invoice.invoiced_revenue,0)=0 THEN NULL ELSE
    ROUND(((COALESCE(invoice.invoiced_revenue,0)-COALESCE(cost.total_hard_cost,0))/invoice.invoiced_revenue)*100,2) END AS gross_margin,
  (COALESCE(invoice.invoiced_revenue,0)-COALESCE(payment.collected,0))::NUMERIC(14,2) AS outstanding,
  cost.cost_through, cost.reconciliation_status
FROM public.jobs j
LEFT JOIN public.svc_service_profiles profile ON profile.job_id=j.id
LEFT JOIN LATERAL (SELECT SUM(billable_amount) billable_labor FROM public.svc_labor_lines WHERE job_id=j.id) labor ON TRUE
LEFT JOIN LATERAL (SELECT SUM(revenue_excluding_tax) invoiced_revenue FROM public.svc_invoices WHERE job_id=j.id AND status='posted') invoice ON TRUE
LEFT JOIN LATERAL (SELECT SUM(p.amount) collected FROM public.svc_payments p JOIN public.svc_invoices i ON i.id=p.invoice_id WHERE i.job_id=j.id AND i.status='posted') payment ON TRUE
LEFT JOIN LATERAL (SELECT * FROM public.svc_cost_snapshots WHERE job_id=j.id AND is_active=TRUE LIMIT 1) cost ON TRUE
WHERE j.job_type='service_call' AND j.archived_at IS NULL;

CREATE VIEW public.svc_monthly_performance WITH (security_invoker = TRUE) AS
SELECT date_trunc('month', COALESCE(completed_at, created_at))::DATE AS performance_month,
  COUNT(*) AS call_count,
  SUM(invoiced_revenue)::NUMERIC(14,2) AS invoiced_revenue,
  SUM(collected)::NUMERIC(14,2) AS collected,
  SUM(total_hard_cost)::NUMERIC(14,2) AS total_hard_cost,
  SUM(gross_profit)::NUMERIC(14,2) AS gross_profit,
  CASE WHEN SUM(invoiced_revenue)=0 THEN NULL ELSE ROUND((SUM(gross_profit)/SUM(invoiced_revenue))*100,2) END AS gross_margin
FROM public.svc_call_financials
GROUP BY 1;

REVOKE ALL ON public.svc_service_profiles, public.svc_visits, public.svc_labor_lines, public.svc_cost_snapshots, public.svc_invoices, public.svc_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.svc_service_profiles, public.svc_visits, public.svc_invoices TO authenticated;
GRANT SELECT, INSERT ON public.svc_labor_lines, public.svc_payments TO authenticated;
GRANT SELECT ON public.svc_cost_snapshots TO authenticated;
REVOKE ALL ON public.svc_call_financials, public.svc_monthly_performance FROM PUBLIC, anon;
GRANT SELECT ON public.svc_call_financials, public.svc_monthly_performance TO authenticated;
