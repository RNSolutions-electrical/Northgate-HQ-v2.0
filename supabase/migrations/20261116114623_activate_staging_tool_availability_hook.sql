-- Staging-only operational activation; do not apply to production without separate approval.
ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.hq_tool_pre_request';
NOTIFY pgrst, 'reload config';
