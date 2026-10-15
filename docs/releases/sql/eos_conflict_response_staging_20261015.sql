-- Staging-only correction: preserve each function body, privileges and guards.
-- Fail closed if any reviewed definition has drifted; no data or grant changes.
BEGIN;
DO $patch$
DECLARE target record; original text; changed integer := 0;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('eos_scorecard_save_category_v1(jsonb,uuid)', '8a5925f3258c265422afaa46bd786fff'),
    ('eos_scorecard_save_period_v1(jsonb,uuid)', '3d0f8f5d474441ae4236584a09d197f8'),
    ('eos_scorecard_save_metric_v1(jsonb,uuid)', 'f0d6c69f769c8c1defe9bb4663c6acb8'),
    ('eos_scorecard_save_observations_v1(jsonb,uuid)', 'b408ee890f285942e97f221b2cfb29dd'),
    ('eos_scorecard_history_v1(text,bigint)', '257b5b8afd8ec58b5c50ecfd83e21c2f'),
    ('eos_save_pursuit_v1(uuid,jsonb,text[],timestamp with time zone,uuid)', '488cf8834208ec28a996f68099cb3396')
  ) AS expected(signature, fingerprint) LOOP
    SELECT pg_get_functiondef(to_regprocedure('public.' || target.signature)) INTO original;
    IF original IS NULL OR md5(original) <> target.fingerprint THEN
      RAISE EXCEPTION 'EOS conflict patch baseline changed: %', target.signature;
    END IF;
    EXECUTE replace(original, 'ERRCODE=''40001''', 'ERRCODE=''PT409''');
    changed := changed + 1;
  END LOOP;
  IF changed <> 6 THEN RAISE EXCEPTION 'Unexpected EOS patch scope'; END IF;
END $patch$;
NOTIFY pgrst, 'reload schema';
COMMIT;
