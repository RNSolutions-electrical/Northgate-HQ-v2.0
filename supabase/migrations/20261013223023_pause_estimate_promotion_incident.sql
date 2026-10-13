-- Production containment receipt: 20261013223023. Function-only; no record writes.
DO $incident$
DECLARE definition text:=pg_get_functiondef('public.apply_v5_estimate_promotion(uuid,integer,text,text)'::regprocedure);
BEGIN
 IF md5(definition)<>'742dcfe5660cc13392dbb870bb319d56' THEN RAISE EXCEPTION 'Promotion function drifted; stop and reconcile before containment'; END IF;
 IF position(E'\nBEGIN\n' IN definition)=0 THEN RAISE EXCEPTION 'Promotion BEGIN anchor missing'; END IF;
 EXECUTE replace(definition,E'\nBEGIN\n',E'\nBEGIN\n  RAISE SQLSTATE ''PT503'' USING MESSAGE=''Estimate promotion is temporarily paused for incident containment. Retry only after the incident is cleared.'';\n');
END $incident$;
NOTIFY pgrst,'reload schema';

