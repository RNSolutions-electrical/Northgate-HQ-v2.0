BEGIN;
CREATE FUNCTION public.tool_api_guard_status() RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$ SELECT coalesce(current_setting('pgrst.db_pre_request',true)='public.hq_tool_pre_request',false) $$;
REVOKE ALL ON FUNCTION public.tool_api_guard_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tool_api_guard_status() TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.hq_tool_pre_request() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE request_path text:=current_setting('request.path',true); resource text; kind text;
BEGIN
 IF hq_tool_private.developer() THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM hq_tool_private.tools WHERE NOT is_enabled) THEN RETURN; END IF;
 IF request_path LIKE '/rpc/%' THEN kind:='rpc'; resource:=substring(request_path FROM 6);
 ELSIF request_path ~ '^/[a-z][a-z0-9_]*$' THEN kind:='table'; resource:=substring(request_path FROM 2);
 ELSE RAISE EXCEPTION 'This API entry point is unavailable while tools are disabled' USING ERRCODE='42501'; END IF;
 -- Identity/bootstrap only, never business records; their original checks remain.
 IF kind='rpc' AND resource=ANY(ARRAY['get_or_create_user_permissions','get_current_user_addons','current_user_can_manage_eos','current_user_can_track_hq_time','read_tool_availability','require_tool_available','set_tool_availability','tool_api_guard_status']) THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM hq_tool_private.resource_map WHERE resource_kind=kind AND resource_name=resource)
 OR NOT hq_tool_private.resource_allowed(kind,resource) THEN
  RAISE EXCEPTION 'This tool is currently unavailable' USING ERRCODE='42501';
 END IF;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
