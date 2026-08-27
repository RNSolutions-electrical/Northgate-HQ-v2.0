-- Developer-only, paginated read access for complete audit-log exports.
CREATE INDEX IF NOT EXISTS change_logs_created_at_id_idx
  ON public.change_logs (created_at, id);

CREATE OR REPLACE FUNCTION public.read_developer_audit_log_export(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 1000,
  p_offset BIGINT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id TEXT,
  user_name TEXT,
  table_name TEXT,
  record_id TEXT,
  action TEXT,
  before_data JSONB,
  after_data JSONB,
  note TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
BEGIN
  IF actor_id IS NULL OR BTRIM(actor_id) = '' THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '28000';
  END IF;
  IF public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required to export audit logs' USING ERRCODE = '42501';
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'export page limit must be 1-1000 and offset cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from >= p_to THEN
    RAISE EXCEPTION 'export start must be earlier than export end' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT log.id, log.user_id, log.user_name, log.table_name, log.record_id,
    log.action, log.before_data, log.after_data, log.note, log.created_at
  FROM public.change_logs AS log
  WHERE (p_from IS NULL OR log.created_at >= p_from)
    AND (p_to IS NULL OR log.created_at < p_to)
  ORDER BY log.created_at, log.id
  LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_developer_audit_log_export(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_row_count INTEGER,
  p_format TEXT DEFAULT 'csv'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  actor_name TEXT;
  normalized_format TEXT := LOWER(BTRIM(COALESCE(p_format, '')));
BEGIN
  IF actor_id IS NULL OR BTRIM(actor_id) = '' THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '28000';
  END IF;
  IF public.current_user_has_developer_access() IS NOT TRUE THEN
    RAISE EXCEPTION 'Developer access is required to export audit logs' USING ERRCODE = '42501';
  END IF;
  IF p_row_count < 0 OR normalized_format <> 'csv' THEN
    RAISE EXCEPTION 'valid row count and csv format are required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(up.display_name, up.email, actor_id)
  INTO actor_name
  FROM public.user_permissions AS up
  WHERE up.clerk_user_id = actor_id AND up.is_active = TRUE
  LIMIT 1;

  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note
  ) VALUES (
    actor_id, COALESCE(actor_name, actor_id), 'change_logs_export', actor_id, 'create', NULL,
    jsonb_build_object('format', normalized_format, 'row_count', p_row_count, 'from', p_from, 'to_exclusive', p_to),
    'Developer exported the full authorized audit-log detail as CSV.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.read_developer_audit_log_export(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BIGINT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_developer_audit_log_export(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_developer_audit_log_export(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BIGINT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_developer_audit_log_export(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.read_developer_audit_log_export(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BIGINT) IS
  'Returns a stable, paginated full-fidelity audit-log export only to server-authorized Developer users.';
