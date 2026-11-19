-- Staging-only additive calculator update. No documents or snapshots rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF public.blank_slate_accounting_version()<>2
 OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='public.blank_slate_pricing(jsonb)'::regprocedure)<>'90f9c522193a55a3bd42a908bf150287'
 OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='public.blank_slate_discount(numeric,jsonb)'::regprocedure)<>'6c94512feac8bd4f7ea449da24b9023d'
 THEN RAISE EXCEPTION 'Expected reviewed blank-slate v2 definitions; stop and review drift';END IF;
END $$;
CREATE FUNCTION public.blank_slate_resource_adjustment(base numeric,adjustment jsonb,legacy jsonb) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v numeric;result numeric;BEGIN
 IF adjustment IS NULL OR adjustment='null'::jsonb THEN RETURN public.blank_slate_discount(base,legacy);END IF;
 IF legacy IS NOT NULL AND legacy<>'null'::jsonb THEN RAISE EXCEPTION 'Conflicting legacy discount and price adjustment' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(adjustment)<>'object' OR coalesce(adjustment->>'direction','') NOT IN ('discount','addition') OR coalesce(adjustment->>'type','') NOT IN ('percent','amount') THEN RAISE EXCEPTION 'Invalid resource price adjustment' USING ERRCODE='22023';END IF;
 IF adjustment->>'direction'='discount' THEN RETURN public.blank_slate_discount(base,adjustment);END IF;
 v:=public.blank_slate_number(adjustment->>'value','Addition');
 result:=round(CASE WHEN adjustment->>'type'='percent' THEN base*v/100 ELSE v END,2);
 RETURN -result;
END $$;
REVOKE ALL ON FUNCTION public.blank_slate_resource_adjustment(numeric,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.blank_slate_resource_adjustment(numeric,jsonb,jsonb) TO authenticated;
DO $patch$ DECLARE definition text;anchor text;BEGIN
 definition:=pg_get_functiondef('public.blank_slate_pricing(jsonb)'::regprocedure);
 anchor:='md:=public.blank_slate_discount(gross_material,l->''materialDiscount'');ld:=public.blank_slate_discount(gross_labor,l->''laborDiscount'');';
 IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'Resource adjustment anchor absent';END IF;
 definition:=replace(definition,anchor,'md:=public.blank_slate_resource_adjustment(gross_material,l->''materialAdjustment'',l->''materialDiscount'');ld:=public.blank_slate_resource_adjustment(gross_labor,l->''laborAdjustment'',l->''laborDiscount'');');
 definition:=replace(definition,'all_resource_discount numeric:=0;','all_resource_discount numeric:=0;resource_addition numeric;all_resource_addition numeric:=0;');
 definition:=replace(definition,'resource_discount:=0;resource_keys','resource_discount:=0;resource_addition:=0;resource_keys');
 definition:=replace(definition,'resource_discount:=resource_discount+md+ld;','resource_discount:=resource_discount+greatest(md,0)+greatest(ld,0);resource_addition:=resource_addition-least(md,0)-least(ld,0);');
 definition:=replace(definition,'all_resource_discount:=all_resource_discount+resource_discount;','all_resource_discount:=all_resource_discount+resource_discount;all_resource_addition:=all_resource_addition+resource_addition;');
 definition:=replace(definition,'''material_markup_rate'',markup_rate));','''material_markup_rate'',markup_rate)||CASE WHEN resource_addition>0 THEN jsonb_build_object(''resource_addition'',resource_addition) ELSE ''{}''::jsonb END);');
 definition:=replace(definition,'RETURN charges||jsonb_build_object','RETURN charges||CASE WHEN all_resource_addition>0 THEN jsonb_build_object(''resourceAddition'',all_resource_addition) ELSE ''{}''::jsonb END||jsonb_build_object');
 EXECUTE definition;
END $patch$;
DO $guard$ DECLARE definition text;anchor text:='scope_resource ? ''laborDiscount''';BEGIN
 definition:=pg_get_functiondef('public.validate_workbench_structure(jsonb,boolean)'::regprocedure);
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Legacy schema validator anchor drift; stop and review';END IF;
 EXECUTE replace(definition,anchor,anchor||' OR scope_resource ? ''materialAdjustment'' OR scope_resource ? ''laborAdjustment''');
END $guard$;
CREATE OR REPLACE FUNCTION public.blank_slate_accounting_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 3 $$;
NOTIFY pgrst,'reload schema';
COMMIT;
