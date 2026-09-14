-- Extends the authoritative estimate approval/snapshot workflow to editor-version-2
-- drafts. It intentionally does not convert an approved estimate into a Job.

ALTER TABLE public.estimate_snapshots
  ADD COLUMN IF NOT EXISTS workbench_document jsonb;

CREATE OR REPLACE FUNCTION public.guard_workbench_header()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.editor_version IS DISTINCT FROM OLD.editor_version THEN
    RAISE EXCEPTION 'Existing estimates cannot switch editors' USING ERRCODE = '22023';
  END IF;

  IF NEW.editor_version = 2
     AND COALESCE(current_setting('northgate.workbench_save', true), '') <> 'yes'
     AND COALESCE(current_setting('northgate.workbench_approval', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'Use the authenticated Workbench draft or approval workflow' USING ERRCODE = '42501';
  END IF;

  IF NEW.editor_version = 2
     AND NEW.status <> 'draft'
     AND COALESCE(current_setting('northgate.workbench_approval', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'Use the Workbench approval workflow' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_workbench_header() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.approve_workbench_estimate(
  p_estimate_id uuid,
  p_approval_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor text := auth.jwt() ->> 'sub';
  target public.estimates;
  workbench public.estimate_workbenches;
  snapshot_id uuid;
  actor_name text;
  approved_document jsonb;
  pricing_lines jsonb := '[]'::jsonb;
  pricing_total numeric(14,2) := 0;
  pricing_line_count integer := 0;
  row_value record;
  previous_approval_setting text := current_setting('northgate.workbench_approval', true);
BEGIN
  IF actor IS NULL OR btrim(actor) = '' THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;
  IF p_estimate_id IS NULL THEN
    RAISE EXCEPTION 'Estimate id is required' USING ERRCODE = '22004';
  END IF;

  SELECT * INTO target
  FROM public.estimates
  WHERE id = p_estimate_id AND archived_at IS NULL
  FOR UPDATE;
  IF target.id IS NULL OR target.editor_version <> 2 OR target.status <> 'draft' THEN
    RAISE EXCEPTION 'An editable Workbench draft is required' USING ERRCODE = '42501';
  END IF;
  IF public.current_user_can_edit_division(target.division, 'can_approve_estimates') IS NOT TRUE THEN
    RAISE EXCEPTION 'Estimate approval permission is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO workbench
  FROM public.estimate_workbenches
  WHERE estimate_id = target.id
  FOR UPDATE;
  IF workbench.estimate_id IS NULL
     OR jsonb_typeof(workbench.document) <> 'object'
     OR NULLIF(btrim(workbench.document ->> 'name'), '') IS NULL
     OR jsonb_typeof(workbench.document -> 'entries') <> 'array'
     OR jsonb_array_length(workbench.document -> 'entries') = 0 THEN
    RAISE EXCEPTION 'Save a named Workbench estimate with at least one entry before approval' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(workbench.document -> 'entries') AS entry_value(value),
         jsonb_array_elements(COALESCE(entry_value.value -> 'items', '[]'::jsonb)) AS item_value(value),
         jsonb_array_elements(COALESCE(item_value.value -> 'lines', '[]'::jsonb)) AS line_value(value)
    WHERE jsonb_typeof(entry_value.value -> 'items') <> 'array'
       OR jsonb_typeof(item_value.value -> 'lines') <> 'array'
       OR COALESCE(line_value.value ->> 'qty', '') !~ '^[0-9]+(\.[0-9]+)?$'
       OR COALESCE(line_value.value ->> 'price', '') !~ '^[0-9]+(\.[0-9]+)?$'
       OR COALESCE(line_value.value ->> 'hours', '') !~ '^[0-9]+(\.[0-9]+)?$'
       OR COALESCE(item_value.value ->> 'qty', '') !~ '^[0-9]+(\.[0-9]+)?$'
  ) THEN
    RAISE EXCEPTION 'Every Workbench component needs valid non-negative quantity, price, and labor values before approval' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(workbench.document ->> 'rate', '') !~ '^[0-9]+(\.[0-9]+)?$'
     OR COALESCE(workbench.document ->> 'materialMarkup', '') !~ '^[0-9]+(\.[0-9]+)?$'
     OR COALESCE(workbench.document ->> 'feePercent', '') !~ '^[0-9]+(\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'Valid labor rate, material markup, and fee values are required before approval' USING ERRCODE = '22023';
  END IF;

  FOR row_value IN
    WITH document_values AS (
      SELECT workbench.document AS document,
             (workbench.document ->> 'rate')::numeric AS labor_rate,
             (workbench.document ->> 'materialMarkup')::numeric AS default_material_markup
    ), items AS (
      SELECT
        entry_value.value AS entry_value,
        item_value.value AS item_value,
        COALESCE((item_value.value ->> 'number')::integer, 0) AS item_number,
        COALESCE(entry_value.value ->> 'number', '') AS entry_number,
        COALESCE(entry_value.value ->> 'location', '') AS location,
        COALESCE(entry_value.value ->> 'section', '') AS section,
        COALESCE(item_value.value ->> 'name', '') AS description,
        COALESCE(item_value.value ->> 'qty', '0')::numeric AS item_qty,
        document_values.labor_rate,
        document_values.default_material_markup,
        document_values.document
      FROM document_values,
           jsonb_array_elements(document_values.document -> 'entries') AS entry_value(value),
           jsonb_array_elements(entry_value.value -> 'items') AS item_value(value)
    ), item_values AS (
      SELECT
        items.*,
        quote_value,
        round(COALESCE(SUM(
          (line_value.value ->> 'qty')::numeric
          * CASE WHEN COALESCE((line_value.value ->> 'fixed')::boolean, false) THEN 1 ELSE items.item_qty END
          * (line_value.value ->> 'price')::numeric
        ) FILTER (WHERE line_value.value IS NOT NULL), 0), 2) AS direct_material,
        round(COALESCE(SUM(
          (line_value.value ->> 'qty')::numeric
          * CASE WHEN COALESCE((line_value.value ->> 'fixed')::boolean, false) THEN 1 ELSE items.item_qty END
          * (line_value.value ->> 'hours')::numeric
        ) FILTER (WHERE line_value.value IS NOT NULL), 0), 4) AS direct_hours
      FROM items
      LEFT JOIN LATERAL (
        SELECT quote_candidate.value AS quote_value
        FROM jsonb_array_elements(COALESCE(items.document -> 'quotes', '[]'::jsonb)) AS quote_candidate(value)
        WHERE quote_candidate.value ->> 'id' = items.item_value ->> 'quoteId'
        LIMIT 1
      ) AS quote_lookup ON true
      LEFT JOIN LATERAL jsonb_array_elements(items.item_value -> 'lines') AS line_value(value) ON true
      GROUP BY items.entry_value, items.item_value, items.item_number, items.entry_number,
               items.location, items.section, items.description, items.item_qty,
               items.labor_rate, items.default_material_markup, items.document, quote_value
    ), calculated AS (
      SELECT
        entry_number, location, section, description, item_number,
        round(CASE WHEN quote_value IS NULL THEN direct_material ELSE COALESCE((quote_value ->> 'materialAmount')::numeric, 0) END, 2) AS material,
        round(CASE WHEN quote_value IS NULL THEN direct_hours * labor_rate ELSE 0 END, 2) AS labor,
        round(CASE WHEN quote_value IS NULL THEN 0 ELSE COALESCE((quote_value ->> 'otherAmount')::numeric, 0) END, 2) AS other,
        round(CASE WHEN quote_value IS NULL THEN direct_hours ELSE 0 END, 4) AS hours,
        round(COALESCE(NULLIF(item_value ->> 'materialMarkupOverride', '')::numeric, default_material_markup), 4) AS material_markup_rate
      FROM item_values
    )
    SELECT
      entry_number, location, section, description, item_number, material, labor, other, hours,
      round(material + labor + other, 2) AS cost,
      material_markup_rate,
      round(material * material_markup_rate / 100, 2) AS material_markup,
      round(material + labor + other + (material * material_markup_rate / 100), 2) AS subtotal
    FROM calculated
    ORDER BY entry_number, item_number, description
  LOOP
    pricing_line_count := pricing_line_count + 1;
    pricing_total := pricing_total + row_value.subtotal;
    pricing_lines := pricing_lines || jsonb_build_array(jsonb_build_object(
      'entry_number', row_value.entry_number,
      'location', row_value.location,
      'section', row_value.section,
      'description', row_value.description,
      'item_number', row_value.item_number,
      'material', row_value.material,
      'labor', row_value.labor,
      'other', row_value.other,
      'hours', row_value.hours,
      'cost', row_value.cost,
      'material_markup_rate', row_value.material_markup_rate,
      'material_markup', row_value.material_markup,
      'subtotal', row_value.subtotal
    ));
  END LOOP;
  IF pricing_line_count = 0 THEN
    RAISE EXCEPTION 'Add at least one priced Workbench item before approval' USING ERRCODE = '22023';
  END IF;

  pricing_total := round(pricing_total * (1 + (workbench.document ->> 'feePercent')::numeric / 100), 2);
  approved_document := jsonb_set(workbench.document, '{approvedAt}', to_jsonb(clock_timestamp()), true);
  actor_name := COALESCE((SELECT display_name FROM public.user_permissions WHERE clerk_user_id = actor),
                         (SELECT email FROM public.user_permissions WHERE clerk_user_id = actor), actor);

  PERFORM set_config('northgate.workbench_approval', 'yes', true);
  UPDATE public.estimates
  SET status = 'approved', submitted_at = COALESCE(submitted_at, clock_timestamp())
  WHERE id = target.id;

  INSERT INTO public.estimate_snapshots (
    estimate_id, division, approved_by, approval_note, estimate_number, title,
    customer_name, bid_due_at, submitted_at, scope_summary, pricing_total,
    pricing_line_count, estimate_data, pricing_lines, workbench_document
  ) VALUES (
    target.id, target.division, actor_name, NULLIF(btrim(COALESCE(p_approval_note, '')), ''),
    target.estimate_number, target.title, target.customer_name, target.bid_due_at,
    clock_timestamp(), target.scope_summary, pricing_total, pricing_line_count,
    (SELECT to_jsonb(e) FROM public.estimates e WHERE e.id = target.id), pricing_lines, approved_document
  ) RETURNING id INTO snapshot_id;

  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, before_data, after_data, note)
  VALUES (
    actor, actor_name, 'estimates', target.id::text, 'update', to_jsonb(target),
    (SELECT to_jsonb(e) FROM public.estimates e WHERE e.id = target.id),
    COALESCE(NULLIF(btrim(COALESCE(p_approval_note, '')), ''), 'Workbench estimate approved and immutable snapshot created.')
  );

  PERFORM set_config('northgate.workbench_approval', COALESCE(previous_approval_setting, ''), true);
  RETURN snapshot_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('northgate.workbench_approval', COALESCE(previous_approval_setting, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_workbench_estimate(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_workbench_estimate(uuid, text) TO authenticated;
