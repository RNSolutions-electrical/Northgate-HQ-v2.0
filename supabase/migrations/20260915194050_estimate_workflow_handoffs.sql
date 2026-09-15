-- One immutable handoff per estimate version. Existing CO, job and service-call
-- workflows remain authoritative; a handoff never approves or posts financials.
CREATE TABLE public.estimate_workflow_handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 estimate_id uuid NOT NULL UNIQUE REFERENCES public.estimates(id),
 source_revision integer NOT NULL CHECK (source_revision > 0),
 source_version integer NOT NULL CHECK (source_version > 0),
 destination text NOT NULL CHECK (destination IN ('job','change_order','service_call')),
 job_id uuid NOT NULL REFERENCES public.jobs(id),
 change_order_id uuid UNIQUE REFERENCES public.change_orders(id),
 source_document jsonb NOT NULL,
 pricing jsonb NOT NULL,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((destination='change_order') = (change_order_id IS NOT NULL))
);
CREATE INDEX estimate_workflow_handoffs_job_idx ON public.estimate_workflow_handoffs(job_id);
ALTER TABLE public.estimate_workflow_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.estimate_workflow_handoffs FROM anon,authenticated;
GRANT SELECT ON public.estimate_workflow_handoffs TO authenticated;
CREATE POLICY estimate_workflow_handoffs_read ON public.estimate_workflow_handoffs
 FOR SELECT TO authenticated USING (
 public.current_user_can_access_job(job_id,'can_view_project_financials')
 AND public.current_user_can_access_job(job_id,'can_view_protected_project_financials')
);

CREATE FUNCTION public.guard_estimate_workflow_handoff() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'Estimate handoff snapshots are immutable; edit the destination draft instead' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.guard_estimate_workflow_handoff() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER estimate_workflow_handoff_immutable BEFORE UPDATE OR DELETE
 ON public.estimate_workflow_handoffs FOR EACH ROW EXECUTE FUNCTION public.guard_estimate_workflow_handoff();

-- Fixed-precision calculation from saved source only, not client-supplied totals.
CREATE FUNCTION public.workbench_handoff_number(v text,label text) RETURNS numeric
 LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE n numeric;
BEGIN
 IF v IS NULL OR btrim(v)='' OR v !~ '^[0-9]+([.][0-9]+)?$' THEN
  RAISE EXCEPTION 'Enter a valid non-negative % before submitting for review',label USING ERRCODE='22023';
 END IF;
 n:=v::numeric;
 IF n>1000000000 THEN RAISE EXCEPTION '% is outside the supported range',label USING ERRCODE='22023'; END IF;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.workbench_handoff_number(text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.workbench_handoff_pricing(doc jsonb) RETURNS jsonb
 LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE e jsonb; i jsonb; l jsonb; q jsonb; row_value jsonb; rows jsonb:='[]'; result jsonb:='[]';
 rate numeric; markup_rate numeric; fee_rate numeric; qty numeric; material numeric; hours numeric; labor numeric;
 other_cost numeric; markup numeric; subtotal numeric; all_subtotal numeric:=0; fee numeric; allocated numeric:=0;
 cumulative numeric:=0; next_allocated numeric; keys text[]:='{}'; k text;
BEGIN
 IF jsonb_typeof(doc->'entries') IS DISTINCT FROM 'array' OR jsonb_array_length(doc->'entries')=0
 THEN RAISE EXCEPTION 'Add estimate entries before submitting for review' USING ERRCODE='22023'; END IF;
 rate:=public.workbench_handoff_number(doc->>'rate','labor rate');
 fee_rate:=public.workbench_handoff_number(coalesce(doc->>'feePercent',doc->>'overallMarkup','30'),'fee percentage');
 FOR e IN SELECT value FROM jsonb_array_elements(doc->'entries') LOOP
  IF jsonb_typeof(e->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid estimate entry' USING ERRCODE='22023'; END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(e->'items') LOOP
   k:=(e->>'id')||':'||(i->>'id');
   IF k IS NULL OR k=ANY(keys) OR nullif(btrim(i->>'name'),'') IS NULL THEN
    RAISE EXCEPTION 'Every work item needs a unique identifier and description' USING ERRCODE='22023';
   END IF;
   keys:=array_append(keys,k); material:=0; hours:=0; other_cost:=0; q:=NULL;
   qty:=public.workbench_handoff_number(i->>'qty','work item quantity');
   markup_rate:=public.workbench_handoff_number(coalesce(i->>'materialMarkupOverride',doc->>'materialMarkup','30'),'material markup');
   IF nullif(i->>'quoteId','') IS NOT NULL THEN
    IF (SELECT count(*) FROM jsonb_array_elements(coalesce(doc->'quotes','[]')) x WHERE x->>'id'=i->>'quoteId')<>1
    THEN RAISE EXCEPTION 'An awarded quote is missing or duplicated; review the estimate' USING ERRCODE='22023'; END IF;
    SELECT value INTO q FROM jsonb_array_elements(doc->'quotes') WHERE value->>'id'=i->>'quoteId';
    material:=public.workbench_handoff_number(q->>'materialAmount','quote material cost');
    other_cost:=public.workbench_handoff_number(q->>'otherAmount','quote other cost');
   ELSE
    IF jsonb_typeof(i->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(i->'lines')=0 THEN
     RAISE EXCEPTION 'Every work item needs components or an awarded quote' USING ERRCODE='22023'; END IF;
    FOR l IN SELECT value FROM jsonb_array_elements(i->'lines') LOOP
     material:=material+public.workbench_handoff_number(l->>'qty','component quantity')*
      CASE WHEN coalesce((l->>'fixed')::boolean,false) THEN 1 ELSE qty END * public.workbench_handoff_number(l->>'price','material price');
     hours:=hours+public.workbench_handoff_number(l->>'qty','component quantity')*
      CASE WHEN coalesce((l->>'fixed')::boolean,false) THEN 1 ELSE qty END * public.workbench_handoff_number(l->>'hours','labor hours');
    END LOOP;
   END IF;
   material:=round(material,2);labor:=round(hours*rate,2);other_cost:=round(other_cost,2);
   markup:=round(material*markup_rate/100,2);subtotal:=material+labor+other_cost+markup;
   all_subtotal:=all_subtotal+subtotal;
   rows:=rows||jsonb_build_array(jsonb_build_object('key',k,'entry_id',e->>'id','item_id',i->>'id',
    'reference',coalesce(e->>'number','')||'.'||coalesce(i->>'number',''),'description',i->>'name',
    'section',e->>'section','location',e->>'location','material_amount',material,'labor_amount',labor,
    'other_amount',other_cost,'markup_amount',markup,'subtotal',subtotal));
  END LOOP;
 END LOOP;
 IF jsonb_array_length(rows)=0 OR jsonb_array_length(rows)>500 THEN RAISE EXCEPTION 'Use between 1 and 500 work items' USING ERRCODE='22023'; END IF;
 fee:=round(all_subtotal*fee_rate/100,2);
 FOR row_value IN SELECT value FROM jsonb_array_elements(rows) LOOP
  cumulative:=cumulative+(row_value->>'subtotal')::numeric;
  next_allocated:=CASE WHEN all_subtotal=0 THEN 0 ELSE round(fee*cumulative/all_subtotal,2) END;
  result:=result||jsonb_build_array(row_value||jsonb_build_object('fee_amount',next_allocated-allocated,
    'markup_amount',(row_value->>'markup_amount')::numeric+next_allocated-allocated,
    'line_total',(row_value->>'subtotal')::numeric+next_allocated-allocated));
  allocated:=next_allocated;
 END LOOP;
 IF all_subtotal+fee>999999999999.99 THEN RAISE EXCEPTION 'Estimate total is outside the supported range' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('lines',result,'subtotal',all_subtotal,'fee',fee,'total',all_subtotal+fee);
END $$;
REVOKE ALL ON FUNCTION public.workbench_handoff_pricing(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.submit_estimate_for_review(p_estimate_id uuid,p_expected_revision integer,
 p_destination text,p_job_id uuid,p_new_job jsonb,p_co_number text,p_line_targets jsonb)
 RETURNS public.estimate_workflow_handoffs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=auth.jwt()->>'sub'; e public.estimates; w public.estimate_workbenches;
 j public.jobs; co public.change_orders; saved public.estimate_workflow_handoffs; pricing jsonb;
 line jsonb; lines jsonb:='[]'; b public.job_budget_lines; number text; idx integer:=0; created boolean:=false; new_id uuid; approved_total numeric;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=actor AND is_active)
 THEN RAISE EXCEPTION 'An active signed-in user is required' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.estimates WHERE id=p_estimate_id AND editor_version=2 AND archived_at IS NULL FOR UPDATE;
 IF e.id IS NULL OR public.current_user_can_edit_division(e.division,'can_estimate') IS NOT TRUE
 THEN RAISE EXCEPTION 'Estimate editing permission is required' USING ERRCODE='42501'; END IF;
 SELECT * INTO saved FROM public.estimate_workflow_handoffs WHERE estimate_id=e.id;
 IF saved.id IS NOT NULL THEN
  IF saved.destination IS DISTINCT FROM p_destination OR (p_job_id IS NOT NULL AND saved.job_id<>p_job_id)
  THEN RAISE EXCEPTION 'This estimate already has a destination. Open its existing handoff; do not submit it again.' USING ERRCODE='22023'; END IF;
  IF public.current_user_can_access_job(saved.job_id,'can_view_project_financials') IS NOT TRUE
   OR public.current_user_can_access_job(saved.job_id,'can_view_protected_project_financials') IS NOT TRUE
  THEN RAISE EXCEPTION 'Destination financial access is required' USING ERRCODE='42501'; END IF;
  RETURN saved;
 END IF;
 IF p_destination IS NULL OR p_destination NOT IN ('job','change_order','service_call')
 THEN RAISE EXCEPTION 'Choose Job, Change Order or Service Call' USING ERRCODE='22023'; END IF;
 SELECT * INTO w FROM public.estimate_workbenches WHERE estimate_id=e.id FOR UPDATE;
 IF w.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Estimate changed. Save or reopen it before submitting.' USING ERRCODE='40001'; END IF;
 IF e.status NOT IN ('draft','approved') THEN RAISE EXCEPTION 'Use a draft or approved estimate' USING ERRCODE='22023'; END IF;
 pricing:=public.workbench_handoff_pricing(w.document);
 IF e.status='approved' THEN
  SELECT pricing_total INTO approved_total FROM public.estimate_snapshots WHERE estimate_id=e.id AND locked ORDER BY approved_at DESC LIMIT 1;
  IF approved_total IS DISTINCT FROM (pricing->>'total')::numeric THEN
   RAISE EXCEPTION 'The approved snapshot does not reconcile to this estimate. Create and review an editable revision before handoff.' USING ERRCODE='22023'; END IF;
 END IF;
 IF p_job_id IS NULL THEN
  IF p_destination='change_order' OR jsonb_typeof(p_new_job) IS DISTINCT FROM 'object'
   OR nullif(btrim(p_new_job->>'number'),'') IS NULL THEN
   RAISE EXCEPTION 'Choose an existing job for a Change Order, or enter a new job/service call number' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('northgate-service-call-save',0));
  IF EXISTS(SELECT 1 FROM public.jobs WHERE lower(btrim(job_number))=lower(btrim(p_new_job->>'number'))
    OR lower(btrim(service_call_number))=lower(btrim(p_new_job->>'number'))) THEN
   RAISE EXCEPTION 'That job or service call number is already assigned; choose another number' USING ERRCODE='23505'; END IF;
  IF p_destination='service_call' THEN
   new_id:=public.svc_save_call(NULL,jsonb_build_object(
    'service_call_number',p_new_job->>'number','name',coalesce(nullif(btrim(p_new_job->>'name'),''),e.title),
    'division',e.division,'work_stage','pursuit','billing_method','quoted','business_name',e.customer_name,
    'description',w.document->'proposal'->>'scope','notes','Created from estimate for review; not authorization to proceed.'),NULL);
   SELECT * INTO j FROM public.jobs WHERE id=new_id;
  ELSE
   j:=public.create_job(e.division,p_new_job->>'number',coalesce(nullif(btrim(p_new_job->>'name'),''),e.title),
    'on_hold',w.document->'proposal'->>'scope','Created from estimate for review; not authorization to proceed.',
    NULL,NULL,NULL,NULL,NULL,'job',NULL,actor);
  END IF;
  created:=true;
 ELSE
  SELECT * INTO j FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL FOR UPDATE;
 END IF;
 IF j.id IS NULL OR j.archived_at IS NOT NULL OR j.job_type IS DISTINCT FROM (CASE WHEN p_destination='service_call' THEN 'service_call' ELSE 'job' END)
 THEN RAISE EXCEPTION 'Choose an active destination of the correct type' USING ERRCODE='22023'; END IF;
 IF public.current_user_can_access_job(j.id,'can_view_project_financials') IS NOT TRUE
  OR public.current_user_can_access_job(j.id,'can_view_protected_project_financials') IS NOT TRUE
 THEN RAISE EXCEPTION 'Project and protected financial access are required for estimate cost breakdowns' USING ERRCODE='42501'; END IF;
 IF p_destination='change_order' THEN
  IF public.current_user_can_edit_division(j.division,'can_create_change_orders') IS NOT TRUE
  THEN RAISE EXCEPTION 'Change Order creation permission for this job is required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_line_targets) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Choose a project division for each work item' USING ERRCODE='22023'; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(pricing->'lines') LOOP
   SELECT * INTO b FROM public.job_budget_lines WHERE id=nullif(p_line_targets->>(line->>'key'),'')::uuid
    AND job_id=j.id AND archived_at IS NULL AND cost_code ~* '[.]CO$' FOR SHARE;
   IF b.id IS NULL THEN RAISE EXCEPTION 'Choose an active project-division .CO line for every work item' USING ERRCODE='22023'; END IF;
   lines:=lines||jsonb_build_array(line||jsonb_build_object('job_budget_line_id',b.id,'sort_order',idx));idx:=idx+1;
  END LOOP;
  number:=nullif(btrim(p_co_number),'');
  IF number IS NULL THEN
   SELECT (coalesce(max(co_number::bigint),0)+1)::text INTO number FROM public.change_orders
    WHERE job_id=j.id AND co_number ~ '^[0-9]{1,8}$';
   number:=lpad(number,greatest(3,length(number)),'0');
  END IF;
  IF EXISTS(SELECT 1 FROM public.change_orders WHERE job_id=j.id AND co_number=number) THEN
   RAISE EXCEPTION 'That Change Order number already exists; choose another number' USING ERRCODE='23505'; END IF;
  co:=public.save_job_change_order_draft(NULL,j.id,j.division,number,e.title,w.document->'proposal'->>'scope',
    current_date,NULL,lines,'Draft created from estimate '||e.id||' version '||e.version_number||' for review.');
  IF co.price_amount IS DISTINCT FROM (pricing->>'total')::numeric THEN RAISE EXCEPTION 'Estimate and Change Order totals did not reconcile'; END IF;
 ELSIF NOT created AND public.current_user_can_edit_job(j.id,'can_manage_jobs') IS NOT TRUE THEN
  RAISE EXCEPTION 'Job management permission is required to attach an estimate' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.estimate_workflow_handoffs(estimate_id,source_revision,source_version,destination,job_id,change_order_id,source_document,pricing,created_by)
 VALUES(e.id,w.revision,e.version_number,p_destination,j.id,co.id,w.document,pricing,actor) RETURNING * INTO saved;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
 VALUES(actor,public.change_order_actor(),'estimate_workflow_handoffs',saved.id::text,'create',
  to_jsonb(saved)-'source_document'-'pricing','Estimate submitted for review; no approval, budget posting, invoice or actual cost created.');
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.submit_estimate_for_review(uuid,integer,text,uuid,jsonb,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_estimate_for_review(uuid,integer,text,uuid,jsonb,text,jsonb) TO authenticated;
