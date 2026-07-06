ALTER TABLE public.job_budget_lines
ADD COLUMN sort_order NUMERIC NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY job_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.job_budget_lines
)
UPDATE public.job_budget_lines jbl
SET sort_order = ordered.rn
FROM ordered
WHERE jbl.id = ordered.id;
