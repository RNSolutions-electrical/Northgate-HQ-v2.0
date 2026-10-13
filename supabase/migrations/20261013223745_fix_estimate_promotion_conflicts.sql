-- Production repair receipt: 20261013223745. Applies only after verified quiescence.
DO $incident$
DECLARE definition text:=pg_get_functiondef('public.apply_v5_estimate_promotion(uuid,integer,text,text)'::regprocedure);
 pause_line text:=E'  RAISE SQLSTATE ''PT503'' USING MESSAGE=''Estimate promotion is temporarily paused for incident containment. Retry only after the incident is cleared.'';\n';
 source_anchor text:='OR destination.proposed_payload IS DISTINCT FROM working_copy.payload THEN';
BEGIN
 IF md5(definition)<>'92ced3145472e7e6f4cecc5d549b3895' THEN RAISE EXCEPTION 'Promotion containment definition drifted; stop before resuming'; END IF;
 IF position(pause_line IN definition)=0 OR position(source_anchor IN definition)=0 THEN RAISE EXCEPTION 'Promotion repair anchors missing'; END IF;
 definition:=replace(definition,pause_line,'');
 definition:=replace(definition,source_anchor,'OR destination.proposed_payload IS DISTINCT FROM (working_copy.payload-''reviewProposals'') THEN');
 definition:=replace(definition,'''40001''','''PT409''');
 EXECUTE definition;
END $incident$;
NOTIFY pgrst,'reload schema';

