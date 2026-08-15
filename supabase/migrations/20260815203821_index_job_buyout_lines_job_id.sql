CREATE INDEX IF NOT EXISTS idx_job_buyout_lines_job_id
ON public.job_buyout_lines (job_id)
WHERE archived_at IS NULL;
