-- Preserve personal estimate work while routing shared-library and catalogue
-- proposals as independent review destinations. Expose one permission-aware
-- inbox for the application bell and Dashboard Pulse.

CREATE OR REPLACE FUNCTION public.submit_v5_estimate_for_review(
  p_request_id uuid,
  p_working_copy_id uuid,
  p_expected_version integer,
  p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE
  actor text:=auth.jwt()->>'sub';
  working_copy public.v5_working_copies%ROWTYPE;
  normalized_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  destinations jsonb;
  proposals jsonb;
  assembly jsonb;
  catalogue_updates jsonb;
  catalogue_items jsonb;
  result jsonb;
BEGIN
  IF nullif(actor,'') IS NULL OR p_request_id IS NULL OR normalized_reason IS NULL OR length(normalized_reason)>1000 THEN
    RAISE EXCEPTION 'Authenticated user, request id, and a reason of 1 to 1000 characters are required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO working_copy FROM public.v5_working_copies
  WHERE id=p_working_copy_id AND owner_user_id=actor FOR UPDATE;
  IF working_copy.id IS NULL OR working_copy.module_key<>'estimating' OR working_copy.work_type<>'estimate' THEN
    RAISE EXCEPTION 'Personal Estimate working copy was not found' USING ERRCODE='P0002';
  END IF;

  proposals:=coalesce(working_copy.payload->'reviewProposals','{}'::jsonb);
  assembly:=proposals->'assembly';
  catalogue_updates:=coalesce(proposals->'catalogueUpdates','[]'::jsonb);
  destinations:=jsonb_build_array(jsonb_build_object(
    'destination_key','official_estimate','action_id','POL-002',
    'context',jsonb_build_object('division',working_copy.scope_context->>'division'),
    'payload',working_copy.payload-'reviewProposals','source_version',working_copy.version::text,
    'items','[]'::jsonb
  ));

  IF assembly IS NOT NULL AND jsonb_typeof(assembly)='object' THEN
    destinations:=destinations||jsonb_build_array(jsonb_build_object(
      'destination_key','shared_assembly',
      'action_id',CASE WHEN nullif(assembly->>'libraryId','') IS NULL THEN 'V3-009' ELSE 'CFG-056' END,
      'context',jsonb_build_object('division',working_copy.scope_context->>'division','module','estimating'),
      'payload',jsonb_build_object('assembly',assembly,'source_estimate',working_copy.id),
      'source_version',working_copy.version::text,
      'items',jsonb_build_array(jsonb_build_object('item_key','assembly','before_value',NULL,'after_value',assembly))
    ));
  END IF;

  IF jsonb_typeof(catalogue_updates)='array' AND jsonb_array_length(catalogue_updates)>0 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'item_key','catalogue:'||(item->>'item_id'),
      'before_value',jsonb_build_object('expected_updated_at',item->>'expected_updated_at'),
      'after_value',item->'changes'
    )),'[]'::jsonb) INTO catalogue_items
    FROM jsonb_array_elements(catalogue_updates) item;
    destinations:=destinations||jsonb_build_array(jsonb_build_object(
      'destination_key','catalogue_updates','action_id','V3-012',
      'context',jsonb_build_object('division',working_copy.scope_context->>'division','module','inventory'),
      'payload',jsonb_build_object('updates',catalogue_updates,'source_estimate',working_copy.id),
      'source_version',working_copy.version::text,'items',catalogue_items
    ));
  END IF;

  result:=public.submit_v5_working_copy(p_request_id,p_working_copy_id,p_expected_version,destinations,normalized_reason);
  RETURN result||jsonb_build_object('destination_count',jsonb_array_length(destinations));
END $function$;

CREATE OR REPLACE FUNCTION public.read_my_review_task_inbox(p_limit integer DEFAULT 100)
RETURNS TABLE(
  destination_id uuid,
  destination_version integer,
  task_type text,
  module_key text,
  title text,
  scope_label text,
  submitted_by text,
  submitted_by_name text,
  submitted_at timestamptz,
  destination_key text,
  action_id text,
  status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $function$
  SELECT destination.id,destination.version,
    CASE destination.destination_key
      WHEN 'official_estimate' THEN 'Estimate reviews'
      WHEN 'shared_assembly' THEN 'Assembly library reviews'
      WHEN 'catalogue_updates' THEN 'Catalogue and pricing reviews'
      ELSE coalesce(action.module,'Review tasks') END,
    CASE WHEN destination.destination_key='catalogue_updates' THEN 'inventory'
      WHEN destination.destination_key IN ('official_estimate','shared_assembly') THEN 'estimating'
      ELSE lower(replace(coalesce(action.module,'dashboard'),' ','_')) END,
    CASE destination.destination_key
      WHEN 'official_estimate' THEN coalesce(destination.proposed_payload->>'name','Untitled estimate')
      WHEN 'shared_assembly' THEN coalesce(destination.proposed_payload#>>'{assembly,name}','Assembly change')
      WHEN 'catalogue_updates' THEN 'Material catalogue update from estimate'
      ELSE action.description END,
    coalesce(destination.scope_context->>'division',destination.scope_context->>'department'),
    change_set.initiated_by,
    coalesce(nullif(initiator.display_name,''),nullif(initiator.email,''),change_set.initiated_by),
    change_set.created_at,destination.destination_key,destination.action_id,destination.status
  FROM public.v5_change_set_destinations destination
  JOIN public.v5_change_sets change_set ON change_set.id=destination.change_set_id
  JOIN public.user_permissions initiator ON initiator.clerk_user_id=change_set.initiated_by
  LEFT JOIN public.authorization_actions action ON action.action_id=destination.action_id
  WHERE destination.status='pending'
    AND change_set.initiated_by IS DISTINCT FROM auth.jwt()->>'sub'
    AND coalesce((public.current_scoped_authorization_decision(destination.action_id,destination.scope_context)->>'allowed')::boolean,false)
  ORDER BY change_set.created_at
  LIMIT least(greatest(coalesce(p_limit,100),1),200)
$function$;

CREATE OR REPLACE FUNCTION public.read_v5_estimate_task_queue(p_limit integer DEFAULT 100)
RETURNS TABLE(
  destination_id uuid,destination_version integer,payload_hash text,submitted_at timestamptz,
  submitted_by text,submitted_by_name text,shared_reason text,target_division text,estimate_name text,
  customer_name text,destination_key text,task_type text,proposed_payload jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $function$
 SELECT destination.id,destination.version,destination.payload_hash,change_set.created_at,change_set.initiated_by,
  coalesce(nullif(initiator.display_name,''),nullif(initiator.email,''),change_set.initiated_by),
  change_set.shared_reason,destination.scope_context->>'division',
  CASE destination.destination_key WHEN 'official_estimate' THEN destination.proposed_payload->>'name'
   WHEN 'shared_assembly' THEN destination.proposed_payload#>>'{assembly,name}'
   ELSE 'Catalogue update' END,
  CASE WHEN destination.destination_key='official_estimate' THEN destination.proposed_payload->>'customer' ELSE NULL END,
  destination.destination_key,
  CASE destination.destination_key WHEN 'official_estimate' THEN 'Estimate review'
   WHEN 'shared_assembly' THEN 'Assembly library review' ELSE 'Catalogue and pricing review' END,
  destination.proposed_payload
 FROM public.v5_change_set_destinations destination
 JOIN public.v5_change_sets change_set ON change_set.id=destination.change_set_id
 JOIN public.user_permissions initiator ON initiator.clerk_user_id=change_set.initiated_by
 WHERE destination.status='pending'
  AND destination.destination_key IN ('official_estimate','shared_assembly','catalogue_updates')
  AND coalesce((public.current_scoped_authorization_decision(destination.action_id,destination.scope_context)->>'allowed')::boolean,false)
 ORDER BY change_set.created_at LIMIT least(greatest(coalesce(p_limit,100),1),200)
$function$;

CREATE OR REPLACE FUNCTION public.apply_v5_estimate_linked_destination(
 p_destination_id uuid,p_expected_version integer,p_expected_payload_hash text,p_note text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE
 actor text:=auth.jwt()->>'sub';destination public.v5_change_set_destinations%ROWTYPE;
 decision jsonb;assembly public.assemblies;patch jsonb;saved public.items;applied jsonb:='{}'::jsonb;
 note text:=nullif(btrim(coalesce(p_note,'')),'');
BEGIN
 IF actor IS NULL OR note IS NULL THEN RAISE EXCEPTION 'Authenticated reviewer and review note are required' USING ERRCODE='22023';END IF;
 SELECT * INTO destination FROM public.v5_change_set_destinations WHERE id=p_destination_id FOR UPDATE;
 IF destination.id IS NULL OR destination.status<>'pending' OR destination.version<>p_expected_version OR destination.payload_hash<>p_expected_payload_hash THEN
  RAISE EXCEPTION 'The reviewed destination changed; reload before applying' USING ERRCODE='40001';END IF;
 IF destination.destination_key NOT IN ('shared_assembly','catalogue_updates') THEN
  RAISE EXCEPTION 'This adapter only applies linked estimating destinations' USING ERRCODE='22023';END IF;
 decision:=public.current_scoped_authorization_decision(destination.action_id,destination.scope_context);
 IF coalesce((decision->>'allowed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Destination application is not authorized' USING ERRCODE='42501',DETAIL=decision::text;END IF;
 IF destination.destination_key='shared_assembly' THEN
  assembly:=public.save_assembly_library(destination.scope_context->>'division',destination.proposed_payload->'assembly',NULL);
  applied:=jsonb_build_object('table','assemblies','id',assembly.id,'name',assembly.name);
 ELSE
  FOR patch IN SELECT value FROM jsonb_array_elements(coalesce(destination.proposed_payload->'updates','[]'::jsonb)) LOOP
   saved:=public.save_material_catalogue_values((patch->>'item_id')::uuid,patch->'changes',(patch->>'expected_updated_at')::timestamptz,NULL);
   applied:=applied||jsonb_build_object(saved.id::text,jsonb_build_object('table','items','id',saved.id));
  END LOOP;
 END IF;
 RETURN public.complete_v5_destination_application(destination.id,destination.version,destination.payload_hash,actor,applied,note);
END $function$;

REVOKE ALL ON FUNCTION public.submit_v5_estimate_for_review(uuid,uuid,integer,text),
  public.read_my_review_task_inbox(integer),public.read_v5_estimate_task_queue(integer),
  public.apply_v5_estimate_linked_destination(uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_v5_estimate_for_review(uuid,uuid,integer,text),
  public.read_my_review_task_inbox(integer),public.read_v5_estimate_task_queue(integer),
  public.apply_v5_estimate_linked_destination(uuid,integer,text,text) TO authenticated;

NOTIFY pgrst,'reload schema';
