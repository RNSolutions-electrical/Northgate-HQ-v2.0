-- Financials can represent a project division either with an explicit
-- job_budget_divisions row or by the numeric prefix of a budget cost code.
-- Maintain one ##.CO line per job/prefix for both representations.

CREATE UNIQUE INDEX IF NOT EXISTS job_budget_lines_active_job_co_code_idx
  ON public.job_budget_lines (job_id, UPPER(BTRIM(cost_code)))
  WHERE archived_at IS NULL
    AND UPPER(BTRIM(COALESCE(cost_code, ''))) ~ '^[0-9]+[.]CO$';

CREATE OR REPLACE FUNCTION public.attach_existing_change_order_line_to_project_division()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_code TEXT := NULLIF(BTRIM(COALESCE(NEW.code, '')), '');
BEGIN
  IF NEW.archived_at IS NOT NULL OR normalized_code IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.job_budget_lines
  SET project_division_id = NEW.id,
      updated_at = NOW()
  WHERE id = (
    SELECT line.id
    FROM public.job_budget_lines AS line
    WHERE line.job_id = NEW.job_id
      AND line.project_division_id IS NULL
      AND line.archived_at IS NULL
      AND UPPER(BTRIM(COALESCE(line.cost_code, ''))) = UPPER(normalized_code) || '.CO'
    ORDER BY line.created_at, line.id
    LIMIT 1
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_existing_change_order_line_to_project_division()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS attach_existing_change_order_line_to_project_division_trigger
  ON public.job_budget_divisions;

CREATE TRIGGER attach_existing_change_order_line_to_project_division_trigger
BEFORE INSERT
ON public.job_budget_divisions
FOR EACH ROW
EXECUTE FUNCTION public.attach_existing_change_order_line_to_project_division();

CREATE OR REPLACE FUNCTION public.ensure_inferred_financial_division_change_order_line()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  division_code TEXT := SUBSTRING(BTRIM(COALESCE(NEW.cost_code, '')) FROM '^([0-9]+)');
  target_project_division public.job_budget_divisions%ROWTYPE;
  saved_line public.job_budget_lines%ROWTYPE;
  actor_id TEXT := COALESCE(
    NULLIF(auth.jwt() ->> 'sub', ''),
    NULLIF(NEW.created_by, ''),
    'system:financial-division-co-line'
  );
BEGIN
  IF NEW.archived_at IS NOT NULL
    OR division_code IS NULL
    OR UPPER(BTRIM(COALESCE(NEW.cost_code, ''))) ~ '^[0-9]+[.]CO$' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.job_budget_lines AS line
    WHERE line.job_id = NEW.job_id
      AND line.archived_at IS NULL
      AND UPPER(BTRIM(COALESCE(line.cost_code, ''))) = UPPER(division_code) || '.CO'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO target_project_division
  FROM public.job_budget_divisions AS project_division
  WHERE project_division.job_id = NEW.job_id
    AND project_division.archived_at IS NULL
    AND UPPER(BTRIM(COALESCE(project_division.code, ''))) = UPPER(division_code)
  ORDER BY project_division.sort_order, project_division.created_at
  LIMIT 1;

  INSERT INTO public.job_budget_lines (
    job_id,
    division,
    project_division_id,
    category,
    cost_code,
    description,
    budget_amount,
    budget_change_amount,
    actual_cost_amount,
    committed_cost_amount,
    forecast_to_complete_amount,
    forecast_final_amount,
    schedule_of_values_amount,
    note,
    created_by
  ) VALUES (
    NEW.job_id,
    NEW.division,
    target_project_division.id,
    'other',
    division_code || '.CO',
    COALESCE(target_project_division.name, 'Division ' || division_code) || ' Change Orders',
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    'System-managed change-order allocation line.',
    actor_id
  )
  RETURNING * INTO saved_line;

  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note
  ) VALUES (
    actor_id,
    'System financial-division sync',
    'job_budget_lines',
    saved_line.id::TEXT,
    'create',
    NULL,
    TO_JSONB(saved_line),
    'Automatically created the inferred Financials division Change Order allocation line.'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_inferred_financial_division_change_order_line()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ensure_inferred_financial_division_change_order_line_trigger
  ON public.job_budget_lines;

CREATE TRIGGER ensure_inferred_financial_division_change_order_line_trigger
AFTER INSERT OR UPDATE OF cost_code, archived_at
ON public.job_budget_lines
FOR EACH ROW
EXECUTE FUNCTION public.ensure_inferred_financial_division_change_order_line();

-- Backfill every active numeric Financials prefix that does not already have
-- a matching active ##.CO line for the same job.
WITH inferred_divisions AS (
  SELECT DISTINCT ON (line.job_id, division_code)
    line.job_id,
    line.division,
    division_code
  FROM public.job_budget_lines AS line
  CROSS JOIN LATERAL (
    SELECT SUBSTRING(BTRIM(COALESCE(line.cost_code, '')) FROM '^([0-9]+)') AS division_code
  ) AS inferred
  WHERE line.archived_at IS NULL
    AND division_code IS NOT NULL
    AND UPPER(BTRIM(COALESCE(line.cost_code, ''))) !~ '^[0-9]+[.]CO$'
  ORDER BY line.job_id, division_code, line.created_at, line.id
), missing_lines AS (
  SELECT
    inferred.job_id,
    inferred.division,
    inferred.division_code,
    project_division.id AS project_division_id,
    project_division.name AS project_division_name
  FROM inferred_divisions AS inferred
  LEFT JOIN public.job_budget_divisions AS project_division
    ON project_division.job_id = inferred.job_id
   AND project_division.archived_at IS NULL
   AND UPPER(BTRIM(COALESCE(project_division.code, ''))) = UPPER(inferred.division_code)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.job_budget_lines AS existing
    WHERE existing.job_id = inferred.job_id
      AND existing.archived_at IS NULL
      AND UPPER(BTRIM(COALESCE(existing.cost_code, ''))) = UPPER(inferred.division_code) || '.CO'
  )
), inserted_lines AS (
  INSERT INTO public.job_budget_lines (
    job_id,
    division,
    project_division_id,
    category,
    cost_code,
    description,
    budget_amount,
    budget_change_amount,
    actual_cost_amount,
    committed_cost_amount,
    forecast_to_complete_amount,
    forecast_final_amount,
    schedule_of_values_amount,
    note,
    created_by
  )
  SELECT
    missing.job_id,
    missing.division,
    missing.project_division_id,
    'other',
    missing.division_code || '.CO',
    COALESCE(missing.project_division_name, 'Division ' || missing.division_code) || ' Change Orders',
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    'System-managed change-order allocation line.',
    'system:financial-division-co-line'
  FROM missing_lines AS missing
  RETURNING *
)
INSERT INTO public.change_logs (
  user_id, user_name, table_name, record_id, action, before_data, after_data, note
)
SELECT
  'system:financial-division-co-line',
  'System financial-division sync',
  'job_budget_lines',
  inserted.id::TEXT,
  'create',
  NULL,
  TO_JSONB(inserted),
  'Backfilled the inferred Financials division Change Order allocation line.'
FROM inserted_lines AS inserted;

COMMENT ON FUNCTION public.ensure_inferred_financial_division_change_order_line() IS
  'Maintains one audited ##.CO line for every numeric cost-code prefix represented in job Financials.';
