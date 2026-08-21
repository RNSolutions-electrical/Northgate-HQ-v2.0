CREATE TABLE public.job_budget_divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  name TEXT NOT NULL,
  code TEXT,
  sort_order INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  UNIQUE (job_id, name)
);

CREATE INDEX job_budget_divisions_active_job_sort_idx
  ON public.job_budget_divisions (job_id, sort_order, name)
  WHERE archived_at IS NULL;

ALTER TABLE public.job_budget_divisions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.job_budget_divisions TO authenticated;

CREATE POLICY job_budget_divisions_read
  ON public.job_budget_divisions FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_budget_divisions.job_id
        AND public.current_user_can_read_division(j.division, 'can_view_financials')
    )
  );

CREATE POLICY job_budget_divisions_write
  ON public.job_budget_divisions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_budget_divisions.job_id
        AND public.current_user_can_edit_division(j.division, 'can_approve_budget')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_budget_divisions.job_id
        AND public.current_user_can_edit_division(j.division, 'can_approve_budget')
    )
  );

ALTER TABLE public.job_budget_lines
  ADD COLUMN project_division_id UUID REFERENCES public.job_budget_divisions(id);

CREATE INDEX job_budget_lines_project_division_idx
  ON public.job_budget_lines (job_id, project_division_id)
  WHERE archived_at IS NULL;

ALTER TABLE public.change_orders
  ADD COLUMN project_division_id UUID REFERENCES public.job_budget_divisions(id),
  ADD COLUMN budget_line_id UUID REFERENCES public.job_budget_lines(id);

CREATE INDEX change_orders_project_division_idx
  ON public.change_orders (job_id, project_division_id)
  WHERE archived_at IS NULL;

COMMENT ON TABLE public.job_budget_divisions IS 'Project-specific budget divisions. These are distinct from Northgate access divisions (Construction, Electrical, Admin).';
COMMENT ON COLUMN public.job_budget_lines.project_division_id IS 'Optional project budget division that owns this financial line.';
COMMENT ON COLUMN public.change_orders.project_division_id IS 'Optional project budget division receiving this change order.';
COMMENT ON COLUMN public.change_orders.budget_line_id IS 'Optional financial line receiving this change order cost impact.';
