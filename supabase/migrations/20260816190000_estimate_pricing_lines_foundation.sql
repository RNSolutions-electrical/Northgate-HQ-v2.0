CREATE TABLE IF NOT EXISTS public.estimate_pricing_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  category TEXT NOT NULL DEFAULT 'material' CHECK (
    category IN ('labor', 'material', 'equipment', 'subcontract', 'other')
  ),
  description TEXT NOT NULL,
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit TEXT,
  unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  markup_percent NUMERIC(8, 4) NOT NULL DEFAULT 0 CHECK (markup_percent >= 0),
  line_total NUMERIC(14, 2) GENERATED ALWAYS AS (
    ROUND(quantity * unit_cost * (1 + (markup_percent / 100)), 2)
  ) STORED,
  sort_order INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_by TEXT
);

COMMENT ON TABLE public.estimate_pricing_lines IS
  'Estimate-owned pricing line foundation. Approval snapshots remain separate and immutable.';
COMMENT ON COLUMN public.estimate_pricing_lines.line_total IS
  'Generated pricing total: quantity * unit_cost * (1 + markup_percent / 100).';

CREATE INDEX IF NOT EXISTS idx_estimate_pricing_lines_estimate
  ON public.estimate_pricing_lines(estimate_id, sort_order, created_at)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_estimate_pricing_lines_division
  ON public.estimate_pricing_lines(division)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS set_estimate_pricing_lines_updated_at ON public.estimate_pricing_lines;
CREATE TRIGGER set_estimate_pricing_lines_updated_at
BEFORE UPDATE ON public.estimate_pricing_lines
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_permissions_updated_at();

ALTER TABLE public.estimate_pricing_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_pricing_lines_read ON public.estimate_pricing_lines;
CREATE POLICY estimate_pricing_lines_read
ON public.estimate_pricing_lines
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_pricing_lines.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_pricing_lines.division
      AND (
        public.current_user_can_read_division(e.division, 'can_estimate')
        OR public.current_user_can_read_division(e.division, 'can_approve_estimates')
      )
  )
);

DROP POLICY IF EXISTS estimate_pricing_lines_insert ON public.estimate_pricing_lines;
CREATE POLICY estimate_pricing_lines_insert
ON public.estimate_pricing_lines
FOR INSERT
TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_pricing_lines.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_pricing_lines.division
      AND e.status <> 'archived'
      AND public.current_user_can_edit_division(e.division, 'can_estimate')
  )
);

DROP POLICY IF EXISTS estimate_pricing_lines_update ON public.estimate_pricing_lines;
CREATE POLICY estimate_pricing_lines_update
ON public.estimate_pricing_lines
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_pricing_lines.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_pricing_lines.division
      AND public.current_user_can_edit_division(e.division, 'can_estimate')
  )
)
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_pricing_lines.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_pricing_lines.division
      AND e.status <> 'archived'
      AND public.current_user_can_edit_division(e.division, 'can_estimate')
  )
);

REVOKE ALL ON public.estimate_pricing_lines FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.estimate_pricing_lines TO authenticated;

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
  ORDER BY cl.created_at DESC, cl.id DESC
  LIMIT safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.read_estimate_change_history(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_estimate_change_history(UUID, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.read_estimate_change_history(UUID, INTEGER) FROM anon;

COMMENT ON FUNCTION public.read_estimate_change_history(UUID, INTEGER) IS
  'Read-only audit history for a visible estimate row, including estimate pricing line changes.';
