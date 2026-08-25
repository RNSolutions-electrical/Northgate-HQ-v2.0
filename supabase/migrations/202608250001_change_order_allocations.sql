CREATE TABLE public.change_order_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES public.change_orders(id) ON DELETE CASCADE,
  project_division_id UUID REFERENCES public.job_budget_divisions(id),
  budget_line_id UUID NOT NULL REFERENCES public.job_budget_lines(id),
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(change_order_id, budget_line_id)
);
ALTER TABLE public.change_order_allocations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.change_order_allocations TO authenticated;
CREATE POLICY change_order_allocations_read ON public.change_order_allocations FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id=change_order_id AND public.current_user_can_read_division(co.division,'can_view_financials')));

CREATE OR REPLACE FUNCTION public.change_order_allocation_total(p_change_order_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT COALESCE(SUM(amount),0) FROM public.change_order_allocations WHERE change_order_id=p_change_order_id;
$$;
REVOKE ALL ON FUNCTION public.change_order_allocation_total(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_order_allocation_total(UUID) TO authenticated;
COMMENT ON TABLE public.change_order_allocations IS 'One-or-many budget allocations for a change order. Approved price is the budget impact; proposed orders remain pending.';
