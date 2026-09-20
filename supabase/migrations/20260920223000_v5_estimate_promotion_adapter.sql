-- First v5 module adapter. Promote an exact personal Estimate Workbench
-- destination to an official draft and complete the destination in the same
-- transaction. POL-002 is the approved cross-app Supervisor+ commit gate.

CREATE FUNCTION public.apply_v5_estimate_promotion(
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
  actor text := auth.jwt()->>'sub';
  actor_profile public.user_permissions%ROWTYPE;
  destination public.v5_change_set_destinations%ROWTYPE;
  change_set public.v5_change_sets%ROWTYPE;
  working_copy public.v5_working_copies%ROWTYPE;
  authorization_result jsonb;
  estimate public.estimates%ROWTYPE;
  workbench public.estimate_workbenches%ROWTYPE;
  target_division text;
  document jsonb;
  normalized_note text := nullif(btrim(coalesce(p_note,'')),'');
  previous_save_setting text := current_setting('northgate.workbench_save',true);
  completion jsonb;
BEGIN
  IF nullif(actor,'') IS NULL OR normalized_note IS NULL OR length(normalized_note)>1000 THEN
    RAISE EXCEPTION 'Authenticated reviewer and a note of 1 to 1000 characters are required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO actor_profile FROM public.user_permissions
  WHERE clerk_user_id=actor AND is_active LIMIT 1;
  IF actor_profile.id IS NULL THEN RAISE EXCEPTION 'Active reviewer profile is required' USING ERRCODE='42501'; END IF;

  SELECT * INTO destination FROM public.v5_change_set_destinations
  WHERE id=p_destination_id FOR UPDATE;
  IF destination.id IS NULL THEN RAISE EXCEPTION 'Estimate promotion destination was not found' USING ERRCODE='P0002'; END IF;
  IF destination.status='applied' THEN
    IF destination.version=p_expected_version+1 AND destination.payload_hash=p_expected_payload_hash THEN
      RETURN to_jsonb(destination)||jsonb_build_object('idempotent',true);
    END IF;
    RAISE EXCEPTION 'Estimate promotion was already applied from a different reviewed version' USING ERRCODE='40001';
  END IF;
  IF destination.status<>'pending' OR destination.version<>p_expected_version
     OR destination.payload_hash<>p_expected_payload_hash THEN
    RAISE EXCEPTION 'Estimate promotion changed; reload before applying' USING ERRCODE='40001';
  END IF;
  IF destination.destination_key<>'official_estimate' OR destination.action_id<>'POL-002' THEN
    RAISE EXCEPTION 'Destination is not an official Estimate promotion request' USING ERRCODE='22023';
  END IF;

  authorization_result:=public.current_scoped_authorization_decision(destination.action_id,destination.scope_context);
  IF COALESCE((authorization_result->>'allowed')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Estimate promotion is not authorized' USING ERRCODE='42501',DETAIL=authorization_result::text;
  END IF;

  SELECT * INTO change_set FROM public.v5_change_sets
  WHERE id=destination.change_set_id FOR UPDATE;
  SELECT * INTO working_copy FROM public.v5_working_copies
  WHERE id=change_set.working_copy_id FOR UPDATE;
  IF working_copy.id IS NULL OR working_copy.module_key<>'estimating' OR working_copy.work_type<>'estimate'
     OR working_copy.owner_user_id<>change_set.initiated_by
     OR change_set.working_copy_version<>working_copy.version
     OR change_set.payload_hash<>working_copy.payload_hash
     OR destination.proposed_payload IS DISTINCT FROM working_copy.payload THEN
    RAISE EXCEPTION 'Personal estimate source no longer matches the reviewed submission' USING ERRCODE='40001';
  END IF;

  document:=destination.proposed_payload;
  target_division:=nullif(btrim(coalesce(destination.scope_context->>'division',working_copy.scope_context->>'division')),'');
  IF target_division IS NULL OR target_division NOT IN ('Electrical','Construction','Admin') THEN
    RAISE EXCEPTION 'A supported target Department is required' USING ERRCODE='22023';
  END IF;
  IF actor_profile.business_role<>'Director' AND actor_profile.division IS DISTINCT FROM target_division THEN
    RAISE EXCEPTION 'Reviewers may promote personal estimates only within their Department' USING ERRCODE='42501';
  END IF;
  IF document IS NULL OR jsonb_typeof(document)<>'object' OR pg_column_size(document)>2097152
     OR nullif(btrim(document->>'name'),'') IS NULL
     OR jsonb_typeof(document->'entries') IS DISTINCT FROM 'array'
     OR coalesce(document->>'approvedAt','')<>'' THEN
    RAISE EXCEPTION 'A valid unpublished Estimate Workbench document is required' USING ERRCODE='22023';
  END IF;
  PERFORM public.validate_workbench_structure(document,false);

  PERFORM set_config('northgate.workbench_save','yes',true);
  INSERT INTO public.estimates(
    division,title,customer_name,created_by,estimator_id,editor_version,status
  ) VALUES(
    target_division,btrim(document->>'name'),nullif(btrim(document->>'customer'),''),
    working_copy.owner_user_id,working_copy.owner_user_id,2,'draft'
  ) RETURNING * INTO estimate;

  INSERT INTO public.estimate_workbenches(estimate_id,revision,document)
  VALUES(estimate.id,1,document)
  RETURNING * INTO workbench;

  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,coalesce(nullif(actor_profile.display_name,''),nullif(actor_profile.email,''),actor),
    'estimates',estimate.id::text,'create',
    jsonb_build_object('working_copy_id',working_copy.id,'change_set_id',change_set.id),
    to_jsonb(estimate)||jsonb_build_object('workbench_revision',workbench.revision),normalized_note);

  completion:=public.complete_v5_destination_application(
    destination.id,destination.version,destination.payload_hash,actor,
    jsonb_build_object('estimate_id',estimate.id,'workbench_revision',workbench.revision),normalized_note
  );
  PERFORM set_config('northgate.workbench_save',coalesce(previous_save_setting,''),true);
  RETURN completion||jsonb_build_object('idempotent',false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('northgate.workbench_save',coalesce(previous_save_setting,''),true);
  RAISE;
END
$function$;

REVOKE ALL ON FUNCTION public.apply_v5_estimate_promotion(uuid,integer,text,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_v5_estimate_promotion(uuid,integer,text,text)
TO authenticated;

NOTIFY pgrst, 'reload schema';
