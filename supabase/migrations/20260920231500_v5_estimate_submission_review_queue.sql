-- Constrained Estimate UI endpoints over the generic v5 workflow.
CREATE FUNCTION public.submit_v5_estimate_for_review(p_request_id uuid,p_working_copy_id uuid,p_expected_version integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE actor text:=auth.jwt()->>'sub';working_copy public.v5_working_copies%ROWTYPE;
 normalized_reason text:=nullif(btrim(coalesce(p_reason,'')),'');result jsonb;
BEGIN
 IF nullif(actor,'') IS NULL OR p_request_id IS NULL OR normalized_reason IS NULL OR length(normalized_reason)>1000 THEN
  RAISE EXCEPTION 'Authenticated user, request id, and a reason of 1 to 1000 characters are required' USING ERRCODE='22023';END IF;
 SELECT * INTO working_copy FROM public.v5_working_copies WHERE id=p_working_copy_id AND owner_user_id=actor FOR UPDATE;
 IF working_copy.id IS NULL OR working_copy.module_key<>'estimating' OR working_copy.work_type<>'estimate' THEN
  RAISE EXCEPTION 'Personal Estimate working copy was not found' USING ERRCODE='P0002';END IF;
 result:=public.submit_v5_working_copy(p_request_id,p_working_copy_id,p_expected_version,
  jsonb_build_array(jsonb_build_object('destination_key','official_estimate','action_id','POL-002',
   'context',jsonb_build_object('division',working_copy.scope_context->>'division'),'payload',working_copy.payload,
   'source_version',working_copy.version::text,'items','[]'::jsonb)),normalized_reason);
 RETURN result;
END $function$;

CREATE FUNCTION public.read_v5_estimate_review_queue(p_limit integer DEFAULT 100)
RETURNS TABLE(destination_id uuid,destination_version integer,payload_hash text,submitted_at timestamptz,
 submitted_by text,submitted_by_name text,shared_reason text,target_division text,estimate_name text,
 customer_name text,proposed_payload jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $function$
 SELECT destination.id,destination.version,destination.payload_hash,change_set.created_at,change_set.initiated_by,
  coalesce(nullif(initiator.display_name,''),nullif(initiator.email,''),change_set.initiated_by),
  change_set.shared_reason,destination.scope_context->>'division',destination.proposed_payload->>'name',
  destination.proposed_payload->>'customer',destination.proposed_payload
 FROM public.v5_change_set_destinations destination
 JOIN public.v5_change_sets change_set ON change_set.id=destination.change_set_id
 JOIN public.user_permissions initiator ON initiator.clerk_user_id=change_set.initiated_by
 JOIN public.user_permissions reviewer ON reviewer.clerk_user_id=auth.jwt()->>'sub' AND reviewer.is_active
 WHERE destination.status='pending' AND destination.destination_key='official_estimate' AND destination.action_id='POL-002'
  AND COALESCE((public.current_scoped_authorization_decision(destination.action_id,destination.scope_context)->>'allowed')::boolean,false)
  AND (reviewer.business_role='Director' OR reviewer.division IS NOT DISTINCT FROM destination.scope_context->>'division')
 ORDER BY change_set.created_at LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),200)
$function$;

REVOKE ALL ON FUNCTION public.submit_v5_estimate_for_review(uuid,uuid,integer,text),
 public.read_v5_estimate_review_queue(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_v5_estimate_for_review(uuid,uuid,integer,text),
 public.read_v5_estimate_review_queue(integer) TO authenticated;
NOTIFY pgrst,'reload schema';
