-- Staging Category validation only. No data writes or ACL changes.
DO $preflight$ BEGIN
 IF md5(pg_get_functiondef('public.eos_scorecard_save_metric_v1(jsonb,uuid)'::regprocedure)) <> '553a95e5c044d3e08ef394b784bcc8c0' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.eos_scorecard_save_metric_v1(jsonb,uuid)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}' THEN RAISE EXCEPTION 'Scorecard function/ACL drift; stop and review'; END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.eos_scorecard_save_metric_v1(p_input jsonb,p_request_id uuid) RETURNS jsonb
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
 IF nullif(btrim(d->>'category_id'),'') IS NULL THEN RAISE EXCEPTION 'Choose a category before saving.' USING ERRCODE='22023'; END IF;
 IF d->>'category_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Choose a valid category before saving.' USING ERRCODE='22023'; END IF;
 SELECT data->>'name' INTO cat FROM public.eos_scorecard_categories WHERE id=(d->>'category_id')::uuid;
 IF cat IS NULL THEN RAISE EXCEPTION 'Choose an existing category. Your draft is retained.' USING ERRCODE='22023'; END IF;
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


