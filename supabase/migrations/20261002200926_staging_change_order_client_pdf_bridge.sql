-- Staging-only compatibility bridge for the Production v0.5.4 optional client PDF detail.
-- Staging already has the contract-adjustment state model and Billing lineage.
-- Do not replay the Production-base integration migration here.

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

CREATE OR REPLACE FUNCTION public.save_contract_adjustment(p_data jsonb)
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
 saved:=public.save_job_change_order_draft_with_client_details(id_value,j.id,j.division,number_value,
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

-- Controlled revisions preserve record type and optional client-facing details.
CREATE OR REPLACE FUNCTION public.revise_job_change_order(p_change_order_id uuid, p_reason text)
RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE actor_id text := auth.jwt()->>'sub'; target public.change_orders%ROWTYPE; revised public.change_orders%ROWTYPE;
BEGIN
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
