CREATE OR REPLACE FUNCTION public.read_tool_change_history(
  p_tool_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  user_name TEXT,
  table_name TEXT,
  record_id TEXT,
  action TEXT,
  note TEXT,
  before_data JSONB,
  after_data JSONB,
  changed_fields TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  target_tool public.tools%ROWTYPE;
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250);
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF p_tool_id IS NULL THEN
    RAISE EXCEPTION 'tool id is required'
      USING ERRCODE = '22004';
  END IF;

  SELECT *
  INTO target_tool
  FROM public.tools
  WHERE tools.id = p_tool_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tool not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF public.current_user_can_read_division(target_tool.division) IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to view this tool history'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cl.id,
    cl.created_at,
    cl.user_name,
    cl.table_name,
    cl.record_id,
    cl.action,
    cl.note,
    cl.before_data,
    cl.after_data,
    ARRAY(
      SELECT key_name
      FROM jsonb_object_keys(COALESCE(cl.before_data, '{}'::JSONB) || COALESCE(cl.after_data, '{}'::JSONB)) AS key_name
      WHERE (cl.before_data -> key_name) IS DISTINCT FROM (cl.after_data -> key_name)
      ORDER BY key_name
    ) AS changed_fields
  FROM public.change_logs cl
  WHERE cl.table_name = 'tools'
    AND (
      cl.record_id = p_tool_id::TEXT
      OR cl.before_data ->> 'id' = p_tool_id::TEXT
      OR cl.after_data ->> 'id' = p_tool_id::TEXT
    )
  ORDER BY cl.created_at DESC, cl.id DESC
  LIMIT safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.read_tool_change_history(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_tool_change_history(UUID, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.read_tool_change_history(UUID, INTEGER) FROM anon;

COMMENT ON FUNCTION public.read_tool_change_history(UUID, INTEGER) IS
  'Read-only audit history for a visible tool catalogue row. Results are scoped by current_user_can_read_division(target_tool.division).';
