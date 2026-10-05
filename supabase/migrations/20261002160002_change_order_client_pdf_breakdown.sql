-- Optional presentation-only detail for the client Change Order PDF.
-- Existing amounts, cost-code posting, approvals and historical rows are not
-- rewritten. The existing draft-save RPC remains the authority for finances.
ALTER TABLE public.change_order_lines ADD COLUMN client_breakdown jsonb;
ALTER TABLE public.change_order_lines ADD CONSTRAINT change_order_lines_client_breakdown_shape
  CHECK (client_breakdown IS NULL OR jsonb_typeof(client_breakdown) = 'object');

CREATE FUNCTION public.save_job_change_order_draft_with_client_details(
  p_change_order_id uuid, p_job_id uuid, p_division text, p_co_number text,
  p_title text, p_description text, p_change_order_date date,
  p_internal_notes text, p_lines jsonb, p_reason text,
  p_overall_markup_percent numeric, p_overall_markup_budget_line_id uuid
) RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp AS $function$
DECLARE
  saved public.change_orders%ROWTYPE;
  item jsonb;
  detail jsonb;
  breakdown jsonb;
  rows jsonb;
  item_index integer := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_lines, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Change Order lines must be an array' USING ERRCODE = '22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) LOOP
    breakdown := item->'client_breakdown';
    IF breakdown IS NOT NULL AND breakdown <> 'null'::jsonb THEN
      IF jsonb_typeof(breakdown) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Invalid client PDF breakdown' USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(breakdown->'rows') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Client PDF breakdown rows must be an array' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(breakdown->'rows') > 40
        OR (breakdown ? 'show_remaining' AND jsonb_typeof(breakdown->'show_remaining') IS DISTINCT FROM 'boolean')
        OR length(COALESCE(breakdown->>'remaining_label', '')) > 120 THEN
        RAISE EXCEPTION 'Invalid client PDF breakdown' USING ERRCODE = '22023';
      END IF;
      rows := breakdown->'rows';
      FOR detail IN SELECT value FROM jsonb_array_elements(rows) LOOP
        IF jsonb_typeof(detail) IS DISTINCT FROM 'object'
          OR jsonb_typeof(detail->'description') IS DISTINCT FROM 'string'
          OR length(BTRIM(COALESCE(detail->>'description', ''))) NOT BETWEEN 1 AND 500
          OR (detail ? 'unit' AND jsonb_typeof(detail->'unit') NOT IN ('string', 'null'))
          OR length(COALESCE(detail->>'unit', '')) > 30 THEN
          RAISE EXCEPTION 'Client PDF detail needs a valid description and unit' USING ERRCODE = '22023';
        END IF;
        IF EXISTS (
          SELECT 1 FROM (VALUES ('quantity'), ('unit_price'), ('amount')) AS field(name)
          WHERE detail ? field.name AND jsonb_typeof(detail->field.name) NOT IN ('number', 'null')
        ) THEN
          RAISE EXCEPTION 'Client PDF detail amounts must be numeric or blank' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Existing RPC enforces draft status, division permission, markup and audit.
  saved := public.save_job_change_order_draft_with_all_markups(
    p_change_order_id, p_job_id, p_division, p_co_number, p_title,
    p_description, p_change_order_date, p_internal_notes, p_lines, p_reason,
    p_overall_markup_percent, p_overall_markup_budget_line_id);

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) LOOP
    breakdown := item->'client_breakdown';
    UPDATE public.change_order_lines SET client_breakdown =
      CASE WHEN breakdown IS NULL OR breakdown = 'null'::jsonb THEN NULL ELSE breakdown END
      WHERE change_order_id = saved.id AND sort_order = item_index AND NOT is_overall_markup;
    IF NOT FOUND THEN RAISE EXCEPTION 'Client PDF detail line could not be saved'; END IF;
    item_index := item_index + 1;
  END LOOP;
  RETURN saved;
END
$function$;
REVOKE ALL ON FUNCTION public.save_job_change_order_draft_with_client_details(uuid,uuid,text,text,text,text,date,text,jsonb,text,numeric,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_job_change_order_draft_with_client_details(uuid,uuid,text,text,text,text,date,text,jsonb,text,numeric,uuid)
  TO authenticated;

-- A controlled revision must retain the client-facing details without
-- modifying the previously approved document or its posted financials.
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
    markup_percent,is_overall_markup,sort_order,created_by,updated_by,client_breakdown)
  SELECT revised.id,job_budget_line_id,division,cost_code,description,vendor_name,material_amount,labor_amount,
    equipment_amount,subcontract_amount,other_amount,markup_amount,markup_percent,is_overall_markup,
    sort_order,actor_id,actor_id,client_breakdown FROM public.change_order_lines WHERE change_order_id=target.id ORDER BY sort_order,id;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor_id,public.change_order_actor(),'change_orders',revised.id::text,'create',to_jsonb(target),to_jsonb(revised),
    COALESCE(NULLIF(BTRIM(p_reason),''),'Controlled revision created.'));
  RETURN revised;
END
$function$;
