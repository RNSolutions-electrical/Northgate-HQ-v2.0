-- Recovery reference only. Coordinate with active reviewers before executing.
-- Preserve schedule, existing observations, immutable audit and retry receipts.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.eos_scorecard_quarters_save_v1(jsonb,uuid) FROM authenticated;
COMMIT;
