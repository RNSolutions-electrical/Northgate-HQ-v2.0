-- Adds a validation wrapper without changing the already-released approval logic.
-- This keeps malformed or empty Workbench items from entering an approval snapshot.

ALTER FUNCTION public.approve_workbench_estimate(uuid, text)
  RENAME TO approve_workbench_estimate_internal;

CREATE FUNCTION public.approve_workbench_estimate(
  p_estimate_id uuid,
  p_approval_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  document jsonb;
BEGIN
  IF auth.jwt() ->> 'sub' IS NULL OR btrim(auth.jwt() ->> 'sub') = '' THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;

  SELECT workbench.document INTO document
  FROM public.estimate_workbenches AS workbench
  WHERE workbench.estimate_id = p_estimate_id;

  IF document IS NULL
     OR jsonb_typeof(document -> 'entries') <> 'array'
     OR jsonb_array_length(document -> 'entries') = 0 THEN
    RAISE EXCEPTION 'Save a named Workbench estimate with at least one entry before approval' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(document -> 'entries') AS entry_value(value)
    WHERE jsonb_typeof(entry_value.value -> 'items') <> 'array'
       OR jsonb_array_length(entry_value.value -> 'items') = 0
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(entry_value.value -> 'items') AS item_value(value)
         WHERE jsonb_typeof(item_value.value -> 'lines') <> 'array'
            OR jsonb_array_length(item_value.value -> 'lines') = 0
       )
  ) THEN
    RAISE EXCEPTION 'Every Workbench entry needs at least one item and every item needs at least one component before approval' USING ERRCODE = '22023';
  END IF;

  RETURN public.approve_workbench_estimate_internal(p_estimate_id, p_approval_note);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_workbench_estimate(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_workbench_estimate(uuid, text) TO authenticated;
