-- Read-only business tools. This table stores request telemetry, never business writes.
CREATE TABLE public.northgate_tool_reads(
 request_id uuid PRIMARY KEY,actor text NOT NULL,tool text NOT NULL,
 arguments jsonb NOT NULL,outcome text NOT NULL CHECK(outcome IN('started','succeeded','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
CREATE INDEX northgate_tool_reads_actor_time_idx ON public.northgate_tool_reads(actor,created_at DESC);
ALTER TABLE public.northgate_tool_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.northgate_tool_reads FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.northgate_tool_reads TO authenticated;
CREATE POLICY northgate_tool_reads_developer ON public.northgate_tool_reads FOR SELECT TO authenticated USING(public.current_user_has_developer_access() AND EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active));
CREATE FUNCTION public.northgate_read_context()RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=public.hi_actor();
BEGIN
 RETURN(SELECT jsonb_build_object('actor',actor,'permissions',public.effective_permissions_for_user(role,division,permission_overrides)) FROM public.user_permissions WHERE clerk_user_id=actor AND is_active);
END $$;
CREATE FUNCTION public.northgate_audit_read(p_request uuid,p_tool text,p_arguments jsonb,p_outcome text)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id text:=public.hi_actor();r public.northgate_tool_reads;
BEGIN
 IF p_request IS NULL OR p_tool NOT IN('get_job_summary','get_service_call','search_catalog','resolve_material','get_inventory_location')
 OR p_outcome NOT IN('started','succeeded','failed') OR jsonb_typeof(p_arguments) IS DISTINCT FROM 'object' OR octet_length(p_arguments::text)>2000 THEN RAISE EXCEPTION 'Invalid read-tool audit request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('northgate-read:'||actor_id,0));
 SELECT * INTO r FROM public.northgate_tool_reads WHERE request_id=p_request;
 IF r.request_id IS NULL THEN
 IF p_outcome<>'started' THEN RAISE EXCEPTION 'Start the request audit first';END IF;
 IF (SELECT count(*) FROM public.northgate_tool_reads WHERE actor=actor_id AND created_at>now()-interval '1 minute')>=120 THEN RAISE EXCEPTION 'Read-tool rate limit reached. Retry in one minute.' USING ERRCODE='54000';END IF;
 INSERT INTO public.northgate_tool_reads(request_id,actor,tool,arguments,outcome)VALUES(p_request,actor_id,p_tool,p_arguments,p_outcome);
 ELSE
 IF r.actor<>actor_id OR r.tool<>p_tool OR r.arguments IS DISTINCT FROM p_arguments OR r.outcome<>'started' OR p_outcome='started' THEN RAISE EXCEPTION 'Read-tool audit replay differs' USING ERRCODE='42501';END IF;
 UPDATE public.northgate_tool_reads SET outcome=p_outcome,finished_at=clock_timestamp()WHERE request_id=p_request;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.northgate_read_context(),public.northgate_audit_read(uuid,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.northgate_read_context(),public.northgate_audit_read(uuid,text,jsonb,text) TO authenticated;
