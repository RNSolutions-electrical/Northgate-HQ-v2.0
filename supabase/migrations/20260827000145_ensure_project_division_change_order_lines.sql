-- Every active project division owns one system-managed Change Order budget line.
-- This keeps the Change Order allocation selector complete as Financials evolves.

CREATE UNIQUE INDEX IF NOT EXISTS job_budget_lines_active_project_division_co_idx
  ON public.job_budget_lines (project_division_id)
  WHERE archived_at IS NULL
    AND project_division_id IS NOT NULL
    AND UPPER(BTRIM(COALESCE(cost_code, ''))) LIKE '%.CO';

CREATE OR REPLACE FUNCTION public.ensure_project_division_change_order_line()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_job public.jobs%ROWTYPE;
  existing_line public.job_budget_lines%ROWTYPE;
  saved_line public.job_budget_lines%ROWTYPE;
  normalized_code TEXT := NULLIF(BTRIM(COALESCE(NEW.code, '')), '');
  actor_id TEXT := COALESCE(NULLIF(auth.jwt() ->> 'sub', ''), 'system:project-division-co-line');
  actor_name TEXT := 'System project-division sync';
BEGIN
  IF NEW.archived_at IS NOT NULL OR normalized_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO target_job
  FROM public.jobs AS j
  WHERE j.id = NEW.job_id
    AND j.archived_at IS NULL;

  IF target_job.id IS NULL THEN
    RAISE EXCEPTION 'active job is required for project division Change Order line'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO existing_line
  FROM public.job_budget_lines AS line
  WHERE line.project_division_id = NEW.id
    AND line.archived_at IS NULL
    AND UPPER(BTRIM(COALESCE(line.cost_code, ''))) LIKE '%.CO'
  ORDER BY line.created_at, line.id
  LIMIT 1
  FOR UPDATE;

  IF existing_line.id IS NULL THEN
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
      target_job.division,
      NEW.id,
      'other',
      normalized_code || '.CO',
      NEW.name || ' Change Orders',
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
      actor_name,
      'job_budget_lines',
      saved_line.id::TEXT,
      'create',
      NULL,
      TO_JSONB(saved_line),
      'Automatically created the project division Change Order allocation line.'
    );
  ELSIF existing_line.cost_code IS DISTINCT FROM normalized_code || '.CO'
    OR existing_line.description IS DISTINCT FROM NEW.name || ' Change Orders' THEN
    UPDATE public.job_budget_lines
    SET cost_code = normalized_code || '.CO',
        description = NEW.name || ' Change Orders',
        note = 'System-managed change-order allocation line.',
        updated_at = NOW()
    WHERE id = existing_line.id
    RETURNING * INTO saved_line;

    INSERT INTO public.change_logs (
      user_id, user_name, table_name, record_id, action, before_data, after_data, note
    ) VALUES (
      actor_id,
      actor_name,
      'job_budget_lines',
      saved_line.id::TEXT,
      'update',
      TO_JSONB(existing_line),
      TO_JSONB(saved_line),
      'Synchronized the project division Change Order allocation line.'
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_project_division_change_order_line() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ensure_project_division_change_order_line_trigger
  ON public.job_budget_divisions;

CREATE TRIGGER ensure_project_division_change_order_line_trigger
AFTER INSERT OR UPDATE OF code, name, archived_at
ON public.job_budget_divisions
FOR EACH ROW
EXECUTE FUNCTION public.ensure_project_division_change_order_line();

-- Backfill existing active project divisions. Each update invokes the same
-- audited trigger used for future Financials additions.
UPDATE public.job_budget_divisions
SET code = code
WHERE archived_at IS NULL
  AND NULLIF(BTRIM(COALESCE(code, '')), '') IS NOT NULL;

COMMENT ON FUNCTION public.ensure_project_division_change_order_line() IS
  'Maintains one audited ##.CO job budget line for every active project division.';
