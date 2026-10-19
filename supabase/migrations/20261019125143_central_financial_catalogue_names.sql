-- Approved central financial catalogue and naming overrides. Staging first.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.financial_line_catalogue GROUP BY upper(btrim(division_code)) HAVING count(DISTINCT division_name)>1)
    THEN RAISE EXCEPTION 'Conflicting master division names require review'; END IF;
  IF EXISTS (SELECT 1 FROM public.job_budget_divisions GROUP BY job_id,upper(btrim(code)) HAVING count(*) FILTER(WHERE archived_at IS NULL)>1)
    THEN RAISE EXCEPTION 'Ambiguous project divisions require review'; END IF;
END $preflight$;

CREATE TEMP TABLE catalogue_original_financials ON COMMIT DROP AS
SELECT id,to_jsonb(b)-'updated_at' AS original FROM public.job_budget_lines b;
CREATE TEMP TABLE catalogue_original_divisions ON COMMIT DROP AS
SELECT id,to_jsonb(d)-'updated_at' AS original FROM public.job_budget_divisions d;
CREATE TEMP TABLE catalogue_original_master_lines ON COMMIT DROP AS
SELECT id,to_jsonb(c) AS original FROM public.financial_line_catalogue c;
CREATE TEMP TABLE catalogue_original_history ON COMMIT DROP AS
SELECT 'revenue' kind,id,to_jsonb(t) original FROM public.job_revenue_lines t
UNION ALL SELECT 'pay_app',id,to_jsonb(t) FROM public.job_pay_application_lines t;

CREATE TABLE public.financial_division_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 20),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 250),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1,
  retired_at timestamptz, retired_by text, retirement_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((is_active AND retired_at IS NULL) OR (NOT is_active AND retired_at IS NOT NULL))
);
CREATE UNIQUE INDEX financial_division_catalogue_code_key ON public.financial_division_catalogue(upper(btrim(code)));
ALTER TABLE public.financial_division_catalogue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_division_catalogue FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.financial_division_catalogue TO authenticated;
CREATE POLICY financial_division_catalogue_read ON public.financial_division_catalogue FOR SELECT TO authenticated
USING (is_active OR public.current_user_has_developer_access());

ALTER TABLE public.financial_line_catalogue ADD COLUMN division_id uuid REFERENCES public.financial_division_catalogue(id) ON DELETE RESTRICT;
ALTER TABLE public.financial_line_catalogue ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.job_budget_divisions ADD COLUMN catalogue_division_id uuid REFERENCES public.financial_division_catalogue(id) ON DELETE RESTRICT;
ALTER TABLE public.job_budget_divisions ADD COLUMN name_override text CHECK(name_override IS NULL OR length(btrim(name_override)) BETWEEN 1 AND 250);
ALTER TABLE public.job_budget_divisions ADD COLUMN name_version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.job_budget_lines ADD COLUMN catalogue_line_id uuid REFERENCES public.financial_line_catalogue(id) ON DELETE RESTRICT;
ALTER TABLE public.job_budget_lines ADD COLUMN name_override text CHECK(name_override IS NULL OR length(btrim(name_override)) BETWEEN 1 AND 250);
ALTER TABLE public.job_budget_lines ADD COLUMN is_job_only_custom boolean NOT NULL DEFAULT false;
CREATE INDEX financial_line_catalogue_division_id_idx ON public.financial_line_catalogue(division_id);
CREATE INDEX job_budget_divisions_catalogue_idx ON public.job_budget_divisions(catalogue_division_id);
CREATE UNIQUE INDEX job_budget_divisions_active_master_key ON public.job_budget_divisions(job_id,catalogue_division_id) WHERE archived_at IS NULL AND catalogue_division_id IS NOT NULL;
CREATE INDEX job_budget_lines_catalogue_idx ON public.job_budget_lines(catalogue_line_id);

INSERT INTO public.financial_division_catalogue(code,name,sort_order)
SELECT division_code,CASE WHEN division_code='07' AND regexp_replace(min(division_name),'\s','','g')='Thermal&MoistureProtection'
  THEN 'Thermal & Moisture Protection' ELSE min(division_name) END,
  min(sort_order)
FROM public.financial_line_catalogue GROUP BY division_code;
UPDATE public.financial_line_catalogue c SET division_id=d.id,division_name=d.name,
  description=CASE WHEN c.cost_code='07' AND regexp_replace(c.description,'\s','','g')='Thermal&MoistureProtection'
    THEN d.name ELSE c.description END
FROM public.financial_division_catalogue d WHERE upper(btrim(c.division_code))=upper(btrim(d.code));
ALTER TABLE public.financial_line_catalogue ALTER COLUMN division_id SET NOT NULL;

UPDATE public.job_budget_divisions j SET catalogue_division_id=d.id,
  name_override=CASE WHEN j.name=d.name OR (d.code='07' AND regexp_replace(j.name,'\s','','g')='Thermal&MoistureProtection') THEN NULL ELSE j.name END
FROM public.financial_division_catalogue d WHERE upper(btrim(j.code))=upper(btrim(d.code));

UPDATE public.job_budget_lines b SET catalogue_line_id=c.id,
  name_override=CASE WHEN b.description=c.description OR (c.cost_code='07' AND regexp_replace(b.description,'\s','','g')='Thermal&MoistureProtection')
    THEN NULL ELSE b.description END
FROM public.financial_line_catalogue c WHERE upper(btrim(b.cost_code))=upper(btrim(c.cost_code));
UPDATE public.job_budget_lines SET is_job_only_custom=true WHERE catalogue_line_id IS NULL;

DO $integrity$
BEGIN
  IF EXISTS (SELECT 1 FROM catalogue_original_financials o FULL JOIN public.job_budget_lines b USING(id)
    WHERE o.id IS NULL OR b.id IS NULL OR o.original IS DISTINCT FROM to_jsonb(b)-ARRAY['updated_at','catalogue_line_id','name_override','is_job_only_custom'])
    THEN RAISE EXCEPTION 'Catalogue mapping changed original financial data or row identities'; END IF;
  IF EXISTS (SELECT 1 FROM catalogue_original_divisions o FULL JOIN public.job_budget_divisions d USING(id)
    WHERE o.id IS NULL OR d.id IS NULL OR o.original IS DISTINCT FROM to_jsonb(d)-ARRAY['updated_at','catalogue_division_id','name_override','name_version'])
    THEN RAISE EXCEPTION 'Catalogue mapping changed original project divisions'; END IF;
  IF EXISTS (SELECT 1 FROM catalogue_original_history o JOIN public.job_revenue_lines r ON o.kind='revenue' AND o.id=r.id WHERE o.original IS DISTINCT FROM to_jsonb(r))
    OR EXISTS (SELECT 1 FROM catalogue_original_history o JOIN public.job_pay_application_lines p ON o.kind='pay_app' AND o.id=p.id WHERE o.original IS DISTINCT FROM to_jsonb(p))
    THEN RAISE EXCEPTION 'Catalogue mapping changed historical/billing data'; END IF;
END $integrity$;
INSERT INTO public.change_logs(user_id,table_name,record_id,action,before_data,after_data,note)
SELECT 'system:financial-catalogue-mapping','job_budget_lines',b.id::text,'update',o.original,to_jsonb(b),
 'Approved unique catalogue mapping; copied text, category, identity and financial values retained.'
FROM public.job_budget_lines b JOIN catalogue_original_financials o USING(id);
INSERT INTO public.change_logs(user_id,table_name,record_id,action,before_data,after_data,note)
SELECT 'system:financial-catalogue-mapping','job_budget_divisions',d.id::text,'update',o.original,to_jsonb(d),
 'Approved unique catalogue division mapping; original copied name retained.'
FROM public.job_budget_divisions d JOIN catalogue_original_divisions o USING(id);
INSERT INTO public.change_logs(user_id,table_name,record_id,action,before_data,after_data,note)
SELECT 'system:financial-catalogue-mapping','financial_line_catalogue',c.id::text,'update',o.original,to_jsonb(c),
 'Master financial division reference initialized; verified Division 07 alias canonicalized.'
FROM public.financial_line_catalogue c JOIN catalogue_original_master_lines o USING(id);
INSERT INTO public.change_logs(user_id,table_name,record_id,action,after_data,note)
SELECT 'system:financial-catalogue-mapping','financial_division_catalogue',d.id::text,'create',to_jsonb(d),
 'Master financial division initialized from unique existing catalogue division.' FROM public.financial_division_catalogue d;
INSERT INTO public.change_logs(user_id,table_name,record_id,action,after_data,note)
SELECT 'system:financial-catalogue-mapping','financial_line_catalogue','catalogue','update',
 jsonb_build_object('master_divisions',(SELECT count(*) FROM public.financial_division_catalogue),
 'linked_job_lines',(SELECT count(*) FROM public.job_budget_lines WHERE catalogue_line_id IS NOT NULL),
 'custom_job_lines',(SELECT count(*) FROM public.job_budget_lines WHERE catalogue_line_id IS NULL)),
 'Approved additive catalogue references; original financial fields/history retained. Unmatched lines remain job-only custom.';

-- Existing authenticated metadata bounds; retired entries are returned globally
-- only to Developers. Referenced retired names are resolved separately per job.
CREATE FUNCTION public.read_financial_catalogue(p_include_retired boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE developer boolean:=public.current_user_has_developer_access(); result jsonb;
BEGIN
 IF nullif(auth.jwt()->>'sub','') IS NULL OR (p_include_retired AND developer IS NOT TRUE) THEN
  RAISE EXCEPTION 'Catalogue access is not authorized' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('divisions',(SELECT coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('usage_count',CASE WHEN developer THEN (SELECT count(*) FROM public.job_budget_divisions j WHERE j.catalogue_division_id=d.id) ELSE 0 END) ORDER BY sort_order,code),'[]') FROM public.financial_division_catalogue d WHERE p_include_retired OR is_active),
 'lines',(SELECT coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('division_name',d.name,'division_code',d.code,'division_active',d.is_active,'usage_count',CASE WHEN developer THEN (SELECT count(*) FROM public.job_budget_lines b WHERE b.catalogue_line_id=c.id) ELSE 0 END) ORDER BY d.sort_order,c.sort_order,c.cost_code),'[]')
 FROM public.financial_line_catalogue c JOIN public.financial_division_catalogue d ON d.id=c.division_id
 WHERE p_include_retired OR (c.is_active AND d.is_active))) INTO result;
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.read_financial_catalogue(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_financial_catalogue(boolean) TO authenticated;

CREATE FUNCTION public.read_job_financial_names(p_job_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 IF nullif(auth.jwt()->>'sub','') IS NULL OR public.current_user_can_access_job(p_job_id,'can_view_project_financials') IS NOT TRUE THEN
  RAISE EXCEPTION 'Project financial access is required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('divisions',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM (
 SELECT j.id,j.catalogue_division_id,j.name_override,j.name_version,j.updated_at,
 d.name catalogue_name,coalesce(j.name_override,d.name,j.name) effective_name,
 coalesce(d.code,j.code) code,coalesce(d.is_active,true) catalogue_active
 FROM public.job_budget_divisions j LEFT JOIN public.financial_division_catalogue d ON d.id=j.catalogue_division_id
 WHERE j.job_id=p_job_id AND j.archived_at IS NULL) s),
 'lines',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM (
 SELECT b.id,b.catalogue_line_id,b.name_override,b.is_job_only_custom,b.updated_at,
 c.description catalogue_name,coalesce(b.name_override,c.description,
 CASE WHEN b.note='System-managed change-order allocation line.' AND b.cost_code ~* '^[0-9]{2}[.]CO$'
 THEN coalesce(j.name_override,jd.name,j.name)||' Change Orders' END,b.description) effective_name,
 coalesce(c.cost_code,b.cost_code) cost_code,coalesce(c.is_active AND d.is_active,true) catalogue_active,
 d.id catalogue_division_id,d.code catalogue_division_code,d.name catalogue_division_name,
 coalesce(j.name_override,jd.name,j.name,d.name) effective_division_name
 FROM public.job_budget_lines b LEFT JOIN public.financial_line_catalogue c ON c.id=b.catalogue_line_id
 LEFT JOIN public.financial_division_catalogue d ON d.id=c.division_id
 LEFT JOIN public.job_budget_divisions j ON j.job_id=b.job_id AND j.archived_at IS NULL AND
  (j.id=b.project_division_id OR (b.project_division_id IS NULL AND j.catalogue_division_id=c.division_id))
 LEFT JOIN public.financial_division_catalogue jd ON jd.id=j.catalogue_division_id
 WHERE b.job_id=p_job_id AND b.archived_at IS NULL AND public.current_user_can_read_project_financial_line(p_job_id,b.id)) s));
END $function$;
REVOKE ALL ON FUNCTION public.read_job_financial_names(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_job_financial_names(uuid) TO authenticated;

CREATE FUNCTION public.guard_financial_catalogue_reference() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE c public.financial_line_catalogue; d public.financial_division_catalogue;
BEGIN
 IF TG_TABLE_NAME='job_budget_lines' THEN
  IF TG_OP='UPDATE' AND NEW.name_override IS DISTINCT FROM OLD.name_override AND
   current_setting('northgate.financial_workflow',true) IS DISTINCT FROM 'financial.save' THEN
   RAISE EXCEPTION 'Use the audited financial save workflow for project names' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND OLD.catalogue_line_id IS NOT NULL AND
   (NEW.catalogue_line_id IS DISTINCT FROM OLD.catalogue_line_id OR NEW.cost_code IS DISTINCT FROM OLD.cost_code OR NEW.is_job_only_custom IS DISTINCT FROM OLD.is_job_only_custom) THEN
   RAISE EXCEPTION 'Used catalogue identity/code changes require a separate impact review' USING ERRCODE='22023'; END IF;
  IF TG_OP='UPDATE' AND NEW.is_job_only_custom IS DISTINCT FROM OLD.is_job_only_custom THEN RAISE EXCEPTION 'Changing a job-only classification requires a separate mapping review'; END IF;
  IF NEW.is_job_only_custom AND NEW.catalogue_line_id IS NOT NULL THEN RAISE EXCEPTION 'A job-only custom line cannot use a catalogue identity'; END IF;
  IF TG_OP='UPDATE' AND NEW.catalogue_line_id IS NOT NULL AND NEW.project_division_id IS DISTINCT FROM OLD.project_division_id AND NEW.project_division_id IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.job_budget_divisions j JOIN public.financial_line_catalogue linked_master ON linked_master.id=NEW.catalogue_line_id
    WHERE j.id=NEW.project_division_id AND j.job_id=NEW.job_id AND j.archived_at IS NULL AND j.catalogue_division_id=linked_master.division_id) THEN
   RAISE EXCEPTION 'Used catalogue division reassignment requires a separate impact review'; END IF;
  IF TG_OP='INSERT' AND NOT NEW.is_job_only_custom THEN
   IF EXISTS(SELECT 1 FROM public.financial_line_catalogue WHERE upper(btrim(cost_code))=upper(btrim(NEW.cost_code)) AND NOT is_active) THEN
    RAISE EXCEPTION 'This catalogue code is retired; choose an active code or explicitly mark a job-only custom line'; END IF;
   IF NEW.catalogue_line_id IS NOT NULL THEN
    SELECT * INTO c FROM public.financial_line_catalogue WHERE id=NEW.catalogue_line_id AND is_active FOR SHARE;
    IF c.id IS NULL OR c.cost_code IS DISTINCT FROM NEW.cost_code THEN RAISE EXCEPTION 'Catalogue selection changed; reload before adding the line'; END IF;
   ELSE
    SELECT * INTO c FROM public.financial_line_catalogue WHERE upper(btrim(cost_code))=upper(btrim(NEW.cost_code)) AND is_active FOR SHARE;
   END IF;
   IF c.id IS NOT NULL THEN
    SELECT * INTO d FROM public.financial_division_catalogue WHERE id=c.division_id AND is_active FOR SHARE;
    IF d.id IS NULL THEN RAISE EXCEPTION 'This catalogue division is retired' USING ERRCODE='22023'; END IF;
    IF NEW.project_division_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.job_budget_divisions j WHERE j.id=NEW.project_division_id AND j.job_id=NEW.job_id AND j.archived_at IS NULL AND upper(btrim(j.code))=upper(btrim(d.code))) THEN
     RAISE EXCEPTION 'Cost code does not belong to the selected project division' USING ERRCODE='22023'; END IF;
    NEW.catalogue_line_id:=c.id;
    IF NEW.name_override IS NULL THEN NEW.name_override:=CASE WHEN NEW.description=c.description OR
     (NEW.note='System-managed change-order allocation line.' AND NEW.cost_code ~* '^[0-9]{2}[.]CO$') THEN NULL ELSE NEW.description END; END IF;
   ELSIF NEW.note='System-managed change-order allocation line.' THEN NEW.is_job_only_custom:=true;
   ELSE RAISE EXCEPTION 'Choose a catalogue code or explicitly mark a job-only custom line'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.description IS DISTINCT FROM OLD.description AND NEW.catalogue_line_id IS NOT NULL AND OLD.name_override IS NULL THEN
   SELECT * INTO c FROM public.financial_line_catalogue WHERE id=NEW.catalogue_line_id;
   NEW.name_override:=CASE WHEN NEW.description=c.description OR
    (NEW.note='System-managed change-order allocation line.' AND NEW.cost_code ~* '^[0-9]{2}[.]CO$') THEN NULL ELSE NEW.description END;
  END IF;
 ELSE
  IF TG_OP='UPDATE' AND (NEW.name_override IS DISTINCT FROM OLD.name_override OR NEW.name_version IS DISTINCT FROM OLD.name_version)
   AND current_setting('northgate.job_division_name_edit',true) IS DISTINCT FROM 'yes' THEN
   RAISE EXCEPTION 'Use the audited financial save workflow for project division names' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND OLD.catalogue_division_id IS NOT NULL AND
   (NEW.catalogue_division_id IS DISTINCT FROM OLD.catalogue_division_id OR NEW.code IS DISTINCT FROM OLD.code) THEN
   RAISE EXCEPTION 'Used catalogue division identity changes require a separate impact review' USING ERRCODE='22023'; END IF;
  IF TG_OP='INSERT' THEN
   SELECT * INTO d FROM public.financial_division_catalogue WHERE upper(btrim(code))=upper(btrim(NEW.code)) FOR SHARE;
   IF d.id IS NOT NULL AND NOT d.is_active THEN RAISE EXCEPTION 'This catalogue division is retired'; END IF;
   IF NEW.catalogue_division_id IS NOT NULL AND NEW.catalogue_division_id IS DISTINCT FROM d.id THEN RAISE EXCEPTION 'Catalogue division selection changed; reload before adding'; END IF;
   IF d.id IS NOT NULL THEN NEW.catalogue_division_id:=d.id;
    NEW.name_override:=CASE WHEN NEW.name=d.name THEN NULL ELSE NEW.name END; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.guard_financial_catalogue_reference() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER financial_catalogue_line_reference BEFORE INSERT OR UPDATE ON public.job_budget_lines FOR EACH ROW EXECUTE FUNCTION public.guard_financial_catalogue_reference();
CREATE TRIGGER financial_catalogue_division_reference BEFORE INSERT OR UPDATE ON public.job_budget_divisions FOR EACH ROW EXECUTE FUNCTION public.guard_financial_catalogue_reference();
CREATE TRIGGER touch_job_division_name_baseline AFTER UPDATE OF name_override ON public.job_budget_divisions FOR EACH ROW WHEN(OLD.name_override IS DISTINCT FROM NEW.name_override) EXECUTE FUNCTION public.touch_job_financial_baseline();

CREATE FUNCTION public.save_financial_catalogue_entry(p_entity text,p_operation text,p_id uuid,p_expected_version bigint,p_values jsonb,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE actor text:=nullif(auth.jwt()->>'sub',''); before_row jsonb; saved jsonb; usage_count bigint:=0;
 prior_d public.financial_division_catalogue; draft_d public.financial_division_catalogue;
 prior_c public.financial_line_catalogue; draft_c public.financial_line_catalogue; parent_d public.financial_division_catalogue;
BEGIN
 IF actor IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN RAISE EXCEPTION 'Developer access is required' USING ERRCODE='42501'; END IF;
 IF p_entity IS NULL OR p_operation IS NULL OR p_entity NOT IN ('division','code') OR p_operation NOT IN ('save','retire','reactivate') OR jsonb_typeof(p_values) IS DISTINCT FROM 'object'
  OR octet_length(p_values::text)>16384 THEN RAISE EXCEPTION 'Invalid catalogue action' USING ERRCODE='22023'; END IF;
 IF p_operation<>'save' AND nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A retirement/reactivation reason is required' USING ERRCODE='22023'; END IF;
 IF p_entity='division' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_values) k WHERE k NOT IN ('code','name','sort_order')) THEN RAISE EXCEPTION 'Unsupported division field'; END IF;
  IF p_id IS NOT NULL THEN
   SELECT * INTO prior_d FROM public.financial_division_catalogue WHERE id=p_id FOR UPDATE;
   IF prior_d.id IS NULL OR prior_d.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Catalogue division changed; reload before saving' USING ERRCODE='40001'; END IF;
   before_row:=to_jsonb(prior_d);
   SELECT count(*) INTO usage_count FROM public.job_budget_divisions WHERE catalogue_division_id=p_id;
  ELSIF p_operation<>'save' OR p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'Invalid new division action'; END IF;
  draft_d:=jsonb_populate_record(prior_d,p_values);
  draft_d.code:=upper(btrim(draft_d.code));draft_d.name:=nullif(btrim(draft_d.name),'');
  IF draft_d.code !~ '^[0-9]{2}$' OR draft_d.name IS NULL OR length(draft_d.name)>250 THEN RAISE EXCEPTION 'A two-digit division code and name are required'; END IF;
  IF prior_d.id IS NOT NULL AND prior_d.code IS DISTINCT FROM draft_d.code AND
   (usage_count>0 OR EXISTS(SELECT 1 FROM public.financial_line_catalogue WHERE division_id=p_id)) THEN
   RAISE EXCEPTION 'Used division codes require a separate impact review' USING ERRCODE='22023'; END IF;
  IF prior_d.id IS NULL THEN
   INSERT INTO public.financial_division_catalogue(code,name,sort_order) VALUES(draft_d.code,draft_d.name,coalesce(draft_d.sort_order,0)) RETURNING to_jsonb(financial_division_catalogue.*) INTO saved;
  ELSE
   UPDATE public.financial_division_catalogue SET code=draft_d.code,name=draft_d.name,sort_order=coalesce(draft_d.sort_order,0),
    is_active=CASE p_operation WHEN 'retire' THEN false WHEN 'reactivate' THEN true ELSE is_active END,
    retired_at=CASE p_operation WHEN 'retire' THEN now() WHEN 'reactivate' THEN NULL ELSE retired_at END,
    retired_by=CASE p_operation WHEN 'retire' THEN actor WHEN 'reactivate' THEN NULL ELSE retired_by END,
    retirement_reason=CASE p_operation WHEN 'retire' THEN btrim(p_reason) WHEN 'reactivate' THEN NULL ELSE retirement_reason END,
    version=version+1,updated_at=clock_timestamp() WHERE id=p_id RETURNING to_jsonb(financial_division_catalogue.*) INTO saved;
   -- Compatibility fields serve existing template/handoff functions. Jobs read
   -- normalized master names directly and no job row is renamed here.
   IF prior_d.name IS DISTINCT FROM draft_d.name OR prior_d.code IS DISTINCT FROM draft_d.code THEN
    UPDATE public.financial_line_catalogue SET division_name=draft_d.name,division_code=draft_d.code,version=version+1,updated_at=clock_timestamp() WHERE division_id=p_id;
   END IF;
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_values) k WHERE k NOT IN ('division_id','cost_code','description','subdivision_name','notes','category','is_protected_financial','sort_order')) THEN RAISE EXCEPTION 'Unsupported cost-code field'; END IF;
  IF p_id IS NOT NULL THEN
   SELECT * INTO prior_c FROM public.financial_line_catalogue WHERE id=p_id FOR UPDATE;
   IF prior_c.id IS NULL OR prior_c.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Catalogue cost code changed; reload before saving' USING ERRCODE='40001'; END IF;
   before_row:=to_jsonb(prior_c);
   SELECT count(*) INTO usage_count FROM public.job_budget_lines WHERE catalogue_line_id=p_id;
   usage_count:=usage_count+(SELECT count(*) FROM public.estimate_handoff_financial_allocations WHERE catalogue_id=p_id);
  ELSIF p_operation<>'save' OR p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'Invalid new cost-code action'; END IF;
  draft_c:=jsonb_populate_record(prior_c,p_values);
  draft_c.cost_code:=upper(nullif(btrim(draft_c.cost_code),''));draft_c.description:=nullif(btrim(draft_c.description),'');
  draft_c.category:=coalesce(draft_c.category,'other');draft_c.is_protected_financial:=coalesce(draft_c.is_protected_financial,false);
  SELECT * INTO parent_d FROM public.financial_division_catalogue WHERE id=draft_c.division_id FOR SHARE;
  IF parent_d.id IS NULL OR (NOT parent_d.is_active AND p_operation IN ('save','reactivate')) THEN RAISE EXCEPTION 'Choose an active catalogue division'; END IF;
  IF draft_c.cost_code IS NULL OR length(draft_c.cost_code)>40 OR draft_c.description IS NULL OR length(draft_c.description)>250 OR
    NOT (draft_c.cost_code=parent_d.code OR left(draft_c.cost_code,length(parent_d.code)+1)=parent_d.code||'.') THEN RAISE EXCEPTION 'A matching division cost code and name are required'; END IF;
  IF prior_c.id IS NOT NULL AND usage_count>0 AND (draft_c.cost_code IS DISTINCT FROM prior_c.cost_code OR draft_c.division_id IS DISTINCT FROM prior_c.division_id
    OR draft_c.category IS DISTINCT FROM prior_c.category OR draft_c.is_protected_financial IS DISTINCT FROM prior_c.is_protected_financial) THEN
   RAISE EXCEPTION 'Used cost-code identity, division or classification changes require a separate impact review' USING ERRCODE='22023'; END IF;
  IF prior_c.id IS NULL THEN
   INSERT INTO public.financial_line_catalogue(division_id,division_code,division_name,cost_code,description,subdivision_name,notes,category,is_protected_financial,sort_order)
   VALUES(parent_d.id,parent_d.code,parent_d.name,draft_c.cost_code,draft_c.description,draft_c.subdivision_name,draft_c.notes,draft_c.category,draft_c.is_protected_financial,coalesce(draft_c.sort_order,0)) RETURNING to_jsonb(financial_line_catalogue.*) INTO saved;
  ELSE
   UPDATE public.financial_line_catalogue SET division_id=parent_d.id,division_code=parent_d.code,division_name=parent_d.name,
    cost_code=draft_c.cost_code,description=draft_c.description,subdivision_name=draft_c.subdivision_name,notes=draft_c.notes,
    category=draft_c.category,is_protected_financial=draft_c.is_protected_financial,sort_order=coalesce(draft_c.sort_order,0),
    is_active=CASE p_operation WHEN 'retire' THEN false WHEN 'reactivate' THEN true ELSE is_active END,
    retired_at=CASE p_operation WHEN 'retire' THEN now() WHEN 'reactivate' THEN NULL ELSE retired_at END,
    retired_by=CASE p_operation WHEN 'retire' THEN actor WHEN 'reactivate' THEN NULL ELSE retired_by END,
    retirement_reason=CASE p_operation WHEN 'retire' THEN btrim(p_reason) WHEN 'reactivate' THEN NULL ELSE retirement_reason END,
    version=version+1,updated_at=clock_timestamp() WHERE id=p_id RETURNING to_jsonb(financial_line_catalogue.*) INTO saved;
  END IF;
 END IF;
 INSERT INTO public.change_logs(user_id,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,CASE p_entity WHEN 'division' THEN 'financial_division_catalogue' ELSE 'financial_line_catalogue' END,saved->>'id',
 CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END,before_row,saved||jsonb_build_object('_catalogue_operation',p_operation),
 coalesce(nullif(btrim(p_reason),''),'Catalogue metadata saved.'));
 RETURN saved||jsonb_build_object('usage_count',usage_count);
END $function$;
REVOKE ALL ON FUNCTION public.save_financial_catalogue_entry(text,text,uuid,bigint,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_financial_catalogue_entry(text,text,uuid,bigint,jsonb,text) TO authenticated;

-- Keep legacy import/retirement entry points within the same audited/versioned
-- manager rules. Imports cannot silently rename existing master divisions.
CREATE OR REPLACE FUNCTION public.replace_financial_line_catalogue(p_rows jsonb,p_reason text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE r jsonb; d public.financial_division_catalogue; c public.financial_line_catalogue; saved jsonb; count_saved integer:=0;
BEGIN
 IF nullif(auth.jwt()->>'sub','') IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN RAISE EXCEPTION 'Developer access is required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 OR octet_length(p_rows::text)>1048576 THEN RAISE EXCEPTION 'Submit one to 500 bounded catalogue rows'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  SELECT * INTO d FROM public.financial_division_catalogue WHERE upper(btrim(code))=upper(btrim(r->>'division_code')) FOR UPDATE;
  IF d.id IS NULL THEN
   saved:=public.save_financial_catalogue_entry('division','save',NULL,NULL,jsonb_build_object('code',r->>'division_code','name',r->>'division_name'),p_reason);
   SELECT * INTO d FROM public.financial_division_catalogue WHERE id=(saved->>'id')::uuid;
  ELSIF r->>'division_name' IS DISTINCT FROM d.name THEN RAISE EXCEPTION 'Edit existing division names in the catalogue manager, then refresh the import'; END IF;
  SELECT * INTO c FROM public.financial_line_catalogue WHERE upper(btrim(cost_code))=upper(btrim(r->>'cost_code'));
  IF c.id IS NOT NULL AND (r->>'expected_version')::bigint IS DISTINCT FROM c.version THEN RAISE EXCEPTION 'Imported catalogue entry changed; reload preview' USING ERRCODE='40001'; END IF;
  saved:=public.save_financial_catalogue_entry('code','save',c.id,c.version,
   (r-ARRAY['division_code','division_name','expected_version'])||jsonb_build_object('division_id',d.id),p_reason);
  count_saved:=count_saved+1;
 END LOOP;
 RETURN count_saved;
END $function$;
CREATE OR REPLACE FUNCTION public.retire_financial_line_catalogue_item(p_catalogue_id uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE c public.financial_line_catalogue;
BEGIN
 SELECT * INTO c FROM public.financial_line_catalogue WHERE id=p_catalogue_id FOR UPDATE;
 PERFORM public.save_financial_catalogue_entry('code','retire',p_catalogue_id,c.version,'{}',p_reason);
END $function$;

CREATE FUNCTION public.apply_job_division_name_override(p_job_id uuid,p_line_id uuid,p_expected_version bigint,p_override text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE prior public.job_budget_divisions; after_row public.job_budget_divisions; actor text:=nullif(auth.jwt()->>'sub','');
 previous_context text:=current_setting('northgate.job_division_name_edit',true);
BEGIN
 IF actor IS NULL OR public.current_user_can_edit_job(p_job_id,'can_approve_budget') IS NOT TRUE OR public.current_user_can_read_project_financial_line(p_job_id,p_line_id) IS NOT TRUE THEN RAISE EXCEPTION 'Financial edit permission is required' USING ERRCODE='42501'; END IF;
 SELECT d.* INTO prior FROM public.job_budget_divisions d JOIN public.job_budget_lines b ON b.project_division_id=d.id
 WHERE b.id=p_line_id AND b.job_id=p_job_id AND b.archived_at IS NULL AND d.job_id=p_job_id AND d.archived_at IS NULL FOR UPDATE OF d;
 IF prior.id IS NULL OR prior.name_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Project division name changed; reload before saving' USING ERRCODE='40001'; END IF;
 IF prior.catalogue_division_id IS NULL THEN RAISE EXCEPTION 'This legacy division needs a reviewed catalogue mapping before a name override'; END IF;
 PERFORM set_config('northgate.job_division_name_edit','yes',true);
 UPDATE public.job_budget_divisions SET name_override=nullif(btrim(p_override),''),name_version=name_version+1,updated_at=clock_timestamp()
 WHERE id=prior.id RETURNING * INTO after_row;
 PERFORM set_config('northgate.job_division_name_edit',coalesce(previous_context,''),true);
 INSERT INTO public.change_logs(user_id,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,'job_budget_divisions',prior.id::text,'update',to_jsonb(prior),to_jsonb(after_row),'Project-only division name override; catalogue identity and financial values retained.');
END $function$;
REVOKE ALL ON FUNCTION public.apply_job_division_name_override(uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;

-- Preserve the existing financial/proposal implementation and authorization;
-- extend only naming fields and guarded project-division name application.
DO $preflight$ BEGIN
 IF (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid='public.save_job_financial_batch(uuid,jsonb,text)'::regprocedure) <> '85be3ca12db88a0e88b3705b357e469b' THEN RAISE EXCEPTION 'Unexpected save_job_financial_batch implementation; stop for review'; END IF;
 IF (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid='public.save_v5_job_financial_proposal(uuid,uuid,integer,uuid,jsonb)'::regprocedure) <> '02b8febabbe0a123d5b4238f5cde8810' THEN RAISE EXCEPTION 'Unexpected save_v5_job_financial_proposal implementation; stop for review'; END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.save_job_financial_batch(p_job_id uuid, p_lines jsonb, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  actor_id text := NULLIF(auth.jwt()->>'sub', '');
  actor_name text;
  target_job public.jobs%ROWTYPE;
  prior public.job_budget_lines%ROWTYPE;
  draft public.job_budget_lines%ROWTYPE;
  saved public.job_budget_lines%ROWTYPE;
  entry jsonb;
  patch jsonb;
  result jsonb := '[]'::jsonb;
  batch_reason text := NULLIF(BTRIM(p_reason, E' \t\n\r'), '');
  line_reason text;
  combined_reason text;
  previous_reason text := current_setting('northgate.financial_reason', true);
  previous_workflow text := current_setting('northgate.financial_workflow', true);
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '28000'; END IF;
  IF public.current_user_can_edit_job(p_job_id, 'can_approve_budget') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial edit permission is required for this job' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Financial lines must be an array'; END IF;
  IF jsonb_array_length(p_lines) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Submit between 1 and 500 lines'; END IF;
  IF octet_length(p_lines::text) > 2097152 THEN RAISE EXCEPTION 'Financial batch exceeds 2 MB'; END IF;
  IF length(batch_reason) > 4000 THEN RAISE EXCEPTION 'Batch reason exceeds 4000 characters'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) e WHERE NULLIF(e->>'id','') IS NOT NULL
    GROUP BY e->>'id' HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate financial line in batch'; END IF;

  SELECT * INTO target_job FROM public.jobs WHERE id = p_job_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active job not found'; END IF;
  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor_id) INTO actor_name
    FROM public.user_permissions WHERE clerk_user_id = actor_id AND is_active;
  IF actor_name IS NULL THEN RAISE EXCEPTION 'Active user required' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('northgate.financial_workflow', 'financial.save', true);

  FOR entry IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid financial line'; END IF;
    patch := entry - ARRAY['id','expected_updated_at','reason','source','project_division_name_override','expected_division_name_version'];
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(patch) k WHERE k NOT IN (
      'project_division_id','category','is_protected_financial','cost_code','description',
      'budget_amount','budget_change_amount','actual_cost_amount','committed_cost_amount',
      'forecast_to_complete_amount','forecast_final_amount','schedule_of_values_amount',
      'current_budget_override_amount','note','name_override','is_job_only_custom','catalogue_line_id')) THEN RAISE EXCEPTION 'Unsupported financial field'; END IF;
    prior := NULL;
    IF NULLIF(entry->>'id','') IS NOT NULL THEN
      SELECT * INTO prior FROM public.job_budget_lines
        WHERE id = (entry->>'id')::uuid AND job_id = p_job_id AND archived_at IS NULL FOR UPDATE;
      IF prior.id IS NULL THEN RAISE EXCEPTION 'Active financial line not found'; END IF;
      IF public.current_user_can_read_project_financial_line(p_job_id, prior.id) IS NOT TRUE THEN
        RAISE EXCEPTION 'This financial line is outside your access' USING ERRCODE = '42501';
      END IF;
      IF entry ? 'expected_updated_at' AND prior.updated_at IS DISTINCT FROM (entry->>'expected_updated_at')::timestamptz THEN
        RAISE EXCEPTION 'This financial line changed. Reload before saving.' USING ERRCODE = '40001';
      END IF;
      draft := jsonb_populate_record(prior, patch);
    ELSE
      draft := jsonb_populate_record(NULL::public.job_budget_lines,
        jsonb_build_object('category','other','is_protected_financial',false,'budget_amount',0,
          'budget_change_amount',0,'actual_cost_amount',0,'committed_cost_amount',0,
          'forecast_to_complete_amount',0,'forecast_final_amount',COALESCE((patch->>'budget_amount')::numeric,0),
          'schedule_of_values_amount',0) || patch);
    END IF;
    draft.name_override := NULLIF(BTRIM(draft.name_override), '');
    draft.is_job_only_custom := COALESCE(draft.is_job_only_custom,false);
    draft.description := NULLIF(BTRIM(draft.description), '');
    draft.cost_code := NULLIF(BTRIM(draft.cost_code), '');
    IF draft.description IS NULL THEN RAISE EXCEPTION 'Description is required'; END IF;
    IF draft.project_division_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.job_budget_divisions WHERE id=draft.project_division_id AND job_id=p_job_id AND archived_at IS NULL
    ) THEN RAISE EXCEPTION 'Project division does not belong to this active job'; END IF;
    IF draft.is_protected_financial AND public.current_user_can_access_job(p_job_id,'can_view_protected_project_financials') IS NOT TRUE THEN
      RAISE EXCEPTION 'Protected financial access is required' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each_text(to_jsonb(draft)) n WHERE n.key IN (
      'budget_amount','budget_change_amount','actual_cost_amount','committed_cost_amount',
      'forecast_to_complete_amount','forecast_final_amount','schedule_of_values_amount','current_budget_override_amount')
      AND n.value IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Amounts must be finite'; END IF;

    line_reason := NULLIF(BTRIM(entry->>'reason', E' \t\n\r'), '');
    IF length(line_reason) > 4000 THEN RAISE EXCEPTION 'Line reason exceeds 4000 characters'; END IF;
    combined_reason := NULLIF(concat_ws(E'\n',
      CASE WHEN batch_reason IS NOT NULL THEN 'Batch: ' || batch_reason END,
      CASE WHEN line_reason IS NOT NULL THEN 'Line: ' || line_reason END), '');
    IF prior.id IS NOT NULL AND draft.project_division_id IS DISTINCT FROM prior.project_division_id AND combined_reason IS NULL THEN
      RAISE EXCEPTION 'A reason is required to move a financial line to another division';
    END IF;
    PERFORM set_config('northgate.financial_reason', COALESCE(combined_reason,''), true);
    IF prior.id IS NULL THEN
      INSERT INTO public.job_budget_lines(job_id,division,project_division_id,category,is_protected_financial,
        cost_code,description,budget_amount,budget_change_amount,actual_cost_amount,committed_cost_amount,
        forecast_to_complete_amount,forecast_final_amount,schedule_of_values_amount,current_budget_override_amount,note,name_override,is_job_only_custom,catalogue_line_id,created_by)
      VALUES (p_job_id,target_job.division,draft.project_division_id,draft.category,draft.is_protected_financial,
        draft.cost_code,draft.description,draft.budget_amount,draft.budget_change_amount,draft.actual_cost_amount,
        draft.committed_cost_amount,draft.forecast_to_complete_amount,draft.forecast_final_amount,
        draft.schedule_of_values_amount,draft.current_budget_override_amount,draft.note,draft.name_override,draft.is_job_only_custom,draft.catalogue_line_id,actor_id)
      RETURNING * INTO saved;
    ELSE
      UPDATE public.job_budget_lines SET project_division_id=draft.project_division_id, category=draft.category,
        is_protected_financial=draft.is_protected_financial,cost_code=draft.cost_code,description=draft.description,
        budget_amount=draft.budget_amount,budget_change_amount=draft.budget_change_amount,actual_cost_amount=draft.actual_cost_amount,
        committed_cost_amount=draft.committed_cost_amount,forecast_to_complete_amount=draft.forecast_to_complete_amount,
        forecast_final_amount=draft.forecast_final_amount,schedule_of_values_amount=draft.schedule_of_values_amount,
        current_budget_override_amount=draft.current_budget_override_amount,note=draft.note,name_override=draft.name_override,is_job_only_custom=draft.is_job_only_custom
      WHERE id=prior.id RETURNING * INTO saved;
    END IF;
    IF entry ? 'project_division_name_override' THEN
      PERFORM public.apply_job_division_name_override(p_job_id,saved.id,(entry->>'expected_division_name_version')::bigint,entry->>'project_division_name_override');
    END IF;
    INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
      VALUES(actor_id,actor_name,'job_budget_lines',saved.id::text,
        CASE WHEN prior.id IS NULL THEN 'create' ELSE 'update' END,
        CASE WHEN prior.id IS NULL THEN NULL ELSE to_jsonb(prior) END,
        to_jsonb(saved) || jsonb_build_object('_audit', jsonb_build_object('workflow','financial.save',
          'batch_reason',batch_reason,'line_reason',line_reason,'source',entry->'source',
          'division_name_override_change',entry ? 'project_division_name_override')),combined_reason);
    result := result || jsonb_build_array(to_jsonb(saved));
  END LOOP;
  PERFORM set_config('northgate.financial_reason', COALESCE(previous_reason,''), true);
  PERFORM set_config('northgate.financial_workflow', COALESCE(previous_workflow,''), true);
  RETURN result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.save_v5_job_financial_proposal(p_request_id uuid, p_working_copy_id uuid, p_expected_version integer, p_job_id uuid, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
      'current_budget_override_amount','note','name_override','is_job_only_custom','catalogue_line_id','project_division_name_override','expected_division_name_version')
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
$function$
;
COMMIT;
