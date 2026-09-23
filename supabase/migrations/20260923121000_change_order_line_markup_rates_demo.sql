-- Legacy rows retain dollar markup. New drafts retain an input rate while
-- the existing authoritative dollar total and approval pipeline stay unchanged.
ALTER TABLE public.change_order_lines ADD COLUMN markup_percent numeric;
ALTER TABLE public.change_order_lines ADD CONSTRAINT change_order_lines_markup_percent_valid
  CHECK (markup_percent IS NULL OR (
    markup_percent >= 0 AND markup_percent NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    AND markup_amount = round((material_amount + labor_amount + equipment_amount + subcontract_amount + other_amount) * markup_percent / 100, 2)
  ));

CREATE FUNCTION public.save_job_change_order_draft_with_rates(
  p_change_order_id uuid, p_job_id uuid, p_division text, p_co_number text, p_title text,
  p_description text, p_change_order_date date, p_internal_notes text, p_lines jsonb, p_reason text
) RETURNS public.change_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE saved public.change_orders%ROWTYPE; item jsonb; index_value integer := 0;
BEGIN
  -- The existing RPC keeps all status, permission, financial and audit behavior.
  saved := public.save_job_change_order_draft(p_change_order_id, p_job_id, p_division,
    p_co_number, p_title, p_description, p_change_order_date, p_internal_notes, p_lines, p_reason);
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) LOOP
    IF item ? 'markup_percent' AND NULLIF(item->>'markup_percent', '') IS NOT NULL THEN
      UPDATE public.change_order_lines SET markup_percent = (item->>'markup_percent')::numeric
        WHERE change_order_id = saved.id AND sort_order = index_value;
      IF NOT FOUND THEN RAISE EXCEPTION 'Line markup rate could not be saved'; END IF;
    END IF;
    index_value := index_value + 1;
  END LOOP;
  RETURN saved;
END
$function$;
REVOKE ALL ON FUNCTION public.save_job_change_order_draft_with_rates(uuid,uuid,text,text,text,text,date,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_job_change_order_draft_with_rates(uuid,uuid,text,text,text,text,date,text,jsonb,text) TO authenticated;
