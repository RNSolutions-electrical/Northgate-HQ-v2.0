-- Complete the v5 material-price workflow: an approved estimate proposal sets
-- the explicit Inventory price, while labor remains an Estimating catalogue value.
CREATE OR REPLACE FUNCTION public.apply_v5_estimate_linked_destination(
 p_destination_id uuid,p_expected_version integer,p_expected_payload_hash text,p_note text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE
 actor text:=auth.jwt()->>'sub';destination public.v5_change_set_destinations%ROWTYPE;
 decision jsonb;assembly public.assemblies;patch jsonb;saved public.items;current_item public.items;
 labor_changes jsonb;applied jsonb:='{}'::jsonb;note text:=nullif(btrim(coalesce(p_note,'')),'');
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
   SELECT * INTO current_item FROM public.items WHERE id=(patch->>'item_id')::uuid FOR UPDATE;
   IF current_item.id IS NULL OR current_item.updated_at IS DISTINCT FROM (patch->>'expected_updated_at')::timestamptz THEN
    RAISE EXCEPTION 'Material pricing changed after submission. Return this review and compare the current value' USING ERRCODE='40001';
   END IF;
   labor_changes:=CASE WHEN patch->'changes'?'labor_rate_hrs'
     THEN jsonb_build_object('labor_rate_hrs',patch->'changes'->'labor_rate_hrs') ELSE '{}'::jsonb END;
   IF labor_changes<>'{}'::jsonb THEN
    saved:=public.save_material_catalogue_values(current_item.id,labor_changes,current_item.updated_at,NULL);
    current_item:=saved;
   END IF;
   IF patch->'changes'?'price_per_unit' THEN
    saved:=public.set_inventory_item_price(current_item.id,(patch->'changes'->>'price_per_unit')::numeric,note);
   ELSE
    saved:=current_item;
   END IF;
   applied:=applied||jsonb_build_object(saved.id::text,jsonb_build_object(
    'table','items','id',saved.id,'effective_price',saved.price_per_unit,'price_source',saved.effective_price_source));
  END LOOP;
 END IF;
 RETURN public.complete_v5_destination_application(destination.id,destination.version,destination.payload_hash,actor,applied,note);
END $function$;

REVOKE ALL ON FUNCTION public.apply_v5_estimate_linked_destination(uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_v5_estimate_linked_destination(uuid,integer,text,text) TO authenticated;

-- V3-012 authorizes the request. V3-013 authorizes reviewing and applying it,
-- so catalogue-price tasks must only appear in Director+ review inboxes.
CREATE OR REPLACE FUNCTION public.v5_destination_review_action(p_destination_key text,p_action_id text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_destination_key='catalogue_updates' THEN 'V3-013' ELSE p_action_id END
$$;
REVOKE ALL ON FUNCTION public.v5_destination_review_action(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v5_destination_review_action(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.read_v5_estimate_task_queue(p_limit integer DEFAULT 100)
RETURNS TABLE(destination_id uuid,destination_version integer,payload_hash text,submitted_at timestamptz,
 submitted_by text,submitted_by_name text,shared_reason text,target_division text,estimate_name text,
 customer_name text,destination_key text,task_type text,proposed_payload jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT destination.id,destination.version,destination.payload_hash,change_set.created_at,change_set.initiated_by,
  coalesce(nullif(initiator.display_name,''),nullif(initiator.email,''),change_set.initiated_by),
  change_set.shared_reason,destination.scope_context->>'division',
  CASE destination.destination_key WHEN 'official_estimate' THEN destination.proposed_payload->>'name'
   WHEN 'shared_assembly' THEN destination.proposed_payload#>>'{assembly,name}' ELSE 'Catalogue update' END,
  CASE WHEN destination.destination_key='official_estimate' THEN destination.proposed_payload->>'customer' ELSE NULL END,
  destination.destination_key,
  CASE destination.destination_key WHEN 'official_estimate' THEN 'Estimate review'
   WHEN 'shared_assembly' THEN 'Assembly library review' ELSE 'Catalogue and pricing review' END,
  destination.proposed_payload
 FROM public.v5_change_set_destinations destination
 JOIN public.v5_change_sets change_set ON change_set.id=destination.change_set_id
 JOIN public.user_permissions initiator ON initiator.clerk_user_id=change_set.initiated_by
 WHERE destination.status='pending' AND destination.destination_key IN ('official_estimate','shared_assembly','catalogue_updates')
  AND coalesce((public.current_scoped_authorization_decision(
   public.v5_destination_review_action(destination.destination_key,destination.action_id),destination.scope_context)->>'allowed')::boolean,false)
 ORDER BY change_set.created_at LIMIT least(greatest(coalesce(p_limit,100),1),200)
$$;

CREATE OR REPLACE FUNCTION public.read_my_review_task_inbox(p_limit integer DEFAULT 100)
RETURNS TABLE(destination_id uuid,destination_version integer,task_type text,module_key text,title text,scope_label text,
 submitted_by text,submitted_by_name text,submitted_at timestamptz,destination_key text,action_id text,status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT destination.id,destination.version,
  CASE destination.destination_key WHEN 'official_estimate' THEN 'Estimate reviews'
   WHEN 'shared_assembly' THEN 'Assembly library reviews' WHEN 'catalogue_updates' THEN 'Catalogue and pricing reviews'
   ELSE coalesce(action.module,'Review tasks') END,
  CASE WHEN destination.destination_key='catalogue_updates' THEN 'inventory'
   WHEN destination.destination_key IN ('official_estimate','shared_assembly') THEN 'estimating'
   ELSE lower(replace(coalesce(action.module,'dashboard'),' ','_')) END,
  CASE destination.destination_key WHEN 'official_estimate' THEN coalesce(destination.proposed_payload->>'name','Untitled estimate')
   WHEN 'shared_assembly' THEN coalesce(destination.proposed_payload#>>'{assembly,name}','Assembly change')
   WHEN 'catalogue_updates' THEN 'Material catalogue update from estimate' ELSE action.description END,
  coalesce(destination.scope_context->>'division',destination.scope_context->>'department'),change_set.initiated_by,
  coalesce(nullif(initiator.display_name,''),nullif(initiator.email,''),change_set.initiated_by),
  change_set.created_at,destination.destination_key,
  public.v5_destination_review_action(destination.destination_key,destination.action_id),destination.status
 FROM public.v5_change_set_destinations destination
 JOIN public.v5_change_sets change_set ON change_set.id=destination.change_set_id
 JOIN public.user_permissions initiator ON initiator.clerk_user_id=change_set.initiated_by
 LEFT JOIN public.authorization_actions action ON action.action_id=destination.action_id
 WHERE destination.status='pending' AND change_set.initiated_by IS DISTINCT FROM auth.jwt()->>'sub'
  AND coalesce((public.current_scoped_authorization_decision(
   public.v5_destination_review_action(destination.destination_key,destination.action_id),destination.scope_context)->>'allowed')::boolean,false)
 ORDER BY change_set.created_at LIMIT least(greatest(coalesce(p_limit,100),1),200)
$$;

REVOKE ALL ON FUNCTION public.read_v5_estimate_task_queue(integer),public.read_my_review_task_inbox(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_v5_estimate_task_queue(integer),public.read_my_review_task_inbox(integer) TO authenticated;
NOTIFY pgrst,'reload schema';
