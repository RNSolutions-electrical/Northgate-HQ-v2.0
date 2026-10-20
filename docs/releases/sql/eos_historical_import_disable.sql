-- Forward recovery: disable new entrypoints, retain all records and receipts.
-- Review target/drift first. No old scorecard functions are replaced.
BEGIN;
SET LOCAL lock_timeout='5s';
REVOKE EXECUTE ON FUNCTION public.eos_scorecard_import_preview_v1(jsonb,uuid),public.eos_scorecard_import_apply_v1(uuid) FROM authenticated;
-- Receipt read remains available to the original actor under EOS membership.
COMMIT;
