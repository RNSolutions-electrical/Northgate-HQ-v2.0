-- The validation wrapper is the public approval entry point. PostgreSQL preserves
-- grants across a function rename, so explicitly remove direct client execution.
REVOKE ALL ON FUNCTION public.approve_workbench_estimate_internal(uuid, text)
  FROM PUBLIC, anon, authenticated;
