CREATE TABLE public.change_order_sov_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES public.change_orders(id) ON DELETE CASCADE,
  revenue_line_id UUID NOT NULL REFERENCES public.job_revenue_lines(id),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (change_order_id, revenue_line_id)
);

ALTER TABLE public.change_order_sov_allocations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.change_order_sov_allocations TO authenticated;

CREATE POLICY change_order_sov_allocations_read ON public.change_order_sov_allocations
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.change_orders co
  WHERE co.id = change_order_id
    AND public.current_user_can_read_division(co.division, 'can_view_financials')
));

CREATE OR REPLACE FUNCTION public.save_change_order_sov_allocations(
  p_change_order_id UUID,
  p_allocations JSONB,
  p_reason TEXT
)
RETURNS SETOF public.change_order_sov_allocations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor TEXT := auth.jwt() ->> 'sub';
  change_order public.change_orders%ROWTYPE;
  allocation JSONB;
  target_revenue public.job_revenue_lines%ROWTYPE;
  created_revenue public.job_revenue_lines%ROWTYPE;
  allocation_total NUMERIC := 0;
  normalized_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  amount_value NUMERIC;
  revenue_id UUID;
BEGIN
  SELECT * INTO change_order FROM public.change_orders WHERE id = p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF actor IS NULL OR change_order.id IS NULL OR change_order.status <> 'approved' OR normalized_reason IS NULL
    OR public.current_user_can_edit_division(change_order.division, 'can_approve_budget') IS NOT TRUE THEN
    RAISE EXCEPTION 'approved change order, permission, and reason are required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'at least one SOV allocation is required' USING ERRCODE = '22023';
  END IF;
  FOR allocation IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
    amount_value := NULLIF(allocation ->> 'amount', '')::NUMERIC;
    IF amount_value IS NULL OR amount_value <= 0 THEN RAISE EXCEPTION 'allocation amounts must be positive' USING ERRCODE = '22023'; END IF;
    allocation_total := allocation_total + amount_value;
  END LOOP;
  IF allocation_total <> change_order.price_amount THEN
    RAISE EXCEPTION 'SOV allocations must equal the approved change order price' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.change_order_sov_allocations WHERE change_order_id = change_order.id) THEN
    RAISE EXCEPTION 'SOV is already allocated for this change order' USING ERRCODE = '22023';
  END IF;
  FOR allocation IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
    amount_value := (allocation ->> 'amount')::NUMERIC;
    revenue_id := NULLIF(allocation ->> 'revenue_line_id', '')::UUID;
    IF revenue_id IS NULL THEN
      INSERT INTO public.job_revenue_lines (job_id, division, sov_line, description, approved_change_amount, created_by, note)
      VALUES (change_order.job_id, change_order.division, change_order.co_number, COALESCE(NULLIF(BTRIM(allocation ->> 'new_description'), ''), 'CO ' || change_order.co_number || ' — ' || change_order.title), amount_value, actor, 'Created from approved change order.')
      RETURNING * INTO created_revenue;
      revenue_id := created_revenue.id;
    ELSE
      SELECT * INTO target_revenue FROM public.job_revenue_lines WHERE id = revenue_id AND job_id = change_order.job_id AND archived_at IS NULL FOR UPDATE;
      IF target_revenue.id IS NULL THEN RAISE EXCEPTION 'selected SOV line is not active for this job' USING ERRCODE = 'P0002'; END IF;
      UPDATE public.job_revenue_lines SET approved_change_amount = approved_change_amount + amount_value WHERE id = revenue_id;
    END IF;
    INSERT INTO public.change_order_sov_allocations(change_order_id, revenue_line_id, amount) VALUES (change_order.id, revenue_id, amount_value)
    ON CONFLICT (change_order_id, revenue_line_id) DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW();
  END LOOP;
  INSERT INTO public.change_logs(user_id, table_name, record_id, action, after_data, note)
  VALUES (actor, 'change_order_sov_allocations', change_order.id::TEXT, 'allocate_sov', p_allocations, normalized_reason);
  RETURN QUERY SELECT * FROM public.change_order_sov_allocations WHERE change_order_id = change_order.id ORDER BY created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.save_change_order_sov_allocations(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_change_order_sov_allocations(UUID, JSONB, TEXT) TO authenticated;
