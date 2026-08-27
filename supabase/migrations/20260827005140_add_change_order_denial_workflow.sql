-- Add an explicit, audited denial outcome to the Change Order workflow.
-- Denial uses approval authority, records a human certification, and never
-- creates a financial posting.

ALTER TABLE public.change_orders
  DROP CONSTRAINT IF EXISTS change_orders_status_check;

ALTER TABLE public.change_orders
  ADD CONSTRAINT change_orders_status_check
  CHECK (status IN ('draft', 'submitted', 'proposed', 'approved', 'rejected', 'denied', 'voided'));

ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS decision_name TEXT,
  ADD COLUMN IF NOT EXISTS decision_certification_state BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS denied_by TEXT,
  ADD COLUMN IF NOT EXISTS denied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS denial_reason TEXT;

CREATE OR REPLACE FUNCTION public.approve_job_change_order(
  p_change_order_id UUID,
  p_reason TEXT,
  p_decision_name TEXT,
  p_certified BOOLEAN
)
RETURNS public.change_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  normalized_name TEXT := NULLIF(BTRIM(COALESCE(p_decision_name, '')), '');
  target public.change_orders%ROWTYPE;
  saved public.change_orders%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO target
  FROM public.change_orders
  WHERE id = p_change_order_id AND archived_at IS NULL
  FOR UPDATE;

  IF target.id IS NULL
    OR NOT public.current_user_can_edit_division(target.division, 'can_approve_change_orders') THEN
    RAISE EXCEPTION 'can_approve_change_orders is required' USING ERRCODE = '42501';
  END IF;

  IF normalized_name IS NULL OR p_certified IS NOT TRUE THEN
    RAISE EXCEPTION 'decision name/initials and certification are required' USING ERRCODE = '22023';
  END IF;

  saved := public.approve_job_change_order(p_change_order_id, p_reason);

  UPDATE public.change_orders
  SET decision_name = normalized_name,
      decision_certification_state = TRUE,
      updated_by = actor_id,
      updated_at = NOW()
  WHERE id = saved.id
  RETURNING * INTO saved;

  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note
  ) VALUES (
    actor_id,
    public.change_order_actor(),
    'change_orders',
    saved.id::TEXT,
    'certify',
    jsonb_build_object('decision_name', target.decision_name, 'decision_certification_state', target.decision_certification_state),
    jsonb_build_object('decision_name', saved.decision_name, 'decision_certification_state', saved.decision_certification_state),
    'Approval decision name/initials and certification recorded.'
  );

  RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.deny_job_change_order(
  p_change_order_id UUID,
  p_reason TEXT,
  p_decision_name TEXT,
  p_certified BOOLEAN
)
RETURNS public.change_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  normalized_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  normalized_name TEXT := NULLIF(BTRIM(COALESCE(p_decision_name, '')), '');
  target public.change_orders%ROWTYPE;
  saved public.change_orders%ROWTYPE;
  posting_count INTEGER;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO target
  FROM public.change_orders
  WHERE id = p_change_order_id AND archived_at IS NULL
  FOR UPDATE;

  IF target.id IS NULL
    OR NOT public.current_user_can_edit_division(target.division, 'can_approve_change_orders') THEN
    RAISE EXCEPTION 'can_approve_change_orders is required' USING ERRCODE = '42501';
  END IF;

  IF target.status = 'denied' THEN
    RETURN target;
  END IF;

  IF target.status <> 'submitted' THEN
    RAISE EXCEPTION 'only a submitted Change Order may be denied';
  END IF;

  IF normalized_reason IS NULL OR normalized_name IS NULL OR p_certified IS NOT TRUE THEN
    RAISE EXCEPTION 'denial reason, decision name/initials, and certification are required' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO posting_count
  FROM public.change_order_financial_postings
  WHERE change_order_id = target.id;

  IF posting_count <> 0 THEN
    RAISE EXCEPTION 'Change Order has financial postings and cannot be denied';
  END IF;

  UPDATE public.change_orders
  SET status = 'denied',
      decision_name = normalized_name,
      decision_certification_state = TRUE,
      denied_by = actor_id,
      denied_at = NOW(),
      denial_reason = normalized_reason,
      updated_by = actor_id,
      updated_at = NOW()
  WHERE id = target.id
  RETURNING * INTO saved;

  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note
  ) VALUES (
    actor_id,
    public.change_order_actor(),
    'change_orders',
    saved.id::TEXT,
    'deny',
    TO_JSONB(target),
    TO_JSONB(saved),
    normalized_reason
  );

  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_job_change_order(UUID, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deny_job_change_order(UUID, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.approve_job_change_order(UUID, TEXT, TEXT, BOOLEAN)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.deny_job_change_order(UUID, TEXT, TEXT, BOOLEAN)
  TO authenticated;

COMMENT ON FUNCTION public.deny_job_change_order(UUID, TEXT, TEXT, BOOLEAN) IS
  'Explicitly denies a submitted Change Order using approval authority, with human certification and no financial posting.';
