-- Track overhead, profit, and fee as a first-class financial category so the
-- application can report Estimated Profit without relying on descriptions.
ALTER TABLE public.job_budget_lines
  DROP CONSTRAINT IF EXISTS job_budget_lines_category_check;

ALTER TABLE public.job_budget_lines
  ADD CONSTRAINT job_budget_lines_category_check
  CHECK (
    category = ANY (
      ARRAY[
        'material'::TEXT,
        'labor'::TEXT,
        'subcontractor'::TEXT,
        'equipment'::TEXT,
        'permit'::TEXT,
        'ohp_fee'::TEXT,
        'other'::TEXT
      ]
    )
  );

COMMENT ON COLUMN public.job_budget_lines.category IS
  'Financial classification. OH&P / Fee rows use ohp_fee and feed the Estimated Profit overview.';
