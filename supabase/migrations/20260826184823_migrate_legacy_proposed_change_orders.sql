-- One-time carry-forward for Change Orders created before the controlled workflow.
-- Legacy proposed records are converted to editable drafts; this does not approve,
-- submit, or post any financial change automatically.
WITH legacy_change_orders AS (
  SELECT
    co.id,
    co.job_id,
    co.division,
    co.co_number,
    co.title,
    co.description,
    co.price_amount,
    co.cost_amount,
    co.internal_notes,
    co.created_by,
    co.updated_by,
    to_jsonb(co) AS before_data,
    allocation.budget_line_id,
    allocation.amount AS allocation_amount,
    budget_line.cost_code,
    budget_line.description AS budget_line_description
  FROM public.change_orders co
  JOIN LATERAL (
    SELECT coa.budget_line_id, coa.amount
    FROM public.change_order_allocations coa
    WHERE coa.change_order_id = co.id
    ORDER BY coa.created_at NULLS LAST, coa.id
    LIMIT 1
  ) allocation ON true
  JOIN public.job_budget_lines budget_line ON budget_line.id = allocation.budget_line_id
  WHERE co.status = 'proposed'
    AND co.archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.change_order_lines line
      WHERE line.change_order_id = co.id
    )
),
inserted_lines AS (
  INSERT INTO public.change_order_lines (
    change_order_id,
    job_budget_line_id,
    division,
    cost_code,
    description,
    other_amount,
    sort_order,
    created_by,
    updated_by
  )
  SELECT
    legacy.id,
    legacy.budget_line_id,
    legacy.division,
    legacy.cost_code,
    COALESCE(NULLIF(BTRIM(legacy.description), ''), NULLIF(BTRIM(legacy.title), ''), legacy.budget_line_description, 'Legacy carry-forward Change Order'),
    COALESCE(legacy.allocation_amount, legacy.price_amount, 0),
    0,
    COALESCE(legacy.updated_by, legacy.created_by, 'system:legacy-change-order-conversion'),
    COALESCE(legacy.updated_by, legacy.created_by, 'system:legacy-change-order-conversion')
  FROM legacy_change_orders legacy
  RETURNING change_order_id
),
converted_orders AS (
  UPDATE public.change_orders co
  SET
    status = 'draft',
    internal_notes = CONCAT_WS(
      E'\n\n',
      NULLIF(BTRIM(co.internal_notes), ''),
      FORMAT(
        'Legacy carry-forward conversion: original price %s; original internal cost %s. Existing budget allocation was preserved as a reviewable breakdown line. No approval or financial posting was created.',
        TO_CHAR(COALESCE(co.price_amount, 0), 'FM$999,999,999,990.00'),
        TO_CHAR(COALESCE(co.cost_amount, 0), 'FM$999,999,999,990.00')
      )
    ),
    updated_by = COALESCE(co.updated_by, co.created_by, 'system:legacy-change-order-conversion'),
    updated_at = NOW()
  FROM legacy_change_orders legacy
  WHERE co.id = legacy.id
    AND EXISTS (
      SELECT 1
      FROM inserted_lines line
      WHERE line.change_order_id = co.id
    )
  RETURNING co.*, legacy.before_data
)
INSERT INTO public.change_logs (
  user_id,
  user_name,
  table_name,
  record_id,
  action,
  before_data,
  after_data,
  note
)
SELECT
  'system:legacy-change-order-conversion',
  'System Migration',
  'change_orders',
  converted.id::TEXT,
  'update',
  converted.before_data,
  to_jsonb(converted) - 'before_data',
  'One-time legacy Change Order conversion: Proposed → Draft. Existing allocation was created as a carry-forward breakdown line; no approval or financial posting was created.'
FROM converted_orders converted;
