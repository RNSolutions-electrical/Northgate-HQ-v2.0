-- The GC/overall percentage is calculated on the sum of line totals AFTER
-- their own markups. A separately marked pricing line lets the existing
-- submission and approval posting pipeline account for the full contract value.
ALTER TABLE public.change_orders ADD COLUMN overall_markup_percent numeric;
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_overall_markup_percent_valid
  CHECK (overall_markup_percent IS NULL OR (overall_markup_percent >= 0
    AND overall_markup_percent NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)));
ALTER TABLE public.change_order_lines ADD COLUMN is_overall_markup boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX change_order_one_overall_markup_line
  ON public.change_order_lines(change_order_id) WHERE is_overall_markup;

CREATE FUNCTION public.save_job_change_order_draft_with_all_markups(
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
    IF budget_line.id IS NULL THEN
      RAISE EXCEPTION 'Select an active financial line for overall Change Order markup' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Reuse the existing authority, draft-state, line, total and audit checks.
  saved := public.save_job_change_order_draft_with_rates(p_change_order_id, p_job_id,
    p_division, p_co_number, p_title, p_description, p_change_order_date,
    p_internal_notes, p_lines, p_reason);
  previous := saved;
  -- The legacy draft-save RPC replaces all prior lines. Repeat this targeted
  -- cleanup defensively so retries cannot include a previous overall line.
  DELETE FROM public.change_order_lines
    WHERE change_order_id = saved.id AND is_overall_markup;
  SELECT COALESCE(SUM(line_total), 0) INTO base_total
    FROM public.change_order_lines WHERE change_order_id = saved.id AND NOT is_overall_markup;
  markup_value := round(base_total * rate / 100, 2);

  IF markup_value <> 0 THEN
    INSERT INTO public.change_order_lines(
      change_order_id, job_budget_line_id, division, cost_code, description,
      material_amount, labor_amount, equipment_amount, subcontract_amount,
      other_amount, markup_amount, sort_order, created_by, updated_by, is_overall_markup
    ) VALUES (
      saved.id, budget_line.id, p_division, budget_line.cost_code,
      'Overall Change Order Markup', 0, 0, 0, 0, 0, markup_value,
      jsonb_array_length(COALESCE(p_lines, '[]'::jsonb)), actor_id, actor_id, true
    );
  END IF;
  UPDATE public.change_orders SET overall_markup_percent = rate,
    price_amount = base_total + markup_value, updated_by = actor_id, updated_at = now()
    WHERE id = saved.id AND status = 'draft' RETURNING * INTO saved;
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

-- Controlled revisions retain both types of markup and their financial-line
-- relationship. Prior approved records remain untouched.
CREATE OR REPLACE FUNCTION public.revise_job_change_order(p_change_order_id uuid, p_reason text)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE actor_id text := auth.jwt()->>'sub'; target public.change_orders%ROWTYPE; revised public.change_orders%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR target.status<>'approved' OR NOT public.current_user_can_edit_division(target.division,'can_revise_change_orders') THEN
    RAISE EXCEPTION 'approved Change Order and can_revise_change_orders are required' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.change_orders(job_id,division,co_number,title,description,price_amount,cost_amount,status,
    change_order_date,internal_notes,created_by,updated_by,revision_of_id,revision_number,overall_markup_percent)
  VALUES(target.job_id,target.division,target.co_number||'-R'||(target.revision_number+1),target.title,target.description,
    target.price_amount,target.cost_amount,'draft',CURRENT_DATE,target.internal_notes,actor_id,actor_id,target.id,
    target.revision_number+1,target.overall_markup_percent) RETURNING * INTO revised;
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
