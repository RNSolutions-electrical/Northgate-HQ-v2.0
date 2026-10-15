-- Production-only: reviewed scorecard contract, no imported records.
-- Source: applied Staging 20261014234750 plus 20261015001358.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $preflight$
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Unexpected migration owner; re-review default privileges'; END IF;
 IF to_regnamespace('eos_private') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'eos_scorecard_%') OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'eos_scorecard_%' OR proname IN('eos_save_pursuit_v1','eos_member_directory_v1'))) THEN RAISE EXCEPTION 'Scorecard objects already exist: stop, do not overwrite'; END IF;
IF to_regprocedure('public.current_user_can_manage_eos()') IS NULL OR md5(pg_get_functiondef('public.current_user_can_manage_eos()'::regprocedure)) <> '5c60299742bfc5c2253a85db73aa7bab' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.current_user_can_manage_eos()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Production function/ACL drift: public.current_user_can_manage_eos()'; END IF;
IF to_regprocedure('public.eos_manager_directory()') IS NULL OR md5(pg_get_functiondef('public.eos_manager_directory()'::regprocedure)) <> '439bf3f39334b0caf07a45baba4e409b' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.eos_manager_directory()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Production function/ACL drift: public.eos_manager_directory()'; END IF;
IF to_regprocedure('public.set_eos_access(text,boolean)') IS NULL OR md5(pg_get_functiondef('public.set_eos_access(text,boolean)'::regprocedure)) <> '8e13cd67a8069e4baf2180c07d847b57' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.set_eos_access(text,boolean)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Production function/ACL drift: public.set_eos_access(text,boolean)'; END IF;
IF to_regprocedure('public.read_eos_access_directory()') IS NULL OR md5(pg_get_functiondef('public.read_eos_access_directory()'::regprocedure)) <> 'ecf9efa3b1ef7249561e69ec1cf9fb02' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.read_eos_access_directory()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Production function/ACL drift: public.read_eos_access_directory()'; END IF;
IF to_regprocedure('public.eos_audit_row()') IS NULL OR md5(pg_get_functiondef('public.eos_audit_row()'::regprocedure)) <> '6c77f6b8d059524f8933fc404d943b06' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.eos_audit_row()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Production function/ACL drift: public.eos_audit_row()'; END IF;
IF to_regprocedure('public.eos_touch()') IS NULL OR md5(pg_get_functiondef('public.eos_touch()'::regprocedure)) <> 'f3d425d1180d6eb94e85f7984a804e79' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.eos_touch()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Production function/ACL drift: public.eos_touch()'; END IF;
IF to_regprocedure('public.eos_save_pursuit(uuid,jsonb,text[])') IS NULL OR md5(pg_get_functiondef('public.eos_save_pursuit(uuid,jsonb,text[])'::regprocedure)) <> '2bcc153b0351c07a94e96986ba5ee62e' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.eos_save_pursuit(uuid,jsonb,text[])'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Production function/ACL drift: public.eos_save_pursuit(uuid,jsonb,text[])'; END IF;
IF to_regprocedure('public.eos_set_pursuit_removed(uuid,boolean)') IS NULL OR md5(pg_get_functiondef('public.eos_set_pursuit_removed(uuid,boolean)'::regprocedure)) <> '2c2732d55cc0433070fb1ef1a3246320' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.eos_set_pursuit_removed(uuid,boolean)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Production function/ACL drift: public.eos_set_pursuit_removed(uuid,boolean)'; END IF;
IF to_regprocedure('public.eos_guard_pursuit()') IS NULL OR md5(pg_get_functiondef('public.eos_guard_pursuit()'::regprocedure)) <> '3c2c9000d67dfb8411bd1ec09d4198a9' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.eos_guard_pursuit()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Production function/ACL drift: public.eos_guard_pursuit()'; END IF;
IF to_regprocedure('public.eos_set_pursuit_job(uuid,uuid,uuid)') IS NULL OR md5(pg_get_functiondef('public.eos_set_pursuit_job(uuid,uuid,uuid)'::regprocedure)) <> 'fa80782ffae95097a0fcfc4b526a1817' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.eos_set_pursuit_job(uuid,uuid,uuid)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Production function/ACL drift: public.eos_set_pursuit_job(uuid,uuid,uuid)'; END IF;
IF to_regprocedure('public.eos_award_pursuit(uuid,uuid,text,text)') IS NULL OR md5(pg_get_functiondef('public.eos_award_pursuit(uuid,uuid,text,text)'::regprocedure)) <> '4068e2e0c1d91dee44c26555fac79d46' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.eos_award_pursuit(uuid,uuid,text,text)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Production function/ACL drift: public.eos_award_pursuit(uuid,uuid,text,text)'; END IF;
IF to_regprocedure('public.eos_reverse_award(uuid,uuid,text,text)') IS NULL OR md5(pg_get_functiondef('public.eos_reverse_award(uuid,uuid,text,text)'::regprocedure)) <> '39387f2f7525a2b6e67f9fc38504fbf9' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.eos_reverse_award(uuid,uuid,text,text)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'Production function/ACL drift: public.eos_reverse_award(uuid,uuid,text,text)'; END IF;
END $preflight$;
-- Drain legacy writers atomically. Existing clients must refresh after cutover.
LOCK TABLE public.eos_pursuits, public.eos_pursuit_managers IN SHARE ROW EXCLUSIVE MODE;

-- REVIEW CANDIDATE ONLY. Not a migration; never run against shared databases
-- without separate approval. No accounts, membership grants or workbook seeds.
-- JSONB payloads preserve numeric/text/null types; immutable definition payloads
-- retain historical labels. Public direct writes are denied; guarded RPCs only.
CREATE SCHEMA IF NOT EXISTS eos_private;
REVOKE ALL ON SCHEMA eos_private FROM PUBLIC, anon, authenticated;
CREATE TABLE eos_private.clock (id boolean PRIMARY KEY DEFAULT true CHECK(id), revision bigint NOT NULL DEFAULT 0);
INSERT INTO eos_private.clock DEFAULT VALUES;
CREATE TABLE eos_private.requests (actor text NOT NULL, request_id uuid NOT NULL, body jsonb NOT NULL, result jsonb NOT NULL, PRIMARY KEY(actor,request_id));
CREATE TABLE public.eos_scorecard_categories (id uuid PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE public.eos_scorecard_metrics (id uuid PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE public.eos_scorecard_definitions (id text PRIMARY KEY, metric_id uuid NOT NULL REFERENCES public.eos_scorecard_metrics, effective_from date NOT NULL, revision integer NOT NULL, data jsonb NOT NULL, UNIQUE(metric_id,revision));
CREATE TABLE public.eos_scorecard_periods (id text PRIMARY KEY, anchor date UNIQUE NOT NULL, meeting_date date NOT NULL, revision integer NOT NULL, CHECK(id=anchor::text), CHECK(extract(isodow FROM anchor)=1));
CREATE TABLE public.eos_scorecard_observations (metric_id uuid NOT NULL REFERENCES public.eos_scorecard_metrics, period_id text NOT NULL REFERENCES public.eos_scorecard_periods, definition_id text NOT NULL REFERENCES public.eos_scorecard_definitions, value_numeric numeric, value_text text, notes text NOT NULL DEFAULT '', measurement_start date NOT NULL, as_of date NOT NULL, revision integer NOT NULL, recorded_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, actor_id text NOT NULL, PRIMARY KEY(metric_id,period_id), CHECK(value_numeric IS NULL OR value_text IS NULL), CHECK(measurement_start<=as_of));
CREATE TABLE public.eos_scorecard_audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), entity text NOT NULL, entity_id text NOT NULL, before_data jsonb, after_data jsonb NOT NULL);
CREATE INDEX eos_scorecard_definitions_period ON public.eos_scorecard_definitions(metric_id,effective_from DESC,revision DESC);
CREATE INDEX eos_scorecard_observations_history ON public.eos_scorecard_observations(period_id,metric_id);

CREATE OR REPLACE FUNCTION public.current_user_can_manage_eos()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.eos_access_grants g JOIN public.user_permissions u ON u.clerk_user_id=g.user_id
 WHERE g.user_id=auth.jwt()->>'sub' AND u.is_active);
$$;
REVOKE ALL ON FUNCTION public.current_user_can_manage_eos() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_eos() TO authenticated;
-- Deliberately leave set_eos_access and read_eos_access_directory administration
-- authority unchanged. Their target-rank restriction requires separate review.
CREATE FUNCTION public.eos_member_directory_v1()
RETURNS TABLE(user_id text,display_name text,is_active boolean,is_member boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.current_user_can_manage_eos() THEN RAISE EXCEPTION 'EOS membership required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.clerk_user_id,coalesce(nullif(u.display_name,''),u.email,u.clerk_user_id),u.is_active,g.user_id IS NOT NULL
 FROM public.user_permissions u LEFT JOIN public.eos_access_grants g ON g.user_id=u.clerk_user_id
 WHERE g.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.eos_pursuit_managers pm WHERE pm.user_id=u.clerk_user_id)
 OR EXISTS(SELECT 1 FROM public.eos_scorecard_definitions d WHERE d.data->>'owner_id'=u.clerk_user_id)
 ORDER BY 2;
END $$;

CREATE FUNCTION eos_private.begin_write(p_request uuid,p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE prior eos_private.requests%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_eos() THEN RAISE EXCEPTION 'EOS membership required' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'Retry identity required'; END IF;
 PERFORM 1 FROM eos_private.clock WHERE id FOR UPDATE;
 SELECT * INTO prior FROM eos_private.requests WHERE actor=auth.jwt()->>'sub' AND request_id=p_request;
 IF FOUND THEN
   IF prior.body<>p_body THEN RAISE EXCEPTION 'Retry identity reused for different request'; END IF;
   RETURN prior.result;
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION eos_private.finish_write(p_request uuid,p_body jsonb,p_result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
BEGIN
 INSERT INTO eos_private.requests VALUES(auth.jwt()->>'sub',p_request,p_body,p_result);
 UPDATE eos_private.clock SET revision=revision+1 WHERE id;
 RETURN p_result;
END $$;
CREATE FUNCTION eos_private.audit(p_entity text,p_id text,p_before jsonb,p_after jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 INSERT INTO public.eos_scorecard_audit(actor_id,entity,entity_id,before_data,after_data)
 VALUES(auth.jwt()->>'sub',p_entity,p_id,p_before,p_after);
$$;
CREATE FUNCTION eos_private.observation_json(o public.eos_scorecard_observations) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT (to_jsonb(o)-'value_numeric'-'value_text') || jsonb_build_object('value',coalesce(to_jsonb(o.value_numeric),to_jsonb(o.value_text),'null'::jsonb)); $$;

CREATE FUNCTION public.eos_scorecard_save_period_v1(p_input jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE body jsonb:=jsonb_build_array('period',p_input); result jsonb; old public.eos_scorecard_periods%ROWTYPE; saved public.eos_scorecard_periods%ROWTYPE;
BEGIN
 result:=eos_private.begin_write(p_request_id,body); IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT * INTO old FROM public.eos_scorecard_periods WHERE id=p_input->>'id';
 IF coalesce(old.revision,0) IS DISTINCT FROM (p_input->>'expected_revision')::integer THEN RAISE EXCEPTION 'Conflict: period changed' USING ERRCODE='PT409'; END IF;
 IF old.id IS NOT NULL AND old.anchor IS DISTINCT FROM (p_input->>'anchor')::date THEN RAISE EXCEPTION 'Period identity cannot change'; END IF;
 INSERT INTO public.eos_scorecard_periods VALUES(p_input->>'id',(p_input->>'anchor')::date,(p_input->>'meeting_date')::date,coalesce(old.revision,0)+1)
 ON CONFLICT(id) DO UPDATE SET meeting_date=excluded.meeting_date,revision=excluded.revision RETURNING * INTO saved;
 result:=to_jsonb(saved); PERFORM eos_private.audit('period',saved.id,CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END,result);
 RETURN eos_private.finish_write(p_request_id,body,result);
END $$;
CREATE FUNCTION public.eos_scorecard_save_category_v1(p_input jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE body jsonb:=jsonb_build_array('category',p_input); result jsonb; old jsonb;
BEGIN
 result:=eos_private.begin_write(p_request_id,body); IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT data INTO old FROM public.eos_scorecard_categories WHERE id=(p_input->>'id')::uuid;
 IF coalesce((old->>'revision')::integer,0) IS DISTINCT FROM (p_input->>'expected_revision')::integer THEN RAISE EXCEPTION 'Conflict: category changed' USING ERRCODE='PT409'; END IF;
 IF nullif(btrim(p_input->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Category name required'; END IF;
 result:=jsonb_build_object('id',p_input->>'id','name',btrim(p_input->>'name'),'revision',coalesce((old->>'revision')::integer,0)+1);
 INSERT INTO public.eos_scorecard_categories VALUES((p_input->>'id')::uuid,result) ON CONFLICT(id) DO UPDATE SET data=excluded.data;
 PERFORM eos_private.audit('category',p_input->>'id',old,result);
 RETURN eos_private.finish_write(p_request_id,body,result);
END $$;
CREATE FUNCTION public.eos_scorecard_save_metric_v1(p_input jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE body jsonb:=jsonb_build_array('metric',p_input); result jsonb; old jsonb; prior jsonb; d jsonb:=p_input->'definition'; rev integer; cat text; owner_name text; owner_id text:=nullif(d->>'owner_id',''); unit text:=d->>'unit'; goal jsonb;
BEGIN
 result:=eos_private.begin_write(p_request_id,body); IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT data INTO old FROM public.eos_scorecard_metrics WHERE id=(p_input->>'id')::uuid;
 IF coalesce((old->>'revision')::integer,0) IS DISTINCT FROM (p_input->>'expected_revision')::integer THEN RAISE EXCEPTION 'Conflict: metric changed' USING ERRCODE='PT409'; END IF;
 SELECT data INTO prior FROM public.eos_scorecard_definitions WHERE metric_id=(p_input->>'id')::uuid AND effective_from<=(d->>'effective_from')::date ORDER BY effective_from DESC,revision DESC LIMIT 1;
 IF nullif(btrim(d->>'name'),'') IS NULL OR nullif(btrim(d->>'context'),'') IS NULL OR d->>'effective_from' IS NULL THEN RAISE EXCEPTION 'Name, definition and effective date required'; END IF;
 IF unit IS NULL OR unit NOT IN ('number','count','currency','percent','text') OR d->>'carry' IS NULL OR d->>'carry' NOT IN ('none','continuous','year','quarter') OR d->>'window' IS NULL OR d->>'window' NOT IN ('point-in-time','rolling-30','YTD','QTD','period') OR d->>'aggregation' IS NULL OR d->>'aggregation' NOT IN ('none','last','sum','average') THEN RAISE EXCEPTION 'Invalid configuration'; END IF;
 IF d->>'aggregation'='sum' AND (unit IN ('percent','text') OR d->>'window' IN ('YTD','QTD','rolling-30')) OR unit='text' AND d->>'aggregation'='average' THEN RAISE EXCEPTION 'Unsafe aggregation'; END IF;
 SELECT data->>'name' INTO cat FROM public.eos_scorecard_categories WHERE id=(d->>'category_id')::uuid;
 IF cat IS NULL THEN RAISE EXCEPTION 'Unknown category'; END IF;
 IF owner_id IS NOT NULL AND owner_id IS DISTINCT FROM prior->>'owner_id' AND NOT EXISTS(SELECT 1 FROM public.eos_access_grants g JOIN public.user_permissions u ON u.clerk_user_id=g.user_id WHERE g.user_id=owner_id AND u.is_active) THEN RAISE EXCEPTION 'New owners must be active EOS members'; END IF;
 SELECT coalesce(nullif(display_name,''),email,clerk_user_id) INTO owner_name FROM public.user_permissions WHERE clerk_user_id=owner_id;
 goal:=CASE WHEN nullif(d->>'goal','') IS NULL THEN 'null'::jsonb WHEN unit='text' THEN to_jsonb(d->>'goal') ELSE to_jsonb((d->>'goal')::numeric) END;
 IF unit='percent' AND ((goal#>>'{}')::numeric<0 OR (goal#>>'{}')::numeric>100) OR unit='count' AND (goal#>>'{}')::numeric<>trunc((goal#>>'{}')::numeric) THEN RAISE EXCEPTION 'Invalid goal type/scale'; END IF;
 rev:=coalesce((old->>'revision')::integer,0)+1;
 result:=jsonb_build_object('id',p_input->>'id','revision',rev,'retired',coalesce((p_input->>'retired')::boolean,false));
 INSERT INTO public.eos_scorecard_metrics VALUES((p_input->>'id')::uuid,result) ON CONFLICT(id) DO UPDATE SET data=excluded.data;
 d:=jsonb_build_object('id',(p_input->>'id')||':v'||rev,'metric_id',p_input->>'id','revision',rev,'name',btrim(d->>'name'),'context',d->>'context','effective_from',d->>'effective_from','category_id',d->>'category_id','category_label',cat,'owner_id',coalesce(owner_id,''),'owner_label',coalesce(owner_name,prior->>'owner_label',''),'unit',unit,'goal',goal,'window',d->>'window','carry',d->>'carry','aggregation',d->>'aggregation','recorded_at',clock_timestamp());
 INSERT INTO public.eos_scorecard_definitions VALUES(d->>'id',(p_input->>'id')::uuid,(d->>'effective_from')::date,rev,d);
 PERFORM eos_private.audit('metric',p_input->>'id',jsonb_build_object('metric',old,'definition',prior),jsonb_build_object('metric',result,'definition',d));
 RETURN eos_private.finish_write(p_request_id,body,result);
END $$;

CREATE FUNCTION public.eos_scorecard_save_observations_v1(p_changes jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE body jsonb:=jsonb_build_array('observations',p_changes); result jsonb; c jsonb; old public.eos_scorecard_observations%ROWTYPE; saved public.eos_scorecard_observations%ROWTYPE; p public.eos_scorecard_periods%ROWTYPE; d jsonb; n numeric; t text; stamp timestamptz:=clock_timestamp();
BEGIN
 result:=eos_private.begin_write(p_request_id,body); IF result IS NOT NULL THEN RETURN result; END IF;
 IF jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes)=0 THEN RAISE EXCEPTION 'Changes required'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_changes) x GROUP BY x->>'metric_id',x->>'period_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate metric/period ID'; END IF;
 result:='[]'::jsonb;
 FOR c IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
   SELECT * INTO p FROM public.eos_scorecard_periods WHERE id=c->>'period_id';
   IF p.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.eos_scorecard_metrics WHERE id=(c->>'metric_id')::uuid) THEN RAISE EXCEPTION 'Unknown metric/period ID'; END IF;
   SELECT * INTO old FROM public.eos_scorecard_observations WHERE metric_id=(c->>'metric_id')::uuid AND period_id=p.id;
   IF coalesce(old.revision,0) IS DISTINCT FROM (c->>'expected_revision')::integer OR p.revision IS DISTINCT FROM (c->>'period_revision')::integer THEN RAISE EXCEPTION 'Conflict: observation/period changed' USING ERRCODE='PT409'; END IF;
   IF old.definition_id IS NOT NULL THEN SELECT data INTO d FROM public.eos_scorecard_definitions WHERE id=old.definition_id;
   ELSE SELECT data INTO d FROM public.eos_scorecard_definitions WHERE metric_id=(c->>'metric_id')::uuid AND effective_from<=p.anchor ORDER BY effective_from DESC,revision DESC LIMIT 1; END IF;
   IF d IS NULL OR d->>'id' IS DISTINCT FROM c->>'definition_id' THEN RAISE EXCEPTION 'Conflict: definition changed' USING ERRCODE='PT409'; END IF;
   n:=NULL; t:=NULL;
   IF nullif(c->>'value','') IS NOT NULL THEN
     IF d->>'unit'='text' THEN t:=c->>'value';
     ELSE
       IF c->>'value' !~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' THEN RAISE EXCEPTION 'Unformatted numeric value required'; END IF;
       n:=(c->>'value')::numeric;
       IF d->>'unit'='count' AND n<>trunc(n) OR d->>'unit'='percent' AND (n<0 OR n>100) THEN RAISE EXCEPTION 'Invalid numeric type/percentage scale'; END IF;
     END IF;
   END IF;
   INSERT INTO public.eos_scorecard_observations VALUES((c->>'metric_id')::uuid,p.id,d->>'id',n,t,coalesce(c->>'notes',''),(c->>'measurement_start')::date,(c->>'as_of')::date,coalesce(old.revision,0)+1,coalesce(old.recorded_at,stamp),stamp,auth.jwt()->>'sub')
   ON CONFLICT(metric_id,period_id) DO UPDATE SET value_numeric=excluded.value_numeric,value_text=excluded.value_text,notes=excluded.notes,measurement_start=excluded.measurement_start,as_of=excluded.as_of,revision=excluded.revision,updated_at=excluded.updated_at,actor_id=excluded.actor_id RETURNING * INTO saved;
   PERFORM eos_private.audit('observation',saved.metric_id||'/'||saved.period_id,CASE WHEN old.period_id IS NULL THEN NULL ELSE eos_private.observation_json(old) END,eos_private.observation_json(saved));
   result:=result||jsonb_build_array(eos_private.observation_json(saved));
 END LOOP;
 RETURN eos_private.finish_write(p_request_id,body,result);
END $$;

-- Page includes actual observations for its periods and original earlier actuals
-- per metric/definition needed for carry resolution. Context-only periods aren't
-- displayed until loaded as ordinary history. Catalog versions remain complete.
CREATE FUNCTION public.eos_scorecard_history_v1(p_cursor text DEFAULT NULL,p_snapshot bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE current_revision bigint; result jsonb;
BEGIN
 IF NOT public.current_user_can_manage_eos() THEN RAISE EXCEPTION 'EOS membership required' USING ERRCODE='42501'; END IF;
 SELECT revision INTO current_revision FROM eos_private.clock WHERE id;
 IF p_snapshot IS NOT NULL AND p_snapshot<>current_revision THEN RAISE EXCEPTION 'Conflict: history changed during export; retry' USING ERRCODE='PT409'; END IF;
 WITH wanted AS (SELECT * FROM public.eos_scorecard_periods WHERE p_cursor IS NULL OR anchor<p_cursor::date ORDER BY anchor DESC LIMIT 12),
 older AS (SELECT DISTINCT ON(o.metric_id,o.definition_id) o.* FROM public.eos_scorecard_observations o JOIN public.eos_scorecard_periods p ON p.id=o.period_id WHERE p.anchor<(SELECT min(anchor) FROM wanted) AND (o.value_numeric IS NOT NULL OR o.value_text IS NOT NULL) ORDER BY o.metric_id,o.definition_id,p.anchor DESC),
 observations AS (SELECT o.* FROM public.eos_scorecard_observations o WHERE o.period_id IN(SELECT id FROM wanted) UNION SELECT * FROM older),
 periods AS (SELECT to_jsonb(w)||jsonb_build_object('context_only',false) data FROM wanted w UNION ALL SELECT to_jsonb(p)||jsonb_build_object('context_only',true) FROM public.eos_scorecard_periods p WHERE p.id IN(SELECT period_id FROM older) AND p.id NOT IN(SELECT id FROM wanted))
 SELECT jsonb_build_object('periods',coalesce((SELECT jsonb_agg(data) FROM periods),'[]'::jsonb),'observations',coalesce((SELECT jsonb_agg(eos_private.observation_json(o)) FROM observations o),'[]'::jsonb),'next_cursor',CASE WHEN EXISTS(SELECT 1 FROM public.eos_scorecard_periods WHERE anchor<(SELECT min(anchor) FROM wanted)) THEN (SELECT min(anchor)::text FROM wanted) ELSE NULL END) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.eos_scorecard_read_v1() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE page jsonb;
BEGIN
 page:=public.eos_scorecard_history_v1();
 RETURN page||jsonb_build_object('snapshot',(SELECT revision FROM eos_private.clock WHERE id),'metrics',coalesce((SELECT jsonb_agg(data) FROM public.eos_scorecard_metrics),'[]'::jsonb),'categories',coalesce((SELECT jsonb_agg(data) FROM public.eos_scorecard_categories),'[]'::jsonb),'definitions',coalesce((SELECT jsonb_agg(data) FROM public.eos_scorecard_definitions),'[]'::jsonb),'members',coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM public.eos_member_directory_v1() m),'[]'::jsonb));
END $$;

-- Pursuit wrapper serializes legacy writes via a row lock, checks updated_at,
-- restricts newly assigned people to members, and retains legacy audit behavior.
CREATE FUNCTION public.eos_save_pursuit_v1(p_id uuid,p_data jsonb,p_manager_ids text[],p_expected_updated_at timestamptz,p_request_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE body jsonb:=jsonb_build_array('pursuit',p_id,p_data,p_manager_ids,p_expected_updated_at); cached jsonb; stamp timestamptz; saved uuid;
BEGIN
 cached:=eos_private.begin_write(p_request_id,body); IF cached IS NOT NULL THEN RETURN (cached#>>'{}')::uuid; END IF;
 IF p_id IS NOT NULL THEN
   SELECT updated_at INTO stamp FROM public.eos_pursuits WHERE id=p_id FOR UPDATE;
   IF NOT FOUND OR stamp IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Conflict: pursuit changed' USING ERRCODE='PT409'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(coalesce(p_manager_ids,ARRAY[]::text[])) m(user_id) WHERE NOT EXISTS(SELECT 1 FROM public.eos_access_grants g JOIN public.user_permissions u ON u.clerk_user_id=g.user_id WHERE g.user_id=m.user_id AND u.is_active) AND NOT EXISTS(SELECT 1 FROM public.eos_pursuit_managers pm WHERE pm.pursuit_id=p_id AND pm.user_id=m.user_id)) THEN RAISE EXCEPTION 'New managers must be active EOS members'; END IF;
 saved:=public.eos_save_pursuit(p_id,p_data,p_manager_ids);
 PERFORM eos_private.finish_write(p_request_id,body,to_jsonb(saved)); RETURN saved;
END $$;
-- Existing legacy RPC must not remain an authenticated bypass for stale writes.
REVOKE EXECUTE ON FUNCTION public.eos_save_pursuit(uuid,jsonb,text[]) FROM PUBLIC,anon,authenticated;

DO $$ DECLARE t text; f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['eos_scorecard_categories','eos_scorecard_metrics','eos_scorecard_definitions','eos_scorecard_periods','eos_scorecard_observations','eos_scorecard_audit'] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
   EXECUTE format('CREATE POLICY eos_member_read ON public.%I FOR SELECT TO authenticated USING(public.current_user_can_manage_eos())',t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'eos_scorecard_%_v1' OR p.proname IN('eos_member_directory_v1','eos_save_pursuit_v1')) LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA eos_private FROM PUBLIC,anon,authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

