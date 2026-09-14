-- Preserve approval logic and grants; accept normal decimal input such as .32,
-- 0.32, and 1. in every existing non-negative numeric validation.
-- Handle both the original migration and its over-escaped live expression.
DO $migration$
DECLARE
  original text := pg_get_functiondef('public.approve_workbench_estimate_internal(uuid,text)'::regprocedure);
  updated text;
  old_pattern text;
  occurrences integer := 0;
BEGIN
  updated := original;
  FOREACH old_pattern IN ARRAY ARRAY[
    '^[0-9]+(' || chr(92) || chr(92) || '.[0-9]+)?$',
    '^[0-9]+(' || chr(92) || '.[0-9]+)?$'
  ] LOOP
    occurrences := occurrences + (length(updated) - length(replace(updated, old_pattern, ''))) / length(old_pattern);
    updated := replace(updated, old_pattern, '^([0-9]+([.][0-9]*)?|[.][0-9]+)$');
  END LOOP;
  IF occurrences <> 7 THEN
    RAISE EXCEPTION 'Expected seven Workbench numeric validations; found %. Review approval function before applying.', occurrences;
  END IF;
  EXECUTE updated;
END;
$migration$;
