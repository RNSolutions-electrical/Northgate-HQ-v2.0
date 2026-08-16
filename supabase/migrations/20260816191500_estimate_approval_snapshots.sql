ALTER TABLE public.estimates DROP CONSTRAINT IF EXISTS estimates_status_check;
ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_status_check
  CHECK (status IN ('draft', 'pursuit', 'submitted', 'approved', 'rejected', 'archived'));

COMMENT ON TABLE public.estimates IS
  'Estimate directory with live pricing, archive, audit history, and approval snapshots.';
COMMENT ON COLUMN public.estimates.status IS
  'Estimate lifecycle status. Approved is set by approve_estimate after a locked estimate_snapshots row is created.';

CREATE TABLE IF NOT EXISTS public.estimate_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE RESTRICT,
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT NOT NULL,
  approval_note TEXT,
  estimate_number TEXT,
  title TEXT NOT NULL,
  customer_name TEXT,
  bid_due_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  scope_summary TEXT,
  pricing_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  pricing_line_count INTEGER NOT NULL DEFAULT 0,
  estimate_data JSONB NOT NULL,
  pricing_lines JSONB NOT NULL DEFAULT '[]'::JSONB,
  locked BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE public.estimate_snapshots IS
  'Immutable approval snapshots for estimates. Each row captures estimate header fields and active pricing lines at approval time.';
COMMENT ON COLUMN public.estimate_snapshots.locked IS
  'Locked snapshots cannot be updated or deleted by trigger.';

CREATE INDEX IF NOT EXISTS idx_estimate_snapshots_estimate_created
  ON public.estimate_snapshots(estimate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_estimate_snapshots_division_created
  ON public.estimate_snapshots(division, created_at DESC);

CREATE OR REPLACE FUNCTION public.block_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.locked IS TRUE THEN
    RAISE EXCEPTION 'Approved estimate snapshots are immutable and cannot be modified.'
      USING ERRCODE = '45000';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_estimate_snapshot ON public.estimate_snapshots;
CREATE TRIGGER trg_protect_estimate_snapshot
BEFORE UPDATE OR DELETE ON public.estimate_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.block_snapshot_mutation();

ALTER TABLE public.estimate_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_snapshots_read ON public.estimate_snapshots;
CREATE POLICY estimate_snapshots_read
ON public.estimate_snapshots
FOR SELECT
TO authenticated
USING (
  locked IS TRUE
  AND (
    public.current_user_can_read_division(division, 'can_estimate')
    OR public.current_user_can_read_division(division, 'can_approve_estimates')
  )
);

REVOKE ALL ON public.estimate_snapshots FROM anon, authenticated;
GRANT SELECT ON public.estimate_snapshots TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_estimate(
  p_estimate_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  target_estimate public.estimates%ROWTYPE;
  approved_estimate public.estimates%ROWTYPE;
  pricing_total_value NUMERIC(14, 2) := 0;
  pricing_line_count_value INTEGER := 0;
  pricing_lines_value JSONB := '[]'::JSONB;
  snapshot_id UUID;
  actor_name TEXT;
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF p_estimate_id IS NULL THEN
    RAISE EXCEPTION 'estimate id is required'
      USING ERRCODE = '22004';
  END IF;

  SELECT *
  INTO caller
  FROM public.user_permissions
  WHERE user_permissions.clerk_user_id = jwt_subject;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permission profile not found'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target_estimate
  FROM public.estimates
  WHERE estimates.id = p_estimate_id
    AND estimates.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimate not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF public.current_user_can_edit_division(target_estimate.division, 'can_approve_estimates') IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to approve this estimate'
      USING ERRCODE = '42501';
  END IF;

  IF target_estimate.status = 'approved' THEN
    RAISE EXCEPTION 'Estimate is already approved'
      USING ERRCODE = '23505';
  END IF;

  SELECT
    COALESCE(SUM(line.line_total), 0)::NUMERIC(14, 2),
    COUNT(*)::INTEGER,
    COALESCE(
      jsonb_agg(to_jsonb(line) ORDER BY line.sort_order, line.created_at, line.id)
        FILTER (WHERE line.id IS NOT NULL),
      '[]'::JSONB
    )
  INTO pricing_total_value, pricing_line_count_value, pricing_lines_value
  FROM public.estimate_pricing_lines line
  WHERE line.estimate_id = target_estimate.id
    AND line.archived_at IS NULL;

  actor_name := COALESCE(caller.display_name, caller.email, jwt_subject, 'Unknown User');

  INSERT INTO public.estimate_snapshots (
    estimate_id,
    division,
    approved_by,
    approval_note,
    estimate_number,
    title,
    customer_name,
    bid_due_at,
    submitted_at,
    scope_summary,
    pricing_total,
    pricing_line_count,
    estimate_data,
    pricing_lines
  )
  VALUES (
    target_estimate.id,
    target_estimate.division,
    actor_name,
    NULLIF(trim(COALESCE(p_note, '')), ''),
    target_estimate.estimate_number,
    target_estimate.title,
    target_estimate.customer_name,
    target_estimate.bid_due_at,
    COALESCE(target_estimate.submitted_at, NOW()),
    target_estimate.scope_summary,
    pricing_total_value,
    pricing_line_count_value,
    to_jsonb(target_estimate),
    pricing_lines_value
  )
  RETURNING id INTO snapshot_id;

  UPDATE public.estimates
  SET
    status = 'approved',
    submitted_at = COALESCE(submitted_at, NOW())
  WHERE id = target_estimate.id
  RETURNING * INTO approved_estimate;

  INSERT INTO public.change_logs (
    user_id,
    user_name,
    table_name,
    record_id,
    action,
    before_data,
    after_data,
    note,
    created_at
  )
  VALUES (
    jwt_subject,
    actor_name,
    'estimates',
    target_estimate.id::TEXT,
    'update',
    to_jsonb(target_estimate),
    to_jsonb(approved_estimate),
    COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), 'Estimate approved and locked snapshot created.'),
    NOW()
  );

  INSERT INTO public.change_logs (
    user_id,
    user_name,
    table_name,
    record_id,
    action,
    before_data,
    after_data,
    note,
    created_at
  )
  SELECT
    jwt_subject,
    actor_name,
    'estimate_snapshots',
    snapshot_id::TEXT,
    'create',
    NULL,
    to_jsonb(snapshot),
    'Approved estimate snapshot created.',
    NOW()
  FROM public.estimate_snapshots snapshot
  WHERE snapshot.id = snapshot_id;

  RETURN snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_estimate(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_estimate(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_estimate(UUID, TEXT) FROM anon;

COMMENT ON FUNCTION public.approve_estimate(UUID, TEXT) IS
  'Approve a visible active estimate by creating an immutable snapshot of the estimate and active pricing lines, then setting the estimate status to approved.';

CREATE OR REPLACE FUNCTION public.read_estimate_change_history(
  p_estimate_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  user_name TEXT,
  table_name TEXT,
  record_id TEXT,
  action TEXT,
  note TEXT,
  before_data JSONB,
  after_data JSONB,
  changed_fields TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  target_estimate public.estimates%ROWTYPE;
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250);
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF p_estimate_id IS NULL THEN
    RAISE EXCEPTION 'estimate id is required'
      USING ERRCODE = '22004';
  END IF;

  SELECT *
  INTO target_estimate
  FROM public.estimates
  WHERE estimates.id = p_estimate_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimate not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF (
    public.current_user_can_read_division(target_estimate.division, 'can_estimate') IS NOT TRUE
    AND public.current_user_can_read_division(target_estimate.division, 'can_approve_estimates') IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'You do not have permission to view this estimate history'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cl.id,
    cl.created_at,
    cl.user_name,
    cl.table_name,
    cl.record_id,
    cl.action,
    cl.note,
    cl.before_data,
    cl.after_data,
    ARRAY(
      SELECT key_name
      FROM jsonb_object_keys(COALESCE(cl.before_data, '{}'::JSONB) || COALESCE(cl.after_data, '{}'::JSONB)) AS key_name
      WHERE (cl.before_data -> key_name) IS DISTINCT FROM (cl.after_data -> key_name)
      ORDER BY key_name
    ) AS changed_fields
  FROM public.change_logs cl
  WHERE (
      cl.table_name = 'estimates'
      AND (
        cl.record_id = p_estimate_id::TEXT
        OR cl.before_data ->> 'id' = p_estimate_id::TEXT
        OR cl.after_data ->> 'id' = p_estimate_id::TEXT
      )
    )
    OR (
      cl.table_name = 'estimate_pricing_lines'
      AND (
        cl.before_data ->> 'estimate_id' = p_estimate_id::TEXT
        OR cl.after_data ->> 'estimate_id' = p_estimate_id::TEXT
      )
    )
    OR (
      cl.table_name = 'estimate_snapshots'
      AND (
        cl.before_data ->> 'estimate_id' = p_estimate_id::TEXT
        OR cl.after_data ->> 'estimate_id' = p_estimate_id::TEXT
      )
    )
  ORDER BY cl.created_at DESC, cl.id DESC
  LIMIT safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.read_estimate_change_history(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_estimate_change_history(UUID, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.read_estimate_change_history(UUID, INTEGER) FROM anon;

COMMENT ON FUNCTION public.read_estimate_change_history(UUID, INTEGER) IS
  'Read-only audit history for a visible estimate row, including pricing lines and approval snapshots.';
