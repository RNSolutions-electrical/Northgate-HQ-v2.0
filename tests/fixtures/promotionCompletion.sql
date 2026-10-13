CREATE OR REPLACE FUNCTION public.complete_v5_destination_application(p_destination_id uuid, p_expected_version integer, p_expected_payload_hash text, p_actor text, p_applied_record jsonb, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  destination public.v5_change_set_destinations%ROWTYPE;
  change_set public.v5_change_sets%ROWTYPE;
  aggregate_status text;
BEGIN
  -- Private adapter hook. No client role receives EXECUTE. The owning module
  -- RPC must authorize, apply live writes, and call this before commit.
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM (auth.jwt()->>'sub') OR p_applied_record IS NULL
     OR jsonb_typeof(p_applied_record)<>'object' OR nullif(btrim(coalesce(p_note,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Authenticated adapter actor, applied record, and note are required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO destination FROM public.v5_change_set_destinations WHERE id=p_destination_id FOR UPDATE;
  IF destination.id IS NULL OR destination.status<>'pending'
     OR destination.version<>p_expected_version OR destination.payload_hash<>p_expected_payload_hash THEN
    RAISE EXCEPTION 'Destination is missing, no longer pending, or changed since review' USING ERRCODE='40001';
  END IF;
  UPDATE public.v5_change_set_destinations SET status='applied',reviewed_by=p_actor,reviewed_at=now(),
    review_note=btrim(p_note),applied_record=p_applied_record,applied_at=now(),version=version+1,updated_at=now()
  WHERE id=destination.id RETURNING * INTO destination;
  SELECT * INTO change_set FROM public.v5_change_sets WHERE id=destination.change_set_id FOR UPDATE;
  SELECT CASE WHEN bool_and(status='applied') THEN 'applied' ELSE 'partially_applied' END
  INTO aggregate_status FROM public.v5_change_set_destinations WHERE change_set_id=change_set.id;
  UPDATE public.v5_change_sets SET status=aggregate_status,updated_at=now() WHERE id=change_set.id;
  IF aggregate_status='applied' THEN
    UPDATE public.v5_working_copies SET status='promoted',updated_at=now()
    WHERE id=change_set.working_copy_id;
  END IF;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(p_actor,(SELECT coalesce(nullif(display_name,''),nullif(email,''),p_actor) FROM public.user_permissions WHERE clerk_user_id=p_actor),
    'v5_change_set_destinations',destination.id::text,'update',
    jsonb_build_object('status','pending','version',p_expected_version,'payload_hash',p_expected_payload_hash),
    to_jsonb(destination),btrim(p_note));
  RETURN to_jsonb(destination);
END
$function$

