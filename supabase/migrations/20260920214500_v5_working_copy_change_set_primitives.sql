-- V5 Phase 2 foundation: durable unpublished work and version-bound,
-- destination-specific change requests. These records never mutate live
-- module tables directly. A destination can become applied only through a
-- separately authorized module adapter that calls the private completion RPC
-- in the same transaction as its live writes.

CREATE TABLE public.v5_working_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text NOT NULL REFERENCES public.user_permissions(clerk_user_id),
  module_key text NOT NULL CHECK (module_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  work_type text NOT NULL CHECK (work_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  source_table text,
  source_record_id text,
  source_version text,
  scope_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scope_context) = 'object'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','returned','declined','promoted','archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  archived_at timestamptz,
  UNIQUE (owner_user_id, module_key, work_type, id)
);

CREATE INDEX v5_working_copies_owner_status_idx
  ON public.v5_working_copies(owner_user_id, status, updated_at DESC);

CREATE TABLE public.v5_working_copy_requests (
  owner_user_id text NOT NULL REFERENCES public.user_permissions(clerk_user_id),
  request_id uuid NOT NULL,
  working_copy_id uuid NOT NULL REFERENCES public.v5_working_copies(id),
  request_payload_hash text NOT NULL CHECK (request_payload_hash ~ '^[0-9a-f]{64}$'),
  saved_snapshot jsonb NOT NULL CHECK (jsonb_typeof(saved_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, request_id)
);

CREATE TABLE public.v5_change_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  working_copy_id uuid NOT NULL REFERENCES public.v5_working_copies(id),
  initiated_by text NOT NULL REFERENCES public.user_permissions(clerk_user_id),
  request_id uuid NOT NULL,
  working_copy_version integer NOT NULL CHECK (working_copy_version > 0),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  shared_reason text CHECK (shared_reason IS NULL OR length(btrim(shared_reason)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','partially_applied','applied','returned','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (initiated_by, request_id),
  UNIQUE (working_copy_id, working_copy_version)
);

CREATE INDEX v5_change_sets_initiator_status_idx
  ON public.v5_change_sets(initiated_by, status, created_at DESC);

CREATE TABLE public.v5_change_set_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_set_id uuid NOT NULL REFERENCES public.v5_change_sets(id) ON DELETE RESTRICT,
  destination_key text NOT NULL CHECK (destination_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  action_id text NOT NULL REFERENCES public.authorization_actions(action_id),
  scope_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scope_context) = 'object'),
  proposed_payload jsonb NOT NULL CHECK (jsonb_typeof(proposed_payload) = 'object'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  source_version text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','returned','declined','applied','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(btrim(review_note)) BETWEEN 1 AND 1000),
  applied_record jsonb,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (change_set_id, destination_key),
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND applied_at IS NULL)
    OR (status IN ('returned','declined') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND applied_at IS NULL)
    OR (status = 'applied' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND applied_at IS NOT NULL)
    OR status = 'cancelled'
  )
);

CREATE INDEX v5_change_set_destinations_review_idx
  ON public.v5_change_set_destinations(status, action_id, created_at);

CREATE TABLE public.v5_change_set_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id uuid NOT NULL REFERENCES public.v5_change_set_destinations(id) ON DELETE RESTRICT,
  item_key text NOT NULL CHECK (length(btrim(item_key)) BETWEEN 1 AND 200),
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (destination_id, item_key),
  CHECK (before_value IS DISTINCT FROM after_value)
);

ALTER TABLE public.v5_working_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v5_working_copy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v5_change_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v5_change_set_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v5_change_set_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.v5_working_copies, public.v5_working_copy_requests, public.v5_change_sets,
  public.v5_change_set_destinations, public.v5_change_set_items
FROM PUBLIC, anon, authenticated;

CREATE POLICY v5_working_copies_no_direct_client_access ON public.v5_working_copies
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY v5_working_copy_requests_no_direct_client_access ON public.v5_working_copy_requests
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY v5_change_sets_no_direct_client_access ON public.v5_change_sets
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY v5_change_set_destinations_no_direct_client_access ON public.v5_change_set_destinations
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY v5_change_set_items_no_direct_client_access ON public.v5_change_set_items
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE FUNCTION public.v5_payload_hash(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT encode(extensions.digest(p_payload::text, 'sha256'), 'hex')
$function$;

CREATE FUNCTION public.save_v5_working_copy(
  p_request_id uuid,
  p_working_copy_id uuid,
  p_expected_version integer,
  p_module_key text,
  p_work_type text,
  p_scope_context jsonb,
  p_payload jsonb,
  p_source_table text DEFAULT NULL,
  p_source_record_id text DEFAULT NULL,
  p_source_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  decision jsonb;
  target public.v5_working_copies%ROWTYPE;
  prior_request public.v5_working_copy_requests%ROWTYPE;
  prior jsonb;
  request_payload_hash text;
BEGIN
  decision := public.current_scoped_authorization_decision('V3-006', '{}'::jsonb);
  IF COALESCE((decision->>'allowed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Durable unpublished work is not authorized' USING ERRCODE = '42501', DETAIL = decision::text;
  END IF;
  IF p_request_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR p_scope_context IS NULL OR jsonb_typeof(p_scope_context) <> 'object'
     OR p_module_key IS NULL OR p_module_key !~ '^[a-z][a-z0-9_]{1,63}$'
     OR p_work_type IS NULL OR p_work_type !~ '^[a-z][a-z0-9_]{1,63}$' THEN
    RAISE EXCEPTION 'A request id, valid module/work type, scope object, and payload object are required' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(p_payload) > 1048576 OR pg_column_size(p_scope_context) > 65536 THEN
    RAISE EXCEPTION 'Working-copy payload or scope is too large' USING ERRCODE = '22023';
  END IF;
  request_payload_hash := public.v5_payload_hash(jsonb_build_object(
    'working_copy_id',p_working_copy_id,'expected_version',p_expected_version,
    'module_key',p_module_key,'work_type',p_work_type,'scope_context',p_scope_context,
    'payload',p_payload,'source_table',p_source_table,'source_record_id',p_source_record_id,
    'source_version',p_source_version
  ));
  SELECT * INTO prior_request FROM public.v5_working_copy_requests
  WHERE owner_user_id=actor AND request_id=p_request_id;
  IF prior_request.request_id IS NOT NULL THEN
    IF prior_request.request_payload_hash<>request_payload_hash THEN
      RAISE EXCEPTION 'Request id was already used for different working-copy content' USING ERRCODE='22023';
    END IF;
    RETURN prior_request.saved_snapshot||jsonb_build_object('idempotent',true);
  END IF;
  IF p_working_copy_id IS NULL THEN
    INSERT INTO public.v5_working_copies(
      owner_user_id,module_key,work_type,source_table,source_record_id,source_version,
      scope_context,payload,payload_hash
    ) VALUES (
      actor,p_module_key,p_work_type,nullif(btrim(p_source_table),''),nullif(btrim(p_source_record_id),''),
      nullif(btrim(p_source_version),''),p_scope_context,p_payload,public.v5_payload_hash(p_payload)
    ) RETURNING * INTO target;
    INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
    VALUES(actor,(SELECT coalesce(nullif(display_name,''),nullif(email,''),actor) FROM public.user_permissions WHERE clerk_user_id=actor),
      'v5_working_copies',target.id::text,'create',to_jsonb(target),'Durable unpublished work saved.');
  ELSE
    SELECT * INTO target FROM public.v5_working_copies
    WHERE id=p_working_copy_id AND owner_user_id=actor FOR UPDATE;
    IF target.id IS NULL THEN RAISE EXCEPTION 'Working copy was not found in the current user scope' USING ERRCODE='P0002'; END IF;
    IF target.status NOT IN ('draft','returned','declined') THEN
      RAISE EXCEPTION 'This working copy cannot be edited in its current state' USING ERRCODE='55000';
    END IF;
    IF p_expected_version IS NULL OR target.version <> p_expected_version THEN
      RAISE EXCEPTION 'Working copy changed; reload before saving' USING ERRCODE='40001';
    END IF;
    prior := to_jsonb(target);
    UPDATE public.v5_working_copies SET
      module_key=p_module_key,work_type=p_work_type,source_table=nullif(btrim(p_source_table),''),
      source_record_id=nullif(btrim(p_source_record_id),''),source_version=nullif(btrim(p_source_version),''),
      scope_context=p_scope_context,payload=p_payload,payload_hash=public.v5_payload_hash(p_payload),
      status='draft',version=version+1,updated_at=now(),submitted_at=NULL
    WHERE id=target.id RETURNING * INTO target;
    INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
    VALUES(actor,(SELECT coalesce(nullif(display_name,''),nullif(email,''),actor) FROM public.user_permissions WHERE clerk_user_id=actor),
      'v5_working_copies',target.id::text,'update',prior,to_jsonb(target),'Durable unpublished work saved.');
  END IF;
  INSERT INTO public.v5_working_copy_requests(
    owner_user_id,request_id,working_copy_id,request_payload_hash,saved_snapshot
  ) VALUES(actor,p_request_id,target.id,request_payload_hash,to_jsonb(target));
  RETURN to_jsonb(target)||jsonb_build_object('idempotent',false);
END
$function$;

CREATE FUNCTION public.read_my_v5_working_copies(
  p_module_key text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.v5_working_copies
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT copy.* FROM public.v5_working_copies copy
  WHERE copy.owner_user_id = auth.jwt()->>'sub'
    AND COALESCE((public.current_scoped_authorization_decision('V3-006','{}'::jsonb)->>'allowed')::boolean,false)
    AND (p_module_key IS NULL OR copy.module_key = p_module_key)
  ORDER BY copy.updated_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),200)
$function$;

CREATE FUNCTION public.submit_v5_working_copy(
  p_request_id uuid,
  p_working_copy_id uuid,
  p_expected_version integer,
  p_destinations jsonb,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  decision jsonb;
  copy public.v5_working_copies%ROWTYPE;
  change_set public.v5_change_sets%ROWTYPE;
  destination jsonb;
  destination_key text;
  destination_action text;
  destination_context jsonb;
  destination_payload jsonb;
  destination_source_version text;
  saved_destination public.v5_change_set_destinations%ROWTYPE;
  changed_item jsonb;
  changed_items jsonb;
  normalized_reason text := nullif(btrim(coalesce(p_reason,'')),'');
BEGIN
  decision := public.current_scoped_authorization_decision('V3-007', '{}'::jsonb);
  IF COALESCE((decision->>'allowed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Submission is not authorized' USING ERRCODE='42501', DETAIL=decision::text;
  END IF;
  IF p_request_id IS NULL OR p_working_copy_id IS NULL OR jsonb_typeof(p_destinations) <> 'array'
     OR jsonb_array_length(p_destinations) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'A request id, working copy, and one to ten destinations are required' USING ERRCODE='22023';
  END IF;
  IF normalized_reason IS NOT NULL AND length(normalized_reason)>1000 THEN
    RAISE EXCEPTION 'Reason must be 1000 characters or fewer' USING ERRCODE='22023';
  END IF;
  SELECT * INTO change_set FROM public.v5_change_sets WHERE initiated_by=actor AND request_id=p_request_id;
  IF change_set.id IS NOT NULL THEN
    IF change_set.working_copy_id<>p_working_copy_id OR change_set.working_copy_version<>p_expected_version THEN
      RAISE EXCEPTION 'Request id was already used for a different submission' USING ERRCODE='22023';
    END IF;
    RETURN to_jsonb(change_set)||jsonb_build_object('idempotent',true);
  END IF;
  SELECT * INTO copy FROM public.v5_working_copies
  WHERE id=p_working_copy_id AND owner_user_id=actor FOR UPDATE;
  IF copy.id IS NULL THEN RAISE EXCEPTION 'Working copy was not found in the current user scope' USING ERRCODE='P0002'; END IF;
  IF copy.status <> 'draft' OR copy.version <> p_expected_version THEN
    RAISE EXCEPTION 'Only the exact current draft version can be submitted' USING ERRCODE='40001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_destinations) item
    GROUP BY item->>'destination_key' HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'Destination keys must be unique within one save' USING ERRCODE='22023'; END IF;
  INSERT INTO public.v5_change_sets(
    working_copy_id,initiated_by,request_id,working_copy_version,payload_hash,shared_reason
  ) VALUES(copy.id,actor,p_request_id,copy.version,copy.payload_hash,normalized_reason)
  RETURNING * INTO change_set;
  FOR destination IN SELECT value FROM jsonb_array_elements(p_destinations) LOOP
    destination_key := destination->>'destination_key';
    destination_action := destination->>'action_id';
    destination_context := COALESCE(destination->'context','{}'::jsonb);
    destination_payload := COALESCE(destination->'payload',copy.payload);
    destination_source_version := COALESCE(nullif(destination->>'source_version',''),copy.source_version);
    changed_items := COALESCE(destination->'items','[]'::jsonb);
    IF destination_key IS NULL OR destination_key !~ '^[a-z][a-z0-9_]{1,63}$'
       OR destination_action IS NULL OR jsonb_typeof(destination_context)<>'object'
       OR jsonb_typeof(destination_payload)<>'object' OR jsonb_typeof(changed_items)<>'array'
       OR jsonb_array_length(changed_items)>500 OR pg_column_size(destination_payload)>1048576
       OR NOT EXISTS(SELECT 1 FROM public.authorization_actions action WHERE action.action_id=destination_action AND action.is_active) THEN
      RAISE EXCEPTION 'Each destination requires a unique key, active action id, bounded payload/items, and context object' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.v5_change_set_destinations(
      change_set_id,destination_key,action_id,scope_context,proposed_payload,payload_hash,source_version
    ) VALUES(change_set.id,destination_key,destination_action,destination_context,destination_payload,
      public.v5_payload_hash(destination_payload),destination_source_version)
    RETURNING * INTO saved_destination;
    FOR changed_item IN SELECT value FROM jsonb_array_elements(changed_items) LOOP
      IF nullif(btrim(changed_item->>'item_key'),'') IS NULL
         OR length(btrim(changed_item->>'item_key'))>200
         OR NOT (changed_item ? 'before_value') OR NOT (changed_item ? 'after_value')
         OR changed_item->'before_value' IS NOT DISTINCT FROM changed_item->'after_value' THEN
        RAISE EXCEPTION 'Every changed item needs a unique key and distinct before/after values' USING ERRCODE='22023';
      END IF;
      INSERT INTO public.v5_change_set_items(destination_id,item_key,before_value,after_value)
      VALUES(saved_destination.id,btrim(changed_item->>'item_key'),changed_item->'before_value',changed_item->'after_value');
      INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
      VALUES(actor,(SELECT coalesce(nullif(display_name,''),nullif(email,''),actor) FROM public.user_permissions WHERE clerk_user_id=actor),
        'v5_change_set_items',saved_destination.id::text||':'||btrim(changed_item->>'item_key'),'create',
        changed_item->'before_value',changed_item->'after_value',
        coalesce(normalized_reason,'Change proposed as part of one master save.'));
    END LOOP;
  END LOOP;
  UPDATE public.v5_working_copies SET status='submitted',submitted_at=now(),updated_at=now()
  WHERE id=copy.id;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,(SELECT coalesce(nullif(display_name,''),nullif(email,''),actor) FROM public.user_permissions WHERE clerk_user_id=actor),
    'v5_change_sets',change_set.id::text,'create',jsonb_build_object('working_copy_version',copy.version,'status','draft'),
    to_jsonb(change_set),coalesce(normalized_reason,'Unpublished work submitted for review.'));
  RETURN to_jsonb(change_set)||jsonb_build_object('idempotent',false);
END
$function$;

CREATE FUNCTION public.read_v5_change_destination(p_destination_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  destination public.v5_change_set_destinations%ROWTYPE;
  change_set public.v5_change_sets%ROWTYPE;
  decision jsonb;
BEGIN
  IF COALESCE((public.current_scoped_authorization_decision('V3-006','{}'::jsonb)->>'allowed')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Working-copy access is not authorized' USING ERRCODE='42501';
  END IF;
  SELECT * INTO destination FROM public.v5_change_set_destinations WHERE id=p_destination_id;
  IF destination.id IS NULL THEN RAISE EXCEPTION 'Destination was not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO change_set FROM public.v5_change_sets WHERE id=destination.change_set_id;
  IF change_set.initiated_by <> actor THEN
    decision := public.current_scoped_authorization_decision(destination.action_id,destination.scope_context);
    IF COALESCE((decision->>'allowed')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Destination is outside the current user scope' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN jsonb_build_object('change_set',to_jsonb(change_set),'destination',to_jsonb(destination),
    'items',COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.item_key) FROM public.v5_change_set_items item WHERE item.destination_id=destination.id),'[]'::jsonb));
END
$function$;

CREATE FUNCTION public.review_v5_change_destination(
  p_destination_id uuid,
  p_expected_version integer,
  p_expected_payload_hash text,
  p_decision text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  destination public.v5_change_set_destinations%ROWTYPE;
  change_set public.v5_change_sets%ROWTYPE;
  authorization_result jsonb;
  normalized_note text := nullif(btrim(coalesce(p_note,'')),'');
  aggregate_status text;
BEGIN
  IF p_decision NOT IN ('return','decline') OR normalized_note IS NULL OR length(normalized_note)>1000 THEN
    RAISE EXCEPTION 'Return or decline and a note of 1 to 1000 characters are required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO destination FROM public.v5_change_set_destinations WHERE id=p_destination_id FOR UPDATE;
  IF destination.id IS NULL THEN RAISE EXCEPTION 'Destination was not found' USING ERRCODE='P0002'; END IF;
  IF destination.status <> 'pending' OR destination.version<>p_expected_version OR destination.payload_hash<>p_expected_payload_hash THEN
    RAISE EXCEPTION 'The reviewed destination changed; reload before deciding' USING ERRCODE='40001';
  END IF;
  authorization_result := public.current_scoped_authorization_decision(destination.action_id,destination.scope_context);
  IF COALESCE((authorization_result->>'allowed')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Destination review is not authorized' USING ERRCODE='42501', DETAIL=authorization_result::text;
  END IF;
  UPDATE public.v5_change_set_destinations SET
    status=CASE p_decision WHEN 'return' THEN 'returned' ELSE 'declined' END,
    reviewed_by=actor,reviewed_at=now(),review_note=normalized_note,version=version+1,updated_at=now()
  WHERE id=destination.id RETURNING * INTO destination;
  SELECT * INTO change_set FROM public.v5_change_sets WHERE id=destination.change_set_id FOR UPDATE;
  SELECT CASE
    WHEN bool_and(status='declined') THEN 'declined'
    WHEN bool_or(status='returned') THEN 'returned'
    WHEN bool_and(status='applied') THEN 'applied'
    WHEN bool_or(status='applied') THEN 'partially_applied'
    ELSE 'pending' END
  INTO aggregate_status FROM public.v5_change_set_destinations WHERE change_set_id=change_set.id;
  UPDATE public.v5_change_sets SET status=aggregate_status,updated_at=now() WHERE id=change_set.id;
  UPDATE public.v5_working_copies SET status=destination.status,updated_at=now()
  WHERE id=change_set.working_copy_id AND destination.status IN ('returned','declined');
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,(SELECT coalesce(nullif(display_name,''),nullif(email,''),actor) FROM public.user_permissions WHERE clerk_user_id=actor),
    'v5_change_set_destinations',destination.id::text,CASE WHEN p_decision='decline' THEN 'deny' ELSE 'update' END,
    jsonb_build_object('status','pending','version',p_expected_version,'payload_hash',p_expected_payload_hash),to_jsonb(destination),normalized_note);
  RETURN to_jsonb(destination);
END
$function$;

CREATE FUNCTION public.complete_v5_destination_application(
  p_destination_id uuid,
  p_expected_version integer,
  p_expected_payload_hash text,
  p_actor text,
  p_applied_record jsonb,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
$function$;

REVOKE ALL ON FUNCTION public.v5_payload_hash(jsonb),
  public.save_v5_working_copy(uuid,uuid,integer,text,text,jsonb,jsonb,text,text,text),
  public.read_my_v5_working_copies(text,integer),
  public.submit_v5_working_copy(uuid,uuid,integer,jsonb,text),
  public.read_v5_change_destination(uuid),
  public.review_v5_change_destination(uuid,integer,text,text,text),
  public.complete_v5_destination_application(uuid,integer,text,text,jsonb,text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.save_v5_working_copy(uuid,uuid,integer,text,text,jsonb,jsonb,text,text,text),
  public.read_my_v5_working_copies(text,integer),
  public.submit_v5_working_copy(uuid,uuid,integer,jsonb,text),
  public.read_v5_change_destination(uuid),
  public.review_v5_change_destination(uuid,integer,text,text,text)
TO authenticated;

NOTIFY pgrst, 'reload schema';
