-- Additive read-only origin projection. No assembly/audit/user rows are rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
CREATE FUNCTION public.read_legacy_assembly_origins(p_division text,p_assembly_ids uuid[])
RETURNS TABLE(id uuid,origin text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=auth.jwt()->>'sub';a record;c record;n jsonb;
 candidate text;seen text;bad boolean;found_create boolean;
BEGIN
 IF nullif(btrim(actor),'') IS NULL OR coalesce(auth.jwt()->>'is_anonymous','false')<>'false'
 OR NOT EXISTS(SELECT 1 FROM public.user_permissions u WHERE u.clerk_user_id=actor AND u.is_active) THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501';END IF;
 IF p_division IS NULL OR p_division NOT IN ('Construction','Electrical','Admin') THEN
  RAISE EXCEPTION 'Supported division required' USING ERRCODE='22023';END IF;
 IF (public.current_user_can_read_division(p_division,'can_estimate') OR
     public.current_user_can_read_division(p_division,'can_approve_estimates')) IS NOT TRUE THEN
  RAISE EXCEPTION 'Assembly read permission required' USING ERRCODE='42501';END IF;
 IF p_assembly_ids IS NULL OR cardinality(p_assembly_ids)>500 OR array_position(p_assembly_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Request up to 500 assembly identifiers' USING ERRCODE='22023';END IF;
 -- Mirror the additional staging availability gate without installing it in production.
 IF to_regprocedure('public.require_tool_available(text)') IS NOT NULL THEN
  EXECUTE 'SELECT public.require_tool_available($1)' USING 'estimates';END IF;
 FOR a IN SELECT x.id,x.division,x.source_estimate_id FROM public.assemblies x
  WHERE x.id=ANY(p_assembly_ids) AND x.division=p_division AND x.is_library_item AND x.archived_at IS NULL
  ORDER BY x.id
 LOOP
  id:=a.id;origin:='unknown';
  IF a.source_estimate_id IS NOT NULL THEN origin:='from_estimate';RETURN NEXT;CONTINUE;END IF;
  seen:=NULL;bad:=false;found_create:=false;
  FOR c IN SELECT l.before_data,l.after_data,l.note FROM public.change_logs l
   WHERE l.table_name='assemblies' AND l.record_id=a.id::text AND l.action IN ('create','insert')
  LOOP
   found_create:=true;candidate:=NULL;n:=NULL;
   BEGIN n:=c.note::jsonb;EXCEPTION WHEN invalid_text_representation THEN bad:=true;CONTINUE;END;
   IF c.before_data IS NOT NULL AND c.before_data<>'null'::jsonb THEN bad:=true;CONTINUE;END IF;
   IF jsonb_typeof(c.after_data) IS DISTINCT FROM 'object'
    OR c.after_data->>'id' IS DISTINCT FROM a.id::text
    OR c.after_data->>'division' IS DISTINCT FROM a.division
    OR jsonb_typeof(n) IS DISTINCT FROM 'object'
    OR n->>'workflow' IS DISTINCT FROM 'assembly_library' THEN bad:=true;CONTINUE;END IF;
   IF n->>'source'='estimate' AND (n->>'estimate_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND c.after_data->>'source_estimate_id'=n->>'estimate_id' THEN
    candidate:='from_estimate';
   ELSIF n->>'source'='assembly_library' AND (n ? 'estimate_id') AND n->>'estimate_id' IS NULL
    AND (c.after_data ? 'source_estimate_id') AND c.after_data->>'source_estimate_id' IS NULL THEN
    candidate:='built_in_library';
   ELSE bad:=true;CONTINUE;END IF;
   IF seen IS NOT NULL AND seen<>candidate THEN bad:=true;END IF;seen:=candidate;
  END LOOP;
  IF found_create AND NOT bad AND seen IS NOT NULL THEN origin:=seen;END IF;
  RETURN NEXT;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.read_legacy_assembly_origins(text,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_legacy_assembly_origins(text,uuid[]) TO authenticated;
-- When an existing restrictive tool registry is installed, register this new read RPC.
-- This adds routing metadata only, not user access grants or business records.
DO $$ BEGIN
 IF to_regclass('hq_tool_private.resource_map') IS NOT NULL THEN
  EXECUTE $q$INSERT INTO hq_tool_private.resource_map(resource_kind,resource_name,module_key)
   VALUES('rpc','read_legacy_assembly_origins','estimates') ON CONFLICT DO NOTHING$q$;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
