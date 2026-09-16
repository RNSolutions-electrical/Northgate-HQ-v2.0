-- Required consideration, not required inclusion. No existing estimate or snapshot is rewritten.
-- Answers use the existing Workbench document, save revision, audit and snapshot boundaries.
CREATE TABLE public.estimate_checklist_definitions (
 key text PRIMARY KEY CHECK(key ~ '^[a-z][a-z0-9_]{0,79}$'),
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 500),
 description text NOT NULL DEFAULT '',
 enabled boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 sort_order integer NOT NULL DEFAULT 0,
 parent_key text REFERENCES public.estimate_checklist_definitions(key) ON DELETE RESTRICT,
 parent_statuses text[] NOT NULL DEFAULT '{}',
 options jsonb NOT NULL CHECK(jsonb_typeof(options)='array' AND jsonb_array_length(options)>0),
 numeric_fields jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(numeric_fields)='array'),
 CHECK(parent_key IS DISTINCT FROM key),
 CHECK((parent_key IS NULL AND cardinality(parent_statuses)=0) OR (parent_key IS NOT NULL AND cardinality(parent_statuses)>0))
);
ALTER TABLE public.estimate_checklist_definitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.estimate_checklist_definitions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.estimate_checklist_definitions TO authenticated;
CREATE POLICY estimate_checklist_definitions_read ON public.estimate_checklist_definitions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.user_permissions u WHERE u.clerk_user_id=auth.jwt()->>'sub' AND u.is_active
 AND (public.current_user_can_read_division(u.division,'can_estimate') OR public.current_user_can_read_division(u.division,'can_approve_estimates'))));
CREATE INDEX estimate_checklist_parent_idx ON public.estimate_checklist_definitions(parent_key);
COMMENT ON TABLE public.estimate_checklist_definitions IS 'Versioned estimating considerations. Maintained through reviewed database migrations, not client writes. Increment version when a response needs reconfirmation.';

-- Definitions support root considerations and one level of conditional follow-ups.
-- Reject invalid configuration instead of silently skipping a required question.
CREATE FUNCTION public.validate_estimate_checklist_definition() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $definition$
DECLARE field jsonb; parent public.estimate_checklist_definitions; option_values text[];
BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.options) o WHERE jsonb_typeof(o) IS DISTINCT FROM 'object'
  OR jsonb_typeof(o->'value') IS DISTINCT FROM 'string' OR coalesce(o->>'value','') !~ '^[a-z][a-z0-9_]*$'
  OR jsonb_typeof(o->'label') IS DISTINCT FROM 'string' OR nullif(btrim(o->>'label'),'') IS NULL)
  OR (SELECT count(*)<>count(DISTINCT o->>'value') FROM jsonb_array_elements(NEW.options) o)
 THEN RAISE EXCEPTION 'Checklist options need unique values and nonblank labels';END IF;
 SELECT array_agg(o->>'value') INTO option_values FROM jsonb_array_elements(NEW.options) o;
 IF NEW.parent_key IS NOT NULL THEN
  SELECT * INTO parent FROM public.estimate_checklist_definitions WHERE key=NEW.parent_key;
  IF parent.key IS NULL OR parent.parent_key IS NOT NULL OR EXISTS(SELECT 1 FROM public.estimate_checklist_definitions WHERE parent_key=NEW.key)
   OR NOT NEW.parent_statuses <@ ARRAY(SELECT o->>'value' FROM jsonb_array_elements(parent.options) o)
  THEN RAISE EXCEPTION 'Checklist follow-ups require a root parent and valid parent statuses';END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.estimate_checklist_definitions WHERE parent_key=NEW.key AND NOT parent_statuses <@ option_values)
 THEN RAISE EXCEPTION 'Update dependent checklist statuses before removing a parent option';END IF;
 IF (SELECT count(*)<>count(DISTINCT f->>'key') FROM jsonb_array_elements(NEW.numeric_fields) f)
 THEN RAISE EXCEPTION 'Checklist numeric field keys must be unique';END IF;
 FOR field IN SELECT value FROM jsonb_array_elements(NEW.numeric_fields) LOOP
  IF jsonb_typeof(field) IS DISTINCT FROM 'object' OR jsonb_typeof(field->'key') IS DISTINCT FROM 'string'
   OR coalesce(field->>'key','') !~ '^[a-zA-Z][a-zA-Z0-9_]*$'
   OR jsonb_typeof(field->'label') IS DISTINCT FROM 'string' OR nullif(btrim(field->>'label'),'') IS NULL
   OR jsonb_typeof(field->'statuses') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid checklist numeric field';END IF;
  IF jsonb_array_length(field->'statuses')=0 OR NOT ARRAY(SELECT jsonb_array_elements_text(field->'statuses')) <@ option_values
   OR (field ? 'default' AND (jsonb_typeof(field->'default')<>'number' OR (field->>'default')::numeric<0))
   OR (field ? 'suggestion' AND field->>'suggestion' NOT IN ('priced_labor_hours','percentage_of_field_hours'))
  THEN RAISE EXCEPTION 'Invalid checklist numeric statuses, default or suggestion';END IF;
 END LOOP;
 IF TG_OP='UPDATE' AND (NEW.label,NEW.description,NEW.options,NEW.numeric_fields,NEW.parent_key,NEW.parent_statuses)
  IS DISTINCT FROM (OLD.label,OLD.description,OLD.options,OLD.numeric_fields,OLD.parent_key,OLD.parent_statuses)
  AND NEW.version<=OLD.version THEN RAISE EXCEPTION 'Increment checklist definition version when changing its meaning';END IF;
 RETURN NEW;
END $definition$;
REVOKE ALL ON FUNCTION public.validate_estimate_checklist_definition() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_estimate_checklist_definition BEFORE INSERT OR UPDATE ON public.estimate_checklist_definitions
 FOR EACH ROW EXECUTE FUNCTION public.validate_estimate_checklist_definition();

INSERT INTO public.estimate_checklist_definitions(key,label,description,enabled,version,sort_order,parent_key,parent_statuses,options,numeric_fields)
SELECT x.key,x.label,x.description,x.enabled,x.version,x.sort_order,x.parent_key,x.parent_statuses,x.options,x.numeric_fields
FROM jsonb_to_recordset($definitions$[{"key":"available_fault_current","label":"Available Fault Current Evaluation","description":"Choose the status that fits this project. AFC work is not universally required.","sort_order":10,"enabled":true,"version":1,"options":[{"value":"completed","label":"Required — calculation completed"},{"value":"included","label":"Required — included in estimate for completion"},{"value":"verified","label":"Existing AFC documentation verified"},{"value":"by_others","label":"AFC calculation/design by others"},{"value":"not_applicable","label":"Not applicable"}],"parent_key":null,"parent_statuses":[],"numeric_fields":[]},{"key":"afc_first_disconnect","label":"AFC at first point of disconnect evaluated","description":"","sort_order":11,"enabled":true,"version":1,"options":[{"value":"included","label":"Included"},{"value":"adjusted","label":"Included / Adjusted"},{"value":"verified","label":"Existing / Verified"},{"value":"by_others","label":"By Others"},{"value":"excluded","label":"Considered and Excluded"},{"value":"not_applicable","label":"Not Applicable"}],"parent_key":"available_fault_current","parent_statuses":["completed","included","verified","by_others"],"numeric_fields":[]},{"key":"afc_existing_ratings","label":"Existing equipment ratings checked against calculated AFC","description":"","sort_order":12,"enabled":true,"version":1,"options":[{"value":"included","label":"Included"},{"value":"adjusted","label":"Included / Adjusted"},{"value":"verified","label":"Existing / Verified"},{"value":"by_others","label":"By Others"},{"value":"excluded","label":"Considered and Excluded"},{"value":"not_applicable","label":"Not Applicable"}],"parent_key":"available_fault_current","parent_statuses":["completed","included","verified","by_others"],"numeric_fields":[]},{"key":"afc_proposed_ratings","label":"Proposed equipment interrupting/SCCR ratings verified","description":"","sort_order":13,"enabled":true,"version":1,"options":[{"value":"included","label":"Included"},{"value":"adjusted","label":"Included / Adjusted"},{"value":"verified","label":"Existing / Verified"},{"value":"by_others","label":"By Others"},{"value":"excluded","label":"Considered and Excluded"},{"value":"not_applicable","label":"Not Applicable"}],"parent_key":"available_fault_current","parent_statuses":["completed","included","verified","by_others"],"numeric_fields":[]},{"key":"afc_field_marking","label":"Required AFC field marking/labels included","description":"","sort_order":14,"enabled":true,"version":1,"options":[{"value":"included","label":"Included"},{"value":"adjusted","label":"Included / Adjusted"},{"value":"verified","label":"Existing / Verified"},{"value":"by_others","label":"By Others"},{"value":"excluded","label":"Considered and Excluded"},{"value":"not_applicable","label":"Not Applicable"}],"parent_key":"available_fault_current","parent_statuses":["completed","included","verified","by_others"],"numeric_fields":[]},{"key":"afc_downstream","label":"Downstream AFC calculations and labeling considered","description":"","sort_order":15,"enabled":true,"version":1,"options":[{"value":"included","label":"Included"},{"value":"adjusted","label":"Included / Adjusted"},{"value":"verified","label":"Existing / Verified"},{"value":"by_others","label":"By Others"},{"value":"excluded","label":"Considered and Excluded"},{"value":"not_applicable","label":"Not Applicable"}],"parent_key":"available_fault_current","parent_statuses":["completed","included","verified","by_others"],"numeric_fields":[]},{"key":"estimating_labor","label":"Has estimating/preconstruction labor been accounted for?","description":"Record the hours considered. Include any chosen cost through the existing pricing work items.","sort_order":20,"enabled":true,"version":1,"parent_key":null,"parent_statuses":[],"options":[{"value":"included","label":"Included"},{"value":"adjusted","label":"Included at adjusted amount"},{"value":"excluded","label":"Considered and intentionally excluded"}],"numeric_fields":[{"key":"hours","label":"Estimating/preconstruction hours","unit":"hours","statuses":["included","adjusted"]}]},{"key":"supervision_labor","label":"Has supervision/project-management labor been accounted for?","description":"Start with approximately 5% of projected field man-hours. Adjust for the project. This records consideration; pricing stays in the existing work items.","sort_order":30,"enabled":true,"version":1,"parent_key":null,"parent_statuses":[],"options":[{"value":"suggested","label":"Included at suggested allowance"},{"value":"adjusted","label":"Included at adjusted allowance"},{"value":"excluded","label":"Considered and intentionally excluded"}],"numeric_fields":[{"key":"fieldHours","label":"Projected field man-hours","unit":"hours","statuses":["suggested","adjusted"],"suggestion":"priced_labor_hours"},{"key":"percent","label":"Supervision allowance percentage","unit":"%","statuses":["suggested","adjusted"],"default":5},{"key":"hours","label":"Supervision/project-management hours","unit":"hours","statuses":["suggested","adjusted"],"suggestion":"percentage_of_field_hours","suggested_status":"suggested","adjusted_status":"adjusted"}]}]$definitions$::jsonb)
 AS x(key text,label text,description text,enabled boolean,version integer,sort_order integer,parent_key text,parent_statuses text[],options jsonb,numeric_fields jsonb);

CREATE FUNCTION public.workbench_finalization_snapshot(p_document jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $checklist$
DECLARE consideration public.estimate_checklist_definitions; answer jsonb; field jsonb; numeric_text text;
 answers jsonb:=p_document#>'{finalizationChecklist,answers}'; definitions jsonb:='[]'::jsonb; issues text[]:='{}';
BEGIN
 -- Serialize configuration changes with finalization, including insertion of a new enabled row.
 LOCK TABLE public.estimate_checklist_definitions IN SHARE MODE;
 IF answers IS NULL THEN answers:='{}'::jsonb;END IF;
 IF jsonb_typeof(answers) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Finalization checklist answers must be an object' USING ERRCODE='22023';
 END IF;
 FOR consideration IN SELECT d.* FROM public.estimate_checklist_definitions d WHERE d.enabled
  AND (d.parent_key IS NULL OR EXISTS(SELECT 1 FROM public.estimate_checklist_definitions parent
   WHERE parent.key=d.parent_key AND parent.enabled AND (answers->parent.key->>'status')=ANY(d.parent_statuses)))
  ORDER BY d.sort_order,d.key
 LOOP
  definitions:=definitions||jsonb_build_array(to_jsonb(consideration));
  answer:=answers->consideration.key;
  IF jsonb_typeof(answer) IS DISTINCT FROM 'object' OR NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(consideration.options) opt WHERE opt->>'value'=answer->>'status'
  ) THEN issues:=array_append(issues,consideration.label||': choose a response');CONTINUE;END IF;
  IF answer->'version' IS DISTINCT FROM to_jsonb(consideration.version) THEN
   issues:=array_append(issues,consideration.label||': definition changed; confirm your response again');CONTINUE;
  END IF;
  FOR field IN SELECT value FROM jsonb_array_elements(consideration.numeric_fields) LOOP
   IF (field->'statuses') ? (answer->>'status') THEN
    numeric_text:=btrim(answer->'values'->>(field->>'key'));
    IF coalesce(numeric_text,'') !~ '^(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)$'
       OR jsonb_typeof(answer->'values'->(field->>'key')) NOT IN ('number','string') THEN
     issues:=array_append(issues,consideration.label||' / '||(field->>'label')||': enter zero or a positive number');
    ELSIF length(numeric_text)>100 OR numeric_text::numeric>1e100::numeric THEN
     issues:=array_append(issues,consideration.label||' / '||(field->>'label')||': value is too large');
    END IF;
   END IF;
  END LOOP;
 END LOOP;
 IF cardinality(issues)>0 THEN
  RAISE EXCEPTION 'Complete the estimate finalization checklist: %',array_to_string(issues,'; ') USING ERRCODE='22023';
 END IF;
 -- Server-produced labels/rules accompany answers in the already immutable source copy.
 RETURN jsonb_set(p_document,'{finalizationChecklist}',jsonb_build_object(
  'answers',answers,'definitions',definitions,'completedAt',clock_timestamp()),true);
END $checklist$;
REVOKE ALL ON FUNCTION public.workbench_finalization_snapshot(jsonb) FROM PUBLIC,anon,authenticated;

-- Inject into the existing locked transactions after their authorization checks.
-- Abort on drift; keep existing signatures, grants, pricing, approval and retry behavior.
DO $patch$
DECLARE definition text; anchor text;
BEGIN
 SELECT pg_get_functiondef('public.approve_workbench_estimate_internal(uuid,text)'::regprocedure) INTO definition;
 anchor := 'approved_document := jsonb_set(workbench.document, ''{approvedAt}'', to_jsonb(clock_timestamp()), true);';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Unexpected Workbench approval definition; reconcile before applying checklist';END IF;
 definition:=replace(definition,anchor,'approved_document := jsonb_set(public.workbench_finalization_snapshot(workbench.document), ''{approvedAt}'', to_jsonb(clock_timestamp()), true);');
 EXECUTE definition;

 SELECT pg_get_functiondef('public.submit_estimate_for_review(uuid,integer,text,uuid,jsonb,text,jsonb)'::regprocedure) INTO definition;
 anchor := 'pricing:=public.workbench_handoff_pricing(w.document);';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Unexpected estimate handoff definition; reconcile before applying checklist';END IF;
 definition:=replace(definition,anchor,
 'IF e.status=''draft'' THEN
  w.document:=public.workbench_finalization_snapshot(w.document);
 ELSE
  -- Existing approvals retain their original checklist (or absence of one).
  -- New definitions never invalidate a historical approved estimate.
  w.document:=(w.document-''finalizationChecklist'') || coalesce((
   SELECT CASE WHEN s.workbench_document ? ''finalizationChecklist''
    THEN jsonb_build_object(''finalizationChecklist'',s.workbench_document->''finalizationChecklist'') ELSE ''{}''::jsonb END
   FROM public.estimate_snapshots s WHERE s.estimate_id=e.id AND s.locked ORDER BY s.approved_at DESC LIMIT 1),''{}''::jsonb);
 END IF;
 '||anchor);
 EXECUTE definition;
END $patch$;
