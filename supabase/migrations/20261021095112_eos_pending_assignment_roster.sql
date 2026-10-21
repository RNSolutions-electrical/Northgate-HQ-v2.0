-- STAGING ONLY: assignment eligibility is separate from authentication/access.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.eos_scorecard_save_metric_v1(jsonb,uuid)'::regprocedure))<>'091eabd5be929dce881c212cc09c234d'
 OR md5(pg_get_functiondef('public.eos_save_pursuit(uuid,jsonb,text[])'::regprocedure))<>'2bcc153b0351c07a94e96986ba5ee62e'
 OR md5(pg_get_functiondef('public.eos_save_pursuit_v1(uuid,jsonb,text[],timestamptz,uuid)'::regprocedure))<>'3b009e7ceb9b8b0c13a3c4019a79058d'
 THEN RAISE EXCEPTION 'Assignment contract drift; stop and review'; END IF;
END $$;
CREATE TABLE eos_private.assignment_people(
 id uuid PRIMARY KEY, display_name text NOT NULL CHECK(btrim(display_name)<>''), contact_email text UNIQUE,
 employee_profile_id uuid UNIQUE REFERENCES public.employee_profiles(id),
 verified_user_id text UNIQUE REFERENCES public.user_permissions(clerk_user_id) CHECK(verified_user_id IS NULL),
 enabled boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1
);
COMMENT ON COLUMN eos_private.assignment_people.verified_user_id IS 'Reserved. Linking is disabled until a separately reviewed verified-identity flow is approved. No email-based automatic linking.';
CREATE TABLE eos_private.assignment_accounts(user_id text PRIMARY KEY REFERENCES public.user_permissions(clerk_user_id),display_name text NOT NULL,enabled boolean NOT NULL,revision integer NOT NULL);
CREATE TABLE eos_private.pursuit_people(pursuit_id uuid NOT NULL REFERENCES public.eos_pursuits(id) ON DELETE CASCADE,person_id uuid NOT NULL REFERENCES eos_private.assignment_people(id),PRIMARY KEY(pursuit_id,person_id));
ALTER TABLE eos_private.assignment_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE eos_private.assignment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE eos_private.pursuit_people ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON eos_private.assignment_people,eos_private.assignment_accounts,eos_private.pursuit_people FROM PUBLIC,anon,authenticated;

CREATE FUNCTION eos_private.can_maintain_roster() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
 SELECT public.current_user_can_manage_eos() AND EXISTS(SELECT 1 FROM public.user_permissions u WHERE u.clerk_user_id=auth.jwt()->>'sub' AND u.is_active AND coalesce((public.effective_permissions_for_user(u.role,u.division,u.permission_overrides)->>'can_manage_employees')::boolean,false));
$$;
CREATE FUNCTION eos_private.assignment_eligible(p_id text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
BEGIN
 IF p_id LIKE 'person:%' THEN
  IF substring(p_id from 8) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM eos_private.assignment_people WHERE id=substring(p_id from 8)::uuid AND enabled AND (employee_profile_id IS NULL OR EXISTS(SELECT 1 FROM public.employee_profiles ep WHERE ep.id=employee_profile_id AND ep.archived_at IS NULL AND ep.clerk_user_id IS NULL)));
 END IF;
 RETURN EXISTS(SELECT 1 FROM public.user_permissions u LEFT JOIN public.eos_access_grants g ON g.user_id=u.clerk_user_id LEFT JOIN eos_private.assignment_accounts a ON a.user_id=u.clerk_user_id WHERE u.clerk_user_id=p_id AND u.is_active AND coalesce(a.enabled,g.user_id IS NOT NULL) AND NOT public.is_protected_account(u.clerk_user_id));
END $$;
CREATE FUNCTION eos_private.assignment_label(p_id text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
BEGIN
 IF p_id LIKE 'person:%' THEN
  IF substring(p_id from 8) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NULL; END IF;
  RETURN (SELECT display_name FROM eos_private.assignment_people WHERE id=substring(p_id from 8)::uuid);
 END IF;
 RETURN (SELECT coalesce(nullif(a.display_name,''),nullif(u.display_name,''),u.email,u.clerk_user_id) FROM public.user_permissions u LEFT JOIN eos_private.assignment_accounts a ON a.user_id=u.clerk_user_id WHERE u.clerk_user_id=p_id);
END $$;
CREATE FUNCTION public.eos_assignment_roster_read_v1(p_snapshot bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE rows jsonb; maintain boolean; current_snapshot bigint;
BEGIN
 IF NOT public.current_user_can_manage_eos() THEN RAISE EXCEPTION 'EOS membership required' USING ERRCODE='42501'; END IF;
 SELECT revision INTO current_snapshot FROM eos_private.clock WHERE id;
 IF p_snapshot IS NOT NULL AND p_snapshot<>current_snapshot THEN RAISE EXCEPTION 'Scorecard changed; reload roster' USING ERRCODE='PT409'; END IF;
 maintain:=eos_private.can_maintain_roster();
 SELECT coalesce(jsonb_agg(item ORDER BY item->>'display_name'),'[]') INTO rows FROM (
  SELECT jsonb_build_object('user_id',u.user_id,'display_name',coalesce(a.display_name,u.display_name),'is_active',u.is_active,'is_member',u.is_member,'can_assign',eos_private.assignment_eligible(u.user_id),'kind','account','revision',coalesce(a.revision,0),'enabled',coalesce(a.enabled,true),'protected',public.is_protected_account(u.user_id)) item
   FROM (SELECT * FROM public.eos_member_directory_v1() UNION ALL SELECT u.clerk_user_id,coalesce(nullif(u.display_name,''),u.email,u.clerk_user_id),u.is_active,EXISTS(SELECT 1 FROM public.eos_access_grants g WHERE g.user_id=u.clerk_user_id) FROM public.user_permissions u JOIN eos_private.assignment_accounts a ON a.user_id=u.clerk_user_id WHERE NOT EXISTS(SELECT 1 FROM public.eos_member_directory_v1() m WHERE m.user_id=u.clerk_user_id)) u LEFT JOIN eos_private.assignment_accounts a ON a.user_id=u.user_id
  UNION ALL
  SELECT jsonb_build_object('user_id','person:'||id,'display_name',display_name,'is_active',enabled,'is_member',false,'can_assign',eos_private.assignment_eligible('person:'||id),'kind','person','revision',revision,'enabled',enabled,'pending',true,'contact_email',CASE WHEN maintain THEN contact_email ELSE NULL END,'employee_profile_id',employee_profile_id) FROM eos_private.assignment_people
 ) all_rows;
 RETURN jsonb_build_object('rows',rows,'can_manage',maintain,'snapshot',current_snapshot,
 'accounts',CASE WHEN maintain THEN coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',u.clerk_user_id,'display_name',coalesce(nullif(u.display_name,''),u.email,u.clerk_user_id),'email',u.email)) FROM public.user_permissions u WHERE u.is_active AND NOT public.is_protected_account(u.clerk_user_id) AND NOT EXISTS(SELECT 1 FROM public.eos_member_directory_v1() m WHERE m.user_id=u.clerk_user_id) AND NOT EXISTS(SELECT 1 FROM eos_private.assignment_accounts a WHERE a.user_id=u.clerk_user_id)),'[]') ELSE '[]'::jsonb END,
 'profiles',CASE WHEN maintain THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name)) FROM public.employee_profiles p WHERE p.archived_at IS NULL AND p.clerk_user_id IS NULL AND NOT EXISTS(SELECT 1 FROM eos_private.assignment_people a WHERE a.employee_profile_id=p.id)),'[]') ELSE '[]'::jsonb END,
 'pursuit_people',coalesce((SELECT jsonb_agg(jsonb_build_object('pursuit_id',pursuit_id,'user_id','person:'||person_id)) FROM eos_private.pursuit_people),'[]'));
END $$;
CREATE FUNCTION public.eos_assignment_roster_save_v1(p_input jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
<<roster_save>>
DECLARE body jsonb:=jsonb_build_array('assignment_roster',p_input); result jsonb; old jsonb; saved jsonb; target uuid; profile_id uuid; label text:=nullif(btrim(p_input->>'display_name'),''); email text:=nullif(lower(btrim(p_input->>'contact_email')),''); enabled boolean; rev integer;
BEGIN
 IF NOT eos_private.can_maintain_roster() THEN RAISE EXCEPTION 'EOS and employee management permission required' USING ERRCODE='42501'; END IF;
 result:=eos_private.begin_write(p_request_id,body);IF result IS NOT NULL THEN RETURN result; END IF;
 IF label IS NULL OR length(label)>160 OR coalesce(p_input->>'expected_revision','') !~ '^[0-9]{1,8}$' OR jsonb_typeof(p_input->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Name, enabled status and revision required' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k NOT IN ('kind','id','user_id','display_name','contact_email','employee_profile_id','enabled','expected_revision','verified_user_id','linked_user_id')) THEN RAISE EXCEPTION 'Unknown roster field'; END IF;
 IF lower(label) IN ('developer','crncmk') OR EXISTS(SELECT 1 FROM public.user_permissions u WHERE public.is_protected_account(u.clerk_user_id) AND lower(label) IN (lower(u.email),lower(u.display_name))) THEN RAISE EXCEPTION 'Protected Developer identity is nonassignable'; END IF;
 IF p_input ? 'verified_user_id' OR p_input ? 'linked_user_id' THEN RAISE EXCEPTION 'Verified account linking is not enabled' USING ERRCODE='22023'; END IF;
 enabled:=(p_input->>'enabled')::boolean;
 IF p_input->>'kind'='account' THEN
  IF NOT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=p_input->>'user_id') THEN RAISE EXCEPTION 'Choose an existing account'; END IF;
  IF public.is_protected_account(p_input->>'user_id') THEN RAISE EXCEPTION 'Protected Developer identity is nonassignable'; END IF;
  SELECT to_jsonb(a) INTO old FROM eos_private.assignment_accounts a WHERE user_id=p_input->>'user_id';
  IF coalesce((old->>'revision')::integer,0)<>(p_input->>'expected_revision')::integer THEN RAISE EXCEPTION 'Conflict: roster record changed' USING ERRCODE='PT409'; END IF;
  rev:=coalesce((old->>'revision')::integer,0)+1;
  INSERT INTO eos_private.assignment_accounts VALUES(p_input->>'user_id',label,enabled,rev) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,enabled=excluded.enabled,revision=excluded.revision RETURNING to_jsonb(assignment_accounts) INTO saved;
 ELSE
  IF p_input->>'kind' IS DISTINCT FROM 'person' OR coalesce(p_input->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Valid person identity required' USING ERRCODE='22023'; END IF;
  target:=(p_input->>'id')::uuid;
  IF email IS NOT NULL AND (length(email)>254 OR email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$') THEN RAISE EXCEPTION 'Valid optional contact email required'; END IF;
  SELECT to_jsonb(p) INTO old FROM eos_private.assignment_people p WHERE id=target;
  IF email IS NOT NULL AND email IS DISTINCT FROM old->>'contact_email' AND EXISTS(SELECT 1 FROM public.user_permissions WHERE lower(roster_save.email)=lower(user_permissions.email)) THEN RAISE EXCEPTION 'Contact email already belongs to an account; choose its existing account identity'; END IF;
  IF coalesce((old->>'revision')::integer,0)<>(p_input->>'expected_revision')::integer THEN RAISE EXCEPTION 'Conflict: roster record changed' USING ERRCODE='PT409'; END IF;
  IF old IS NOT NULL AND nullif(p_input->>'employee_profile_id','') IS DISTINCT FROM old->>'employee_profile_id' THEN RAISE EXCEPTION 'Existing person source identity cannot be replaced'; END IF;
  IF nullif(p_input->>'employee_profile_id','') IS NOT NULL THEN
   IF p_input->>'employee_profile_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Valid source profile identity required'; END IF;
   profile_id:=(p_input->>'employee_profile_id')::uuid;
   IF old IS NULL AND NOT EXISTS(SELECT 1 FROM public.employee_profiles ep WHERE ep.id=profile_id AND ep.archived_at IS NULL AND ep.clerk_user_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.user_permissions u WHERE lower(u.email)=lower(ep.email))) THEN RAISE EXCEPTION 'Active source profile required'; END IF;
  END IF;
  IF email IS NOT NULL AND EXISTS(SELECT 1 FROM eos_private.assignment_people p WHERE p.contact_email=roster_save.email AND p.id<>target) THEN RAISE EXCEPTION 'A roster person already uses this contact email'; END IF;
  IF profile_id IS NOT NULL AND EXISTS(SELECT 1 FROM eos_private.assignment_people p WHERE p.employee_profile_id=profile_id AND p.id<>target) THEN RAISE EXCEPTION 'This employee profile already has a roster person'; END IF;
  rev:=coalesce((old->>'revision')::integer,0)+1;
  INSERT INTO eos_private.assignment_people(id,display_name,contact_email,employee_profile_id,enabled,revision) VALUES(target,label,email,profile_id,enabled,rev)
  ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,contact_email=excluded.contact_email,enabled=excluded.enabled,revision=excluded.revision RETURNING to_jsonb(assignment_people) INTO saved;
 END IF;
 PERFORM eos_private.audit('assignment_roster',coalesce(p_input->>'user_id',p_input->>'id'),old-'contact_email',(saved-'contact_email')||jsonb_build_object('contact_changed',(old->>'contact_email') IS DISTINCT FROM (saved->>'contact_email')));
 RETURN eos_private.finish_write(p_request_id,body,saved);
END $$;
CREATE FUNCTION public.eos_save_pursuit_v2(p_id uuid,p_data jsonb,p_manager_ids text[],p_expected_updated_at timestamptz,p_request_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,eos_private,pg_temp AS $$
DECLARE body jsonb:=jsonb_build_array('pursuit_v2',p_id,p_data,p_manager_ids,p_expected_updated_at); cached jsonb; saved uuid; ref text; account_ids text[]:=ARRAY[]::text[]; people uuid[]:=ARRAY[]::uuid[]; prior jsonb; after_people jsonb;
BEGIN
 cached:=eos_private.begin_write(p_request_id,body); IF cached IS NOT NULL THEN RETURN (cached#>>'{}')::uuid; END IF;
 IF cardinality(p_manager_ids)>100 OR cardinality(p_manager_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_manager_ids)x) THEN RAISE EXCEPTION 'Duplicate or excessive manager identities'; END IF;
 FOREACH ref IN ARRAY coalesce(p_manager_ids,ARRAY[]::text[]) LOOP
  IF ref LIKE 'person:%' THEN
   IF substring(ref from 8) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid person identity' USING ERRCODE='22023'; END IF;
   IF NOT eos_private.assignment_eligible(ref) AND NOT EXISTS(SELECT 1 FROM eos_private.pursuit_people WHERE pursuit_id=p_id AND person_id=substring(ref from 8)::uuid) THEN RAISE EXCEPTION 'Choose an eligible roster person'; END IF;
   people:=array_append(people,substring(ref from 8)::uuid);
  ELSE
   IF NOT eos_private.assignment_eligible(ref) AND NOT EXISTS(SELECT 1 FROM public.eos_pursuit_managers WHERE pursuit_id=p_id AND user_id=ref) THEN RAISE EXCEPTION 'Choose an eligible manager account'; END IF;
   account_ids:=array_append(account_ids,ref);
  END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(person_id ORDER BY person_id),'[]') INTO prior FROM eos_private.pursuit_people WHERE pursuit_id=p_id;
 saved:=public.eos_save_pursuit_v1(p_id,p_data,account_ids,p_expected_updated_at,gen_random_uuid());
 DELETE FROM eos_private.pursuit_people WHERE pursuit_id=saved AND person_id<>ALL(people);
 INSERT INTO eos_private.pursuit_people SELECT saved,unnest(people) ON CONFLICT DO NOTHING;
 SELECT coalesce(jsonb_agg(person_id ORDER BY person_id),'[]') INTO after_people FROM eos_private.pursuit_people WHERE pursuit_id=saved;
 IF prior IS DISTINCT FROM after_people THEN PERFORM eos_private.audit('pursuit_people',saved::text,prior,after_people); END IF;
 PERFORM eos_private.finish_write(p_request_id,body,to_jsonb(saved)); RETURN saved;
END $$;
REVOKE ALL ON FUNCTION eos_private.can_maintain_roster(),eos_private.assignment_eligible(text),eos_private.assignment_label(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.eos_assignment_roster_read_v1(bigint),public.eos_assignment_roster_save_v1(jsonb,uuid),public.eos_save_pursuit_v2(uuid,jsonb,text[],timestamptz,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.eos_assignment_roster_read_v1(bigint),public.eos_assignment_roster_save_v1(jsonb,uuid),public.eos_save_pursuit_v2(uuid,jsonb,text[],timestamptz,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.eos_scorecard_save_metric_v1(p_input jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'eos_private', 'pg_temp'
AS $function$
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
 IF owner_id IS NOT NULL AND owner_id IS DISTINCT FROM prior->>'owner_id' AND NOT eos_private.assignment_eligible(owner_id) THEN RAISE EXCEPTION 'Choose an eligible roster owner'; END IF;
 owner_name:=eos_private.assignment_label(owner_id);
 goal:=CASE WHEN nullif(d->>'goal','') IS NULL THEN 'null'::jsonb WHEN unit='text' THEN to_jsonb(d->>'goal') ELSE to_jsonb((d->>'goal')::numeric) END;
 IF unit='percent' AND ((goal#>>'{}')::numeric<0 OR (goal#>>'{}')::numeric>100) OR unit='count' AND (goal#>>'{}')::numeric<>trunc((goal#>>'{}')::numeric) THEN RAISE EXCEPTION 'Invalid goal type/scale'; END IF;
 rev:=coalesce((old->>'revision')::integer,0)+1;
 result:=jsonb_build_object('id',p_input->>'id','revision',rev,'retired',coalesce((p_input->>'retired')::boolean,false));
 INSERT INTO public.eos_scorecard_metrics VALUES((p_input->>'id')::uuid,result) ON CONFLICT(id) DO UPDATE SET data=excluded.data;
 d:=jsonb_build_object('id',(p_input->>'id')||':v'||rev,'metric_id',p_input->>'id','revision',rev,'name',btrim(d->>'name'),'context',d->>'context','effective_from',d->>'effective_from','category_id',d->>'category_id','category_label',cat,'owner_id',coalesce(owner_id,''),'owner_label',coalesce(owner_name,prior->>'owner_label',''),'unit',unit,'goal',goal,'window',d->>'window','carry',d->>'carry','aggregation',d->>'aggregation','recorded_at',clock_timestamp());
 INSERT INTO public.eos_scorecard_definitions VALUES(d->>'id',(p_input->>'id')::uuid,(d->>'effective_from')::date,rev,d);
 PERFORM eos_private.audit('metric',p_input->>'id',jsonb_build_object('metric',old,'definition',prior),jsonb_build_object('metric',result,'definition',d));
 RETURN eos_private.finish_write(p_request_id,body,result);
END $function$
;
CREATE OR REPLACE FUNCTION public.eos_save_pursuit(p_id uuid, p_data jsonb, p_manager_ids text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE saved public.eos_pursuits%ROWTYPE; name text;
BEGIN
  IF public.current_user_can_manage_eos() IS NOT TRUE THEN
    RAISE EXCEPTION 'EOS access required' USING ERRCODE='42501';
  END IF;
  name:=nullif(btrim(p_data->>'project_name'),'');
  IF name IS NULL THEN RAISE EXCEPTION 'Project Pursuit name is required'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(coalesce(p_manager_ids,ARRAY[]::text[])) AS manager_id(user_id)
    LEFT JOIN public.user_permissions u ON u.clerk_user_id=manager_id.user_id
    WHERE (u.is_active IS DISTINCT FROM true OR NOT eos_private.assignment_eligible(manager_id.user_id))
      AND NOT EXISTS (SELECT 1 FROM public.eos_pursuit_managers pm
        WHERE pm.pursuit_id=p_id AND pm.user_id=manager_id.user_id)
  ) THEN RAISE EXCEPTION 'Only active accounts can be newly assigned as pursuit managers'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.eos_pursuits(project_name,client_id,discussion,phase,planning_value,
      probability,potential_start_date,go_no_go,initial_meeting,follow_up_7_day,
      meeting_2_week,status,created_by)
    VALUES(name,(p_data->>'client_id')::uuid,p_data->>'discussion',p_data->>'phase',
      (p_data->>'planning_value')::numeric,(p_data->>'probability')::numeric,
      (p_data->>'potential_start_date')::date,p_data->>'go_no_go',
      (p_data->>'initial_meeting')::date,(p_data->>'follow_up_7_day')::date,
      (p_data->>'meeting_2_week')::date,coalesce(p_data->>'status','Active'),auth.jwt()->>'sub')
    RETURNING * INTO saved;
  ELSE
    SELECT * INTO saved FROM public.eos_pursuits WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
    IF saved.id IS NULL THEN RAISE EXCEPTION 'Pursuit not found'; END IF;
    UPDATE public.eos_pursuits SET project_name=name,client_id=(p_data->>'client_id')::uuid,
      discussion=p_data->>'discussion',phase=p_data->>'phase',
      planning_value=(p_data->>'planning_value')::numeric,
      probability=(p_data->>'probability')::numeric,
      potential_start_date=(p_data->>'potential_start_date')::date,
      go_no_go=p_data->>'go_no_go',initial_meeting=(p_data->>'initial_meeting')::date,
      follow_up_7_day=(p_data->>'follow_up_7_day')::date,
      meeting_2_week=(p_data->>'meeting_2_week')::date,
      status=coalesce(p_data->>'status','Active') WHERE id=p_id RETURNING * INTO saved;
  END IF;
  DELETE FROM public.eos_pursuit_managers WHERE pursuit_id=saved.id
    AND user_id <> ALL(coalesce(p_manager_ids,ARRAY[]::text[]));
  INSERT INTO public.eos_pursuit_managers(pursuit_id,user_id)
  SELECT saved.id,manager_id.user_id
  FROM unnest(coalesce(p_manager_ids,ARRAY[]::text[])) AS manager_id(user_id)
  ON CONFLICT DO NOTHING;
  RETURN saved.id;
END $function$
;
CREATE OR REPLACE FUNCTION public.eos_save_pursuit_v1(p_id uuid, p_data jsonb, p_manager_ids text[], p_expected_updated_at timestamp with time zone, p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'eos_private', 'pg_temp'
AS $function$
DECLARE body jsonb:=jsonb_build_array('pursuit',p_id,p_data,p_manager_ids,p_expected_updated_at); cached jsonb; stamp timestamptz; saved uuid;
BEGIN
 cached:=eos_private.begin_write(p_request_id,body); IF cached IS NOT NULL THEN RETURN (cached#>>'{}')::uuid; END IF;
 IF p_id IS NOT NULL THEN
   SELECT updated_at INTO stamp FROM public.eos_pursuits WHERE id=p_id FOR UPDATE;
   IF NOT FOUND OR stamp IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Conflict: pursuit changed' USING ERRCODE='PT409'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(coalesce(p_manager_ids,ARRAY[]::text[])) m(user_id) WHERE NOT eos_private.assignment_eligible(m.user_id) AND NOT EXISTS(SELECT 1 FROM public.eos_pursuit_managers pm WHERE pm.pursuit_id=p_id AND pm.user_id=m.user_id)) THEN RAISE EXCEPTION 'Choose an eligible roster manager'; END IF;
 saved:=public.eos_save_pursuit(p_id,p_data,p_manager_ids);
 PERFORM eos_private.finish_write(p_request_id,body,to_jsonb(saved)); RETURN saved;
END $function$
;
NOTIFY pgrst,'reload schema';
COMMIT;
