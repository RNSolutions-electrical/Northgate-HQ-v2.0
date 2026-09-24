-- Presentation state only. Financial amounts remain in Job Financials and
-- approved Change Order postings; acknowledgement never edits those sources.
CREATE TABLE public.job_budget_health_acknowledgements (
  user_id text NOT NULL REFERENCES public.user_permissions(clerk_user_id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  job_budget_line_id uuid NOT NULL REFERENCES public.job_budget_lines(id) ON DELETE CASCADE,
  budget_cents bigint NOT NULL,
  actual_cents bigint NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_budget_line_id)
);
CREATE INDEX job_budget_health_acknowledgements_job_idx
  ON public.job_budget_health_acknowledgements(job_id);
ALTER TABLE public.job_budget_health_acknowledgements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_budget_health_acknowledgements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.job_budget_health_acknowledgements TO authenticated;

CREATE POLICY job_budget_health_acknowledgements_read_self
  ON public.job_budget_health_acknowledgements FOR SELECT TO authenticated
  USING (
    user_id = auth.jwt()->>'sub'
    AND public.current_user_can_read_project_financial_line(job_id, job_budget_line_id)
    AND EXISTS (
      SELECT 1 FROM public.job_budget_lines line
      WHERE line.id = job_budget_line_id AND line.archived_at IS NULL
    )
  );

CREATE FUNCTION public.acknowledge_job_budget_health(p_budget_line_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
  actor_id text := auth.jwt()->>'sub';
  line public.job_budget_lines%ROWTYPE;
  approved_change_orders numeric;
  current_budget numeric;
  current_budget_cents bigint;
  current_actual_cents bigint;
BEGIN
  IF actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_permissions p
    WHERE p.clerk_user_id = actor_id AND p.is_active
  ) THEN
    RAISE EXCEPTION 'Active sign-in required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO line FROM public.job_budget_lines
  WHERE id = p_budget_line_id AND archived_at IS NULL FOR SHARE;
  IF line.id IS NULL OR public.current_user_can_read_project_financial_line(line.job_id, line.id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial line access required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(posting.amount_delta), 0) INTO approved_change_orders
  FROM public.change_order_financial_postings posting
  WHERE posting.job_budget_line_id = line.id;
  current_budget := CASE
    WHEN line.current_budget_override_amount IS NOT NULL THEN line.current_budget_override_amount
    ELSE COALESCE(line.budget_amount, 0) + COALESCE(line.budget_change_amount, 0) + approved_change_orders
  END;
  current_budget_cents := ROUND(current_budget * 100)::bigint;
  current_actual_cents := ROUND(line.actual_cost_amount * 100)::bigint;
  IF current_budget_cents <= 0 OR current_actual_cents IS NULL OR current_actual_cents < 0
     OR (current_budget_cents - current_actual_cents) * 100 > current_budget_cents * 20 THEN
    RAISE EXCEPTION 'No active budget warning to acknowledge' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.job_budget_health_acknowledgements
    (user_id, job_id, job_budget_line_id, budget_cents, actual_cents)
  VALUES (actor_id, line.job_id, line.id, current_budget_cents, current_actual_cents)
  ON CONFLICT (user_id, job_budget_line_id) DO UPDATE SET
    budget_cents = EXCLUDED.budget_cents,
    actual_cents = EXCLUDED.actual_cents,
    acknowledged_at = now();
END
$function$;

REVOKE ALL ON FUNCTION public.acknowledge_job_budget_health(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_job_budget_health(uuid) TO authenticated;
