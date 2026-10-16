-- Attach legacy unassigned ##.CO lines only after the new parent exists.
-- Keep the existing name: AFTER triggers run alphabetically, so attachment
-- still precedes ensure_project_division_change_order_line_trigger and reuses
-- the existing CO line. No function, FK, ACL, RLS or business data is changed.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.job_budget_divisions'::regclass
      AND tgname = 'attach_existing_change_order_line_to_project_division_trigger'
      AND tgfoid = 'public.attach_existing_change_order_line_to_project_division()'::regprocedure
      AND tgtype IN (7, 5) -- row BEFORE INSERT, or already-correct row AFTER INSERT
      AND tgenabled = 'O' AND NOT tgisinternal AND tgnargs = 0
  ) THEN
    RAISE EXCEPTION 'Unexpected CO attachment trigger configuration; review before changing timing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.job_budget_divisions'::regclass
      AND tgname = 'ensure_project_division_change_order_line_trigger'
      AND tgfoid = 'public.ensure_project_division_change_order_line()'::regprocedure
      AND (tgtype & 7) = 5 -- row AFTER INSERT, possibly with UPDATE events
      AND tgenabled = 'O' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Expected AFTER INSERT CO ensure trigger is missing; review trigger ordering';
  END IF;
END;
$preflight$;

CREATE OR REPLACE TRIGGER attach_existing_change_order_line_to_project_division_trigger
AFTER INSERT ON public.job_budget_divisions
FOR EACH ROW
EXECUTE FUNCTION public.attach_existing_change_order_line_to_project_division();
