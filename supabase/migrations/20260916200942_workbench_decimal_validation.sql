-- Match the existing approval decimal grammar without changing pricing or snapshots.
-- Intentionally entered zero is valid; blank, negative and malformed inputs are not.
CREATE OR REPLACE FUNCTION public.workbench_handoff_number(v text, label text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $function$
DECLARE n numeric;
BEGIN
 IF v IS NULL OR btrim(v)='' OR v !~ '^([0-9]+([.][0-9]*)?|[.][0-9]+)$' THEN
  RAISE EXCEPTION 'Enter a valid non-negative % before submitting for review',label USING ERRCODE='22023';
 END IF;
 n:=v::numeric;
 IF n>1000000000 THEN RAISE EXCEPTION '% is outside the supported range',label USING ERRCODE='22023'; END IF;
 RETURN n;
END $function$;

-- Internal helper only; preserve the existing caller boundary.
REVOKE ALL ON FUNCTION public.workbench_handoff_number(text,text) FROM PUBLIC, anon, authenticated;
