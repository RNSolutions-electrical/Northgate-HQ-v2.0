-- Preserve incomplete draft breakdowns in the existing Change Order lines table.
-- Financial coding remains mandatory before any non-draft status.
ALTER TABLE public.change_order_lines ALTER COLUMN job_budget_line_id DROP NOT NULL;

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
  IF p_job_id IS NULL OR NULLIF(BTRIM(p_co_number),'') IS NULL OR NULLIF(BTRIM(p_title),'') IS NULL THEN
    RAISE EXCEPTION 'project, number, and title are required';
  END IF;
  IF jsonb_typeof(COALESCE(p_lines,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'lines must be an array'; END IF;
  actor_name := public.change_order_actor();
  IF p_change_order_id IS NULL THEN
    IF NOT public.current_user_can_edit_division(p_division,'can_create_change_orders') THEN
      RAISE EXCEPTION 'can_create_change_orders is required' USING ERRCODE='42501';
    END IF;
    INSERT INTO public.change_orders(job_id,division,co_number,title,description,change_order_date,internal_notes,status,price_amount,cost_amount,created_by,updated_by)
    VALUES(p_job_id,p_division,BTRIM(p_co_number),BTRIM(p_title),NULLIF(BTRIM(COALESCE(p_description,'')),''),COALESCE(p_change_order_date,CURRENT_DATE),NULLIF(BTRIM(COALESCE(p_internal_notes,'')),''),'draft',0,0,actor_id,actor_id)
    RETURNING * INTO saved;
  ELSE
    SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
    IF target.id IS NULL OR target.job_id<>p_job_id OR target.division<>p_division THEN RAISE EXCEPTION 'change order not found'; END IF;
    IF target.status<>'draft' THEN RAISE EXCEPTION 'only draft change orders may be edited'; END IF;
    IF NOT public.current_user_can_edit_division(p_division,'can_create_change_orders')
      AND NOT (target.revision_of_id IS NOT NULL AND public.current_user_can_edit_division(p_division,'can_revise_change_orders')) THEN
      RAISE EXCEPTION 'can_create_change_orders or revision edit authority is required' USING ERRCODE='42501';
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(col) ORDER BY col.sort_order,col.id),'[]'::jsonb) INTO before_lines
      FROM public.change_order_lines col WHERE col.change_order_id=target.id;
    UPDATE public.change_orders SET co_number=BTRIM(p_co_number),title=BTRIM(p_title),
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
      IF budget_line.id IS NULL THEN RAISE EXCEPTION 'each coded line must reference an active project financial line'; END IF;
    END IF;
    IF NULLIF(BTRIM(line->>'description'),'') IS NULL THEN RAISE EXCEPTION 'each line requires a description'; END IF;
    INSERT INTO public.change_order_lines(change_order_id,job_budget_line_id,division,cost_code,description,vendor_name,
      material_amount,labor_amount,equipment_amount,subcontract_amount,other_amount,markup_amount,sort_order,created_by,updated_by)
    VALUES(saved.id,budget_line.id,p_division,budget_line.cost_code,BTRIM(line->>'description'),
      NULLIF(BTRIM(COALESCE(line->>'vendor_name','')),''),COALESCE(NULLIF(line->>'material_amount','')::numeric,0),
      COALESCE(NULLIF(line->>'labor_amount','')::numeric,0),COALESCE(NULLIF(line->>'equipment_amount','')::numeric,0),
      COALESCE(NULLIF(line->>'subcontract_amount','')::numeric,0),COALESCE(NULLIF(line->>'other_amount','')::numeric,0),
      COALESCE(NULLIF(line->>'markup_amount','')::numeric,0),COALESCE(NULLIF(line->>'sort_order','')::integer,0),actor_id,actor_id);
  END LOOP;
  SELECT COALESCE(SUM(line_total),0) INTO total FROM public.change_order_lines WHERE change_order_id=saved.id;
  UPDATE public.change_orders SET price_amount=total,
    cost_amount=total-COALESCE((SELECT SUM(markup_amount) FROM public.change_order_lines WHERE change_order_id=saved.id),0),
    updated_at=NOW() WHERE id=saved.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
    VALUES(actor_id,actor_name,'change_orders',saved.id::text,CASE WHEN target.id IS NULL THEN 'create' ELSE 'update' END,
      CASE WHEN target.id IS NULL THEN NULL ELSE to_jsonb(target)||jsonb_build_object('lines',before_lines) END,
      to_jsonb(saved)||jsonb_build_object('lines',p_lines),normalized_reason);
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.save_job_change_order_draft(uuid,uuid,text,text,text,text,date,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_job_change_order_draft(uuid,uuid,text,text,text,text,date,text,jsonb,text) TO authenticated;

-- Guard both status changes and later line mutations, including callers other
-- than the UI. An uncoded line may exist only while its parent is a draft.
CREATE FUNCTION public.guard_change_order_line_coding() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF TG_TABLE_NAME = 'change_orders' THEN
    IF NEW.status <> 'draft' AND EXISTS (SELECT 1 FROM public.change_order_lines
      WHERE change_order_id=NEW.id AND job_budget_line_id IS NULL) THEN
      RAISE EXCEPTION 'Assign a financial line to every breakdown line before submitting this Change Order' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.job_budget_line_id IS NULL AND EXISTS (SELECT 1 FROM public.change_orders
    WHERE id=NEW.change_order_id AND status <> 'draft') THEN
    RAISE EXCEPTION 'Uncoded breakdown lines are allowed only on draft Change Orders' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_change_order_line_coding() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER change_order_line_coding_guard
BEFORE INSERT OR UPDATE OF job_budget_line_id,change_order_id ON public.change_order_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_change_order_line_coding();

CREATE TRIGGER change_order_submit_coding_guard
BEFORE UPDATE OF status ON public.change_orders
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.guard_change_order_line_coding();
