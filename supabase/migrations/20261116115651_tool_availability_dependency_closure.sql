-- Conservative additive dependency snapshot. Reapply/review after changing public functions.
-- Static names in bodies (including dynamic-SQL fixed identifier literals) and
-- transitively called public routines propagate all owning modules.
-- Shared auth/bootstrap/control endpoints are excluded; original permissions remain.
BEGIN;
DO $$ DECLARE added integer; BEGIN
 LOOP
  INSERT INTO hq_tool_private.resource_map(resource_kind,resource_name,module_key)
  SELECT DISTINCT 'rpc',p.proname,m.module_key
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  JOIN hq_tool_private.resource_map m
   ON p.prosrc ~* ('\m'||m.resource_name||'\M')
  WHERE n.nspname='public' AND p.prokind='f'
  AND p.proname NOT IN ('get_or_create_user_permissions','get_current_user_addons',
   'current_user_can_manage_eos','current_user_can_track_hq_time','read_tool_availability',
   'require_tool_available','set_tool_availability','hq_tool_pre_request','tool_api_guard_status')
  AND p.proname !~ '^(current_user_|user_has_|effective_permissions_)'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  EXIT WHEN added=0;
 END LOOP;
END $$;
UPDATE hq_tool_private.enforcement SET reviewed=false,review_notes='Dependency closure installed; hosted verification pending';
COMMIT;
