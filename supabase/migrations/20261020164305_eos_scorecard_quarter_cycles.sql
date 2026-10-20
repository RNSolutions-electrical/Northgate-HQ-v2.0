-- Additive only. Do not apply while the active Staging review is in progress.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE eos_private.quarter_schedule (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 revision integer NOT NULL DEFAULT 0,
 cycles jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(cycles)='array')
);
ALTER TABLE eos_private.quarter_schedule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON eos_private.quarter_schedule FROM PUBLIC,anon,authenticated;
INSERT INTO eos_private.quarter_schedule DEFAULT VALUES;

CREATE FUNCTION public.eos_scorecard_quarters_read_v1(p_snapshot bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
BEGIN
 IF NOT public.current_user_can_manage_eos() THEN RAISE EXCEPTION 'EOS membership required' USING ERRCODE='42501'; END IF;
 IF p_snapshot IS NOT NULL AND p_snapshot<>(SELECT revision FROM eos_private.clock WHERE id) THEN
  RAISE EXCEPTION 'Scorecard changed while reading cycle schedule; reload latest' USING ERRCODE='PT409';
 END IF;
 RETURN (SELECT jsonb_build_object('revision',revision,'cycles',cycles) FROM eos_private.quarter_schedule WHERE id);
END $$;

CREATE FUNCTION public.eos_scorecard_quarters_save_v1(p_input jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE body jsonb:=jsonb_build_array('quarter_schedule',p_input); result jsonb; old eos_private.quarter_schedule%ROWTYPE;
 c jsonb; normalized jsonb:='[]'; starts text[]:='{}'; names text[]:='{}'; ids text[]:='{}'; start_date date; name text;
BEGIN
 result:=eos_private.begin_write(p_request_id,body); IF result IS NOT NULL THEN RETURN result; END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR NOT p_input ?& ARRAY['expected_revision','cycles']
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k NOT IN ('expected_revision','cycles')) THEN RAISE EXCEPTION 'Cycle schedule and expected revision required'; END IF;
 IF jsonb_typeof(p_input->'expected_revision') IS DISTINCT FROM 'number' OR coalesce(p_input->>'expected_revision','') !~ '^[0-9]{1,9}$' THEN RAISE EXCEPTION 'Valid schedule revision required'; END IF;
 IF jsonb_typeof(p_input->'cycles') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'A list of named cycles is required'; END IF;
 IF jsonb_array_length(p_input->'cycles')>200 THEN RAISE EXCEPTION 'Use at most 200 named cycles'; END IF;
 SELECT * INTO old FROM eos_private.quarter_schedule WHERE id FOR UPDATE;
 IF old.revision<>(p_input->>'expected_revision')::integer THEN RAISE EXCEPTION 'Conflict: management cycle schedule changed; reload and review your retained draft' USING ERRCODE='PT409'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(p_input->'cycles') LOOP
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT c ?& ARRAY['id','name','starts_on']
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN ('id','name','starts_on'))
  OR jsonb_typeof(c->'id') IS DISTINCT FROM 'string' OR coalesce(c->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR jsonb_typeof(c->'name') IS DISTINCT FROM 'string' OR nullif(btrim(c->>'name'),'') IS NULL OR length(btrim(c->>'name'))>100
  OR jsonb_typeof(c->'starts_on') IS DISTINCT FROM 'string' OR coalesce(c->>'starts_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Each cycle requires a valid identity, name and effective start date'; END IF;
  BEGIN start_date:=(c->>'starts_on')::date; EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'Choose a real calendar date for the cycle start'; END;
  IF start_date<'1900-01-01'::date OR start_date>'2199-12-31'::date THEN RAISE EXCEPTION 'Cycle starts must be between 1900 and 2199'; END IF;
  name:=btrim(c->>'name');
  IF c->>'id'=ANY(ids) OR c->>'starts_on'=ANY(starts) OR lower(name)=ANY(names) THEN RAISE EXCEPTION 'Cycles need unique identities, names and start dates; their ranges must not overlap'; END IF;
  ids:=array_append(ids,c->>'id'); starts:=array_append(starts,c->>'starts_on'); names:=array_append(names,lower(name));
  normalized:=normalized||jsonb_build_array(jsonb_build_object('id',c->>'id','name',name,'starts_on',start_date::text));
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(old.cycles) prior WHERE NOT (prior->>'id'=ANY(ids))) THEN RAISE EXCEPTION 'Existing cycles must be retained; edit their name or start date instead'; END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'starts_on'),'[]'::jsonb) INTO normalized FROM jsonb_array_elements(normalized);
 UPDATE eos_private.quarter_schedule SET revision=revision+1,cycles=normalized WHERE id;
 result:=jsonb_build_object('revision',old.revision+1,'cycles',normalized);
 PERFORM eos_private.audit('quarter_schedule','main',jsonb_build_object('revision',old.revision,'cycles',old.cycles),result);
 RETURN eos_private.finish_write(p_request_id,body,result);
END $$;
REVOKE ALL ON FUNCTION public.eos_scorecard_quarters_read_v1(bigint),public.eos_scorecard_quarters_save_v1(jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.eos_scorecard_quarters_read_v1(bigint),public.eos_scorecard_quarters_save_v1(jsonb,uuid) TO authenticated;
COMMIT;
