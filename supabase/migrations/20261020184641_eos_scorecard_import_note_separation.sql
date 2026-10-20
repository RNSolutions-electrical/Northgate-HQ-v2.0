-- Staging only. No observation changes occur merely by applying this migration.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.eos_scorecard_bulk_apply_v1(uuid)'::regprocedure))<>'94c7a346eb100ecddf4e65f705fb2ab1'
 OR md5(pg_get_functiondef('public.eos_scorecard_import_apply_v1(uuid)'::regprocedure))<>'80d038632c9890fdda1e86f2fa59fb7c'
 OR md5(pg_get_functiondef('public.eos_scorecard_save_observations_v1(jsonb,uuid)'::regprocedure))<>'dc219b9a6458aa8d71a25283c10f3a40' THEN RAISE EXCEPTION 'Import contract drift; stop and review'; END IF;
END $$;
CREATE TABLE eos_private.note_cleanup_previews(actor text NOT NULL,id uuid NOT NULL,rows jsonb NOT NULL,expires_at timestamptz NOT NULL,receipt jsonb,PRIMARY KEY(actor,id));
CREATE TABLE eos_private.note_cleanup_records(actor text NOT NULL,cleanup_id uuid NOT NULL,metric_id uuid NOT NULL,period_id text NOT NULL,before_data jsonb NOT NULL,after_data jsonb NOT NULL,metadata_before jsonb,metadata_after jsonb NOT NULL,proof jsonb NOT NULL,PRIMARY KEY(actor,cleanup_id,metric_id,period_id));
ALTER TABLE eos_private.note_cleanup_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE eos_private.note_cleanup_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON eos_private.note_cleanup_previews,eos_private.note_cleanup_records FROM PUBLIC,anon,authenticated;

CREATE FUNCTION eos_private.note_cleanup_candidate(p_metric uuid,p_period text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE o public.eos_scorecard_observations%ROWTYPE; s eos_private.import_sources%ROWTYPE;
 b jsonb; src jsonb; original jsonb; evidence bigint; import_entity text; generated text; review text; prefix text; tail text; matches integer; source_count integer;
BEGIN
 SELECT * INTO o FROM public.eos_scorecard_observations WHERE metric_id=p_metric AND period_id=p_period;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','skipped','reason','Observation missing'); END IF;
 SELECT count(*) INTO source_count FROM eos_private.import_sources WHERE metric_id=p_metric AND period_id=p_period;
 IF source_count<>1 THEN RETURN jsonb_build_object('status','skipped','reason','Import provenance is missing or ambiguous'); END IF;
 SELECT * INTO s FROM eos_private.import_sources WHERE metric_id=p_metric AND period_id=p_period;
 b:=eos_private.bulk_baseline(p_metric,p_period);src:=(b->'row'->>'Source')::jsonb;
 IF src->>'id' IS DISTINCT FROM s.source_id OR src->>'revision' IS DISTINCT FROM s.source_revision OR src->>'cell' IS DISTINCT FROM s.source_cell THEN RETURN jsonb_build_object('status','skipped','reason','Source provenance differs from ledger'); END IF;
 SELECT a.id,a.entity,rec INTO evidence,import_entity,original FROM public.eos_scorecard_audit a
 CROSS JOIN LATERAL jsonb_array_elements(a.after_data->'records') rec
 WHERE a.entity IN ('bulk_edit','historical_import') AND a.entity_id=s.import_id::text
 AND coalesce(a.after_data->>'note_provenance','')<>'separate'
 AND rec->>'metric_id'=p_metric::text AND rec->>'period_id'=p_period ORDER BY a.id LIMIT 1;
 IF original IS NULL THEN RETURN jsonb_build_object('status','skipped','reason','No generated footer proved by original import audit'); END IF;
 prefix:=CASE WHEN import_entity='bulk_edit' THEN E'\n[Bulk import ' ELSE E'\n[Historical import ' END||s.import_id::text||'; ';
 tail:='; source '||s.source_id||'; revision '||s.source_revision||'; cell '||s.source_cell||'; meeting '||(src->>'meeting_date')||']';
 generated:=NULL;
 FOREACH review IN ARRAY ARRAY['review-needed','reviewed'] LOOP
  IF right(original->>'notes',length(prefix||review||tail))=prefix||review||tail THEN generated:=prefix||review||tail; END IF;
 END LOOP;
 IF generated IS NULL THEN RETURN jsonb_build_object('status','skipped','reason','Original generated footer could not be proved exactly'); END IF;
 matches:=(length(o.notes)-length(replace(o.notes,generated,'')))/length(generated);
 IF matches<>1 THEN RETURN jsonb_build_object('status','skipped','reason',CASE WHEN matches=0 THEN 'Generated footer already absent' ELSE 'Repeated footer is ambiguous' END); END IF;
 RETURN jsonb_build_object('status','ready','metric_id',p_metric,'period_id',p_period,'revision',o.revision,
  'before',to_jsonb(o),'after_notes',replace(o.notes,generated,''),'generated',generated,'source',src,
  'review',coalesce((SELECT m.review FROM eos_private.bulk_metadata m WHERE m.metric_id=p_metric AND m.period_id=p_period),CASE WHEN lower(replace(b->'row'->>'Review',' ','-'))='needs-review' THEN 'review-needed' ELSE lower(b->'row'->>'Review') END),
  'period_revision',(b->'period'->>'revision')::integer,'proof',jsonb_build_object('audit_id',evidence,'import_id',s.import_id));
END $$;

CREATE FUNCTION public.eos_scorecard_import_notes_preview_v1(p_cleanup_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE row record; item jsonb; rows jsonb:='[]'; prior eos_private.note_cleanup_previews%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_eos() THEN RAISE EXCEPTION 'EOS membership required' USING ERRCODE='42501'; END IF;
 IF p_cleanup_id IS NULL THEN RAISE EXCEPTION 'Cleanup review identity required'; END IF;
 PERFORM 1 FROM eos_private.clock WHERE id FOR UPDATE;
 SELECT * INTO prior FROM eos_private.note_cleanup_previews WHERE actor=auth.jwt()->>'sub' AND id=p_cleanup_id;
 IF FOUND THEN RETURN coalesce(prior.receipt,jsonb_build_object('id',p_cleanup_id,'status','preview','rows',prior.rows)); END IF;
 FOR row IN SELECT DISTINCT metric_id,period_id FROM eos_private.import_sources LOOP
  item:=eos_private.note_cleanup_candidate(row.metric_id,row.period_id)||jsonb_build_object('metric_id',row.metric_id,'period_id',row.period_id);
  rows:=rows||jsonb_build_array(item);
 END LOOP;
 INSERT INTO eos_private.note_cleanup_previews VALUES(auth.jwt()->>'sub',p_cleanup_id,rows,clock_timestamp()+interval '30 minutes',NULL);
 RETURN jsonb_build_object('id',p_cleanup_id,'status','preview','rows',rows);
END $$;

CREATE FUNCTION public.eos_scorecard_import_notes_receipt_v1(p_cleanup_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE item eos_private.note_cleanup_previews%ROWTYPE;
BEGIN
 IF NOT public.current_user_can_manage_eos() THEN RAISE EXCEPTION 'EOS membership required' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM eos_private.note_cleanup_previews WHERE actor=auth.jwt()->>'sub' AND id=p_cleanup_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'No cleanup review for this actor'; END IF;
 RETURN coalesce(item.receipt,jsonb_build_object('id',p_cleanup_id,'status','preview','rows',item.rows));
END $$;

CREATE FUNCTION public.eos_scorecard_import_notes_apply_v1(p_cleanup_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE plan eos_private.note_cleanup_previews%ROWTYPE; r jsonb; current jsonb; result_rows jsonb:='[]'; drafts jsonb:='[]'; saved jsonb; after_row jsonb; meta_before jsonb; meta_after jsonb; n integer:=0; held integer:=0;
BEGIN
 IF NOT public.current_user_can_manage_eos() THEN RAISE EXCEPTION 'EOS membership required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM eos_private.clock WHERE id FOR UPDATE;
 SELECT * INTO plan FROM eos_private.note_cleanup_previews WHERE actor=auth.jwt()->>'sub' AND id=p_cleanup_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Preview cleanup first'; END IF;
 IF plan.receipt IS NOT NULL THEN RETURN plan.receipt; END IF;
 IF plan.expires_at<clock_timestamp() THEN RAISE EXCEPTION 'Cleanup review expired; create a fresh review' USING ERRCODE='PT409'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(plan.rows) LOOP
  current:=eos_private.note_cleanup_candidate((r->>'metric_id')::uuid,r->>'period_id')||jsonb_build_object('metric_id',r->>'metric_id','period_id',r->>'period_id');
  IF r->>'status'<>'ready' OR current IS DISTINCT FROM r THEN
   held:=held+1;result_rows:=result_rows||jsonb_build_array(jsonb_build_object('metric_id',r->>'metric_id','period_id',r->>'period_id','status','skipped','reason',CASE WHEN current IS DISTINCT FROM r THEN 'Changed since preview or no longer eligible' ELSE r->>'reason' END));CONTINUE;
  END IF;
  drafts:=drafts||jsonb_build_array(jsonb_build_object('metric_id',r->>'metric_id','period_id',r->>'period_id','definition_id',r->'before'->>'definition_id','expected_revision',(r->>'revision')::integer,'period_revision',r->'period_revision','value',coalesce(nullif(r->'before'->'value_numeric','null'::jsonb),nullif(r->'before'->'value_text','null'::jsonb),'null'::jsonb),'notes',r->>'after_notes','measurement_start',r->'before'->>'measurement_start','as_of',r->'before'->>'as_of'));
  result_rows:=result_rows||jsonb_build_array(r||jsonb_build_object('status','cleaned'));n:=n+1;
 END LOOP;
 IF n>0 THEN
  saved:=public.eos_scorecard_save_observations_v1(drafts,gen_random_uuid());
  FOR r IN SELECT value FROM jsonb_array_elements(result_rows) WHERE value->>'status'='cleaned' LOOP
   SELECT to_jsonb(m) INTO meta_before FROM eos_private.bulk_metadata m WHERE m.metric_id=(r->>'metric_id')::uuid AND m.period_id=r->>'period_id';
   INSERT INTO eos_private.bulk_metadata VALUES((r->>'metric_id')::uuid,r->>'period_id',r->'source',r->>'review','') ON CONFLICT(metric_id,period_id) DO UPDATE SET suffix='';
   SELECT to_jsonb(m) INTO meta_after FROM eos_private.bulk_metadata m WHERE m.metric_id=(r->>'metric_id')::uuid AND m.period_id=r->>'period_id';
   SELECT to_jsonb(o) INTO after_row FROM public.eos_scorecard_observations o WHERE o.metric_id=(r->>'metric_id')::uuid AND o.period_id=r->>'period_id';
   INSERT INTO eos_private.note_cleanup_records VALUES(auth.jwt()->>'sub',p_cleanup_id,(r->>'metric_id')::uuid,r->>'period_id',r->'before',after_row,meta_before,meta_after,(r->'proof')||jsonb_build_object('generated',r->>'generated'));
  END LOOP;
 END IF;
 plan.receipt:=jsonb_build_object('id',p_cleanup_id,'status','saved','cleaned',n,'skipped',held,'rows',result_rows,'saved_at',clock_timestamp());
 PERFORM eos_private.audit('import_note_cleanup',p_cleanup_id::text,NULL,plan.receipt);
 UPDATE eos_private.note_cleanup_previews SET receipt=plan.receipt WHERE actor=auth.jwt()->>'sub' AND id=p_cleanup_id;
 RETURN plan.receipt;
END $$;

CREATE FUNCTION public.eos_scorecard_import_notes_restore_v1(p_cleanup_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE body jsonb:=jsonb_build_array('note_cleanup_restore',p_cleanup_id); result jsonb; r eos_private.note_cleanup_records%ROWTYPE; o public.eos_scorecard_observations%ROWTYPE; drafts jsonb:='[]'; restored integer:=0; skipped integer:=0; period_revision integer;
BEGIN
 result:=eos_private.begin_write(p_request_id,body);IF result IS NOT NULL THEN RETURN result; END IF;
 IF NOT EXISTS(SELECT 1 FROM eos_private.note_cleanup_previews WHERE actor=auth.jwt()->>'sub' AND id=p_cleanup_id AND receipt IS NOT NULL) THEN RAISE EXCEPTION 'Completed cleanup not found for this actor'; END IF;
 FOR r IN SELECT * FROM eos_private.note_cleanup_records WHERE actor=auth.jwt()->>'sub' AND cleanup_id=p_cleanup_id LOOP
  SELECT * INTO o FROM public.eos_scorecard_observations WHERE metric_id=r.metric_id AND period_id=r.period_id;
  IF to_jsonb(o) IS DISTINCT FROM r.after_data OR (SELECT to_jsonb(m) FROM eos_private.bulk_metadata m WHERE m.metric_id=r.metric_id AND m.period_id=r.period_id) IS DISTINCT FROM r.metadata_after THEN skipped:=skipped+1;CONTINUE; END IF;
  SELECT revision INTO period_revision FROM public.eos_scorecard_periods WHERE id=r.period_id;
  drafts:=drafts||jsonb_build_array(jsonb_build_object('metric_id',r.metric_id,'period_id',r.period_id,'definition_id',o.definition_id,'expected_revision',o.revision,'period_revision',period_revision,'value',coalesce(to_jsonb(o.value_numeric),to_jsonb(o.value_text)),'notes',r.before_data->>'notes','measurement_start',o.measurement_start,'as_of',o.as_of));restored:=restored+1;
  UPDATE eos_private.bulk_metadata SET suffix=coalesce(r.metadata_before->>'suffix',r.proof->>'generated','') WHERE metric_id=r.metric_id AND period_id=r.period_id;
 END LOOP;
 IF restored>0 THEN PERFORM public.eos_scorecard_save_observations_v1(drafts,gen_random_uuid()); END IF;
 result:=jsonb_build_object('cleanup_id',p_cleanup_id,'restored',restored,'skipped',skipped);
 PERFORM eos_private.audit('import_note_restore',p_request_id::text,NULL,result);
 RETURN eos_private.finish_write(p_request_id,body,result);
END $$;
REVOKE ALL ON FUNCTION eos_private.note_cleanup_candidate(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.eos_scorecard_import_notes_preview_v1(uuid),public.eos_scorecard_import_notes_receipt_v1(uuid),public.eos_scorecard_import_notes_apply_v1(uuid),public.eos_scorecard_import_notes_restore_v1(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.eos_scorecard_import_notes_preview_v1(uuid),public.eos_scorecard_import_notes_receipt_v1(uuid),public.eos_scorecard_import_notes_apply_v1(uuid),public.eos_scorecard_import_notes_restore_v1(uuid,uuid) TO authenticated;
-- Future import function replacements are appended below; their original guards remain intact.

CREATE OR REPLACE FUNCTION public.eos_scorecard_bulk_apply_v1(p_import_id uuid) RETURNS jsonb
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
  suffix:='';
  IF (c->>'new')::boolean THEN
   INSERT INTO eos_private.import_sources VALUES(c->'source'->>'id',c->'source'->>'revision',c->'source'->>'cell',auth.jwt()->>'sub',p_import_id,(c->>'metric_id')::uuid,c->>'period_id');
  END IF;
  INSERT INTO eos_private.bulk_metadata VALUES((c->>'metric_id')::uuid,c->>'period_id',c->'source',c->>'review',suffix) ON CONFLICT(metric_id,period_id) DO UPDATE SET source=excluded.source,review=excluded.review,suffix=excluded.suffix;
  draft:=(c-'suffix'-'source'-'review'-'meeting_date'-'new')||jsonb_build_object('notes',(c->>'notes')||suffix,'period_revision',p.revision);
  changes:=changes||jsonb_build_array(draft);
 END LOOP;
 IF jsonb_array_length(changes)>0 THEN saved:=public.eos_scorecard_save_observations_v1(changes,gen_random_uuid()); END IF;
 result:=(item.preview-'changes')||jsonb_build_object('status','saved','saved',jsonb_array_length(saved),'records',saved,'actor',auth.jwt()->>'sub','saved_at',clock_timestamp(),'note_provenance','separate');
 IF jsonb_array_length(saved)>0 THEN PERFORM eos_private.audit('bulk_edit',p_import_id::text,NULL,result); END IF;
 UPDATE eos_private.bulk_previews SET receipt=result WHERE actor=auth.jwt()->>'sub' AND id=p_import_id;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.eos_scorecard_import_apply_v1(p_import_id uuid) RETURNS jsonb
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
  notes:=coalesce(r->>'comments','');
  changes:=changes||jsonb_build_array(jsonb_build_object('metric_id',r->>'metric_id','period_id',p.id,'definition_id',r->>'definition_id','expected_revision',0,'period_revision',p.revision,'value',row->'value','notes',notes,'measurement_start',r->>'measurement_start','as_of',r->>'as_of'));
 END LOOP;
 saved:=public.eos_scorecard_save_observations_v1(changes,gen_random_uuid());
 FOR row IN SELECT * FROM jsonb_array_elements(result->'rows') WHERE value->>'status'='ready' LOOP
  r:=row->'source';
  INSERT INTO eos_private.import_sources VALUES(r->>'source_id',r->>'source_revision',r->>'source_cell',auth.jwt()->>'sub',p_import_id,(r->>'metric_id')::uuid,r->>'reporting_anchor');
  INSERT INTO eos_private.bulk_metadata VALUES((r->>'metric_id')::uuid,r->>'reporting_anchor',jsonb_build_object('id',r->>'source_id','revision',r->>'source_revision','cell',r->>'source_cell','meeting_date',r->>'source_meeting_date','measurement_start',r->>'measurement_start','as_of',r->>'as_of'),r->>'review_status','');
 END LOOP;
 result:=item.preview||jsonb_build_object('status','applied','success',jsonb_array_length(saved),'ready',0,'records',saved,'applied_at',clock_timestamp(),'actor',auth.jwt()->>'sub','note_provenance','separate');
 PERFORM eos_private.audit('historical_import',p_import_id::text,NULL,result);
 UPDATE eos_private.imports SET receipt=result WHERE actor=auth.jwt()->>'sub' AND id=p_import_id;
 RETURN result;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
