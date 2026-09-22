-- V5 Jobs / Financials foundation.
-- Financial values remain authoritative in job_budget_lines. This migration adds
-- baseline metadata and constrained, version-bound proposal/review/application
-- endpoints over the existing v5 working-copy primitives.

CREATE TABLE public.job_financial_baselines (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status = 'active'),
  established_at timestamptz NOT NULL DEFAULT now(),
  established_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  source text NOT NULL CHECK (source IN ('legacy_backfill','official_write','reviewed_proposal'))
);

CREATE INDEX job_financial_baselines_updated_idx
  ON public.job_financial_baselines(updated_at DESC);

ALTER TABLE public.job_financial_baselines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.job_financial_baselines FROM PUBLIC, anon, authenticated;

-- Existing production financials are already official. Record that fact without
-- modifying, copying, recalculating, or re-auditing any financial amount.
INSERT INTO public.job_financial_baselines(
  job_id, version, established_at, established_by, updated_at, updated_by, source
)
SELECT job.id, 1, now(), 'system:v5-financial-baseline-backfill', now(),
  'system:v5-financial-baseline-backfill', 'legacy_backfill'
FROM public.jobs job
WHERE EXISTS (
  SELECT 1 FROM public.job_budget_lines line WHERE line.job_id=job.id
)
OR EXISTS (
  SELECT 1 FROM public.job_revenue_lines line WHERE line.job_id=job.id
)
ON CONFLICT (job_id) DO NOTHING;

-- Every authoritative budget or SOV mutation advances the concurrency token,
-- including retained legacy RPCs, imports, archives, and controlled deletes.
CREATE FUNCTION public.touch_job_financial_baseline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  target_job_id uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.job_id ELSE NEW.job_id END;
  actor text:=coalesce(nullif(auth.jwt()->>'sub',''),'system:job-financial-write');
  baseline_source text:=CASE
    WHEN current_setting('northgate.reviewed_job_financial_apply',true)='yes' THEN 'reviewed_proposal'
    ELSE 'official_write'
  END;
BEGIN
  INSERT INTO public.job_financial_baselines(
    job_id,version,established_by,updated_by,source
  ) VALUES(target_job_id,1,actor,actor,baseline_source)
  ON CONFLICT (job_id) DO UPDATE SET
    version=public.job_financial_baselines.version+1,
    updated_at=now(),updated_by=actor;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$function$;

REVOKE ALL ON FUNCTION public.touch_job_financial_baseline() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER touch_job_budget_financial_baseline
AFTER INSERT OR UPDATE OR DELETE ON public.job_budget_lines
FOR EACH ROW EXECUTE FUNCTION public.touch_job_financial_baseline();
CREATE TRIGGER touch_job_revenue_financial_baseline
AFTER INSERT OR UPDATE OR DELETE ON public.job_revenue_lines
FOR EACH ROW EXECUTE FUNCTION public.touch_job_financial_baseline();

CREATE FUNCTION public.read_job_financial_baseline(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  baseline public.job_financial_baselines%ROWTYPE;
BEGIN
  IF nullif(auth.jwt()->>'sub','') IS NULL
     OR public.current_user_can_access_job(p_job_id,'can_view_project_financials') IS NOT TRUE THEN
    RAISE EXCEPTION 'Project financial access is required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO baseline FROM public.job_financial_baselines WHERE job_id=p_job_id;
  RETURN CASE WHEN baseline.job_id IS NULL THEN
    jsonb_build_object('job_id',p_job_id,'version',0,'status','unbaselined','source',NULL)
  ELSE to_jsonb(baseline) END;
END
$function$;

CREATE FUNCTION public.save_v5_job_financial_proposal(
  p_request_id uuid,
  p_working_copy_id uuid,
  p_expected_version integer,
  p_job_id uuid,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  decision jsonb;
  baseline public.job_financial_baselines%ROWTYPE;
  entry jsonb;
  target public.job_budget_lines%ROWTYPE;
  scope jsonb;
  payload jsonb;
BEGIN
  decision:=public.current_scoped_authorization_decision(
    'POL-010',jsonb_build_object('job_id',p_job_id)
  );
  IF COALESCE((decision->>'allowed')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial proposal access is required' USING ERRCODE='42501',DETAIL=decision::text;
  END IF;
  IF p_request_id IS NULL OR p_job_id IS NULL OR jsonb_typeof(p_lines)<>'array'
     OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 500
     OR pg_column_size(p_lines)>1048576 THEN
    RAISE EXCEPTION 'A request id, job, and one to 500 bounded financial lines are required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Active job not found' USING ERRCODE='P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) line
    WHERE jsonb_typeof(line)<>'object'
       OR nullif(btrim(coalesce(line->>'description','')),'') IS NULL
  ) THEN
    RAISE EXCEPTION 'Every proposed financial line requires an object and description' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) line
    CROSS JOIN LATERAL jsonb_object_keys(line - ARRAY['id','expected_updated_at','reason','source']) key
    WHERE key NOT IN ('project_division_id','category','is_protected_financial','cost_code','description',
      'budget_amount','budget_change_amount','actual_cost_amount','committed_cost_amount',
      'forecast_to_complete_amount','forecast_final_amount','schedule_of_values_amount',
      'current_budget_override_amount','note')
  ) THEN
    RAISE EXCEPTION 'A proposed financial line contains an unsupported field' USING ERRCODE='22023';
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF nullif(entry->>'id','') IS NOT NULL THEN
      BEGIN
        SELECT * INTO target FROM public.job_budget_lines
        WHERE id=(entry->>'id')::uuid AND job_id=p_job_id AND archived_at IS NULL;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'A proposed financial line has an invalid identifier' USING ERRCODE='22023';
      END;
      IF target.id IS NULL OR public.current_user_can_read_project_financial_line(p_job_id,target.id) IS NOT TRUE THEN
        RAISE EXCEPTION 'A proposed financial line is missing or outside your access' USING ERRCODE='42501';
      END IF;
      IF nullif(entry->>'expected_updated_at','') IS NULL THEN
        RAISE EXCEPTION 'Existing proposed lines require their expected update timestamp' USING ERRCODE='22023';
      END IF;
    ELSIF COALESCE((entry->>'is_protected_financial')::boolean,false)
      AND public.current_user_can_access_job(p_job_id,'can_view_protected_project_financials') IS NOT TRUE THEN
      RAISE EXCEPTION 'Protected financial access is required' USING ERRCODE='42501';
    END IF;
  END LOOP;

  SELECT * INTO baseline FROM public.job_financial_baselines WHERE job_id=p_job_id;
  scope:=jsonb_build_object('job_id',p_job_id);
  payload:=jsonb_build_object(
    'job_id',p_job_id,
    'baseline_version',COALESCE(baseline.version,0),
    'lines',p_lines
  );
  RETURN public.save_v5_working_copy(
    p_request_id,p_working_copy_id,p_expected_version,'jobs','financial_proposal',
    scope,payload,'job_financial_baselines',p_job_id::text,
    CASE WHEN baseline.job_id IS NULL THEN 'unbaselined' ELSE baseline.version::text END
  );
END
$function$;

CREATE FUNCTION public.submit_v5_job_financial_proposal(
  p_request_id uuid,
  p_working_copy_id uuid,
  p_expected_version integer,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text:=auth.jwt()->>'sub';
  copy public.v5_working_copies%ROWTYPE;
  target_job_id uuid;
  baseline public.job_financial_baselines%ROWTYPE;
  items jsonb:='[]'::jsonb;
  entry jsonb;
  target public.job_budget_lines%ROWTYPE;
  item_key text;
  item_index integer:=0;
  action_id text;
  previous_submission_context text:=current_setting('northgate.job_financial_submission',true);
BEGIN
  SELECT * INTO copy FROM public.v5_working_copies
  WHERE id=p_working_copy_id AND owner_user_id=actor FOR UPDATE;
  IF copy.id IS NULL OR copy.module_key<>'jobs' OR copy.work_type<>'financial_proposal' THEN
    RAISE EXCEPTION 'Financial proposal working copy was not found' USING ERRCODE='P0002';
  END IF;
  BEGIN target_job_id:=(copy.scope_context->>'job_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Financial proposal job context is invalid' USING ERRCODE='22023'; END;
  IF copy.payload->>'job_id' IS DISTINCT FROM target_job_id::text OR jsonb_typeof(copy.payload->'lines')<>'array' THEN
    RAISE EXCEPTION 'Financial proposal payload does not match its job context' USING ERRCODE='40001';
  END IF;
  SELECT * INTO baseline FROM public.job_financial_baselines WHERE job_id=target_job_id;
  IF COALESCE((copy.payload->>'baseline_version')::integer,0)<>COALESCE(baseline.version,0) THEN
    RAISE EXCEPTION 'The official financial baseline changed; reload the proposal before submitting' USING ERRCODE='40001';
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(copy.payload->'lines') LOOP
    item_index:=item_index+1;
    target:=NULL;
    IF nullif(entry->>'id','') IS NOT NULL THEN
      SELECT * INTO target FROM public.job_budget_lines
      WHERE id=(entry->>'id')::uuid AND job_id=target_job_id AND archived_at IS NULL;
      item_key:='financial-line:'||(entry->>'id');
    ELSE
      item_key:='financial-line:new:'||item_index::text||':'||COALESCE(entry->>'cost_code',entry->>'description');
    END IF;
    items:=items||jsonb_build_array(jsonb_build_object(
      'item_key',left(item_key,200),
      'before_value',CASE WHEN target.id IS NULL THEN 'null'::jsonb ELSE to_jsonb(target) END,
      'after_value',entry
    ));
  END LOOP;
  action_id:=CASE WHEN baseline.job_id IS NULL THEN 'CFG-005' ELSE 'CFG-004' END;
  PERFORM set_config('northgate.job_financial_submission',copy.id::text,true);
  items:=public.submit_v5_working_copy(
    p_request_id,p_working_copy_id,p_expected_version,
    jsonb_build_array(jsonb_build_object(
      'destination_key','official_job_financials','action_id',action_id,
      'context',jsonb_build_object('job_id',target_job_id),'payload',copy.payload,
      'source_version',copy.source_version,'items',items
    )),p_reason
  );
  PERFORM set_config('northgate.job_financial_submission',coalesce(previous_submission_context,''),true);
  RETURN items;
END
$function$;

-- The generic v5 primitives remain reusable, but they cannot be used to forge
-- an official Job Financials review. Only the constrained wrapper above opens
-- this transaction-local destination for the exact working copy being saved.
CREATE FUNCTION public.guard_job_financial_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  submitted_copy_id uuid;
BEGIN
  IF NEW.destination_key='official_job_financials' OR NEW.action_id IN ('CFG-004','CFG-005') THEN
    SELECT change_set.working_copy_id INTO submitted_copy_id
    FROM public.v5_change_sets change_set WHERE change_set.id=NEW.change_set_id;
    IF NEW.destination_key<>'official_job_financials'
       OR NEW.action_id NOT IN ('CFG-004','CFG-005')
       OR nullif(current_setting('northgate.job_financial_submission',true),'') IS DISTINCT FROM submitted_copy_id::text THEN
      RAISE EXCEPTION 'Use the Job Financials workflow to submit this proposal' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.guard_job_financial_submission() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_job_financial_submission
BEFORE INSERT ON public.v5_change_set_destinations
FOR EACH ROW EXECUTE FUNCTION public.guard_job_financial_submission();

CREATE FUNCTION public.read_v5_job_financial_review_queue(p_limit integer DEFAULT 100)
RETURNS TABLE(
  destination_id uuid,destination_version integer,payload_hash text,
  submitted_at timestamptz,submitted_by text,submitted_by_name text,
  shared_reason text,job_id uuid,job_name text,baseline_version integer,
  line_count integer,proposed_payload jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT destination.id,destination.version,destination.payload_hash,change_set.created_at,
    change_set.initiated_by,
    coalesce(nullif(initiator.display_name,''),nullif(initiator.email,''),change_set.initiated_by),
    change_set.shared_reason,job.id,job.name,
    coalesce((destination.proposed_payload->>'baseline_version')::integer,0),
    jsonb_array_length(destination.proposed_payload->'lines'),destination.proposed_payload
  FROM public.v5_change_set_destinations destination
  JOIN public.v5_change_sets change_set ON change_set.id=destination.change_set_id
  JOIN public.user_permissions initiator ON initiator.clerk_user_id=change_set.initiated_by
  JOIN public.jobs job ON job.id::text=destination.scope_context->>'job_id' AND job.archived_at IS NULL
  WHERE destination.status='pending'
    AND destination.destination_key='official_job_financials'
    AND destination.action_id IN ('CFG-004','CFG-005')
    AND COALESCE((public.current_scoped_authorization_decision(
      destination.action_id,destination.scope_context
    )->>'allowed')::boolean,false)
  ORDER BY change_set.created_at
  LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),200)
$function$;

CREATE FUNCTION public.apply_v5_job_financial_proposal(
  p_destination_id uuid,
  p_expected_version integer,
  p_expected_payload_hash text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text:=auth.jwt()->>'sub';
  destination public.v5_change_set_destinations%ROWTYPE;
  change_set public.v5_change_sets%ROWTYPE;
  copy public.v5_working_copies%ROWTYPE;
  baseline public.job_financial_baselines%ROWTYPE;
  authorization_result jsonb;
  target_job_id uuid;
  baseline_version integer;
  normalized_note text:=nullif(btrim(coalesce(p_note,'')),'');
  audit_reason text;
  saved_lines jsonb;
  completion jsonb;
  previous_apply_context text:=current_setting('northgate.reviewed_job_financial_apply',true);
BEGIN
  IF nullif(actor,'') IS NULL OR normalized_note IS NULL OR length(normalized_note)>1000 THEN
    RAISE EXCEPTION 'Authenticated reviewer and a note of 1 to 1000 characters are required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO destination FROM public.v5_change_set_destinations
  WHERE id=p_destination_id FOR UPDATE;
  IF destination.id IS NULL THEN RAISE EXCEPTION 'Financial proposal destination was not found' USING ERRCODE='P0002'; END IF;
  IF destination.status='applied' THEN
    IF destination.version=p_expected_version+1 AND destination.payload_hash=p_expected_payload_hash THEN
      RETURN to_jsonb(destination)||jsonb_build_object('idempotent',true);
    END IF;
    RAISE EXCEPTION 'Financial proposal was already applied from a different reviewed version' USING ERRCODE='40001';
  END IF;
  IF destination.status<>'pending' OR destination.version<>p_expected_version
     OR destination.payload_hash<>p_expected_payload_hash THEN
    RAISE EXCEPTION 'Financial proposal changed; reload before applying' USING ERRCODE='40001';
  END IF;
  IF destination.destination_key<>'official_job_financials'
     OR destination.action_id NOT IN ('CFG-004','CFG-005') THEN
    RAISE EXCEPTION 'Destination is not an official Job Financials proposal' USING ERRCODE='22023';
  END IF;
  authorization_result:=public.current_scoped_authorization_decision(
    destination.action_id,destination.scope_context
  );
  IF COALESCE((authorization_result->>'allowed')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial proposal application is not authorized' USING ERRCODE='42501',DETAIL=authorization_result::text;
  END IF;
  SELECT * INTO change_set FROM public.v5_change_sets WHERE id=destination.change_set_id FOR UPDATE;
  SELECT * INTO copy FROM public.v5_working_copies WHERE id=change_set.working_copy_id FOR UPDATE;
  IF copy.id IS NULL OR copy.module_key<>'jobs' OR copy.work_type<>'financial_proposal'
     OR copy.owner_user_id<>change_set.initiated_by
     OR change_set.working_copy_version<>copy.version
     OR change_set.payload_hash<>copy.payload_hash
     OR destination.proposed_payload IS DISTINCT FROM copy.payload THEN
    RAISE EXCEPTION 'Financial proposal source no longer matches the reviewed submission' USING ERRCODE='40001';
  END IF;
  BEGIN target_job_id:=(destination.scope_context->>'job_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Financial proposal job context is invalid' USING ERRCODE='22023'; END;
  IF destination.proposed_payload->>'job_id' IS DISTINCT FROM target_job_id::text
     OR jsonb_typeof(destination.proposed_payload->'lines')<>'array' THEN
    RAISE EXCEPTION 'Financial proposal payload does not match its job context' USING ERRCODE='40001';
  END IF;
  baseline_version:=COALESCE((destination.proposed_payload->>'baseline_version')::integer,0);
  SELECT * INTO baseline FROM public.job_financial_baselines WHERE job_id=target_job_id FOR UPDATE;
  IF baseline_version<>COALESCE(baseline.version,0) THEN
    RAISE EXCEPTION 'The official financial baseline changed; reload before applying' USING ERRCODE='40001';
  END IF;
  IF (baseline.job_id IS NULL AND destination.action_id<>'CFG-005')
     OR (baseline.job_id IS NOT NULL AND destination.action_id<>'CFG-004') THEN
    RAISE EXCEPTION 'Financial proposal action no longer matches baseline state' USING ERRCODE='40001';
  END IF;
  audit_reason:=left(concat_ws(E'\n',
    CASE WHEN change_set.shared_reason IS NOT NULL THEN 'Proposal: '||change_set.shared_reason END,
    'Review: '||normalized_note),4000);
  IF baseline.job_id IS NULL THEN
    INSERT INTO public.job_financial_baselines(
      job_id,version,established_by,updated_by,source
    ) VALUES(target_job_id,1,actor,actor,'reviewed_proposal')
    RETURNING * INTO baseline;
  END IF;
  PERFORM set_config('northgate.reviewed_job_financial_apply','yes',true);
  saved_lines:=public.save_job_financial_batch(
    target_job_id,destination.proposed_payload->'lines',audit_reason
  );
  PERFORM set_config('northgate.reviewed_job_financial_apply',coalesce(previous_apply_context,''),true);
  SELECT * INTO baseline FROM public.job_financial_baselines WHERE job_id=target_job_id;
  completion:=public.complete_v5_destination_application(
    destination.id,destination.version,destination.payload_hash,actor,
    jsonb_build_object('job_id',target_job_id,'baseline_version',baseline.version,
      'financial_line_ids',(SELECT coalesce(jsonb_agg(value->>'id'),'[]'::jsonb)
        FROM jsonb_array_elements(saved_lines))),normalized_note
  );
  RETURN completion||jsonb_build_object('idempotent',false,'baseline_version',baseline.version);
END
$function$;

REVOKE ALL ON FUNCTION public.read_job_financial_baseline(uuid),
  public.save_v5_job_financial_proposal(uuid,uuid,integer,uuid,jsonb),
  public.submit_v5_job_financial_proposal(uuid,uuid,integer,text),
  public.read_v5_job_financial_review_queue(integer),
  public.apply_v5_job_financial_proposal(uuid,integer,text,text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.read_job_financial_baseline(uuid),
  public.save_v5_job_financial_proposal(uuid,uuid,integer,uuid,jsonb),
  public.submit_v5_job_financial_proposal(uuid,uuid,integer,text),
  public.read_v5_job_financial_review_queue(integer),
  public.apply_v5_job_financial_proposal(uuid,integer,text,text)
TO authenticated;

NOTIFY pgrst, 'reload schema';
