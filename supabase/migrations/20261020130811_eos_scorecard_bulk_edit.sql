-- Staging only: authenticated baseline-backed CSV round trip. No business seeds.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.eos_scorecard_save_metric_v1(jsonb,uuid)'::regprocedure))<>'091eabd5be929dce881c212cc09c234d' OR md5(pg_get_functiondef('public.eos_scorecard_save_observations_v1(jsonb,uuid)'::regprocedure))<>'dc219b9a6458aa8d71a25283c10f3a40' THEN RAISE EXCEPTION 'Scorecard contract drift; stop and review'; END IF;
END $$;
CREATE TABLE eos_private.bulk_exports(actor text NOT NULL,id uuid NOT NULL,baseline jsonb NOT NULL,snapshot bigint NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(actor,id));
CREATE TABLE eos_private.bulk_previews(actor text NOT NULL,id uuid NOT NULL,payload jsonb NOT NULL,snapshot bigint NOT NULL,expires_at timestamptz NOT NULL,preview jsonb NOT NULL,receipt jsonb,PRIMARY KEY(actor,id));
CREATE TABLE eos_private.bulk_metadata(metric_id uuid NOT NULL,period_id text NOT NULL,source jsonb NOT NULL,review text NOT NULL,suffix text NOT NULL,PRIMARY KEY(metric_id,period_id));
ALTER TABLE eos_private.bulk_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE eos_private.bulk_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE eos_private.bulk_metadata ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON eos_private.bulk_exports,eos_private.bulk_previews,eos_private.bulk_metadata FROM PUBLIC,anon,authenticated;

CREATE FUNCTION eos_private.bulk_baseline(p_metric uuid,p_period text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE o public.eos_scorecard_observations%ROWTYPE; p public.eos_scorecard_periods%ROWTYPE; d jsonb; src jsonb:='{}'; review text:='preserved'; suffix text:=''; comment text; original jsonb; import_id uuid;
BEGIN
 SELECT * INTO p FROM public.eos_scorecard_periods WHERE id=p_period;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reporting date'; END IF;
 SELECT * INTO o FROM public.eos_scorecard_observations WHERE metric_id=p_metric AND period_id=p_period;
 IF o.definition_id IS NOT NULL THEN SELECT data INTO d FROM public.eos_scorecard_definitions WHERE id=o.definition_id;
 ELSE SELECT data INTO d FROM public.eos_scorecard_definitions WHERE metric_id=p_metric AND effective_from<=p.anchor ORDER BY effective_from DESC,revision DESC LIMIT 1; END IF;
 IF d IS NULL THEN RAISE EXCEPTION 'No historical definition for this date'; END IF;
 SELECT source,m.review,m.suffix INTO src,review,suffix FROM eos_private.bulk_metadata m WHERE metric_id=p_metric AND period_id=p_period;
 IF NOT FOUND THEN
  SELECT x.value->'source',i.id INTO original,import_id FROM eos_private.import_sources s JOIN eos_private.imports i ON i.actor=s.actor AND i.id=s.import_id CROSS JOIN LATERAL jsonb_array_elements(i.receipt->'rows') x WHERE s.metric_id=p_metric AND s.period_id=p_period AND x.value->'source'->>'metric_id'=p_metric::text AND x.value->'source'->>'reporting_anchor'=p_period LIMIT 1;
  IF FOUND THEN
   src:=jsonb_build_object('id',original->>'source_id','revision',original->>'source_revision','cell',original->>'source_cell','meeting_date',original->>'source_meeting_date','measurement_start',original->>'measurement_start','as_of',original->>'as_of'); review:=original->>'review_status';
   suffix:=E'\n[Historical import '||import_id||'; '||review||'; source '||(original->>'source_id')||'; revision '||(original->>'source_revision')||'; cell '||(original->>'source_cell')||'; meeting '||(original->>'source_meeting_date')||']';
  ELSE src:='{}';review:='preserved';suffix:=''; END IF;
 END IF;
 IF o.period_id IS NULL AND d->>'window'='point-in-time' THEN
  src:=jsonb_build_object('id','HQ scorecard','revision',d->>'id','cell',p_metric||'/'||p_period,'meeting_date',p.meeting_date::text,'measurement_start',p.meeting_date::text,'as_of',p.meeting_date::text);review:='review-needed';
 END IF;
 comment:=coalesce(o.notes,'');
 IF suffix<>'' AND right(comment,length(suffix))=suffix THEN comment:=left(comment,length(comment)-length(suffix)); ELSE suffix:=''; END IF;
 RETURN jsonb_build_object('metric_id',p_metric,'definition_id',d->>'id','period',to_jsonb(p),'old',CASE WHEN o.period_id IS NULL THEN 'null'::jsonb ELSE eos_private.observation_json(o) END,'suffix',suffix,
  'row',jsonb_build_object('Metric',d->>'name','Date',coalesce(src->>'meeting_date',p.meeting_date::text),'Value',coalesce(o.value_numeric::text,o.value_text,''),'Notes',comment,'Format',d->>'unit','Review',CASE lower(replace(review,' ','-')) WHEN 'review-needed' THEN 'Needs review' WHEN 'needs-review' THEN 'Needs review' WHEN 'reviewed' THEN 'Reviewed' ELSE 'Preserved' END,'Source',src::text,'System reference',''));
END $$;

CREATE FUNCTION public.eos_scorecard_bulk_export_v1(p_cells jsonb,p_export_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE c jsonb; b jsonb; baselines jsonb:='[]'; rows jsonb:='[]'; revision bigint; n integer:=0; prior eos_private.bulk_exports%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_eos() OR nullif(auth.jwt()->>'sub','') IS NULL THEN RAISE EXCEPTION 'Active EOS membership required' USING ERRCODE='42501'; END IF;
 IF p_export_id IS NULL OR jsonb_typeof(p_cells) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Export selection required'; END IF;
 IF jsonb_array_length(p_cells) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Select 1–2000 cells; narrow the reporting period'; END IF;
 SELECT c.revision INTO revision FROM eos_private.clock c WHERE id FOR UPDATE;
 SELECT * INTO prior FROM eos_private.bulk_exports WHERE actor=auth.jwt()->>'sub' AND id=p_export_id;
 IF FOUND THEN RAISE EXCEPTION 'Export already exists; create a fresh export'; END IF;
 FOR c IN SELECT * FROM jsonb_array_elements(p_cells) LOOP
  IF coalesce(c->>'metric_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid metric selection'; END IF;
  b:=eos_private.bulk_baseline((c->>'metric_id')::uuid,c->>'period_id'); n:=n+1;
  b:=jsonb_set(b,'{row,System reference}',to_jsonb(p_export_id::text||':'||n));
  baselines:=baselines||jsonb_build_array(b);rows:=rows||jsonb_build_array(b->'row');
 END LOOP;
 INSERT INTO eos_private.bulk_exports VALUES(auth.jwt()->>'sub',p_export_id,baselines,revision,clock_timestamp()+interval '7 days');
 RETURN jsonb_build_object('rows',rows,'export_id',p_export_id);
END $$;

CREATE FUNCTION eos_private.bulk_validate(p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE r jsonb; b jsonb; old jsonb; src jsonb; d jsonb; p public.eos_scorecard_periods%ROWTYPE; exp eos_private.bulk_exports%ROWTYPE;
 reporting_day date; meeting date; first_date date; last_date date; metric uuid; def text; expected integer; period_revision integer;
 value jsonb; before_value jsonb; notes text; suffix text; review text; kind text; message text; ref text; parts text[]; identity text; seen text[]:=ARRAY[]::text[]; source_seen text[]:=ARRAY[]::text[];
 rows jsonb:='[]'; changes jsonb:='[]'; i integer:=0; n numeric; current_revision bigint; count_matches integer; is_new boolean;
BEGIN
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'CSV rows required'; END IF;
 IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 2000 OR octet_length(p_rows::text)>4000000 THEN RAISE EXCEPTION 'Use 1–2000 rows within 4 MB'; END IF;
 SELECT revision INTO current_revision FROM eos_private.clock WHERE id;
 FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
  i:=i+1;kind:='needs-review';message:='';b:=NULL;old:=NULL;value:=NULL;before_value:=NULL;src:=NULL;suffix:='';notes:='';review:='';first_date:=NULL;last_date:=NULL;
  BEGIN
   IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(r))<>8 OR NOT r ?& ARRAY['Metric','Date','Value','Notes','Format','Review','Source','System reference'] OR EXISTS(SELECT 1 FROM jsonb_each(r) x WHERE jsonb_typeof(x.value)<>'string') THEN RAISE EXCEPTION 'Use the eight original CSV columns'; END IF;
   IF coalesce(r->>'Date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Use a valid YYYY-MM-DD date'; END IF;
   meeting:=(r->>'Date')::date;reporting_day:=meeting-(extract(isodow FROM meeting)::integer-1);ref:=r->>'System reference';
   IF ref<>'' THEN
    IF ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9][0-9]{0,3}$' THEN RAISE EXCEPTION 'System reference changed; export a fresh copy'; END IF;
    parts:=string_to_array(ref,':');
    SELECT * INTO exp FROM eos_private.bulk_exports WHERE actor=auth.jwt()->>'sub' AND id=parts[1]::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Export belongs to another session or user; export your own copy'; END IF;
    IF exp.expires_at<=clock_timestamp() OR exp.snapshot<>current_revision THEN RAISE EXCEPTION 'Scorecard changed since export; export a fresh copy'; END IF;
    b:=exp.baseline->(parts[2]::integer-1);
    IF b IS NULL OR EXISTS(SELECT 1 FROM unnest(ARRAY['Metric','Date','Format','Review','Source','System reference']) k WHERE r->>k IS DISTINCT FROM b->'row'->>k) THEN RAISE EXCEPTION 'Protected row details changed; edit Value and Notes only'; END IF;
    metric:=(b->>'metric_id')::uuid;def:=b->>'definition_id';old:=b->'old';src:=(b->'row'->>'Source')::jsonb;review:=lower(replace(b->'row'->>'Review',' ','-'));IF review='needs-review' THEN review:='review-needed'; END IF;suffix:=b->>'suffix';
    p:=jsonb_populate_record(NULL::public.eos_scorecard_periods,b->'period');reporting_day:=p.anchor;
    IF eos_private.bulk_baseline(metric,p.id) IS DISTINCT FROM ((b-'row')||jsonb_build_object('row',(b->'row')||jsonb_build_object('System reference',''))) THEN RAISE EXCEPTION 'Row changed since export; export a fresh copy'; END IF;
    expected:=coalesce((old->>'revision')::integer,0);period_revision:=p.revision;
    SELECT data INTO d FROM public.eos_scorecard_definitions WHERE id=def;
   ELSE
    IF nullif(btrim(r->>'Metric'),'') IS NULL THEN RAISE EXCEPTION 'Metric name required'; END IF;
    SELECT count(*),min(x.id) INTO count_matches,def FROM public.eos_scorecard_metrics m CROSS JOIN LATERAL(SELECT * FROM public.eos_scorecard_definitions v WHERE v.metric_id=m.id AND v.effective_from<=reporting_day ORDER BY v.effective_from DESC,v.revision DESC LIMIT 1)x WHERE x.data->>'name'=r->>'Metric' AND NOT coalesce((m.data->>'retired')::boolean,false);
    IF count_matches<>1 THEN RAISE EXCEPTION 'Metric name has no unique historical match; review metric setup'; END IF;
    SELECT data,metric_id INTO d,metric FROM public.eos_scorecard_definitions WHERE id=def;
    IF EXISTS(SELECT 1 FROM public.eos_scorecard_observations WHERE metric_id=metric AND period_id=reporting_day::text) THEN RAISE EXCEPTION 'An entry already exists for this metric/week; export it before editing'; END IF;
    src:=(r->>'Source')::jsonb;review:=lower(replace(r->>'Review',' ','-'));IF review='needs-review' THEN review:='review-needed'; END IF;expected:=0;
    SELECT * INTO p FROM public.eos_scorecard_periods WHERE id=reporting_day::text;period_revision:=coalesce(p.revision,0);
   END IF;
   identity:=metric||'/'||reporting_day;
   IF identity=ANY(seen) THEN RAISE EXCEPTION 'Duplicate metric/week rows; keep one reviewed row'; END IF;seen:=array_append(seen,identity);
   IF d->>'unit' IS DISTINCT FROM r->>'Format' THEN RAISE EXCEPTION 'Format differs from the historical metric definition'; END IF;
   before_value:=coalesce(old->'value','null'::jsonb);value:=before_value;
   IF r->>'Value'<>'' THEN
    IF d->>'unit'='text' THEN value:=to_jsonb(r->>'Value');
    ELSE
     ref:=r->>'Value';IF d->>'unit'='percent' THEN ref:=regexp_replace(ref,'%$',''); END IF;
     IF ref !~ '^-?([0-9]+([.][0-9]*)?|[.][0-9]+)$' THEN RAISE EXCEPTION 'Enter an unformatted number; percentage values use 0–100'; END IF;n:=ref::numeric;
     IF d->>'unit'='count' AND n<>trunc(n) OR d->>'unit'='percent' AND (n<0 OR n>100) THEN RAISE EXCEPTION 'Count or percentage value is out of range'; END IF;value:=to_jsonb(n);
    END IF;
   END IF;
   notes:=coalesce(nullif(r->>'Notes',''),b->'row'->>'Notes','');
   is_new:=old IS NULL OR old='null'::jsonb;
   IF value IS NOT DISTINCT FROM before_value AND notes=coalesce(b->'row'->>'Notes','') THEN kind:='unchanged';message:='No change';
   ELSE
    IF is_new THEN
     IF jsonb_typeof(src) IS DISTINCT FROM 'object' OR NOT src ?& ARRAY['id','revision','cell'] OR EXISTS(SELECT 1 FROM jsonb_each(src) x WHERE jsonb_typeof(x.value)<>'string' OR x.key NOT IN ('id','revision','cell','url','meeting_date','measurement_start','as_of')) THEN RAISE EXCEPTION 'Source provenance is missing or malformed; review the prepared row'; END IF;
     -- A configured snapshot establishes its date interval. Weekly rates with
     -- uncertain starts still require explicit source measurement dates.
     IF d->>'window'='point-in-time' THEN src:=jsonb_build_object('meeting_date',meeting::text,'measurement_start',meeting::text,'as_of',meeting::text)||src; END IF;
     IF EXISTS(SELECT 1 FROM unnest(ARRAY['id','revision','cell']) k WHERE nullif(btrim(src->>k),'') IS NULL) OR review NOT IN ('review-needed','reviewed') THEN RAISE EXCEPTION 'Source identity and review status required'; END IF;
     IF EXISTS(SELECT 1 FROM unnest(ARRAY['meeting_date','measurement_start','as_of']) k WHERE coalesce(src->>k,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN RAISE EXCEPTION 'Source measurement dates required'; END IF;
     first_date:=(src->>'measurement_start')::date;last_date:=(src->>'as_of')::date;
     IF (src->>'meeting_date')::date<>meeting OR first_date>last_date THEN RAISE EXCEPTION 'Source dates do not match this row'; END IF;
     IF EXISTS(SELECT 1 FROM eos_private.import_sources s WHERE s.source_id=src->>'id' AND s.source_revision=src->>'revision' AND s.source_cell=src->>'cell') THEN RAISE EXCEPTION 'This source cell was already imported; review the existing entry'; END IF;
     identity:=jsonb_build_array(src->>'id',src->>'revision',src->>'cell')::text;
     IF identity=ANY(source_seen) THEN RAISE EXCEPTION 'Duplicate source cell in this file'; END IF;source_seen:=array_append(source_seen,identity);
     kind:='new';message:='New entry';
    ELSE first_date:=(old->>'measurement_start')::date;last_date:=(old->>'as_of')::date;kind:='changed';message:='Update existing entry'; END IF;
    changes:=changes||jsonb_build_array(jsonb_build_object('metric_id',metric,'definition_id',def,'period_id',reporting_day,'period_revision',period_revision,'expected_revision',expected,'value',value,'notes',notes,'suffix',suffix,'source',src,'review',review,'meeting_date',meeting,'measurement_start',first_date,'as_of',last_date,'new',is_new));
   END IF;
  EXCEPTION WHEN OTHERS THEN kind:='needs-review';message:=SQLERRM;END;
  -- Human review uses exact decimal text, avoiding JavaScript float rounding.
  rows:=rows||jsonb_build_array(jsonb_build_object('row',i,'kind',kind,'message',message,'metric',r->>'Metric','date',r->>'Date','format',r->>'Format','source_review',r->>'Review','measurement_start',first_date,'as_of',last_date,'before_value',before_value#>>'{}','after_value',value#>>'{}','before_notes',coalesce(b->'row'->>'Notes',''),'after_notes',notes));
 END LOOP;
 RETURN jsonb_build_object('rows',rows,'changes',changes,'new',(SELECT count(*) FROM jsonb_array_elements(rows)x WHERE x->>'kind'='new'),'changed',(SELECT count(*) FROM jsonb_array_elements(rows)x WHERE x->>'kind'='changed'),'unchanged',(SELECT count(*) FROM jsonb_array_elements(rows)x WHERE x->>'kind'='unchanged'),'needs_review',(SELECT count(*) FROM jsonb_array_elements(rows)x WHERE x->>'kind'='needs-review'));
END $$;

CREATE FUNCTION public.eos_scorecard_bulk_preview_v1(p_rows jsonb,p_import_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE item eos_private.bulk_previews%ROWTYPE; result jsonb; revision bigint;
BEGIN
 IF NOT public.current_user_can_manage_eos() OR nullif(auth.jwt()->>'sub','') IS NULL THEN RAISE EXCEPTION 'Active EOS membership required' USING ERRCODE='42501'; END IF;
 IF p_import_id IS NULL THEN RAISE EXCEPTION 'Retry identity required'; END IF;
 SELECT c.revision INTO revision FROM eos_private.clock c WHERE id FOR UPDATE;
 SELECT * INTO item FROM eos_private.bulk_previews WHERE actor=auth.jwt()->>'sub' AND id=p_import_id;
 IF FOUND THEN IF item.payload IS DISTINCT FROM p_rows THEN RAISE EXCEPTION 'Retry identity reused'; END IF;RETURN coalesce(item.receipt,item.preview)-'changes';END IF;
 result:=eos_private.bulk_validate(p_rows)||jsonb_build_object('import_id',p_import_id,'status','preview','saved',0);
 INSERT INTO eos_private.bulk_previews VALUES(auth.jwt()->>'sub',p_import_id,p_rows,revision,clock_timestamp()+interval '30 minutes',result,NULL);
 RETURN result-'changes';
END $$;
CREATE FUNCTION public.eos_scorecard_bulk_receipt_v1(p_import_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.current_user_can_manage_eos() THEN RAISE EXCEPTION 'Active EOS membership required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(receipt,preview)-'changes' INTO result FROM eos_private.bulk_previews WHERE actor=auth.jwt()->>'sub' AND id=p_import_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'No saved review for this user'; END IF;RETURN result;
END $$;
CREATE FUNCTION public.eos_scorecard_bulk_apply_v1(p_import_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE item eos_private.bulk_previews%ROWTYPE; revision bigint; verified jsonb; c jsonb; draft jsonb; changes jsonb:='[]'; saved jsonb:='[]'; result jsonb; suffix text; p public.eos_scorecard_periods%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_eos() OR nullif(auth.jwt()->>'sub','') IS NULL THEN RAISE EXCEPTION 'Active EOS membership required' USING ERRCODE='42501'; END IF;
 SELECT x.revision INTO revision FROM eos_private.clock x WHERE id FOR UPDATE;
 SELECT * INTO item FROM eos_private.bulk_previews WHERE actor=auth.jwt()->>'sub' AND id=p_import_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Upload and review the edited CSV first'; END IF;
 IF item.receipt IS NOT NULL THEN RETURN item.receipt; END IF;
 IF item.snapshot<>revision OR item.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Scorecard changed; export and review a fresh copy' USING ERRCODE='PT409'; END IF;
 verified:=eos_private.bulk_validate(item.payload);
 IF verified->'rows' IS DISTINCT FROM item.preview->'rows' THEN RAISE EXCEPTION 'Preview changed; review a fresh copy' USING ERRCODE='PT409'; END IF;
 IF (verified->>'needs_review')::integer>0 THEN RAISE EXCEPTION 'Resolve every Needs review row before saving'; END IF;
 FOR c IN SELECT * FROM jsonb_array_elements(verified->'changes') LOOP
  SELECT * INTO p FROM public.eos_scorecard_periods WHERE id=c->>'period_id';
  IF NOT FOUND THEN
   PERFORM public.eos_scorecard_save_period_v1(jsonb_build_object('id',c->>'period_id','anchor',c->>'period_id','meeting_date',c->>'meeting_date','expected_revision',0),gen_random_uuid());
   SELECT * INTO p FROM public.eos_scorecard_periods WHERE id=c->>'period_id';
  END IF;
  suffix:=coalesce(c->>'suffix','');
  IF (c->>'new')::boolean THEN
   suffix:=E'\n[Bulk import '||p_import_id||'; '||(c->>'review')||'; source '||(c->'source'->>'id')||'; revision '||(c->'source'->>'revision')||'; cell '||(c->'source'->>'cell')||'; meeting '||(c->'source'->>'meeting_date')||']';
   INSERT INTO eos_private.import_sources VALUES(c->'source'->>'id',c->'source'->>'revision',c->'source'->>'cell',auth.jwt()->>'sub',p_import_id,(c->>'metric_id')::uuid,c->>'period_id');
  END IF;
  INSERT INTO eos_private.bulk_metadata VALUES((c->>'metric_id')::uuid,c->>'period_id',c->'source',c->>'review',suffix) ON CONFLICT(metric_id,period_id) DO UPDATE SET source=excluded.source,review=excluded.review,suffix=excluded.suffix;
  draft:=(c-'suffix'-'source'-'review'-'meeting_date'-'new')||jsonb_build_object('notes',(c->>'notes')||suffix,'period_revision',p.revision);
  changes:=changes||jsonb_build_array(draft);
 END LOOP;
 IF jsonb_array_length(changes)>0 THEN saved:=public.eos_scorecard_save_observations_v1(changes,gen_random_uuid()); END IF;
 result:=(item.preview-'changes')||jsonb_build_object('status','saved','saved',jsonb_array_length(saved),'records',saved,'actor',auth.jwt()->>'sub','saved_at',clock_timestamp());
 IF jsonb_array_length(saved)>0 THEN PERFORM eos_private.audit('bulk_edit',p_import_id::text,NULL,result); END IF;
 UPDATE eos_private.bulk_previews SET receipt=result WHERE actor=auth.jwt()->>'sub' AND id=p_import_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION eos_private.bulk_baseline(uuid,text),eos_private.bulk_validate(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.eos_scorecard_bulk_export_v1(jsonb,uuid),public.eos_scorecard_bulk_preview_v1(jsonb,uuid),public.eos_scorecard_bulk_receipt_v1(uuid),public.eos_scorecard_bulk_apply_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eos_scorecard_bulk_export_v1(jsonb,uuid),public.eos_scorecard_bulk_preview_v1(jsonb,uuid),public.eos_scorecard_bulk_receipt_v1(uuid),public.eos_scorecard_bulk_apply_v1(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
