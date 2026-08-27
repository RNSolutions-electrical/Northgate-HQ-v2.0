-- RLS policy expressions must not rely on a protected row being visible to the
-- caller while deciding whether that very row is visible. These narrowly
-- scoped helpers run as the owner, return booleans only, and still use the
-- caller's Clerk JWT through the existing permission helpers.
CREATE OR REPLACE FUNCTION public.current_user_can_read_project_financial_line(
  p_job_id UUID,
  p_budget_line_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.current_user_can_access_job(p_job_id, 'can_view_project_financials')
    AND EXISTS (
      SELECT 1
      FROM public.job_budget_lines line
      WHERE line.id = p_budget_line_id
        AND line.job_id = p_job_id
        AND (
          NOT line.is_protected_financial
          OR public.current_user_can_access_job(p_job_id, 'can_view_protected_project_financials')
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_read_project_change_order(
  p_job_id UUID,
  p_change_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.current_user_can_access_job(p_job_id, 'can_view_project_financials')
    AND (
      public.current_user_can_access_job(p_job_id, 'can_view_protected_project_financials')
      OR NOT EXISTS (
        SELECT 1
        FROM public.change_order_allocations allocation
        JOIN public.job_budget_lines line ON line.id = allocation.budget_line_id
        WHERE allocation.change_order_id = p_change_order_id
          AND line.is_protected_financial
      )
    );
$$;

REVOKE ALL ON FUNCTION public.current_user_can_read_project_financial_line(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_read_project_financial_line(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.current_user_can_read_project_change_order(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_read_project_change_order(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS job_budget_lines_read_project_financials ON public.job_budget_lines;
CREATE POLICY job_budget_lines_read_project_financials ON public.job_budget_lines
  FOR SELECT TO authenticated
  USING (archived_at IS NULL AND public.current_user_can_read_project_financial_line(job_id, id));

DROP POLICY IF EXISTS change_orders_read_project_financials ON public.change_orders;
CREATE POLICY change_orders_read_project_financials ON public.change_orders
  FOR SELECT TO authenticated
  USING (archived_at IS NULL AND public.current_user_can_read_project_change_order(job_id, id));

DROP POLICY IF EXISTS change_order_allocations_read_project_financials ON public.change_order_allocations;
CREATE POLICY change_order_allocations_read_project_financials ON public.change_order_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.change_orders co
      WHERE co.id = change_order_allocations.change_order_id
        AND public.current_user_can_read_project_change_order(co.job_id, co.id)
        AND public.current_user_can_read_project_financial_line(co.job_id, change_order_allocations.budget_line_id)
    )
  );

DROP POLICY IF EXISTS change_order_postings_read_project_financials ON public.change_order_financial_postings;
CREATE POLICY change_order_postings_read_project_financials ON public.change_order_financial_postings
  FOR SELECT TO authenticated
  USING (public.current_user_can_read_project_financial_line(job_id, job_budget_line_id));
