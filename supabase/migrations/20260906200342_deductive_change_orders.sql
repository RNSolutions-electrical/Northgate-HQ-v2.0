-- Deductive Change Orders retain signed amounts. No permission or approval changes.
CREATE OR REPLACE FUNCTION public.void_approved_job_change_order(p_change_order_id uuid, p_reason text, p_confirmation text)
 RETURNS change_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; target public.change_orders%ROWTYPE; saved public.change_orders%ROWTYPE; approval_count INTEGER; void_count INTEGER; unbalanced_count INTEGER; normalized_reason TEXT:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR NOT public.current_user_can_edit_division(target.division,'can_revise_change_orders') THEN RAISE EXCEPTION 'Change Order and can_revise_change_orders are required' USING ERRCODE='42501'; END IF;
  IF target.status='voided' THEN RETURN target; END IF;
  IF target.status<>'approved' THEN RAISE EXCEPTION 'only an approved Change Order may be voided'; END IF;
  IF normalized_reason IS NULL OR BTRIM(COALESCE(p_confirmation,''))<>target.co_number THEN RAISE EXCEPTION 'reason and exact Change Order number confirmation are required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.change_order_financial_postings(change_order_id,job_id,job_budget_line_id,division,cost_code,amount_delta,posted_by,posting_kind)
  SELECT change_order_id,job_id,job_budget_line_id,division,cost_code,-amount_delta,actor_id,'void'
  FROM public.change_order_financial_postings WHERE change_order_id=target.id AND posting_kind='approval'
  ON CONFLICT(change_order_id,job_budget_line_id,posting_kind) DO NOTHING;
  SELECT COUNT(*) FILTER(WHERE posting_kind='approval'),COUNT(*) FILTER(WHERE posting_kind='void') INTO approval_count,void_count
  FROM public.change_order_financial_postings WHERE change_order_id=target.id;
  SELECT COUNT(*) INTO unbalanced_count FROM (
    SELECT job_budget_line_id FROM public.change_order_financial_postings WHERE change_order_id=target.id GROUP BY job_budget_line_id HAVING SUM(amount_delta)<>0
  ) unbalanced;
  IF approval_count=0 OR void_count<>approval_count OR unbalanced_count<>0 THEN RAISE EXCEPTION 'void reversal did not reconcile; operation rolled back'; END IF;
  UPDATE public.change_orders SET status='voided',voided_at=NOW(),voided_by=actor_id,void_reason=normalized_reason,updated_by=actor_id,updated_at=NOW()
  WHERE id=target.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor_id,public.change_order_actor(),'change_orders',saved.id::TEXT,'update',to_jsonb(target),to_jsonb(saved),normalized_reason);
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor_id,public.change_order_actor(),'change_order_financial_postings',saved.id::TEXT,'create',NULL,jsonb_build_object('posting_kind','void','posting_count',void_count,'change_order_id',saved.id,'job_id',saved.job_id),'Immutable equal-and-opposite void postings created.');
  RETURN saved;
END $function$
;
-- Keep uniqueness per posting kind so a credit can receive its opposite void posting.
ALTER TABLE public.change_order_financial_postings DROP CONSTRAINT change_order_financial_postin_change_order_id_job_budget_li_key;
ALTER TABLE public.change_orders DROP CONSTRAINT change_orders_cost_amount_check;
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_cost_amount_check CHECK (cost_amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));
ALTER TABLE public.change_orders DROP CONSTRAINT change_orders_price_amount_check;
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_price_amount_check CHECK (price_amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));
ALTER TABLE public.change_order_lines DROP CONSTRAINT change_order_lines_material_amount_check;
ALTER TABLE public.change_order_lines ADD CONSTRAINT change_order_lines_material_amount_check CHECK (material_amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));
ALTER TABLE public.change_order_lines DROP CONSTRAINT change_order_lines_labor_amount_check;
ALTER TABLE public.change_order_lines ADD CONSTRAINT change_order_lines_labor_amount_check CHECK (labor_amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));
ALTER TABLE public.change_order_lines DROP CONSTRAINT change_order_lines_equipment_amount_check;
ALTER TABLE public.change_order_lines ADD CONSTRAINT change_order_lines_equipment_amount_check CHECK (equipment_amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));
ALTER TABLE public.change_order_lines DROP CONSTRAINT change_order_lines_subcontract_amount_check;
ALTER TABLE public.change_order_lines ADD CONSTRAINT change_order_lines_subcontract_amount_check CHECK (subcontract_amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));
ALTER TABLE public.change_order_lines DROP CONSTRAINT change_order_lines_other_amount_check;
ALTER TABLE public.change_order_lines ADD CONSTRAINT change_order_lines_other_amount_check CHECK (other_amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));
ALTER TABLE public.change_order_lines DROP CONSTRAINT change_order_lines_markup_amount_check;
ALTER TABLE public.change_order_lines ADD CONSTRAINT change_order_lines_markup_amount_check CHECK (markup_amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));
ALTER TABLE public.job_revenue_lines DROP CONSTRAINT job_revenue_lines_approved_change_amount_check;
ALTER TABLE public.job_revenue_lines ADD CONSTRAINT job_revenue_lines_approved_change_amount_check CHECK (approved_change_amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric));
ALTER TABLE public.change_order_sov_allocations DROP CONSTRAINT change_order_sov_allocations_amount_check;
ALTER TABLE public.change_order_sov_allocations ADD CONSTRAINT change_order_sov_allocations_amount_check CHECK (amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) AND amount <> 0);

CREATE OR REPLACE FUNCTION public.save_job_change_order_draft(p_change_order_id uuid, p_job_id uuid, p_division text, p_co_number text, p_title text, p_description text, p_change_order_date date, p_internal_notes text, p_lines jsonb, p_reason text)
 RETURNS change_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  actor_id TEXT := auth.jwt()->>'sub'; actor_name TEXT; target public.change_orders%ROWTYPE;
  saved public.change_orders%ROWTYPE; line JSONB; budget_line public.job_budget_lines%ROWTYPE;
  normalized_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason,'')),''); total NUMERIC := 0; before_lines JSONB := '[]'::JSONB;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE='28000'; END IF;
  IF p_job_id IS NULL OR NULLIF(BTRIM(p_co_number),'') IS NULL OR NULLIF(BTRIM(p_title),'') IS NULL THEN RAISE EXCEPTION 'project, number, and title are required'; END IF;
  IF jsonb_typeof(COALESCE(p_lines,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'lines must be an array'; END IF;
  actor_name := public.change_order_actor();
  IF p_change_order_id IS NULL THEN
    IF NOT public.current_user_can_edit_division(p_division,'can_create_change_orders') THEN RAISE EXCEPTION 'can_create_change_orders is required' USING ERRCODE='42501'; END IF;
    INSERT INTO public.change_orders(job_id,division,co_number,title,description,change_order_date,internal_notes,status,price_amount,cost_amount,created_by,updated_by)
    VALUES(p_job_id,p_division,BTRIM(p_co_number),BTRIM(p_title),NULLIF(BTRIM(COALESCE(p_description,'')),''),COALESCE(p_change_order_date,CURRENT_DATE),NULLIF(BTRIM(COALESCE(p_internal_notes,'')),''),'draft',0,0,actor_id,actor_id)
    RETURNING * INTO saved;
  ELSE
    SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
    IF target.id IS NULL OR target.job_id<>p_job_id OR target.division<>p_division THEN RAISE EXCEPTION 'change order not found'; END IF;
    IF target.status<>'draft' THEN RAISE EXCEPTION 'only draft change orders may be edited'; END IF;
    IF NOT public.current_user_can_edit_division(p_division,'can_create_change_orders') AND NOT (target.revision_of_id IS NOT NULL AND public.current_user_can_edit_division(p_division,'can_revise_change_orders')) THEN RAISE EXCEPTION 'can_create_change_orders or revision edit authority is required' USING ERRCODE='42501'; END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(col) ORDER BY col.sort_order,col.id),'[]'::JSONB) INTO before_lines FROM public.change_order_lines col WHERE col.change_order_id=target.id;
    UPDATE public.change_orders SET co_number=BTRIM(p_co_number),title=BTRIM(p_title),description=NULLIF(BTRIM(COALESCE(p_description,'')),''),change_order_date=COALESCE(p_change_order_date,CURRENT_DATE),internal_notes=NULLIF(BTRIM(COALESCE(p_internal_notes,'')),''),updated_by=actor_id,updated_at=NOW() WHERE id=target.id RETURNING * INTO saved;
    DELETE FROM public.change_order_lines WHERE change_order_id=target.id;
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines,'[]'::jsonb)) LOOP
    SELECT * INTO budget_line FROM public.job_budget_lines WHERE id=(line->>'job_budget_line_id')::UUID AND job_id=p_job_id AND archived_at IS NULL;
    IF budget_line.id IS NULL THEN RAISE EXCEPTION 'each line must reference an active project financial line'; END IF;
    IF NULLIF(BTRIM(line->>'description'),'') IS NULL THEN RAISE EXCEPTION 'each line requires a description'; END IF;
    -- Signed components are validated by finite-money table constraints.
    INSERT INTO public.change_order_lines(change_order_id,job_budget_line_id,division,cost_code,description,vendor_name,material_amount,labor_amount,equipment_amount,subcontract_amount,other_amount,markup_amount,sort_order,created_by,updated_by)
    VALUES(saved.id,budget_line.id,p_division,budget_line.cost_code,BTRIM(line->>'description'),NULLIF(BTRIM(COALESCE(line->>'vendor_name','')),''),COALESCE(NULLIF(line->>'material_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'labor_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'equipment_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'subcontract_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'other_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'markup_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'sort_order','')::INTEGER,0),actor_id,actor_id);
  END LOOP;
  SELECT COALESCE(SUM(line_total),0) INTO total FROM public.change_order_lines WHERE change_order_id=saved.id;
  UPDATE public.change_orders SET price_amount=total,cost_amount=total-COALESCE((SELECT SUM(markup_amount) FROM public.change_order_lines WHERE change_order_id=saved.id),0),updated_at=NOW() WHERE id=saved.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,actor_name,'change_orders',saved.id::TEXT,CASE WHEN target.id IS NULL THEN 'create' ELSE 'update' END,CASE WHEN target.id IS NULL THEN NULL ELSE to_jsonb(target)||jsonb_build_object('lines',before_lines) END,to_jsonb(saved)||jsonb_build_object('lines',p_lines),normalized_reason);
  RETURN saved;
END $function$
;

CREATE OR REPLACE FUNCTION public.submit_job_change_order(p_change_order_id uuid, p_reason text)
 RETURNS change_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE actor_id TEXT:=auth.jwt()->>'sub'; actor_name TEXT; target public.change_orders%ROWTYPE; saved public.change_orders%ROWTYPE; line_count INTEGER; total NUMERIC;
BEGIN
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR NOT public.current_user_can_edit_division(target.division,'can_submit_change_orders') THEN RAISE EXCEPTION 'can_submit_change_orders is required' USING ERRCODE='42501'; END IF;
  IF target.status<>'draft' THEN RAISE EXCEPTION 'only a draft may be submitted'; END IF;
  SELECT COUNT(*),COALESCE(SUM(line_total),0) INTO line_count,total FROM public.change_order_lines WHERE change_order_id=target.id;
  IF line_count=0 OR total=0 THEN RAISE EXCEPTION 'at least one breakdown line and a nonzero total are required'; END IF;
  actor_name:=public.change_order_actor();
  UPDATE public.change_orders SET status='submitted',price_amount=total,submitted_by=actor_id,submitted_at=NOW(),updated_by=actor_id,updated_at=NOW() WHERE id=target.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,actor_name,'change_orders',saved.id::TEXT,'update',to_jsonb(target),to_jsonb(saved),COALESCE(NULLIF(BTRIM(p_reason),''),'Change Order submitted.'));
  RETURN saved;
END $function$
;

CREATE OR REPLACE FUNCTION public.save_change_order_sov_allocations(p_change_order_id uuid, p_allocations jsonb, p_reason text)
 RETURNS SETOF change_order_sov_allocations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE actor TEXT := auth.jwt() ->> 'sub'; co public.change_orders%ROWTYPE; a JSONB; total NUMERIC := 0; amount_value NUMERIC; revenue_id UUID; revenue public.job_revenue_lines%ROWTYPE; normalized_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason,'')), '');
BEGIN
 SELECT * INTO co FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
 IF actor IS NULL OR co.id IS NULL OR co.status <> 'approved' OR normalized_reason IS NULL OR public.current_user_can_edit_division(co.division,'can_approve_budget') IS NOT TRUE THEN RAISE EXCEPTION 'approved change order, permission, and reason are required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations)=0 THEN RAISE EXCEPTION 'at least one SOV allocation is required' USING ERRCODE='22023'; END IF;
 FOR a IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP amount_value:=NULLIF(a->>'amount','')::NUMERIC; IF amount_value IS NULL OR amount_value=0 OR amount_value IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) THEN RAISE EXCEPTION 'allocation amounts must be finite and nonzero' USING ERRCODE='22023'; END IF; total:=total+amount_value; END LOOP;
 IF total <> co.price_amount THEN RAISE EXCEPTION 'SOV allocations must equal the approved change order price' USING ERRCODE='22023'; END IF;
 IF EXISTS (SELECT 1 FROM public.change_order_sov_allocations WHERE change_order_id=co.id) THEN RAISE EXCEPTION 'SOV is already allocated for this change order' USING ERRCODE='22023'; END IF;
 FOR a IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
   amount_value := (a->>'amount')::NUMERIC; revenue_id:=NULLIF(a->>'revenue_line_id','')::UUID;
   IF revenue_id IS NULL THEN
      INSERT INTO public.job_revenue_lines(job_id,division,sov_line,description,approved_change_amount,created_by,note) VALUES(co.job_id,co.division,co.co_number,COALESCE(NULLIF(BTRIM(a->>'new_description'),''),'CO '||co.co_number||' — '||co.title),amount_value,actor,'Created from approved change order.') RETURNING id INTO revenue_id;
   ELSE
      SELECT * INTO revenue FROM public.job_revenue_lines WHERE id=revenue_id AND job_id=co.job_id AND archived_at IS NULL FOR UPDATE;
      IF revenue.id IS NULL THEN RAISE EXCEPTION 'selected SOV line is not active for this job' USING ERRCODE='P0002'; END IF;
      UPDATE public.job_revenue_lines SET approved_change_amount=approved_change_amount+amount_value WHERE id=revenue_id;
   END IF;
   INSERT INTO public.change_order_sov_allocations(change_order_id,revenue_line_id,amount) VALUES(co.id,revenue_id,amount_value);
 END LOOP;
 INSERT INTO public.change_logs(user_id,table_name,record_id,action,after_data,note) VALUES(actor,'change_order_sov_allocations',co.id::TEXT,'create',p_allocations,normalized_reason);
 RETURN QUERY SELECT * FROM public.change_order_sov_allocations WHERE change_order_id=co.id ORDER BY created_at;
END; $function$
;
