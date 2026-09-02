-- Shared, developer-maintained catalogue for project financial line templates.
-- The catalogue deliberately keeps project financial amounts out of this table.

CREATE TABLE IF NOT EXISTS public.financial_line_catalogue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_code TEXT NOT NULL,
  division_name TEXT NOT NULL,
  subdivision_name TEXT,
  cost_code TEXT NOT NULL,
  description TEXT NOT NULL,
  notes TEXT,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('material','labor','subcontractor','equipment','permit','ohp_fee','other')),
  is_protected_financial BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  retired_at TIMESTAMPTZ,
  retired_by TEXT,
  retirement_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT financial_line_catalogue_active_state CHECK (
    (is_active AND retired_at IS NULL) OR (NOT is_active AND retired_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_line_catalogue_cost_code_unique
  ON public.financial_line_catalogue (UPPER(BTRIM(cost_code)));
CREATE INDEX IF NOT EXISTS financial_line_catalogue_active_division_idx
  ON public.financial_line_catalogue (is_active, division_code, sort_order, cost_code);

ALTER TABLE public.financial_line_catalogue ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.financial_line_catalogue TO authenticated;
DROP POLICY IF EXISTS financial_line_catalogue_read ON public.financial_line_catalogue;
CREATE POLICY financial_line_catalogue_read ON public.financial_line_catalogue
  FOR SELECT TO authenticated USING (is_active OR public.current_user_has_developer_access());

CREATE OR REPLACE FUNCTION public.apply_financial_catalogue_to_job(
  p_job_id UUID,
  p_catalogue_ids UUID[],
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  actor_name TEXT;
  target_job public.jobs%ROWTYPE;
  catalog public.financial_line_catalogue%ROWTYPE;
  project_division public.job_budget_divisions%ROWTYPE;
  existing_line public.job_budget_lines%ROWTYPE;
  added_count INTEGER := 0;
  aligned_count INTEGER := 0;
  division_count INTEGER := 0;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE='28000'; END IF;
  IF p_job_id IS NULL OR COALESCE(array_length(p_catalogue_ids, 1), 0) = 0 OR NULLIF(BTRIM(COALESCE(p_reason,'')), '') IS NULL THEN
    RAISE EXCEPTION 'job, at least one catalogue line, and an audit reason are required';
  END IF;
  IF NOT public.current_user_can_edit_job(p_job_id, 'can_approve_budget') THEN
    RAISE EXCEPTION 'can_approve_budget is required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO target_job FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL FOR UPDATE;
  IF target_job.id IS NULL THEN RAISE EXCEPTION 'active job not found'; END IF;
  SELECT COALESCE(NULLIF(display_name,''), NULLIF(email,''), actor_id) INTO actor_name FROM public.user_permissions WHERE clerk_user_id=actor_id LIMIT 1;

  FOR catalog IN SELECT * FROM public.financial_line_catalogue WHERE id = ANY(p_catalogue_ids) AND is_active ORDER BY division_code, sort_order, cost_code LOOP
    SELECT * INTO project_division FROM public.job_budget_divisions
      WHERE job_id=p_job_id AND archived_at IS NULL AND UPPER(BTRIM(COALESCE(code,'')))=UPPER(BTRIM(catalog.division_code))
      LIMIT 1 FOR UPDATE;
    IF project_division.id IS NULL THEN
      INSERT INTO public.job_budget_divisions(job_id, code, name, sort_order)
      VALUES(p_job_id, catalog.division_code, catalog.division_name, COALESCE(NULLIF(regexp_replace(catalog.division_code, '\\D','','g'), '')::INTEGER, 999))
      RETURNING * INTO project_division;
      division_count := division_count + 1;
    END IF;
    SELECT * INTO existing_line FROM public.job_budget_lines
      WHERE job_id=p_job_id AND archived_at IS NULL AND UPPER(BTRIM(COALESCE(cost_code,'')))=UPPER(BTRIM(catalog.cost_code))
      LIMIT 1 FOR UPDATE;
    IF existing_line.id IS NULL THEN
      INSERT INTO public.job_budget_lines(job_id, division, project_division_id, category, is_protected_financial, cost_code, description, budget_amount, budget_change_amount, actual_cost_amount, committed_cost_amount, forecast_to_complete_amount, forecast_final_amount, schedule_of_values_amount, note, sort_order, created_by)
      VALUES(p_job_id, target_job.division, project_division.id, catalog.category, catalog.is_protected_financial, catalog.cost_code, catalog.description, 0,0,0,0,0,0,0, NULLIF(BTRIM(catalog.notes),''), catalog.sort_order, actor_id);
      added_count := added_count + 1;
    ELSIF existing_line.project_division_id IS DISTINCT FROM project_division.id
       OR existing_line.description IS DISTINCT FROM catalog.description
       OR existing_line.category IS DISTINCT FROM catalog.category
       OR existing_line.is_protected_financial IS DISTINCT FROM catalog.is_protected_financial THEN
      UPDATE public.job_budget_lines SET project_division_id=project_division.id, description=catalog.description, category=catalog.category, is_protected_financial=catalog.is_protected_financial, note=COALESCE(NULLIF(BTRIM(catalog.notes),''),note), updated_at=NOW() WHERE id=existing_line.id;
      aligned_count := aligned_count + 1;
    END IF;
  END LOOP;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
  VALUES(actor_id,actor_name,'financial_line_catalogue',p_job_id::TEXT,'apply_to_job',jsonb_build_object('catalogue_ids',p_catalogue_ids,'divisions_added',division_count,'lines_added',added_count,'lines_aligned',aligned_count),BTRIM(p_reason));
  RETURN jsonb_build_object('divisions_added',division_count,'lines_added',added_count,'lines_aligned',aligned_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_job_financial_line(
  p_job_id UUID, p_line_id UUID, p_project_division_id UUID, p_category TEXT, p_is_protected_financial BOOLEAN,
  p_cost_code TEXT, p_description TEXT, p_budget_amount NUMERIC, p_budget_change_amount NUMERIC, p_actual_cost_amount NUMERIC,
  p_committed_cost_amount NUMERIC, p_forecast_to_complete_amount NUMERIC, p_forecast_final_amount NUMERIC,
  p_schedule_of_values_amount NUMERIC, p_note TEXT, p_reason TEXT
)
RETURNS public.job_budget_lines
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; actor_name TEXT; target_job public.jobs%ROWTYPE; prior public.job_budget_lines%ROWTYPE; saved public.job_budget_lines%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE='28000'; END IF;
  IF p_job_id IS NULL OR p_project_division_id IS NULL OR NULLIF(BTRIM(COALESCE(p_description,'')), '') IS NULL OR NULLIF(BTRIM(COALESCE(p_reason,'')), '') IS NULL THEN RAISE EXCEPTION 'job, project division, description, and audit reason are required'; END IF;
  IF NOT public.current_user_can_edit_job(p_job_id,'can_approve_budget') THEN RAISE EXCEPTION 'can_approve_budget is required' USING ERRCODE='42501'; END IF;
  SELECT * INTO target_job FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL;
  IF target_job.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.job_budget_divisions WHERE id=p_project_division_id AND job_id=p_job_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'active job and its project division are required'; END IF;
  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor_id) INTO actor_name FROM public.user_permissions WHERE clerk_user_id=actor_id LIMIT 1;
  IF p_line_id IS NULL THEN
    INSERT INTO public.job_budget_lines(job_id,division,project_division_id,category,is_protected_financial,cost_code,description,budget_amount,budget_change_amount,actual_cost_amount,committed_cost_amount,forecast_to_complete_amount,forecast_final_amount,schedule_of_values_amount,note,created_by)
    VALUES(p_job_id,target_job.division,p_project_division_id,COALESCE(NULLIF(BTRIM(p_category),''),'other'),COALESCE(p_is_protected_financial,FALSE),NULLIF(BTRIM(p_cost_code),''),BTRIM(p_description),COALESCE(p_budget_amount,0),COALESCE(p_budget_change_amount,0),COALESCE(p_actual_cost_amount,0),COALESCE(p_committed_cost_amount,0),COALESCE(p_forecast_to_complete_amount,0),COALESCE(p_forecast_final_amount,0),COALESCE(p_schedule_of_values_amount,0),NULLIF(BTRIM(p_note),''),actor_id) RETURNING * INTO saved;
  ELSE
    SELECT * INTO prior FROM public.job_budget_lines WHERE id=p_line_id AND job_id=p_job_id AND archived_at IS NULL FOR UPDATE;
    IF prior.id IS NULL THEN RAISE EXCEPTION 'active financial line not found'; END IF;
    UPDATE public.job_budget_lines SET project_division_id=p_project_division_id,category=COALESCE(NULLIF(BTRIM(p_category),''),'other'),is_protected_financial=COALESCE(p_is_protected_financial,FALSE),cost_code=NULLIF(BTRIM(p_cost_code),''),description=BTRIM(p_description),budget_amount=COALESCE(p_budget_amount,0),budget_change_amount=COALESCE(p_budget_change_amount,0),actual_cost_amount=COALESCE(p_actual_cost_amount,0),committed_cost_amount=COALESCE(p_committed_cost_amount,0),forecast_to_complete_amount=COALESCE(p_forecast_to_complete_amount,0),forecast_final_amount=COALESCE(p_forecast_final_amount,0),schedule_of_values_amount=COALESCE(p_schedule_of_values_amount,0),note=NULLIF(BTRIM(p_note),''),updated_at=NOW() WHERE id=p_line_id RETURNING * INTO saved;
  END IF;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,actor_name,'job_budget_lines',saved.id::TEXT,CASE WHEN p_line_id IS NULL THEN 'create' ELSE 'update' END,CASE WHEN p_line_id IS NULL THEN NULL ELSE to_jsonb(prior) END,to_jsonb(saved),BTRIM(p_reason));
  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_financial_catalogue_to_job(UUID,UUID[],TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_job_financial_line(UUID,UUID,UUID,TEXT,BOOLEAN,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_financial_catalogue_to_job(UUID,UUID[],TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_job_financial_line(UUID,UUID,UUID,TEXT,BOOLEAN,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT) TO authenticated;
