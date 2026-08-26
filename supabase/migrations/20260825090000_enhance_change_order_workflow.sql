-- HIGH RISK / REVIEW REQUIRED: money, permissions, document retention, and approval workflow.
-- This migration is additive. It preserves original budgets and manual budget changes.

ALTER TABLE public.user_permission_overrides
  DROP CONSTRAINT IF EXISTS user_permission_overrides_permission_flag_check;

ALTER TABLE public.user_permission_overrides
  ADD CONSTRAINT user_permission_overrides_permission_flag_check CHECK (
    permission_flag IN (
      'can_access_developer', 'can_manage_users', 'can_view_reports', 'can_edit_catalog',
      'can_manage_employees', 'can_manage_vehicles', 'can_manage_tools',
      'can_manage_inventory', 'can_inventory_transactions', 'can_view_all_divisions',
      'can_estimate', 'can_approve_estimates', 'can_create_jobs', 'can_manage_jobs',
      'can_approve_budget', 'can_view_financials', 'can_field_access',
      'can_archive_records', 'can_manage_change_orders', 'can_express_checkout',
      'can_approve_express_checkout', 'can_defer_completion',
      'can_create_change_orders', 'can_submit_change_orders',
      'can_verify_change_orders', 'can_approve_change_orders', 'can_revise_change_orders'
    )
  );

CREATE OR REPLACE FUNCTION public.default_permissions_for_role(p_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  base JSONB;
  budget_approver BOOLEAN;
BEGIN
  CASE p_role
    WHEN 'Developer' THEN
      base := '{"can_access_developer":true,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Manager' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Supervisor' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":true,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Administrator' THEN
      base := '{"can_access_developer":false,"can_manage_users":true,"can_view_reports":true,"can_edit_catalog":true,"can_manage_employees":true,"can_manage_vehicles":true,"can_manage_tools":true,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":false,"can_estimate":true,"can_approve_estimates":true,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":true,"can_field_access":true,"can_archive_records":true,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Project Manager' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":true,"can_inventory_transactions":true,"can_view_all_divisions":false,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":true,"can_manage_jobs":true,"can_approve_budget":true,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":true}'::jsonb;
    WHEN 'Estimator' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":true,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":false,"can_view_all_divisions":false,"can_estimate":true,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
    WHEN 'Field Supervisor' THEN
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":false,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":true,"can_view_all_divisions":false,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
    ELSE
      base := '{"can_access_developer":false,"can_manage_users":false,"can_view_reports":false,"can_edit_catalog":false,"can_manage_employees":false,"can_manage_vehicles":false,"can_manage_tools":false,"can_manage_inventory":false,"can_inventory_transactions":false,"can_view_all_divisions":false,"can_estimate":false,"can_approve_estimates":false,"can_create_jobs":false,"can_manage_jobs":false,"can_approve_budget":false,"can_view_financials":false,"can_field_access":true,"can_archive_records":false,"can_manage_change_orders":false}'::jsonb;
  END CASE;

  budget_approver := COALESCE((base ->> 'can_approve_budget')::BOOLEAN, FALSE);
  RETURN base || jsonb_build_object(
    'can_express_checkout', COALESCE((base ->> 'can_inventory_transactions')::BOOLEAN, FALSE),
    'can_approve_express_checkout', p_role IN ('Developer', 'Manager', 'Administrator'),
    'can_defer_completion', p_role = 'Developer',
    'can_create_change_orders', budget_approver,
    'can_submit_change_orders', budget_approver,
    'can_verify_change_orders', budget_approver,
    'can_approve_change_orders', budget_approver,
    'can_revise_change_orders', budget_approver
  );
END;
$$;

-- Preserve day-one access for users whose individual budget override differs from their role default.
WITH flags(permission_flag) AS (
  VALUES ('can_create_change_orders'), ('can_submit_change_orders'),
         ('can_verify_change_orders'), ('can_approve_change_orders'),
         ('can_revise_change_orders')
), current_access AS (
  SELECT up.clerk_user_id,
    COALESCE(
      (override_state.permissions ->> 'can_approve_budget')::BOOLEAN,
      (public.permission_base_for_user(up.role, up.division, up.permission_overrides) ->> 'can_approve_budget')::BOOLEAN,
      FALSE
    ) AS effective_budget,
    COALESCE((public.default_permissions_for_role(up.role) ->> 'can_approve_budget')::BOOLEAN, FALSE) AS role_budget
  FROM public.user_permissions up
  LEFT JOIN LATERAL (
    SELECT jsonb_object_agg(s.permission_flag, to_jsonb(CASE WHEN s.has_deny THEN FALSE ELSE s.has_grant END)) permissions
    FROM (
      SELECT uo.permission_flag, BOOL_OR(NOT uo.granted) has_deny, BOOL_OR(uo.granted) has_grant
      FROM public.user_permission_overrides uo
      WHERE uo.user_id=up.clerk_user_id AND uo.is_active=TRUE
      GROUP BY uo.permission_flag
    ) s
  ) override_state ON TRUE
  WHERE up.is_active = TRUE
)
INSERT INTO public.user_permission_overrides (
  user_id, permission_flag, granted, granted_by_user_id, reason, is_active
)
SELECT ca.clerk_user_id, flags.permission_flag, ca.effective_budget,
  'system:change-order-permission-migration',
  'Initial Change Order permission copied from effective can_approve_budget access.', TRUE
FROM current_access ca CROSS JOIN flags
WHERE ca.effective_budget IS DISTINCT FROM ca.role_budget
ON CONFLICT DO NOTHING;

ALTER TABLE public.change_orders DROP CONSTRAINT IF EXISTS change_orders_status_check;
INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
SELECT 'system:change-order-workflow-migration','System migration','change_orders',co.id::TEXT,'archive',to_jsonb(co),
  to_jsonb(co)||jsonb_build_object('archived_at',NOW(),'archived_by','system:change-order-workflow-migration','archive_reason','Archived as pre-workflow test data during Change Order workflow migration.'),
  'Archived as pre-workflow test data during Change Order workflow migration.'
FROM public.change_orders co WHERE co.archived_at IS NULL;
UPDATE public.change_orders
SET archived_at=COALESCE(archived_at,NOW()),
    archived_by=COALESCE(archived_by,'system:change-order-workflow-migration'),
    archive_reason=COALESCE(archive_reason,'Archived as pre-workflow test data during Change Order workflow migration.'),
    updated_at=NOW()
WHERE archived_at IS NULL;
UPDATE public.change_orders SET status = 'submitted' WHERE status = 'proposed';
ALTER TABLE public.change_orders
  ADD CONSTRAINT change_orders_status_check CHECK (status IN ('draft', 'submitted', 'approved', 'rejected'));

ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS change_order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exported_by TEXT,
  ADD COLUMN IF NOT EXISTS verified_by TEXT,
  ADD COLUMN IF NOT EXISTS verification_name TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certification_state BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS signed_document_id UUID,
  ADD COLUMN IF NOT EXISTS revision_of_id UUID,
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 0 CHECK (revision_number >= 0);

ALTER TABLE public.change_orders ALTER COLUMN status SET DEFAULT 'draft';
DROP TRIGGER IF EXISTS validate_approved_change_order_allocations ON public.change_orders;
UPDATE public.change_orders
SET submitted_at = COALESCE(submitted_at, created_at),
    created_by = COALESCE(created_by, submitted_by),
    updated_by = COALESCE(updated_by, submitted_by)
WHERE status IN ('submitted', 'approved', 'rejected');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='change_orders_revision_of_id_fkey' AND conrelid='public.change_orders'::regclass) THEN
    ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_revision_of_id_fkey
      FOREIGN KEY (revision_of_id) REFERENCES public.change_orders(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS change_orders_revision_of_id_idx ON public.change_orders (revision_of_id);

CREATE TABLE public.change_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES public.change_orders(id) ON DELETE RESTRICT,
  job_budget_line_id UUID NOT NULL REFERENCES public.job_budget_lines(id) ON DELETE RESTRICT,
  division TEXT NOT NULL,
  cost_code TEXT,
  description TEXT NOT NULL,
  vendor_name TEXT,
  material_amount NUMERIC NOT NULL DEFAULT 0 CHECK (material_amount >= 0),
  labor_amount NUMERIC NOT NULL DEFAULT 0 CHECK (labor_amount >= 0),
  equipment_amount NUMERIC NOT NULL DEFAULT 0 CHECK (equipment_amount >= 0),
  subcontract_amount NUMERIC NOT NULL DEFAULT 0 CHECK (subcontract_amount >= 0),
  other_amount NUMERIC NOT NULL DEFAULT 0 CHECK (other_amount >= 0),
  markup_amount NUMERIC NOT NULL DEFAULT 0 CHECK (markup_amount >= 0),
  line_total NUMERIC GENERATED ALWAYS AS
    (material_amount + labor_amount + equipment_amount + subcontract_amount + other_amount + markup_amount) STORED,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);
CREATE INDEX change_order_lines_change_order_id_idx ON public.change_order_lines (change_order_id, sort_order);
CREATE INDEX change_order_lines_budget_line_id_idx ON public.change_order_lines (job_budget_line_id);
ALTER TABLE public.change_order_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.change_order_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.change_order_lines TO authenticated;
CREATE POLICY change_order_lines_read ON public.change_order_lines FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id=change_order_id AND co.archived_at IS NULL
    AND public.current_user_can_read_division(co.division, 'can_view_financials'))
);

CREATE TABLE public.change_order_financial_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES public.change_orders(id) ON DELETE RESTRICT,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  job_budget_line_id UUID NOT NULL REFERENCES public.job_budget_lines(id) ON DELETE RESTRICT,
  division TEXT NOT NULL,
  cost_code TEXT,
  amount_delta NUMERIC NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_by TEXT NOT NULL,
  UNIQUE (change_order_id, job_budget_line_id)
);
CREATE INDEX change_order_postings_job_budget_idx ON public.change_order_financial_postings (job_id, job_budget_line_id);
ALTER TABLE public.change_order_financial_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.change_order_financial_postings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.change_order_financial_postings TO authenticated;
CREATE POLICY change_order_postings_read ON public.change_order_financial_postings FOR SELECT TO authenticated USING (
  public.current_user_can_read_division(division, 'can_view_financials')
);

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS change_order_id UUID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='documents_change_order_id_fkey' AND conrelid='public.documents'::regclass) THEN
    ALTER TABLE public.documents ADD CONSTRAINT documents_change_order_id_fkey
      FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS documents_change_order_id_idx ON public.documents (change_order_id) WHERE change_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS documents_active_signed_change_order_idx
  ON public.documents (change_order_id) WHERE change_order_id IS NOT NULL AND archived_at IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='change_orders_signed_document_id_fkey' AND conrelid='public.change_orders'::regclass) THEN
    ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_signed_document_id_fkey
      FOREIGN KEY (signed_document_id) REFERENCES public.documents(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS change_orders_signed_document_id_idx ON public.change_orders (signed_document_id);

CREATE OR REPLACE FUNCTION public.change_order_actor()
RETURNS TEXT LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT COALESCE(NULLIF(up.display_name,''), NULLIF(up.email,''), auth.jwt()->>'sub')
  FROM public.user_permissions up
  WHERE up.clerk_user_id=auth.jwt()->>'sub' AND up.is_active=TRUE LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.set_change_order_permission_override(
  p_user_id TEXT, p_permission_flag TEXT, p_granted BOOLEAN, p_reason TEXT
) RETURNS public.user_permission_overrides
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor_id TEXT:=auth.jwt()->>'sub'; target public.user_permissions%ROWTYPE;
  saved public.user_permission_overrides%ROWTYPE;
  allowed_flags TEXT[]:=ARRAY['can_create_change_orders','can_submit_change_orders','can_verify_change_orders','can_approve_change_orders','can_revise_change_orders'];
BEGIN
  IF actor_id IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN RAISE EXCEPTION 'Developer access is required' USING ERRCODE='42501'; END IF;
  IF p_permission_flag<>ALL(allowed_flags) OR NULLIF(BTRIM(COALESCE(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'canonical Change Order permission and reason are required'; END IF;
  SELECT * INTO target FROM public.user_permissions WHERE clerk_user_id=p_user_id AND is_active=TRUE FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'active target user is required'; END IF;
  IF COALESCE((public.permission_base_for_user(target.role,target.division,target.permission_overrides)->>'can_access_developer')::BOOLEAN,FALSE) THEN RAISE EXCEPTION 'Developer users cannot be targeted through this override system'; END IF;
  IF LENGTH(p_reason)>500 THEN RAISE EXCEPTION 'reason must be 500 characters or fewer'; END IF;
  UPDATE public.user_permission_overrides SET is_active=FALSE WHERE user_id=p_user_id AND permission_flag=p_permission_flag AND is_active=TRUE;
  INSERT INTO public.user_permission_overrides(user_id,permission_flag,granted,granted_by_user_id,reason,is_active)
  VALUES(p_user_id,p_permission_flag,p_granted,actor_id,BTRIM(p_reason),TRUE) RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor_id,public.change_order_actor(),'user_permission_overrides',saved.id::TEXT,'permission_change',NULL,to_jsonb(saved),BTRIM(p_reason));
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.save_job_change_order_draft(
  p_change_order_id UUID, p_job_id UUID, p_division TEXT, p_co_number TEXT,
  p_title TEXT, p_description TEXT, p_change_order_date DATE, p_internal_notes TEXT,
  p_lines JSONB, p_reason TEXT
) RETURNS public.change_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor_id TEXT := auth.jwt()->>'sub'; actor_name TEXT; target public.change_orders%ROWTYPE;
  saved public.change_orders%ROWTYPE; line JSONB; budget_line public.job_budget_lines%ROWTYPE;
  normalized_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason,'')),''); total NUMERIC := 0; before_lines JSONB := '[]'::JSONB;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE='28000'; END IF;
  IF p_job_id IS NULL OR NULLIF(BTRIM(p_co_number),'') IS NULL OR NULLIF(BTRIM(p_title),'') IS NULL OR normalized_reason IS NULL THEN RAISE EXCEPTION 'project, number, title, and reason are required'; END IF;
  IF jsonb_typeof(COALESCE(p_lines,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'lines must be an array'; END IF;
  actor_name := public.change_order_actor();
  IF p_change_order_id IS NULL THEN
    IF NOT public.current_user_can_edit_division(p_division,'can_create_change_orders') THEN RAISE EXCEPTION 'can_create_change_orders is required' USING ERRCODE='42501'; END IF;
    INSERT INTO public.change_orders(job_id,division,co_number,title,description,change_order_date,internal_notes,status,price_amount,cost_amount,created_by,updated_by)
    VALUES(p_job_id,p_division,BTRIM(p_co_number),BTRIM(p_title),NULLIF(BTRIM(COALESCE(p_description,'')),''),COALESCE(p_change_order_date,CURRENT_DATE),NULLIF(BTRIM(COALESCE(p_internal_notes,'')),''),'draft',0,0,actor_id,actor_id)
    RETURNING * INTO saved;
  ELSE
    SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
    IF target.id IS NULL OR target.job_id<>p_job_id OR target.division<>p_division THEN RAISE EXCEPTION 'change order not found'; END IF;
    IF target.status<>'draft' THEN RAISE EXCEPTION 'only draft change orders may be edited'; END IF;
    IF NOT public.current_user_can_edit_division(p_division,'can_create_change_orders') AND NOT (target.revision_of_id IS NOT NULL AND public.current_user_can_edit_division(p_division,'can_revise_change_orders')) THEN RAISE EXCEPTION 'can_create_change_orders or revision edit authority is required' USING ERRCODE='42501'; END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(col) ORDER BY col.sort_order,col.id),'[]'::JSONB) INTO before_lines FROM public.change_order_lines col WHERE col.change_order_id=target.id;
    UPDATE public.change_orders SET co_number=BTRIM(p_co_number),title=BTRIM(p_title),description=NULLIF(BTRIM(COALESCE(p_description,'')),''),change_order_date=COALESCE(p_change_order_date,CURRENT_DATE),internal_notes=NULLIF(BTRIM(COALESCE(p_internal_notes,'')),''),updated_by=actor_id,updated_at=NOW() WHERE id=target.id RETURNING * INTO saved;
    DELETE FROM public.change_order_lines WHERE change_order_id=target.id;
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines,'[]'::jsonb)) LOOP
    SELECT * INTO budget_line FROM public.job_budget_lines WHERE id=(line->>'job_budget_line_id')::UUID AND job_id=p_job_id AND archived_at IS NULL;
    IF budget_line.id IS NULL THEN RAISE EXCEPTION 'each line must reference an active project financial line'; END IF;
    IF NULLIF(BTRIM(line->>'description'),'') IS NULL THEN RAISE EXCEPTION 'each line requires a description'; END IF;
    IF COALESCE(NULLIF(line->>'material_amount','')::NUMERIC,0)<0 OR COALESCE(NULLIF(line->>'labor_amount','')::NUMERIC,0)<0 OR COALESCE(NULLIF(line->>'equipment_amount','')::NUMERIC,0)<0 OR COALESCE(NULLIF(line->>'subcontract_amount','')::NUMERIC,0)<0 OR COALESCE(NULLIF(line->>'other_amount','')::NUMERIC,0)<0 OR COALESCE(NULLIF(line->>'markup_amount','')::NUMERIC,0)<0 THEN RAISE EXCEPTION 'line amounts cannot be negative'; END IF;
    INSERT INTO public.change_order_lines(change_order_id,job_budget_line_id,division,cost_code,description,vendor_name,material_amount,labor_amount,equipment_amount,subcontract_amount,other_amount,markup_amount,sort_order,created_by,updated_by)
    VALUES(saved.id,budget_line.id,p_division,budget_line.cost_code,BTRIM(line->>'description'),NULLIF(BTRIM(COALESCE(line->>'vendor_name','')),''),COALESCE(NULLIF(line->>'material_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'labor_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'equipment_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'subcontract_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'other_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'markup_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'sort_order','')::INTEGER,0),actor_id,actor_id);
  END LOOP;
  SELECT COALESCE(SUM(line_total),0) INTO total FROM public.change_order_lines WHERE change_order_id=saved.id;
  UPDATE public.change_orders SET price_amount=total,cost_amount=GREATEST(total-COALESCE((SELECT SUM(markup_amount) FROM public.change_order_lines WHERE change_order_id=saved.id),0),0),updated_at=NOW() WHERE id=saved.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,actor_name,'change_orders',saved.id::TEXT,CASE WHEN target.id IS NULL THEN 'create' ELSE 'update' END,CASE WHEN target.id IS NULL THEN NULL ELSE to_jsonb(target)||jsonb_build_object('lines',before_lines) END,to_jsonb(saved)||jsonb_build_object('lines',p_lines),normalized_reason);
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.submit_job_change_order(p_change_order_id UUID,p_reason TEXT)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; actor_name TEXT; target public.change_orders%ROWTYPE; saved public.change_orders%ROWTYPE; line_count INTEGER; total NUMERIC;
BEGIN
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR NOT public.current_user_can_edit_division(target.division,'can_submit_change_orders') THEN RAISE EXCEPTION 'can_submit_change_orders is required' USING ERRCODE='42501'; END IF;
  IF target.status<>'draft' THEN RAISE EXCEPTION 'only a draft may be submitted'; END IF;
  SELECT COUNT(*),COALESCE(SUM(line_total),0) INTO line_count,total FROM public.change_order_lines WHERE change_order_id=target.id;
  IF line_count=0 OR total<=0 THEN RAISE EXCEPTION 'at least one positive breakdown line is required'; END IF;
  actor_name:=public.change_order_actor();
  UPDATE public.change_orders SET status='submitted',price_amount=total,submitted_by=actor_id,submitted_at=NOW(),updated_by=actor_id,updated_at=NOW() WHERE id=target.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,actor_name,'change_orders',saved.id::TEXT,'update',to_jsonb(target),to_jsonb(saved),COALESCE(NULLIF(BTRIM(p_reason),''),'Change Order submitted.'));
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.record_job_change_order_export(p_change_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; target public.change_orders%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR target.status NOT IN ('submitted','approved') OR NOT public.current_user_can_edit_division(target.division,'can_submit_change_orders') THEN RAISE EXCEPTION 'submitted Change Order and can_submit_change_orders are required' USING ERRCODE='42501'; END IF;
  UPDATE public.change_orders SET exported_at=NOW(),exported_by=actor_id,updated_at=NOW() WHERE id=target.id;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,public.change_order_actor(),'change_orders',target.id::TEXT,'update',to_jsonb(target),to_jsonb(target)||jsonb_build_object('exported_at',NOW(),'exported_by',actor_id),'Client-facing Change Order PDF exported.');
END $$;

CREATE OR REPLACE FUNCTION public.attach_signed_job_change_order_document(p_change_order_id UUID,p_document_id UUID,p_verification_name TEXT,p_certified BOOLEAN)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; target public.change_orders%ROWTYPE; doc public.documents%ROWTYPE; saved public.change_orders%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR NOT public.current_user_can_edit_division(target.division,'can_verify_change_orders') THEN RAISE EXCEPTION 'can_verify_change_orders is required' USING ERRCODE='42501'; END IF;
  IF target.status<>'submitted' THEN RAISE EXCEPTION 'only a submitted Change Order may be verified'; END IF;
  IF NULLIF(BTRIM(COALESCE(p_verification_name,'')),'') IS NULL OR p_certified IS NOT TRUE THEN RAISE EXCEPTION 'verification name and certification are required'; END IF;
  SELECT * INTO doc FROM public.documents WHERE id=p_document_id AND owner_type='job' AND owner_id=target.job_id AND change_order_id=target.id AND document_type='change_orders' AND archived_at IS NULL;
  IF doc.id IS NULL THEN RAISE EXCEPTION 'linked signed Change Order document not found'; END IF;
  UPDATE public.change_orders SET signed_document_id=doc.id,verified_by=actor_id,verification_name=BTRIM(p_verification_name),verified_at=NOW(),certification_state=TRUE,updated_by=actor_id,updated_at=NOW() WHERE id=target.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,public.change_order_actor(),'change_orders',saved.id::TEXT,'update',to_jsonb(target),to_jsonb(saved),'Signed Change Order document uploaded and employee certification recorded.');
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.approve_job_change_order(p_change_order_id UUID,p_reason TEXT)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; target public.change_orders%ROWTYPE; saved public.change_orders%ROWTYPE; expected_count INTEGER; posted_count INTEGER;
BEGIN
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR NOT public.current_user_can_edit_division(target.division,'can_approve_change_orders') THEN RAISE EXCEPTION 'can_approve_change_orders is required' USING ERRCODE='42501'; END IF;
  IF target.status='approved' THEN RETURN target; END IF;
  IF target.status<>'submitted' OR target.signed_document_id IS NULL OR target.certification_state IS NOT TRUE OR target.verified_by IS NULL THEN RAISE EXCEPTION 'signed document and employee certification are required before approval'; END IF;
  WITH current_totals AS (
    SELECT job_budget_line_id,MAX(cost_code) cost_code,SUM(line_total) amount FROM public.change_order_lines WHERE change_order_id=target.id GROUP BY job_budget_line_id
  ), previous_totals AS (
    SELECT col.job_budget_line_id,SUM(col.line_total) amount FROM public.change_order_lines col WHERE col.change_order_id=target.revision_of_id GROUP BY col.job_budget_line_id
  ), deltas AS (
    SELECT COALESCE(c.job_budget_line_id,p.job_budget_line_id) job_budget_line_id,COALESCE(c.cost_code,jbl.cost_code) cost_code,COALESCE(c.amount,0)-COALESCE(p.amount,0) amount_delta
    FROM current_totals c FULL JOIN previous_totals p USING(job_budget_line_id)
    JOIN public.job_budget_lines jbl ON jbl.id=COALESCE(c.job_budget_line_id,p.job_budget_line_id)
  )
  INSERT INTO public.change_order_financial_postings(change_order_id,job_id,job_budget_line_id,division,cost_code,amount_delta,posted_by)
  SELECT target.id,target.job_id,d.job_budget_line_id,target.division,d.cost_code,d.amount_delta,actor_id FROM deltas d
  ON CONFLICT(change_order_id,job_budget_line_id) DO NOTHING;
  SELECT COUNT(DISTINCT job_budget_line_id) INTO expected_count FROM public.change_order_lines WHERE change_order_id=target.id OR change_order_id=target.revision_of_id;
  SELECT COUNT(*) INTO posted_count FROM public.change_order_financial_postings WHERE change_order_id=target.id;
  IF posted_count<>expected_count THEN RAISE EXCEPTION 'financial posting count did not reconcile; approval rolled back'; END IF;
  UPDATE public.change_orders SET status='approved',approved_by=actor_id,approved_at=NOW(),updated_by=actor_id,updated_at=NOW() WHERE id=target.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,public.change_order_actor(),'change_orders',saved.id::TEXT,'update',to_jsonb(target),to_jsonb(saved),COALESCE(NULLIF(BTRIM(p_reason),''),'Change Order approved and financial postings created atomically.'));
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,public.change_order_actor(),'change_order_financial_postings',saved.id::TEXT,'create',NULL,jsonb_build_object('posting_count',posted_count,'change_order_id',saved.id,'job_id',saved.job_id),'Immutable Change Order financial postings created.');
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.revise_job_change_order(p_change_order_id UUID,p_reason TEXT)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; target public.change_orders%ROWTYPE; revised public.change_orders%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR target.status<>'approved' OR NOT public.current_user_can_edit_division(target.division,'can_revise_change_orders') THEN RAISE EXCEPTION 'approved Change Order and can_revise_change_orders are required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.change_orders(job_id,division,co_number,title,description,price_amount,cost_amount,status,change_order_date,internal_notes,created_by,updated_by,revision_of_id,revision_number)
  VALUES(target.job_id,target.division,target.co_number||'-R'||(target.revision_number+1),target.title,target.description,target.price_amount,target.cost_amount,'draft',CURRENT_DATE,target.internal_notes,actor_id,actor_id,target.id,target.revision_number+1) RETURNING * INTO revised;
  INSERT INTO public.change_order_lines(change_order_id,job_budget_line_id,division,cost_code,description,vendor_name,material_amount,labor_amount,equipment_amount,subcontract_amount,other_amount,markup_amount,sort_order,created_by,updated_by)
  SELECT revised.id,job_budget_line_id,division,cost_code,description,vendor_name,material_amount,labor_amount,equipment_amount,subcontract_amount,other_amount,markup_amount,sort_order,actor_id,actor_id FROM public.change_order_lines WHERE change_order_id=target.id ORDER BY sort_order,id;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,public.change_order_actor(),'change_orders',revised.id::TEXT,'create',to_jsonb(target),to_jsonb(revised),COALESCE(NULLIF(BTRIM(p_reason),''),'Controlled revision created.'));
  RETURN revised;
END $$;

-- Signed Change Order documents remain job-owned and visible in the existing Documents tab.
DROP POLICY IF EXISTS documents_insert ON public.documents;
CREATE POLICY documents_insert ON public.documents FOR INSERT TO authenticated WITH CHECK (
  (owner_type='job' AND (
    (change_order_id IS NULL AND public.current_user_can_edit_division(division,'can_manage_jobs') AND EXISTS (
      SELECT 1 FROM public.jobs j WHERE j.id=owner_id AND j.division=documents.division AND j.archived_at IS NULL
    )) OR
    (change_order_id IS NOT NULL AND document_type='change_orders' AND EXISTS (
      SELECT 1 FROM public.change_orders co WHERE co.id=change_order_id AND co.job_id=owner_id AND co.division=documents.division AND co.status='submitted'
        AND public.current_user_can_edit_division(co.division,'can_verify_change_orders')
    ))
  )) OR
  (owner_type='estimate' AND change_order_id IS NULL AND public.current_user_can_edit_division(division,'can_estimate') AND EXISTS (
    SELECT 1 FROM public.estimates e WHERE e.id=owner_id AND e.division=documents.division AND e.archived_at IS NULL
  )) OR
  (owner_type='change_order' AND change_order_id IS NULL AND public.current_user_can_edit_division(division,'can_manage_change_orders') AND EXISTS (
    SELECT 1 FROM public.change_orders co WHERE co.id=owner_id AND co.division=documents.division AND co.archived_at IS NULL
  ))
);

DROP POLICY IF EXISTS documents_update ON public.documents;
CREATE POLICY documents_update ON public.documents FOR UPDATE TO authenticated
USING (
  archived_at IS NULL AND ((owner_type='job' AND (
    (change_order_id IS NULL AND public.current_user_can_edit_division(division,'can_manage_jobs')) OR
    (change_order_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.change_orders approved_co
      WHERE approved_co.signed_document_id=documents.id AND approved_co.status='approved' AND approved_co.archived_at IS NULL
    ) AND EXISTS (
      SELECT 1 FROM public.change_orders co WHERE co.id=change_order_id AND co.job_id=owner_id AND co.status='submitted'
        AND public.current_user_can_edit_division(co.division,'can_verify_change_orders')
    ))
  )) OR (owner_type='estimate' AND change_order_id IS NULL AND public.current_user_can_edit_division(division,'can_estimate'))
     OR (owner_type='change_order' AND change_order_id IS NULL AND public.current_user_can_edit_division(division,'can_manage_change_orders')))
)
WITH CHECK (
  (owner_type='job' AND (
    (change_order_id IS NULL AND public.current_user_can_edit_division(division,'can_manage_jobs')) OR
    (change_order_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.change_orders co WHERE co.id=change_order_id AND co.job_id=owner_id AND co.status='submitted'
        AND public.current_user_can_edit_division(co.division,'can_verify_change_orders')
    ))
  )) OR
  (owner_type='estimate' AND change_order_id IS NULL AND public.current_user_can_edit_division(division,'can_estimate')) OR
  (owner_type='change_order' AND change_order_id IS NULL AND public.current_user_can_edit_division(division,'can_manage_change_orders') AND EXISTS (
    SELECT 1 FROM public.change_orders co WHERE co.id=owner_id AND co.division=documents.division AND co.archived_at IS NULL
  ))
);

DROP POLICY IF EXISTS documents_storage_insert ON storage.objects;
CREATE POLICY documents_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='northgate-files' AND (storage.foldername(name))[1]='documents' AND (
    ((storage.foldername(name))[2]='job' AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id::TEXT=(storage.foldername(name))[3] AND j.archived_at IS NULL AND (
      public.current_user_can_edit_division(j.division,'can_manage_jobs') OR public.current_user_can_edit_division(j.division,'can_verify_change_orders')
    ))) OR
    ((storage.foldername(name))[2]='estimate' AND EXISTS (SELECT 1 FROM public.estimates e WHERE e.id::TEXT=(storage.foldername(name))[3] AND e.archived_at IS NULL AND public.current_user_can_edit_division(e.division,'can_estimate'))) OR
    ((storage.foldername(name))[2]='change_order' AND EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id::TEXT=(storage.foldername(name))[3] AND co.archived_at IS NULL AND public.current_user_can_edit_division(co.division,'can_manage_change_orders')))
  )
);

DROP POLICY IF EXISTS documents_storage_delete_change_order ON storage.objects;
CREATE POLICY documents_storage_delete_change_order ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='northgate-files' AND EXISTS (
    SELECT 1 FROM public.documents d JOIN public.change_orders co ON co.id=d.change_order_id
    WHERE d.storage_path=storage.objects.name AND d.archived_at IS NULL AND co.status='submitted'
      AND co.signed_document_id IS NULL
      AND public.current_user_can_edit_division(co.division,'can_verify_change_orders')
  )
);

-- Approved signed documents cannot be archived through the normal document path.
CREATE OR REPLACE FUNCTION public.archive_job_document(p_document_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE doc public.documents%ROWTYPE;
BEGIN
  SELECT * INTO doc FROM public.documents WHERE id=p_document_id AND archived_at IS NULL FOR UPDATE;
  IF doc.id IS NULL THEN RAISE EXCEPTION 'Job document not found or already archived'; END IF;
  IF EXISTS(SELECT 1 FROM public.change_orders co WHERE co.signed_document_id=doc.id AND co.status='approved' AND co.archived_at IS NULL) THEN RAISE EXCEPTION 'approved signed Change Order documents cannot be archived'; END IF;
  IF NOT public.current_user_can_edit_division(doc.division,'can_manage_jobs') THEN RAISE EXCEPTION 'You do not have permission to archive this document' USING ERRCODE='42501'; END IF;
  UPDATE public.documents SET archived_at=NOW(),archived_by=auth.jwt()->>'sub',archive_reason=BTRIM(p_reason),updated_at=NOW() WHERE id=doc.id;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(auth.jwt()->>'sub',public.change_order_actor(),'documents',doc.id::TEXT,'archive',to_jsonb(doc),to_jsonb(doc)||jsonb_build_object('archived_at',NOW()),BTRIM(p_reason));
END $$;

-- Replace the legacy broad write RPC. Archive is draft-only and uses create permission.
CREATE OR REPLACE FUNCTION public.archive_job_change_order(p_change_order_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target public.change_orders%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR target.status<>'draft' OR NOT public.current_user_can_edit_division(target.division,'can_create_change_orders') THEN RAISE EXCEPTION 'only an authorized draft may be archived' USING ERRCODE='42501'; END IF;
  UPDATE public.change_orders SET archived_at=NOW(),archived_by=auth.jwt()->>'sub',archive_reason=BTRIM(p_reason),updated_at=NOW() WHERE id=target.id;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(auth.jwt()->>'sub',public.change_order_actor(),'change_orders',target.id::TEXT,'archive',to_jsonb(target),to_jsonb(target)||jsonb_build_object('archived_at',NOW()),BTRIM(p_reason));
END $$;

REVOKE ALL ON FUNCTION public.save_job_change_order_draft(UUID,UUID,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,JSONB,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_job_change_order(UUID,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.record_job_change_order_export(UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.attach_signed_job_change_order_document(UUID,UUID,TEXT,BOOLEAN) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.approve_job_change_order(UUID,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.revise_job_change_order(UUID,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_change_order_permission_override(TEXT,TEXT,BOOLEAN,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_job_change_order_draft(UUID,UUID,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,JSONB,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_job_change_order(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_job_change_order_export(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attach_signed_job_change_order_document(UUID,UUID,TEXT,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_job_change_order(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revise_job_change_order(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_change_order_permission_override(TEXT,TEXT,BOOLEAN,TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.save_job_change_order(UUID,UUID,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,TEXT,UUID,UUID) FROM authenticated;

COMMENT ON TABLE public.change_order_financial_postings IS 'HIGH RISK: immutable, idempotent Change Order deltas. Financials Changes = manual budget_change_amount + SUM(amount_delta).';
COMMENT ON COLUMN public.documents.change_order_id IS 'Links one job-owned signed Change Order document to its workflow without duplicating storage.';

CREATE OR REPLACE FUNCTION public.read_job_change_history(p_job_id UUID,p_limit INTEGER DEFAULT 100)
RETURNS TABLE(id UUID,created_at TIMESTAMPTZ,user_name TEXT,table_name TEXT,record_id TEXT,action TEXT,note TEXT,before_data JSONB,after_data JSONB,changed_fields TEXT[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; target_job public.jobs%ROWTYPE; safe_limit INTEGER:=LEAST(GREATEST(COALESCE(p_limit,100),1),250);
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO target_job FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL;
  IF target_job.id IS NULL THEN RAISE EXCEPTION 'Job not found' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_permissions up WHERE up.clerk_user_id=actor_id AND up.is_active=TRUE AND (up.division=target_job.division OR COALESCE((public.effective_permissions_for_user(up.role,up.division,up.permission_overrides)->>'can_view_all_divisions')::BOOLEAN,FALSE))) THEN RAISE EXCEPTION 'You do not have permission to view this job history' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT cl.id,cl.created_at,cl.user_name,cl.table_name,cl.record_id,cl.action,cl.note,cl.before_data,cl.after_data,
    ARRAY(SELECT key_name FROM jsonb_object_keys(COALESCE(cl.before_data,'{}'::JSONB)||COALESCE(cl.after_data,'{}'::JSONB)) key_name WHERE (cl.before_data->key_name) IS DISTINCT FROM (cl.after_data->key_name) ORDER BY key_name)
  FROM public.change_logs cl
  WHERE cl.table_name='jobs' AND cl.record_id=p_job_id::TEXT
     OR cl.table_name IN ('job_buyout_lines','job_budget_lines','job_schedule_items','change_orders','change_order_financial_postings')
        AND (cl.before_data->>'job_id'=p_job_id::TEXT OR cl.after_data->>'job_id'=p_job_id::TEXT)
     OR cl.table_name='documents' AND ((cl.before_data->>'owner_type'='job' AND cl.before_data->>'owner_id'=p_job_id::TEXT) OR (cl.after_data->>'owner_type'='job' AND cl.after_data->>'owner_id'=p_job_id::TEXT))
  ORDER BY cl.created_at DESC,cl.id DESC LIMIT safe_limit;
END $$;
