-- STAGING ONLY. No source data, no membership/security policy changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.eos_scorecard_save_metric_v1(jsonb,uuid)'::regprocedure)) <> '091eabd5be929dce881c212cc09c234d'
 OR md5(pg_get_functiondef('public.eos_scorecard_save_observations_v1(jsonb,uuid)'::regprocedure)) <> 'dc219b9a6458aa8d71a25283c10f3a40'
 THEN RAISE EXCEPTION 'Staging scorecard contract drift; stop'; END IF;
END $$;
CREATE TABLE eos_private.imports (
 actor text NOT NULL, id uuid NOT NULL, payload jsonb NOT NULL, snapshot bigint NOT NULL,
 expires_at timestamptz NOT NULL, preview jsonb NOT NULL, receipt jsonb, PRIMARY KEY(actor,id)
);
CREATE TABLE eos_private.import_sources (
 source_id text NOT NULL, source_revision text NOT NULL, source_cell text NOT NULL,
 actor text NOT NULL, import_id uuid NOT NULL, metric_id uuid NOT NULL, period_id text NOT NULL,
 PRIMARY KEY(source_id,source_revision,source_cell)
);
ALTER TABLE eos_private.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE eos_private.import_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON eos_private.imports,eos_private.import_sources FROM PUBLIC,anon,authenticated;

CREATE FUNCTION eos_private.validate_import(p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE r jsonb; d jsonb; rows jsonb:='[]'; state text; message text; anchor date; meeting date; start_date date; end_date date;
 n numeric; value jsonb; i integer:=0; ready integer:=0; held integer:=0; errors integer:=0;
 seen text[]:=ARRAY[]::text[]; sources text[]:=ARRAY[]::text[]; identity text; source_key text;
BEGIN
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Historical rows must be an array' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 2000 OR octet_length(p_rows::text)>4000000 THEN RAISE EXCEPTION 'Provide 1–2000 rows within 4 MB' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
  i:=i+1; state:='ready'; message:='Insert new observation'; value:=NULL;
  BEGIN
   IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(r))<>15
    OR NOT r ?& ARRAY['source_id','source_revision','source_cell','metric_id','definition_id','category_id','unit','percent_scale','reporting_anchor','source_meeting_date','measurement_start','as_of','actual_value','comments','review_status']
    OR EXISTS(SELECT 1 FROM jsonb_each(r) e WHERE jsonb_typeof(e.value)<>'string') THEN RAISE EXCEPTION 'Use the historical template: all 15 columns must be strings'; END IF;
   IF EXISTS(SELECT 1 FROM unnest(ARRAY['source_id','source_revision','source_cell','definition_id']) k WHERE nullif(btrim(r->>k),'') IS NULL) THEN RAISE EXCEPTION 'Source ID, revision, cell and explicit definition ID required'; END IF;
   IF coalesce(r->>'metric_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Valid metric ID required'; END IF;
   IF coalesce(r->>'category_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Valid category ID required'; END IF;
   IF EXISTS(SELECT 1 FROM unnest(ARRAY['reporting_anchor','source_meeting_date','measurement_start','as_of']) k WHERE coalesce(r->>k,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN RAISE EXCEPTION 'ISO calendar dates required'; END IF;
   anchor:=(r->>'reporting_anchor')::date; meeting:=(r->>'source_meeting_date')::date; start_date:=(r->>'measurement_start')::date; end_date:=(r->>'as_of')::date;
   IF extract(isodow FROM anchor)<>1 OR meeting<anchor OR meeting>anchor+6 OR start_date>end_date THEN RAISE EXCEPTION 'Invalid week anchor, source meeting date or measurement interval'; END IF;
   identity:=lower(r->>'metric_id')||'/'||anchor;
   source_key:=jsonb_build_array(r->>'source_id',r->>'source_revision',r->>'source_cell')::text;
   IF identity=ANY(seen) OR source_key=ANY(sources) THEN RAISE EXCEPTION 'Duplicate metric/week or source cell within file'; END IF;
   seen:=array_append(seen,identity); sources:=array_append(sources,source_key);
   IF NOT EXISTS(SELECT 1 FROM public.eos_scorecard_metrics WHERE id=(r->>'metric_id')::uuid) THEN RAISE EXCEPTION 'Unknown metric ID; review mapping first'; END IF;
   SELECT data INTO d FROM public.eos_scorecard_definitions WHERE metric_id=(r->>'metric_id')::uuid AND effective_from<=anchor ORDER BY effective_from DESC,revision DESC LIMIT 1;
   IF d IS NULL OR d->>'id' IS DISTINCT FROM r->>'definition_id' THEN RAISE EXCEPTION 'Definition is not effective for this historical week; review mapping first'; END IF;
   IF d->>'category_id' IS DISTINCT FROM r->>'category_id' OR NOT EXISTS(SELECT 1 FROM public.eos_scorecard_categories WHERE id=(r->>'category_id')::uuid) THEN RAISE EXCEPTION 'Category mapping missing or inconsistent'; END IF;
   IF d->>'unit' IS DISTINCT FROM r->>'unit' THEN RAISE EXCEPTION 'Unit differs from explicit definition'; END IF;
   IF r->>'review_status' NOT IN ('review-needed','reviewed') THEN RAISE EXCEPTION 'Explicit review-needed or reviewed status required'; END IF;
   IF d->>'unit'='percent' AND r->>'percent_scale' NOT IN ('fraction','0-100') OR d->>'unit'<>'percent' AND r->>'percent_scale'<>'' THEN RAISE EXCEPTION 'Explicit percent scale required only for percentage metrics'; END IF;
   IF r->>'actual_value'<>'' THEN
    IF d->>'unit'='text' THEN value:=to_jsonb(r->>'actual_value');
    ELSE
     IF r->>'actual_value' !~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' THEN RAISE EXCEPTION 'Unformatted finite numeric value required'; END IF;
     n:=(r->>'actual_value')::numeric;
     IF d->>'unit'='percent' AND r->>'percent_scale'='fraction' THEN
      IF n<0 OR n>1 THEN RAISE EXCEPTION 'Fraction percentage must be between 0 and 1'; END IF;
      n:=n*100;
     END IF;
     IF d->>'unit'='count' AND n<>trunc(n) OR d->>'unit'='percent' AND (n<0 OR n>100) THEN RAISE EXCEPTION 'Invalid count or percent scale'; END IF;
     value:=to_jsonb(n);
    END IF;
   END IF;
   IF r->>'actual_value'='' THEN state:='held'; message:='Blank source; no observation created';
   ELSIF EXISTS(SELECT 1 FROM eos_private.import_sources s WHERE s.source_id=r->>'source_id' AND s.source_revision=r->>'source_revision' AND s.source_cell=r->>'source_cell') THEN state:='held'; message:='Source cell already imported; review receipt';
   ELSIF EXISTS(SELECT 1 FROM public.eos_scorecard_observations WHERE metric_id=(r->>'metric_id')::uuid AND period_id=anchor::text) THEN state:='held'; message:='Existing observation retained; no overwrite'; END IF;
  EXCEPTION WHEN OTHERS THEN state:='error'; message:=SQLERRM; END;
  IF state='ready' THEN ready:=ready+1; ELSIF state='held' THEN held:=held+1; ELSE errors:=errors+1; END IF;
  rows:=rows||jsonb_build_array(jsonb_build_object('row',i,'status',state,'message',message,'source',r,'value',value));
 END LOOP;
 RETURN jsonb_build_object('rows',rows,'ready',ready,'held',held,'errors',errors,'success',0);
END $$;

CREATE FUNCTION public.eos_scorecard_import_preview_v1(p_rows jsonb,p_import_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE prior eos_private.imports%ROWTYPE; result jsonb; revision bigint; expiry timestamptz:=clock_timestamp()+interval '30 minutes';
BEGIN
 IF NOT public.current_user_can_manage_eos() OR nullif(auth.jwt()->>'sub','') IS NULL THEN RAISE EXCEPTION 'Active EOS membership required' USING ERRCODE='42501'; END IF;
 IF p_import_id IS NULL THEN RAISE EXCEPTION 'Import retry identity required' USING ERRCODE='22023'; END IF;
 SELECT c.revision INTO revision FROM eos_private.clock c WHERE id FOR UPDATE;
 SELECT * INTO prior FROM eos_private.imports WHERE actor=auth.jwt()->>'sub' AND id=p_import_id;
 IF FOUND THEN
  IF prior.payload IS DISTINCT FROM p_rows THEN RAISE EXCEPTION 'Import identity reused for different source'; END IF;
  RETURN coalesce(prior.receipt,prior.preview);
 END IF;
 result:=eos_private.validate_import(p_rows)||jsonb_build_object('import_id',p_import_id,'snapshot',revision,'expires_at',expiry,'status','preview');
 INSERT INTO eos_private.imports VALUES(auth.jwt()->>'sub',p_import_id,p_rows,revision,expiry,result,NULL);
 RETURN result;
END $$;
CREATE FUNCTION public.eos_scorecard_import_receipt_v1(p_import_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE item eos_private.imports%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_eos() THEN RAISE EXCEPTION 'Active EOS membership required' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM eos_private.imports WHERE actor=auth.jwt()->>'sub' AND id=p_import_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Import not found for current actor'; END IF;
 RETURN coalesce(item.receipt,item.preview);
END $$;
CREATE FUNCTION public.eos_scorecard_import_apply_v1(p_import_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE item eos_private.imports%ROWTYPE; revision bigint; row jsonb; r jsonb; result jsonb; saved jsonb; p public.eos_scorecard_periods%ROWTYPE;
 changes jsonb:='[]'; completed jsonb:='[]'; notes text;
BEGIN
 IF NOT public.current_user_can_manage_eos() OR nullif(auth.jwt()->>'sub','') IS NULL THEN RAISE EXCEPTION 'Active EOS membership required' USING ERRCODE='42501'; END IF;
 SELECT c.revision INTO revision FROM eos_private.clock c WHERE id FOR UPDATE;
 SELECT * INTO item FROM eos_private.imports WHERE actor=auth.jwt()->>'sub' AND id=p_import_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Import not found for current actor'; END IF;
 -- Completed receipts survive expiry and later edits. Retrying never writes twice.
 IF item.receipt IS NOT NULL THEN RETURN item.receipt; END IF;
 IF item.snapshot<>revision OR item.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Stale preview: create and review a fresh preview' USING ERRCODE='PT409'; END IF;
 result:=eos_private.validate_import(item.payload);
 IF result->'rows' IS DISTINCT FROM item.preview->'rows' THEN RAISE EXCEPTION 'Mapping or data changed; create a fresh preview' USING ERRCODE='PT409'; END IF;
 IF (result->>'errors')::integer>0 OR (result->>'ready')::integer=0 THEN RAISE EXCEPTION 'Resolve errors and review at least one ready row before Apply' USING ERRCODE='22023'; END IF;
 FOR row IN SELECT * FROM jsonb_array_elements(result->'rows') WHERE value->>'status'='ready' LOOP
  r:=row->'source';
  SELECT * INTO p FROM public.eos_scorecard_periods WHERE id=r->>'reporting_anchor';
  IF NOT FOUND THEN
   PERFORM public.eos_scorecard_save_period_v1(jsonb_build_object('id',r->>'reporting_anchor','anchor',r->>'reporting_anchor','meeting_date',r->>'source_meeting_date','expected_revision',0),gen_random_uuid());
   SELECT * INTO p FROM public.eos_scorecard_periods WHERE id=r->>'reporting_anchor';
  END IF;
  notes:=coalesce(r->>'comments','')||E'\n[Historical import '||p_import_id||'; '||(r->>'review_status')||'; source '||(r->>'source_id')||'; revision '||(r->>'source_revision')||'; cell '||(r->>'source_cell')||'; meeting '||(r->>'source_meeting_date')||']';
  changes:=changes||jsonb_build_array(jsonb_build_object('metric_id',r->>'metric_id','period_id',p.id,'definition_id',r->>'definition_id','expected_revision',0,'period_revision',p.revision,'value',row->'value','notes',notes,'measurement_start',r->>'measurement_start','as_of',r->>'as_of'));
 END LOOP;
 saved:=public.eos_scorecard_save_observations_v1(changes,gen_random_uuid());
 FOR row IN SELECT * FROM jsonb_array_elements(result->'rows') WHERE value->>'status'='ready' LOOP
  r:=row->'source';
  INSERT INTO eos_private.import_sources VALUES(r->>'source_id',r->>'source_revision',r->>'source_cell',auth.jwt()->>'sub',p_import_id,(r->>'metric_id')::uuid,r->>'reporting_anchor');
 END LOOP;
 result:=item.preview||jsonb_build_object('status','applied','success',jsonb_array_length(saved),'ready',0,'records',saved,'applied_at',clock_timestamp(),'actor',auth.jwt()->>'sub');
 PERFORM eos_private.audit('historical_import',p_import_id::text,NULL,result);
 UPDATE eos_private.imports SET receipt=result WHERE actor=auth.jwt()->>'sub' AND id=p_import_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION eos_private.validate_import(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.eos_scorecard_import_preview_v1(jsonb,uuid),public.eos_scorecard_import_receipt_v1(uuid),public.eos_scorecard_import_apply_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eos_scorecard_import_preview_v1(jsonb,uuid),public.eos_scorecard_import_receipt_v1(uuid),public.eos_scorecard_import_apply_v1(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
