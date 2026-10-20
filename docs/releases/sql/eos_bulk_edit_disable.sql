-- Forward recovery: stop only new bulk writers; keep receipts and all history.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.eos_scorecard_bulk_export_v1(jsonb,uuid),public.eos_scorecard_bulk_preview_v1(jsonb,uuid),public.eos_scorecard_bulk_apply_v1(uuid) FROM authenticated;
COMMIT;
