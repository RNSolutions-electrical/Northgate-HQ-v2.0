-- Staging contract-adjustment refactor. Existing records remain Change Orders.
-- This migration is a local candidate until its staging regression gates pass.
ALTER TABLE public.change_orders ADD COLUMN record_type text NOT NULL DEFAULT 'change_order'
  CHECK(record_type IN ('change_order','credit'));
ALTER TABLE public.change_orders DROP CONSTRAINT change_orders_status_check;
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_status_check
  CHECK(status IN ('draft','potential','proposed','submitted','approved','rejected','denied','waived','voided'));
ALTER TABLE public.change_orders ALTER COLUMN price_amount DROP NOT NULL,
  ALTER COLUMN cost_amount DROP NOT NULL;
ALTER TABLE public.change_order_lines
  ALTER COLUMN material_amount DROP NOT NULL, ALTER COLUMN material_amount DROP DEFAULT,
  ALTER COLUMN labor_amount DROP NOT NULL, ALTER COLUMN labor_amount DROP DEFAULT,
  ALTER COLUMN equipment_amount DROP NOT NULL, ALTER COLUMN equipment_amount DROP DEFAULT,
  ALTER COLUMN subcontract_amount DROP NOT NULL, ALTER COLUMN subcontract_amount DROP DEFAULT,
  ALTER COLUMN other_amount DROP NOT NULL, ALTER COLUMN other_amount DROP DEFAULT,
  ALTER COLUMN markup_amount DROP NOT NULL, ALTER COLUMN markup_amount DROP DEFAULT;
-- Rebuild only the derived column. Historical fully populated rows evaluate identically.
ALTER TABLE public.change_order_lines DROP COLUMN line_total;
ALTER TABLE public.change_order_lines ADD COLUMN line_total numeric GENERATED ALWAYS AS (
  CASE WHEN material_amount IS NULL AND labor_amount IS NULL AND equipment_amount IS NULL
    AND subcontract_amount IS NULL AND other_amount IS NULL AND markup_amount IS NULL THEN NULL
  ELSE COALESCE(material_amount,0)+COALESCE(labor_amount,0)+COALESCE(equipment_amount,0)
    +COALESCE(subcontract_amount,0)+COALESCE(other_amount,0)+COALESCE(markup_amount,0) END
) STORED;
ALTER TABLE public.change_order_lines DROP CONSTRAINT change_order_lines_markup_percent_valid;
ALTER TABLE public.change_order_lines ADD CONSTRAINT change_order_lines_markup_percent_valid CHECK (
  markup_percent IS NULL OR (markup_percent >= 0 AND markup_percent NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    AND markup_amount = round((COALESCE(material_amount,0)+COALESCE(labor_amount,0)+COALESCE(equipment_amount,0)+COALESCE(subcontract_amount,0)+COALESCE(other_amount,0))*markup_percent/100,2)));
-- Reuse canonical action decisions and existing granular flags.
UPDATE public.authorization_actions SET minimum_business_role='Supervisor', scope_rule='PROJECT_ACCESS',
  required_permission=CASE action_id WHEN 'CFG-007' THEN 'can_submit_change_orders' WHEN 'AUD-018' THEN 'can_verify_change_orders' ELSE 'can_create_change_orders' END
  WHERE action_id IN ('AUD-019','AUD-021','CFG-007','AUD-018');
UPDATE public.authorization_actions SET minimum_business_role='Manager',scope_rule='PROJECT_ACCESS',
  required_permission='can_approve_change_orders' WHERE action_id IN ('CFG-009','AUD-016','AUD-017','V3-001');
-- Only defaults change; named custom templates and individual denies stay intact.
WITH previous AS MATERIALIZED (SELECT * FROM public.permission_templates WHERE default_role='Supervisor'),
changed AS (
 UPDATE public.permission_templates SET permissions=permissions || '{"can_create_change_orders":true,"can_submit_change_orders":true,"can_verify_change_orders":true}'::jsonb,
   version=version+1,updated_at=now() WHERE default_role='Supervisor' RETURNING *
)
INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
SELECT NULL,'Schema migration 20260925112213','permission_templates',changed.id::text,'permission_change',
 to_jsonb(previous),to_jsonb(changed),'Supervisor default preparation authority; individual overrides and unrelated defaults preserved.'
FROM changed JOIN previous USING(id);
CREATE OR REPLACE FUNCTION public.save_job_change_order_draft(
  p_change_order_id uuid, p_job_id uuid, p_division text, p_co_number text,
  p_title text, p_description text, p_change_order_date date,
  p_internal_notes text, p_lines jsonb, p_reason text
) RETURNS public.change_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  actor_id text := auth.jwt()->>'sub'; actor_name text; target public.change_orders%ROWTYPE;
  saved public.change_orders%ROWTYPE; line jsonb; budget_line public.job_budget_lines%ROWTYPE;
  normalized_reason text := NULLIF(BTRIM(COALESCE(p_reason,'')),'');
  total numeric := 0; before_lines jsonb := '[]'::jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE='28000'; END IF;
  IF p_job_id IS NULL OR NULLIF(BTRIM(p_co_number),'') IS NULL THEN
    RAISE EXCEPTION 'project and number are required';
  END IF;
  IF jsonb_typeof(COALESCE(p_lines,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'lines must be an array'; END IF;
  PERFORM 1 FROM public.jobs WHERE id=p_job_id AND division=p_division AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project and division must match an active project'; END IF;
  actor_name := public.change_order_actor();
  IF p_change_order_id IS NULL THEN
    IF NOT public.current_user_can_edit_job(p_job_id,'can_create_change_orders') THEN
      RAISE EXCEPTION 'can_create_change_orders is required' USING ERRCODE='42501';
    END IF;
    INSERT INTO public.change_orders(job_id,division,co_number,title,description,change_order_date,internal_notes,status,price_amount,cost_amount,created_by,updated_by)
    VALUES(p_job_id,p_division,BTRIM(p_co_number),COALESCE(BTRIM(p_title),''),NULLIF(BTRIM(COALESCE(p_description,'')),''),COALESCE(p_change_order_date,CURRENT_DATE),NULLIF(BTRIM(COALESCE(p_internal_notes,'')),''),'draft',0,0,actor_id,actor_id)
    RETURNING * INTO saved;
  ELSE
    PERFORM 1 FROM public.jobs WHERE id=(SELECT job_id FROM public.change_orders WHERE id=p_change_order_id) FOR UPDATE;
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
    IF target.id IS NULL OR target.job_id<>p_job_id OR target.division<>p_division THEN RAISE EXCEPTION 'change order not found'; END IF;
    IF target.status NOT IN ('draft','potential','proposed','submitted') THEN RAISE EXCEPTION 'approved/finalized adjustments require a controlled revision'; END IF;
    IF NOT public.current_user_can_edit_job(p_job_id,'can_create_change_orders')
      AND NOT (target.revision_of_id IS NOT NULL AND public.current_user_can_edit_job(p_job_id,'can_revise_change_orders')) THEN
      RAISE EXCEPTION 'can_create_change_orders or revision edit authority is required' USING ERRCODE='42501';
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(col) ORDER BY col.sort_order,col.id),'[]'::jsonb) INTO before_lines
      FROM public.change_order_lines col WHERE col.change_order_id=target.id;
    UPDATE public.change_orders SET co_number=BTRIM(p_co_number),title=COALESCE(BTRIM(p_title),''),
      description=NULLIF(BTRIM(COALESCE(p_description,'')),''),change_order_date=COALESCE(p_change_order_date,CURRENT_DATE),
      internal_notes=NULLIF(BTRIM(COALESCE(p_internal_notes,'')),''),updated_by=actor_id,updated_at=NOW()
      WHERE id=target.id RETURNING * INTO saved;
    DELETE FROM public.change_order_lines WHERE change_order_id=target.id;
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines,'[]'::jsonb)) LOOP
    budget_line := NULL;
    IF NULLIF(BTRIM(line->>'job_budget_line_id'),'') IS NOT NULL THEN
      SELECT * INTO budget_line FROM public.job_budget_lines
        WHERE id=(line->>'job_budget_line_id')::uuid AND job_id=p_job_id AND archived_at IS NULL;
      IF budget_line.id IS NULL OR NOT public.current_user_can_read_project_financial_line(p_job_id,budget_line.id) THEN RAISE EXCEPTION 'each coded line must reference an accessible active project financial line'; END IF;
    END IF;

    INSERT INTO public.change_order_lines(change_order_id,job_budget_line_id,division,cost_code,description,vendor_name,
      material_amount,labor_amount,equipment_amount,subcontract_amount,other_amount,markup_amount,sort_order,created_by,updated_by)
    VALUES(saved.id,budget_line.id,p_division,budget_line.cost_code,COALESCE(BTRIM(line->>'description'),''),
      NULLIF(BTRIM(COALESCE(line->>'vendor_name','')),''),round(NULLIF(line->>'material_amount','')::numeric,2),
      round(NULLIF(line->>'labor_amount','')::numeric,2),round(NULLIF(line->>'equipment_amount','')::numeric,2),
      round(NULLIF(line->>'subcontract_amount','')::numeric,2),round(NULLIF(line->>'other_amount','')::numeric,2),
      round(NULLIF(line->>'markup_amount','')::numeric,2),COALESCE(NULLIF(line->>'sort_order','')::integer,0),actor_id,actor_id);
  END LOOP;
  SELECT SUM(line_total) INTO total FROM public.change_order_lines WHERE change_order_id=saved.id;
  UPDATE public.change_orders SET price_amount=total,
    cost_amount=total-COALESCE((SELECT SUM(markup_amount) FROM public.change_order_lines WHERE change_order_id=saved.id),0),
    updated_at=NOW() WHERE id=saved.id RETURNING * INTO saved;
  -- Keep the file in Documents, but do not treat authorization for an earlier
  -- scope/price as authorization for edited work. Identical saves retain it.
  IF target.signed_document_id IS NOT NULL AND (
    ROW(target.co_number,target.title,target.description,target.change_order_date)
      IS DISTINCT FROM ROW(saved.co_number,saved.title,saved.description,saved.change_order_date)
    OR (SELECT jsonb_agg(jsonb_build_object('description',x->>'description','amount',x->'line_total') ORDER BY ordinal)
        FROM jsonb_array_elements(before_lines) WITH ORDINALITY t(x,ordinal)
        WHERE COALESCE((x->>'is_overall_markup')::boolean,false)=false)
      IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('description',description,'amount',line_total) ORDER BY sort_order,id)
        FROM public.change_order_lines WHERE change_order_id=saved.id AND NOT is_overall_markup)
  ) THEN
    UPDATE public.change_orders SET signed_document_id=NULL,verified_by=NULL,verification_name=NULL,
      verified_at=NULL,certification_state=false WHERE id=saved.id RETURNING * INTO saved;
  END IF;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
    VALUES(actor_id,actor_name,'change_orders',saved.id::text,CASE WHEN target.id IS NULL THEN 'create' ELSE 'update' END,
      CASE WHEN target.id IS NULL THEN NULL ELSE to_jsonb(target)||jsonb_build_object('lines',before_lines) END,
      to_jsonb(saved)||jsonb_build_object('lines',p_lines),normalized_reason);
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.save_job_change_order_draft(uuid,uuid,text,text,text,text,date,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_job_change_order_draft(uuid,uuid,text,text,text,text,date,text,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_job_change_order_draft_with_all_markups(
  p_change_order_id uuid, p_job_id uuid, p_division text, p_co_number text, p_title text,
  p_description text, p_change_order_date date, p_internal_notes text, p_lines jsonb,
  p_reason text, p_overall_markup_percent numeric, p_overall_markup_budget_line_id uuid
) RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
  saved public.change_orders%ROWTYPE;
  previous public.change_orders%ROWTYPE;
  budget_line public.job_budget_lines%ROWTYPE;
  base_total numeric;
  markup_value numeric;
  rate numeric := COALESCE(p_overall_markup_percent, 0);
  actor_id text := auth.jwt()->>'sub';
BEGIN
  IF rate < 0 OR rate IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'Overall markup percentage must be a valid non-negative number' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) item
    WHERE item->>'is_overall_markup' = 'true') THEN
    RAISE EXCEPTION 'Overall markup is calculated separately; do not include it among line items' USING ERRCODE = '22023';
  END IF;
  IF rate > 0 THEN
    SELECT * INTO budget_line FROM public.job_budget_lines
      WHERE id = p_overall_markup_budget_line_id AND job_id = p_job_id AND archived_at IS NULL;
    IF p_overall_markup_budget_line_id IS NOT NULL AND (budget_line.id IS NULL OR NOT public.current_user_can_read_project_financial_line(p_job_id,budget_line.id)) THEN
      RAISE EXCEPTION 'Select an active financial line for overall Change Order markup' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Reuse the existing authority, draft-state, line, total and audit checks.
  saved := public.save_job_change_order_draft_with_rates(p_change_order_id, p_job_id,
    p_division, p_co_number, p_title, p_description, p_change_order_date,
    p_internal_notes, p_lines, p_reason);
  previous := saved;
  IF previous.signed_document_id IS NOT NULL AND COALESCE(previous.overall_markup_percent,0)<>rate THEN
    UPDATE public.change_orders SET signed_document_id=NULL,verified_by=NULL,verification_name=NULL,
      verified_at=NULL,certification_state=false WHERE id=saved.id;
  END IF;
  -- The legacy draft-save RPC replaces all prior lines. Repeat this targeted
  -- cleanup defensively so retries cannot include a previous overall line.
  DELETE FROM public.change_order_lines
    WHERE change_order_id = saved.id AND is_overall_markup;
  SELECT SUM(line_total) INTO base_total
    FROM public.change_order_lines WHERE change_order_id = saved.id AND NOT is_overall_markup;
  markup_value := round(base_total * rate / 100, 2);

  IF rate > 0 AND base_total IS NOT NULL THEN
    INSERT INTO public.change_order_lines(
      change_order_id, job_budget_line_id, division, cost_code, description,
      material_amount, labor_amount, equipment_amount, subcontract_amount,
      other_amount, markup_amount, sort_order, created_by, updated_by, is_overall_markup
    ) VALUES (
      saved.id, budget_line.id, p_division, budget_line.cost_code,
      'General Contractor Fee', 0, 0, 0, 0, 0, markup_value,
      jsonb_array_length(COALESCE(p_lines, '[]'::jsonb)), actor_id, actor_id, true
    );
  END IF;
  UPDATE public.change_orders SET overall_markup_percent = rate,
    price_amount = base_total + COALESCE(markup_value,0), updated_by = actor_id, updated_at = now()
    WHERE id = saved.id AND status IN ('draft','potential','proposed','submitted') RETURNING * INTO saved;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'Draft could not be updated'; END IF;
  INSERT INTO public.change_logs(user_id, user_name, table_name, record_id, action,
    before_data, after_data, note)
  VALUES (actor_id, public.change_order_actor(), 'change_orders', saved.id::text,
    'update', to_jsonb(previous), to_jsonb(saved),
    'Overall Change Order markup: ' || rate::text || '% of marked-up line totals (' || base_total::text || ').');
  RETURN saved;
END
$function$;
REVOKE ALL ON FUNCTION public.save_job_change_order_draft_with_all_markups(uuid,uuid,text,text,text,text,date,text,jsonb,text,numeric,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_job_change_order_draft_with_all_markups(uuid,uuid,text,text,text,text,date,text,jsonb,text,numeric,uuid)
  TO authenticated;



CREATE OR REPLACE FUNCTION public.guard_change_order_line_coding() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  -- Completeness is checked by submission/approval, not ordinary saves.
  IF TG_TABLE_NAME='change_orders' THEN
   IF NEW.status='approved' AND EXISTS(
    SELECT 1 FROM public.change_order_lines WHERE change_order_id=NEW.id AND job_budget_line_id IS NULL
   ) THEN RAISE EXCEPTION 'Assign a financial line to every item before approval'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_v5_change_order_action() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE action_id text; decision jsonb;
BEGIN
  PERFORM 1 FROM public.jobs WHERE id=NEW.job_id FOR UPDATE;
  IF NEW.archived_at IS NULL AND
    (NEW.status IN ('potential','proposed','submitted') OR (NEW.status='approved' AND NEW.signed_document_id IS NULL))
    AND EXISTS(SELECT 1 FROM public.jobs WHERE id=NEW.job_id AND status='complete') THEN
    RAISE EXCEPTION 'Reopen the job before adding an unresolved contract adjustment';
  END IF;
  IF TG_OP='INSERT' THEN action_id:='AUD-019';
  ELSIF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN action_id:='AUD-017';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    action_id:=CASE NEW.status WHEN 'approved' THEN 'CFG-009' WHEN 'submitted' THEN 'CFG-007'
      WHEN 'denied' THEN 'V3-001' WHEN 'waived' THEN 'V3-001' WHEN 'voided' THEN 'V3-005' ELSE CASE WHEN OLD.status IN ('denied','waived','rejected') THEN 'V3-001' ELSE 'AUD-021' END END;
  ELSIF NEW.signed_document_id IS NOT NULL AND OLD.signed_document_id IS DISTINCT FROM NEW.signed_document_id THEN action_id:='AUD-018';
  ELSE action_id:='AUD-021'; END IF;
  decision:=public.current_scoped_authorization_decision(action_id,jsonb_build_object('job_id',NEW.job_id));
  IF COALESCE((decision->>'allowed')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'This contract-adjustment action is not authorized' USING ERRCODE='42501',DETAIL=decision::text;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.validate_contract_adjustment(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE co public.change_orders;
BEGIN
  SELECT * INTO co FROM public.change_orders WHERE id=p_id;
  IF NOT public.current_user_can_access_job(co.job_id) THEN RAISE EXCEPTION 'Job access required' USING ERRCODE='42501'; END IF;
  IF NULLIF(trim(co.title),'') IS NULL THEN RAISE EXCEPTION 'Add a description/title before submitting or approving'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.change_order_lines WHERE change_order_id=p_id AND NOT is_overall_markup)
    OR EXISTS(SELECT 1 FROM public.change_order_lines l LEFT JOIN public.job_budget_lines b ON b.id=l.job_budget_line_id
      WHERE l.change_order_id=p_id AND (NULLIF(trim(l.description),'') IS NULL OR l.line_total IS NULL OR b.id IS NULL OR b.job_id<>co.job_id OR b.archived_at IS NOT NULL))
  THEN RAISE EXCEPTION 'Each item needs a description, an explicit amount (zero is valid), and an active project cost code'; END IF;
  IF co.record_type='credit' AND co.price_amount>0 THEN RAISE EXCEPTION 'A standalone Credit must have a zero or negative net value'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.validate_contract_adjustment(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.approve_job_change_order(p_change_order_id UUID,p_reason TEXT)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; target public.change_orders%ROWTYPE; saved public.change_orders%ROWTYPE; expected_count INTEGER; posted_count INTEGER;
BEGIN
  PERFORM 1 FROM public.jobs WHERE id=(SELECT job_id FROM public.change_orders WHERE id=p_change_order_id) FOR UPDATE;
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR NOT public.current_user_can_edit_job(target.job_id,'can_approve_change_orders') THEN RAISE EXCEPTION 'can_approve_change_orders is required' USING ERRCODE='42501'; END IF;
  IF target.status='approved' THEN RETURN target; END IF;
  IF target.status NOT IN ('draft','potential','proposed','submitted') THEN RAISE EXCEPTION 'This adjustment has a final decision'; END IF;
  PERFORM public.validate_contract_adjustment(target.id);
  PERFORM 1 FROM public.jobs WHERE id=target.job_id FOR UPDATE;
  IF target.revision_of_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.change_orders WHERE id=target.revision_of_id AND status='approved') OR EXISTS(SELECT 1 FROM public.change_orders WHERE revision_of_id=target.revision_of_id AND status='approved' AND id<>target.id)) THEN RAISE EXCEPTION 'The source revision has changed; refresh and review before approval'; END IF;
  WITH current_totals AS (
    SELECT job_budget_line_id,MAX(cost_code) cost_code,SUM(line_total) amount FROM public.change_order_lines WHERE change_order_id=target.id GROUP BY job_budget_line_id
  ), previous_totals AS (
    SELECT col.job_budget_line_id,SUM(col.line_total) amount FROM public.change_order_lines col WHERE col.change_order_id=target.revision_of_id GROUP BY col.job_budget_line_id
  ), deltas AS (
    SELECT COALESCE(c.job_budget_line_id,p.job_budget_line_id) job_budget_line_id,COALESCE(c.cost_code,jbl.cost_code) cost_code,COALESCE(c.amount,0)-COALESCE(p.amount,0) amount_delta
    FROM current_totals c FULL JOIN previous_totals p USING(job_budget_line_id)
    JOIN public.job_budget_lines jbl ON jbl.id=COALESCE(c.job_budget_line_id,p.job_budget_line_id)
  )
  INSERT INTO public.change_order_financial_postings(change_order_id,job_id,job_budget_line_id,division,cost_code,amount_delta,posted_by,posting_kind)
  SELECT target.id,target.job_id,d.job_budget_line_id,target.division,d.cost_code,d.amount_delta,actor_id,'approval' FROM deltas d
  ON CONFLICT(change_order_id,job_budget_line_id,posting_kind) DO NOTHING;
  SELECT COUNT(DISTINCT job_budget_line_id) INTO expected_count FROM public.change_order_lines WHERE change_order_id=target.id OR change_order_id=target.revision_of_id;
  SELECT COUNT(*) INTO posted_count FROM public.change_order_financial_postings WHERE change_order_id=target.id;
  IF posted_count<>expected_count THEN RAISE EXCEPTION 'financial posting count did not reconcile; approval rolled back'; END IF;
  UPDATE public.change_orders SET status='approved',approved_by=actor_id,approved_at=NOW(),decision_name=public.change_order_actor(),decision_certification_state=TRUE,updated_by=actor_id,updated_at=NOW() WHERE id=target.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,public.change_order_actor(),'change_orders',saved.id::TEXT,'update',to_jsonb(target),to_jsonb(saved),COALESCE(NULLIF(BTRIM(p_reason),''),'Change Order approved and financial postings created atomically.'));
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,public.change_order_actor(),'change_order_financial_postings',saved.id::TEXT,'create',NULL,jsonb_build_object('posting_count',posted_count,'change_order_id',saved.id,'job_id',saved.job_id),'Immutable Change Order financial postings created.');
  RETURN saved;
END $$;


-- Compatibility overload: identity is always server-derived; no manual initials.
CREATE OR REPLACE FUNCTION public.approve_job_change_order(p_change_order_id uuid,p_reason text,p_decision_name text,p_certified boolean)
RETURNS public.change_orders LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.approve_job_change_order(p_change_order_id,p_reason)
$$;

CREATE FUNCTION public.set_contract_adjustment_status(p_id uuid,p_status text,p_note text DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.change_orders; saved public.change_orders; actor text:=auth.jwt()->>'sub';
BEGIN
 PERFORM 1 FROM public.jobs WHERE id=(SELECT job_id FROM public.change_orders WHERE id=p_id) FOR UPDATE;
 SELECT * INTO prior FROM public.change_orders WHERE id=p_id AND archived_at IS NULL FOR UPDATE;
 IF prior.id IS NULL OR NOT public.current_user_can_access_job(prior.job_id) THEN RAISE EXCEPTION 'Adjustment access required' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NOT NULL AND prior.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'Another user changed this adjustment. Refresh before continuing.' USING ERRCODE='40001'; END IF;
 IF p_status=prior.status THEN RETURN prior; END IF;
 IF p_status='approved' THEN RETURN public.approve_job_change_order(p_id,p_note); END IF;
 IF p_status='submitted' THEN RETURN public.submit_job_change_order(p_id,p_note); END IF;
 IF p_status NOT IN ('draft','potential','denied','waived') THEN RAISE EXCEPTION 'Unsupported adjustment status'; END IF;
 IF prior.status IN ('approved','voided') OR EXISTS(SELECT 1 FROM public.change_order_financial_postings WHERE change_order_id=p_id) THEN
   RAISE EXCEPTION 'Posted adjustments require a controlled revision or reversal';
 END IF;
 IF p_status IN ('denied','waived') THEN
   IF NOT public.current_user_can_edit_job(prior.job_id,'can_approve_change_orders') THEN RAISE EXCEPTION 'Manager decision authority required' USING ERRCODE='42501'; END IF;
 ELSE
   IF NOT public.current_user_can_edit_job(prior.job_id,'can_create_change_orders') THEN RAISE EXCEPTION 'Preparation authority required' USING ERRCODE='42501'; END IF;
   IF prior.status IN ('denied','waived','rejected') AND NOT public.current_user_can_edit_job(prior.job_id,'can_approve_change_orders') THEN RAISE EXCEPTION 'Manager authority required to reopen a final decision' USING ERRCODE='42501'; END IF;
 END IF;
 UPDATE public.change_orders SET status=p_status,updated_by=actor,updated_at=now(),
   denied_at=CASE WHEN p_status='denied' THEN now() ELSE denied_at END,
   denied_by=CASE WHEN p_status='denied' THEN actor ELSE denied_by END,
   denial_reason=CASE WHEN p_status='denied' THEN p_note ELSE denial_reason END,
   decision_name=CASE WHEN p_status IN ('denied','waived') THEN public.change_order_actor() ELSE decision_name END
 WHERE id=p_id RETURNING * INTO saved;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,public.change_order_actor(),'change_orders',p_id::text,'update',to_jsonb(prior),to_jsonb(saved),COALESCE(NULLIF(trim(p_note),''),'Status set to '||p_status||'. No financial posting.'));
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.set_contract_adjustment_status(uuid,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_contract_adjustment_status(uuid,text,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.deny_job_change_order(p_change_order_id uuid,p_reason text,p_decision_name text,p_certified boolean)
RETURNS public.change_orders LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.set_contract_adjustment_status(p_change_order_id,'denied',p_reason)
$$;

CREATE FUNCTION public.save_contract_adjustment(p_data jsonb)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE saved public.change_orders; prior public.change_orders; j public.jobs; id_value uuid:=NULLIF(p_data->>'id','')::uuid;
 kind text:=COALESCE(p_data->>'record_type','change_order'); number_value text:=NULLIF(trim(p_data->>'co_number'),'');
 prefix text; next_number bigint; desired_status text:=COALESCE(p_data->>'status','draft');
BEGIN
 IF kind NOT IN ('change_order','credit') OR desired_status NOT IN ('draft','potential','submitted') THEN RAISE EXCEPTION 'Invalid type or editable status'; END IF;
 SELECT * INTO j FROM public.jobs WHERE id=(p_data->>'job_id')::uuid AND archived_at IS NULL FOR UPDATE;
 IF j.id IS NULL OR NOT public.current_user_can_edit_job(j.id,'can_create_change_orders') THEN RAISE EXCEPTION 'Preparation authority required' USING ERRCODE='42501'; END IF;
 IF id_value IS NOT NULL THEN
   SELECT * INTO prior FROM public.change_orders WHERE id=id_value AND job_id=j.id AND archived_at IS NULL FOR UPDATE;
   IF prior.id IS NULL OR prior.status NOT IN ('draft','potential','proposed','submitted') THEN RAISE EXCEPTION 'Only editable adjustments can be saved'; END IF;
   IF NULLIF(p_data->>'expected_updated_at','')::timestamptz IS DISTINCT FROM prior.updated_at THEN RAISE EXCEPTION 'Another user changed this adjustment. Refresh before saving.' USING ERRCODE='40001'; END IF;
   IF prior.record_type<>kind THEN RAISE EXCEPTION 'Record type cannot change after creation'; END IF;
 END IF;
 prefix:=CASE kind WHEN 'credit' THEN 'CR-' ELSE 'CO-' END;
 IF number_value IS NULL THEN
   SELECT COALESCE(MAX(substring(co_number from ('^'||prefix||'([0-9]+)'))::bigint),0)+1 INTO next_number
   FROM public.change_orders WHERE job_id=j.id AND record_type=kind;
   number_value:=prefix||lpad(next_number::text,GREATEST(3,length(next_number::text)),'0');
 END IF;
 IF (kind='credit' AND number_value !~ '^CR-') OR (kind='change_order' AND number_value ~ '^CR-') THEN RAISE EXCEPTION 'Credits use CR numbers; Change Orders use CO numbers'; END IF;
 saved:=public.save_job_change_order_draft_with_all_markups(id_value,j.id,j.division,number_value,
   p_data->>'title',p_data->>'description',NULLIF(p_data->>'change_order_date','')::date,p_data->>'internal_notes',
   COALESCE(p_data->'lines','[]'::jsonb),p_data->>'note',NULLIF(p_data->>'overall_markup_percent','')::numeric,
   NULLIF(p_data->>'overall_markup_budget_line_id','')::uuid);
 UPDATE public.change_orders SET record_type=kind WHERE id=saved.id RETURNING * INTO saved;
 IF desired_status<>saved.status THEN saved:=public.set_contract_adjustment_status(saved.id,desired_status,p_data->>'note'); END IF;
 IF desired_status='submitted' THEN PERFORM public.validate_contract_adjustment(saved.id); END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
 VALUES(auth.jwt()->>'sub',public.change_order_actor(),'change_orders',saved.id::text,'update',to_jsonb(saved),'Contract adjustment type and current state saved.');
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.save_contract_adjustment(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_contract_adjustment(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_signed_job_change_order_document(p_change_order_id uuid,p_document_id uuid,p_verification_name text,p_certified boolean)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.change_orders; saved public.change_orders; doc public.documents; actor text:=auth.jwt()->>'sub';
BEGIN
 PERFORM 1 FROM public.jobs WHERE id=(SELECT job_id FROM public.change_orders WHERE id=p_change_order_id) FOR UPDATE;
 SELECT * INTO prior FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
 IF prior.id IS NULL OR NOT public.current_user_can_edit_job(prior.job_id,'can_verify_change_orders') THEN RAISE EXCEPTION 'Document attachment authority required' USING ERRCODE='42501'; END IF;
 SELECT * INTO doc FROM public.documents WHERE id=p_document_id AND owner_type='job' AND owner_id=prior.job_id
   AND change_order_id=prior.id AND document_type='change_orders' AND archived_at IS NULL;
 IF doc.id IS NULL OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='northgate-files' AND name=doc.storage_path)
 THEN RAISE EXCEPTION 'Upload the linked authorization file before attaching it'; END IF;
 UPDATE public.change_orders SET signed_document_id=doc.id,verified_by=actor,verification_name=public.change_order_actor(),
  verified_at=now(),certification_state=true,updated_by=actor,updated_at=now() WHERE id=prior.id RETURNING * INTO saved;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,public.change_order_actor(),'change_orders',saved.id::text,'update',to_jsonb(prior),to_jsonb(saved),'Customer authorization attached directly to contract adjustment.');
 RETURN saved;
END $$;
CREATE POLICY contract_adjustment_document_insert ON public.documents FOR INSERT TO authenticated WITH CHECK (
 owner_type='job' AND document_type='change_orders' AND EXISTS(SELECT 1 FROM public.change_orders co
 WHERE co.id=documents.change_order_id AND co.job_id=documents.owner_id AND co.division=documents.division AND co.archived_at IS NULL
 AND public.current_user_can_edit_job(co.job_id,'can_verify_change_orders')));
-- Reuse financial visibility for the entire adjustment; never disclose hidden pricing via line reads.
DROP POLICY change_order_lines_read ON public.change_order_lines;
CREATE POLICY change_order_lines_read ON public.change_order_lines FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.change_orders co WHERE co.id=change_order_id AND co.archived_at IS NULL
 AND public.current_user_can_read_project_change_order(co.job_id,co.id)));

CREATE OR REPLACE FUNCTION public.record_job_change_order_export(p_change_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE co public.change_orders;
BEGIN
 SELECT * INTO co FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
 IF co.id IS NULL OR NOT public.current_user_can_read_project_change_order(co.job_id,co.id) THEN RAISE EXCEPTION 'Adjustment access required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,note)
 VALUES(auth.jwt()->>'sub',public.change_order_actor(),'change_orders',co.id::text,'update','Client print preview exported.');
END $$;

CREATE OR REPLACE FUNCTION public.archive_job_change_order(p_change_order_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.change_orders; saved public.change_orders;
BEGIN
 PERFORM 1 FROM public.jobs WHERE id=(SELECT job_id FROM public.change_orders WHERE id=p_change_order_id) FOR UPDATE;
 SELECT * INTO prior FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
 IF prior.id IS NULL OR NOT public.current_user_can_edit_job(prior.job_id,'can_approve_change_orders') THEN RAISE EXCEPTION 'Manager decision authority required' USING ERRCODE='42501'; END IF;
 IF prior.status='approved' OR EXISTS(SELECT 1 FROM public.change_order_financial_postings WHERE change_order_id=prior.id) THEN
 RAISE EXCEPTION 'Posted adjustments remain in the contract history. Use a controlled revision or reversal.'; END IF;
 UPDATE public.change_orders SET archived_at=now(),archived_by=auth.jwt()->>'sub',
 archive_reason=COALESCE(NULLIF(trim(p_reason),''),'Archived from active adjustments.'),updated_at=now(),updated_by=auth.jwt()->>'sub'
 WHERE id=prior.id RETURNING * INTO saved;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(auth.jwt()->>'sub',public.change_order_actor(),'change_orders',saved.id::text,'archive',to_jsonb(prior),to_jsonb(saved),saved.archive_reason);
END $$;

CREATE FUNCTION public.job_contract_closeout_counts(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE missing_count integer; unresolved_count integer;
BEGIN
 IF NOT public.current_user_can_access_job(p_job_id) THEN RAISE EXCEPTION 'Job access required' USING ERRCODE='42501'; END IF;
 SELECT count(*) FILTER(WHERE co.status='approved' AND co.archived_at IS NULL AND NOT EXISTS(
   SELECT 1 FROM public.documents d WHERE d.id=co.signed_document_id AND d.change_order_id=co.id AND d.archived_at IS NULL)),
   count(*) FILTER(WHERE co.archived_at IS NULL AND co.status IN ('potential','proposed','submitted'))
 INTO missing_count,unresolved_count FROM public.change_orders co WHERE co.job_id=p_job_id
 AND NOT EXISTS(SELECT 1 FROM public.change_orders revision WHERE revision.revision_of_id=co.id AND revision.status='approved');
 RETURN jsonb_build_object('missing_signed_documents',missing_count,'unresolved_adjustments',unresolved_count,
   'ready',missing_count+unresolved_count=0);
END $$;
REVOKE ALL ON FUNCTION public.job_contract_closeout_counts(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.job_contract_closeout_counts(uuid) TO authenticated;

CREATE FUNCTION public.guard_job_contract_closeout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE readiness jsonb;
BEGIN
 IF NEW.status='complete' AND OLD.status IS DISTINCT FROM NEW.status THEN
   readiness:=public.job_contract_closeout_counts(NEW.id);
   IF NOT (readiness->>'ready')::boolean THEN RAISE EXCEPTION 'Job closeout requires % signed authorization(s) and disposition of % unresolved contract adjustment(s).',
     readiness->>'missing_signed_documents',readiness->>'unresolved_adjustments'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_job_contract_closeout() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER jobs_contract_closeout_guard BEFORE UPDATE OF status ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.guard_job_contract_closeout();

CREATE OR REPLACE FUNCTION public.revise_job_change_order(p_change_order_id uuid, p_reason text)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE actor_id text := auth.jwt()->>'sub'; target public.change_orders%ROWTYPE; revised public.change_orders%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.jobs WHERE id=(SELECT job_id FROM public.change_orders WHERE id=p_change_order_id) FOR UPDATE;
  PERFORM 1 FROM public.jobs WHERE id=(SELECT job_id FROM public.change_orders WHERE id=p_change_order_id) FOR UPDATE;
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR target.status<>'approved' OR NOT public.current_user_can_edit_division(target.division,'can_revise_change_orders') THEN
    RAISE EXCEPTION 'approved Change Order and can_revise_change_orders are required' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.change_orders(job_id,division,co_number,title,description,price_amount,cost_amount,status,
    change_order_date,internal_notes,created_by,updated_by,revision_of_id,revision_number,overall_markup_percent,record_type)
  VALUES(target.job_id,target.division,target.co_number||'-R'||(target.revision_number+1),target.title,target.description,
    target.price_amount,target.cost_amount,'draft',CURRENT_DATE,target.internal_notes,actor_id,actor_id,target.id,
    target.revision_number+1,target.overall_markup_percent,target.record_type) RETURNING * INTO revised;
  INSERT INTO public.change_order_lines(change_order_id,job_budget_line_id,division,cost_code,description,vendor_name,
    material_amount,labor_amount,equipment_amount,subcontract_amount,other_amount,markup_amount,
    markup_percent,is_overall_markup,sort_order,created_by,updated_by)
  SELECT revised.id,job_budget_line_id,division,cost_code,description,vendor_name,material_amount,labor_amount,
    equipment_amount,subcontract_amount,other_amount,markup_amount,markup_percent,is_overall_markup,
    sort_order,actor_id,actor_id FROM public.change_order_lines WHERE change_order_id=target.id ORDER BY sort_order,id;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor_id,public.change_order_actor(),'change_orders',revised.id::text,'create',to_jsonb(target),to_jsonb(revised),
    COALESCE(NULLIF(BTRIM(p_reason),''),'Controlled revision created.'));
  RETURN revised;
END
$function$;

CREATE OR REPLACE FUNCTION public.submit_job_change_order(p_change_order_id uuid,p_reason text)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.change_orders; saved public.change_orders; actor text:=auth.jwt()->>'sub';
BEGIN
 PERFORM 1 FROM public.jobs WHERE id=(SELECT job_id FROM public.change_orders WHERE id=p_change_order_id) FOR UPDATE;
 SELECT * INTO prior FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
 IF prior.id IS NULL OR NOT public.current_user_can_edit_job(prior.job_id,'can_submit_change_orders') THEN RAISE EXCEPTION 'Submission authority required' USING ERRCODE='42501'; END IF;
 IF prior.status NOT IN ('draft','potential','proposed','submitted') THEN RAISE EXCEPTION 'This adjustment is finalized'; END IF;
 PERFORM public.validate_contract_adjustment(prior.id);
 UPDATE public.change_orders SET status='submitted',submitted_by=actor,submitted_at=now(),updated_by=actor,updated_at=now() WHERE id=prior.id RETURNING * INTO saved;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,public.change_order_actor(),'change_orders',saved.id::text,'update',to_jsonb(prior),to_jsonb(saved),COALESCE(NULLIF(trim(p_reason),''),'Submitted for customer disposition.'));
 RETURN saved;
END $$;
