-- V5 Job Billing/SOV reconciliation.
-- Keep job_revenue_lines authoritative while adding one stale-safe official
-- adapter and constrained contributor proposal/review/application endpoints.

CREATE FUNCTION public.apply_job_sov_line_change(
  p_job_id uuid,
  p_line jsonb,
  p_operation text DEFAULT 'upsert',
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  actor_name text;
  target public.job_revenue_lines%ROWTYPE;
  saved public.job_revenue_lines%ROWTYPE;
  target_id uuid;
  expected_updated_at timestamptz;
  normalized_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  before_snapshot jsonb;
  scheduled_amount numeric;
  approved_change_amount numeric;
  billed_amount numeric;
BEGIN
  IF nullif(actor,'') IS NULL THEN
    RAISE EXCEPTION 'Authenticated Clerk JWT is required' USING ERRCODE='28000';
  END IF;
  IF p_job_id IS NULL OR p_line IS NULL OR jsonb_typeof(p_line)<>'object'
     OR p_operation IS NULL OR p_operation NOT IN ('upsert','archive') THEN
    RAISE EXCEPTION 'A job, SOV line object, and supported operation are required' USING ERRCODE='22023';
  END IF;
  IF public.current_user_can_edit_job(p_job_id,'can_approve_budget') IS NOT TRUE THEN
    RAISE EXCEPTION 'Billing management permission is required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Active job not found' USING ERRCODE='P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_line) key
    WHERE key NOT IN ('id','expected_updated_at','sov_line','description','scheduled_value_amount',
      'approved_change_amount','billed_to_date_amount','note','is_protected_financial')
  ) THEN
    RAISE EXCEPTION 'The SOV change contains an unsupported field' USING ERRCODE='22023';
  END IF;

  BEGIN
    target_id:=nullif(p_line->>'id','')::uuid;
    expected_updated_at:=nullif(p_line->>'expected_updated_at','')::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'The SOV line identifier or update timestamp is invalid' USING ERRCODE='22023';
  END;

  IF target_id IS NOT NULL THEN
    SELECT * INTO target FROM public.job_revenue_lines
    WHERE id=target_id AND job_id=p_job_id AND archived_at IS NULL FOR UPDATE;
    IF target.id IS NULL THEN RAISE EXCEPTION 'Active SOV line not found' USING ERRCODE='P0002'; END IF;
    IF expected_updated_at IS NULL OR target.updated_at IS DISTINCT FROM expected_updated_at THEN
      RAISE EXCEPTION 'The SOV line changed; reload before saving' USING ERRCODE='40001';
    END IF;
    before_snapshot:=to_jsonb(target);
  ELSIF p_operation='archive' THEN
    RAISE EXCEPTION 'An existing SOV line is required for archive' USING ERRCODE='22023';
  END IF;

  SELECT coalesce(nullif(display_name,''),nullif(email,''),actor)
  INTO actor_name FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1;

  IF p_operation='archive' THEN
    IF normalized_reason IS NULL THEN
      RAISE EXCEPTION 'Enter a reason before archiving an SOV line' USING ERRCODE='22023';
    END IF;
    IF coalesce(target.billed_to_date_amount,0)<>0
       OR EXISTS(SELECT 1 FROM public.change_order_sov_allocations WHERE revenue_line_id=target.id)
       OR EXISTS(SELECT 1 FROM public.job_pay_application_lines WHERE sov_line_id=target.id) THEN
      RAISE EXCEPTION 'This SOV line has billing or Change Order history and cannot be archived' USING ERRCODE='23503';
    END IF;
    UPDATE public.job_revenue_lines SET archived_at=now(),archived_by=actor,
      archive_reason=normalized_reason WHERE id=target.id RETURNING * INTO saved;
    INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
    VALUES(actor,actor_name,'job_revenue_lines',saved.id::text,'update',before_snapshot,to_jsonb(saved),normalized_reason);
    RETURN to_jsonb(saved)||jsonb_build_object('operation','archive');
  END IF;

  IF nullif(btrim(coalesce(p_line->>'description','')),'') IS NULL THEN
    RAISE EXCEPTION 'Enter an SOV description before saving' USING ERRCODE='22023';
  END IF;
  BEGIN
    scheduled_amount:=coalesce((p_line->>'scheduled_value_amount')::numeric,0);
    approved_change_amount:=coalesce((p_line->>'approved_change_amount')::numeric,0);
    billed_amount:=coalesce((p_line->>'billed_to_date_amount')::numeric,0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'SOV amounts must contain valid financial values' USING ERRCODE='22023';
  END;
  IF scheduled_amount<0 OR billed_amount<0
     OR scheduled_amount IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
     OR approved_change_amount IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
     OR billed_amount IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
     OR scheduled_amount+approved_change_amount<billed_amount THEN
    RAISE EXCEPTION 'SOV values must be valid and the revised contract value cannot be below billed-to-date' USING ERRCODE='22023';
  END IF;
  IF (coalesce(target.is_protected_financial,false) OR coalesce((p_line->>'is_protected_financial')::boolean,false))
     AND public.current_user_can_access_job(p_job_id,'can_view_protected_project_financials') IS NOT TRUE THEN
    RAISE EXCEPTION 'Protected financial access is required' USING ERRCODE='42501';
  END IF;

  IF target_id IS NULL THEN
    IF billed_amount<>0 THEN
      RAISE EXCEPTION 'New SOV lines cannot start with billed-to-date; billing is controlled by finalized Pay Apps' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.job_revenue_lines(
      job_id,division,sov_line,description,scheduled_value_amount,approved_change_amount,
      billed_to_date_amount,note,created_by,is_protected_financial
    ) SELECT p_job_id,job.division,nullif(btrim(coalesce(p_line->>'sov_line','')),''),
      btrim(p_line->>'description'),scheduled_amount,approved_change_amount,billed_amount,
      nullif(btrim(coalesce(p_line->>'note','')),''),actor,
      coalesce((p_line->>'is_protected_financial')::boolean,false)
    FROM public.jobs job WHERE job.id=p_job_id AND job.archived_at IS NULL
    RETURNING * INTO saved;
  ELSE
    IF billed_amount IS DISTINCT FROM target.billed_to_date_amount THEN
      RAISE EXCEPTION 'Billed-to-date is controlled by finalized Pay Apps and cannot be edited here' USING ERRCODE='22023';
    END IF;
    UPDATE public.job_revenue_lines SET
      sov_line=nullif(btrim(coalesce(p_line->>'sov_line','')),''),
      description=btrim(p_line->>'description'),scheduled_value_amount=scheduled_amount,
      approved_change_amount=approved_change_amount,note=nullif(btrim(coalesce(p_line->>'note','')),''),
      is_protected_financial=coalesce((p_line->>'is_protected_financial')::boolean,false)
    WHERE id=target.id RETURNING * INTO saved;
  END IF;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,actor_name,'job_revenue_lines',saved.id::text,
    CASE WHEN target_id IS NULL THEN 'create' ELSE 'update' END,before_snapshot,to_jsonb(saved),
    coalesce(normalized_reason,format('SOV line %s %s.',saved.description,
      CASE WHEN target_id IS NULL THEN 'created' ELSE 'updated' END)));
  RETURN to_jsonb(saved)||jsonb_build_object('operation','upsert');
END
$function$;

CREATE FUNCTION public.save_v5_job_sov_proposal(
  p_request_id uuid,
  p_working_copy_id uuid,
  p_expected_version integer,
  p_job_id uuid,
  p_operation text,
  p_line jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  decision jsonb;
  baseline public.job_financial_baselines%ROWTYPE;
  target public.job_revenue_lines%ROWTYPE;
  target_id uuid;
  payload jsonb;
BEGIN
  decision:=public.current_scoped_authorization_decision('POL-010',jsonb_build_object('job_id',p_job_id));
  IF coalesce((decision->>'allowed')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'SOV proposal access is required' USING ERRCODE='42501',DETAIL=decision::text;
  END IF;
  IF p_request_id IS NULL OR p_job_id IS NULL OR p_operation IS NULL OR p_operation NOT IN ('upsert','archive')
     OR p_line IS NULL OR jsonb_typeof(p_line)<>'object' OR pg_column_size(p_line)>131072 THEN
    RAISE EXCEPTION 'A request id, job, supported operation, and bounded SOV line are required' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_line) key
    WHERE key NOT IN ('id','expected_updated_at','sov_line','description','scheduled_value_amount',
      'approved_change_amount','billed_to_date_amount','note','is_protected_financial')
  ) THEN RAISE EXCEPTION 'The SOV proposal contains an unsupported field' USING ERRCODE='22023'; END IF;
  BEGIN target_id:=nullif(p_line->>'id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'The SOV proposal identifier is invalid' USING ERRCODE='22023'; END;
  IF target_id IS NOT NULL THEN
    SELECT * INTO target FROM public.job_revenue_lines
    WHERE id=target_id AND job_id=p_job_id AND archived_at IS NULL;
    IF target.id IS NULL OR nullif(p_line->>'expected_updated_at','') IS NULL THEN
      RAISE EXCEPTION 'An existing SOV proposal requires its active line and update timestamp' USING ERRCODE='22023';
    END IF;
    IF target.is_protected_financial
       AND public.current_user_can_access_job(p_job_id,'can_view_protected_project_financials') IS NOT TRUE THEN
      RAISE EXCEPTION 'Protected financial access is required' USING ERRCODE='42501';
    END IF;
  ELSIF p_operation='archive' THEN
    RAISE EXCEPTION 'An existing SOV line is required for archive' USING ERRCODE='22023';
  END IF;
  IF coalesce((p_line->>'is_protected_financial')::boolean,false)
     AND public.current_user_can_access_job(p_job_id,'can_view_protected_project_financials') IS NOT TRUE THEN
    RAISE EXCEPTION 'Protected financial access is required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO baseline FROM public.job_financial_baselines WHERE job_id=p_job_id;
  payload:=jsonb_build_object('job_id',p_job_id,'baseline_version',coalesce(baseline.version,0),
    'operation',p_operation,'line',p_line);
  RETURN public.save_v5_working_copy(p_request_id,p_working_copy_id,p_expected_version,
    'jobs','sov_proposal',jsonb_build_object('job_id',p_job_id),payload,
    'job_financial_baselines',p_job_id::text,coalesce(baseline.version,0)::text);
END
$function$;

CREATE FUNCTION public.submit_v5_job_sov_proposal(
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
  target public.job_revenue_lines%ROWTYPE;
  target_job_id uuid;
  baseline public.job_financial_baselines%ROWTYPE;
  item_key text;
  items jsonb;
  result jsonb;
  previous_context text:=current_setting('northgate.job_sov_submission',true);
BEGIN
  SELECT * INTO copy FROM public.v5_working_copies
  WHERE id=p_working_copy_id AND owner_user_id=actor FOR UPDATE;
  IF copy.id IS NULL OR copy.module_key<>'jobs' OR copy.work_type<>'sov_proposal' THEN
    RAISE EXCEPTION 'SOV proposal working copy was not found' USING ERRCODE='P0002';
  END IF;
  BEGIN target_job_id:=(copy.scope_context->>'job_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'SOV proposal job context is invalid' USING ERRCODE='22023'; END;
  IF copy.payload->>'job_id' IS DISTINCT FROM target_job_id::text
     OR copy.payload->>'operation' NOT IN ('upsert','archive')
     OR jsonb_typeof(copy.payload->'line')<>'object' THEN
    RAISE EXCEPTION 'SOV proposal payload does not match its job context' USING ERRCODE='40001';
  END IF;
  SELECT * INTO baseline FROM public.job_financial_baselines WHERE job_id=target_job_id;
  IF coalesce((copy.payload->>'baseline_version')::integer,0)<>coalesce(baseline.version,0) THEN
    RAISE EXCEPTION 'The official financial baseline changed; reload the SOV proposal before submitting' USING ERRCODE='40001';
  END IF;
  IF nullif(copy.payload->'line'->>'id','') IS NOT NULL THEN
    SELECT * INTO target FROM public.job_revenue_lines
    WHERE id=(copy.payload->'line'->>'id')::uuid AND job_id=target_job_id AND archived_at IS NULL;
    item_key:='sov-line:'||(copy.payload->'line'->>'id');
  ELSE item_key:='sov-line:new:'||coalesce(copy.payload->'line'->>'sov_line',copy.payload->'line'->>'description'); END IF;
  items:=jsonb_build_array(jsonb_build_object('item_key',left(item_key,200),
    'before_value',CASE WHEN target.id IS NULL THEN 'null'::jsonb ELSE to_jsonb(target) END,
    'after_value',copy.payload->'line'||jsonb_build_object('operation',copy.payload->>'operation')));
  PERFORM set_config('northgate.job_sov_submission',copy.id::text,true);
  result:=public.submit_v5_working_copy(p_request_id,p_working_copy_id,p_expected_version,
    jsonb_build_array(jsonb_build_object('destination_key','official_job_sov','action_id','AUD-046',
      'context',jsonb_build_object('job_id',target_job_id),'payload',copy.payload,
      'source_version',copy.source_version,'items',items)),p_reason);
  PERFORM set_config('northgate.job_sov_submission',coalesce(previous_context,''),true);
  RETURN result;
END
$function$;

CREATE FUNCTION public.guard_job_sov_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE submitted_copy_id uuid;
BEGIN
  IF NEW.destination_key='official_job_sov' THEN
    SELECT change_set.working_copy_id INTO submitted_copy_id
    FROM public.v5_change_sets change_set WHERE change_set.id=NEW.change_set_id;
    IF NEW.action_id<>'AUD-046'
       OR nullif(current_setting('northgate.job_sov_submission',true),'') IS DISTINCT FROM submitted_copy_id::text THEN
      RAISE EXCEPTION 'Use the Job Billing workflow to submit this SOV proposal' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.guard_job_sov_submission() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_job_sov_submission
BEFORE INSERT ON public.v5_change_set_destinations
FOR EACH ROW EXECUTE FUNCTION public.guard_job_sov_submission();

CREATE FUNCTION public.read_v5_job_sov_review_queue(p_limit integer DEFAULT 100)
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
    coalesce((destination.proposed_payload->>'baseline_version')::integer,0),1,
    destination.proposed_payload
  FROM public.v5_change_set_destinations destination
  JOIN public.v5_change_sets change_set ON change_set.id=destination.change_set_id
  JOIN public.user_permissions initiator ON initiator.clerk_user_id=change_set.initiated_by
  JOIN public.jobs job ON job.id::text=destination.scope_context->>'job_id' AND job.archived_at IS NULL
  WHERE destination.status='pending' AND destination.destination_key='official_job_sov'
    AND destination.action_id='AUD-046'
    AND coalesce((public.current_scoped_authorization_decision(
      destination.action_id,destination.scope_context)->>'allowed')::boolean,false)
  ORDER BY change_set.created_at
  LIMIT least(greatest(coalesce(p_limit,100),1),200)
$function$;

CREATE FUNCTION public.apply_v5_job_sov_proposal(
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
  normalized_note text:=nullif(btrim(coalesce(p_note,'')),'');
  audit_reason text;
  saved jsonb;
  completion jsonb;
  previous_apply_context text:=current_setting('northgate.reviewed_job_financial_apply',true);
BEGIN
  IF nullif(actor,'') IS NULL OR normalized_note IS NULL OR length(normalized_note)>1000 THEN
    RAISE EXCEPTION 'Authenticated reviewer and a note of 1 to 1000 characters are required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO destination FROM public.v5_change_set_destinations WHERE id=p_destination_id FOR UPDATE;
  IF destination.id IS NULL THEN RAISE EXCEPTION 'SOV proposal destination was not found' USING ERRCODE='P0002'; END IF;
  IF destination.status='applied' THEN
    IF destination.version=p_expected_version+1 AND destination.payload_hash=p_expected_payload_hash THEN
      RETURN to_jsonb(destination)||jsonb_build_object('idempotent',true);
    END IF;
    RAISE EXCEPTION 'SOV proposal was already applied from a different reviewed version' USING ERRCODE='40001';
  END IF;
  IF destination.status<>'pending' OR destination.version<>p_expected_version
     OR destination.payload_hash<>p_expected_payload_hash
     OR destination.destination_key<>'official_job_sov' OR destination.action_id<>'AUD-046' THEN
    RAISE EXCEPTION 'SOV proposal changed or is not an official SOV destination' USING ERRCODE='40001';
  END IF;
  authorization_result:=public.current_scoped_authorization_decision('AUD-046',destination.scope_context);
  IF coalesce((authorization_result->>'allowed')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'SOV proposal application is not authorized' USING ERRCODE='42501',DETAIL=authorization_result::text;
  END IF;
  SELECT * INTO change_set FROM public.v5_change_sets WHERE id=destination.change_set_id FOR UPDATE;
  SELECT * INTO copy FROM public.v5_working_copies WHERE id=change_set.working_copy_id FOR UPDATE;
  IF copy.id IS NULL OR copy.module_key<>'jobs' OR copy.work_type<>'sov_proposal'
     OR copy.owner_user_id<>change_set.initiated_by OR change_set.working_copy_version<>copy.version
     OR change_set.payload_hash<>copy.payload_hash OR destination.proposed_payload IS DISTINCT FROM copy.payload THEN
    RAISE EXCEPTION 'SOV proposal source no longer matches the reviewed submission' USING ERRCODE='40001';
  END IF;
  BEGIN target_job_id:=(destination.scope_context->>'job_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'SOV proposal job context is invalid' USING ERRCODE='22023'; END;
  SELECT * INTO baseline FROM public.job_financial_baselines WHERE job_id=target_job_id FOR UPDATE;
  IF coalesce((destination.proposed_payload->>'baseline_version')::integer,0)<>coalesce(baseline.version,0) THEN
    RAISE EXCEPTION 'The official financial baseline changed; reload before applying' USING ERRCODE='40001';
  END IF;
  audit_reason:=left(concat_ws(E'\n',CASE WHEN change_set.shared_reason IS NOT NULL
    THEN 'Proposal: '||change_set.shared_reason END,'Review: '||normalized_note),4000);
  PERFORM set_config('northgate.reviewed_job_financial_apply','yes',true);
  saved:=public.apply_job_sov_line_change(target_job_id,destination.proposed_payload->'line',
    destination.proposed_payload->>'operation',audit_reason);
  PERFORM set_config('northgate.reviewed_job_financial_apply',coalesce(previous_apply_context,''),true);
  SELECT * INTO baseline FROM public.job_financial_baselines WHERE job_id=target_job_id;
  completion:=public.complete_v5_destination_application(destination.id,destination.version,
    destination.payload_hash,actor,jsonb_build_object('job_id',target_job_id,
      'baseline_version',baseline.version,'sov_line',saved),normalized_note);
  RETURN completion||jsonb_build_object('idempotent',false,'baseline_version',baseline.version);
END
$function$;

REVOKE ALL ON FUNCTION public.apply_job_sov_line_change(uuid,jsonb,text,text),
  public.save_v5_job_sov_proposal(uuid,uuid,integer,uuid,text,jsonb),
  public.submit_v5_job_sov_proposal(uuid,uuid,integer,text),
  public.read_v5_job_sov_review_queue(integer),
  public.apply_v5_job_sov_proposal(uuid,integer,text,text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_job_sov_line_change(uuid,jsonb,text,text),
  public.save_v5_job_sov_proposal(uuid,uuid,integer,uuid,text,jsonb),
  public.submit_v5_job_sov_proposal(uuid,uuid,integer,text),
  public.read_v5_job_sov_review_queue(integer),
  public.apply_v5_job_sov_proposal(uuid,integer,text,text)
TO authenticated;

NOTIFY pgrst, 'reload schema';
