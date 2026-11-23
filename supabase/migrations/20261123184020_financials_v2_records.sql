-- Append-only job-owned financial planning records. This does not rewrite
-- existing budgets, SOV lines, pay applications, approvals or forecasts.
CREATE TABLE public.job_financial_v2_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  kind text NOT NULL CHECK (kind IN ('contract','baseline','sales','labor','forecast','billing_plan','receipt')),
  record_key text NOT NULL CHECK (length(record_key) BETWEEN 1 AND 48),
  revision integer NOT NULL CHECK (revision > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 524288),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  UNIQUE (job_id,kind,record_key,revision)
);
ALTER TABLE public.job_financial_v2_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_financial_v2_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.job_financial_v2_records TO authenticated;
CREATE POLICY financial_v2_job_read ON public.job_financial_v2_records FOR SELECT TO authenticated
  USING (public.current_user_can_access_job(job_id,'can_view_project_financials') IS TRUE
    AND public.current_user_can_access_job(job_id,'can_view_protected_project_financials') IS TRUE);

CREATE FUNCTION public.record_job_financial_v2(
  p_job_id uuid, p_kind text, p_key text, p_expected_revision integer, p_payload jsonb
) RETURNS public.job_financial_v2_records
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor text := auth.jwt()->>'sub';
  prior integer;
  saved public.job_financial_v2_records;
  v_amount numeric;
BEGIN
  IF actor IS NULL OR public.current_user_can_access_job(p_job_id,'can_view_project_financials') IS NOT TRUE
    OR public.current_user_can_access_job(p_job_id,'can_view_protected_project_financials') IS NOT TRUE
    OR public.current_user_can_edit_job(p_job_id,'can_approve_budget') IS NOT TRUE
    OR NOT EXISTS (SELECT 1 FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Job-scoped financial approval and protected access required.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR pg_column_size(p_payload) > 524288 OR p_kind IS NULL OR p_key IS NULL THEN
    RAISE EXCEPTION 'Invalid Financials V2 record.';
  END IF;
  -- Serialize changes to a record, not all financial activity for a job.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::text || ':' || p_kind || ':' || p_key,0));
  SELECT coalesce(max(revision),0) INTO prior FROM public.job_financial_v2_records
    WHERE job_id=p_job_id AND kind=p_kind AND record_key=p_key;
  IF prior IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'This record changed. Reload it and review before saving.' USING ERRCODE='40001';
  END IF;
  IF p_kind IN ('contract','baseline','sales') AND p_key <> 'job' THEN RAISE EXCEPTION 'Invalid job record key.'; END IF;
  CASE p_kind
  WHEN 'contract' THEN
    v_amount := (p_payload->>'amount')::numeric;
    IF v_amount IS NULL OR v_amount < 0 OR v_amount > 9999999999.99 OR round(v_amount,2) <> v_amount
       OR length(trim(coalesce(p_payload->>'source',''))) NOT BETWEEN 3 AND 300
       OR (prior > 0 AND length(trim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 3 AND 500) THEN
      RAISE EXCEPTION 'Enter the signed contract amount, document reference, and a reason if correcting.';
    END IF;
  WHEN 'baseline' THEN
    IF prior > 0 THEN RAISE EXCEPTION 'The original budget snapshot is locked.'; END IF;
    IF length(trim(coalesce(p_payload->>'source',''))) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Enter the baseline source reference.'; END IF;
    -- Snapshot existing HQ original line values server-side, not client overrides.
    SELECT jsonb_set(p_payload - 'lines','{lines}',coalesce(jsonb_agg(jsonb_build_object(
      'id',b.id,'code',b.cost_code,'label',b.description,'category',b.category,'original',b.budget_amount
    ) ORDER BY b.cost_code,b.id),'[]'::jsonb)) INTO p_payload
    FROM public.job_budget_lines b WHERE b.job_id=p_job_id AND b.archived_at IS NULL;
    IF jsonb_array_length(p_payload->'lines') = 0 THEN RAISE EXCEPTION 'Add original budget lines first.'; END IF;
  WHEN 'sales' THEN
    IF jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_payload->'overrides') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_payload->'fee') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid Sales Budget plan.'; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_payload->'lines') AS line
      WHERE NOT EXISTS (SELECT 1 FROM public.job_budget_lines b WHERE b.job_id=p_job_id AND b.id=(line->>'id')::uuid AND b.archived_at IS NULL)
    ) THEN RAISE EXCEPTION 'A sales line is no longer active on this job.'; END IF;
  WHEN 'labor' THEN
    IF NOT EXISTS (SELECT 1 FROM public.job_budget_lines WHERE job_id=p_job_id AND id=p_key::uuid AND archived_at IS NULL AND category='labor') THEN RAISE EXCEPTION 'Labor line not found.'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(p_payload) AS e WHERE
        e.key NOT IN ('planned','used','salesRate','executionRate','salesLock','executionLock')
        OR (e.key IN ('salesLock','executionLock') AND jsonb_typeof(e.value) <> 'boolean')
        OR (e.key NOT IN ('salesLock','executionLock') AND (
          CASE jsonb_typeof(e.value) WHEN 'null' THEN false WHEN 'number' THEN
            (e.value::text::numeric < 0 OR e.value::text::numeric > 9999999.99) ELSE true END)))
    THEN RAISE EXCEPTION 'Invalid labor inputs.'; END IF;
  WHEN 'forecast' THEN
    -- Use the same job lock order as save_job_financial_batch. Bind the reviewed
    -- snapshot to every cost line and its version; serialize with budget writers.
    PERFORM 1 FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Active job not found.'; END IF;
    PERFORM 1 FROM public.job_budget_lines
      WHERE job_id=p_job_id AND archived_at IS NULL AND category <> 'ohp_fee' ORDER BY id FOR UPDATE;
    IF prior > 0 OR p_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'A finalized monthly forecast cannot be overwritten.'; END IF;
    IF (p_payload->>'asOf')::date IS NULL OR to_char((p_payload->>'asOf')::date,'YYYY-MM') <> p_key
      OR (p_payload->>'cutoff')::date > (p_payload->>'asOf')::date
      OR jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'Check the forecast period, report date and accounting cutoff.'; END IF;
    IF jsonb_array_length(p_payload->'lines') <> (SELECT count(*) FROM public.job_budget_lines
          WHERE job_id=p_job_id AND archived_at IS NULL AND category <> 'ohp_fee')
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'lines') line GROUP BY line->>'id' HAVING count(*)>1)
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_payload->'lines') AS line
         WHERE NOT EXISTS (SELECT 1 FROM public.job_budget_lines b WHERE b.job_id=p_job_id AND b.id=(line->>'id')::uuid
           AND b.archived_at IS NULL AND b.category <> 'ohp_fee' AND b.updated_at = (line->>'updatedAt')::timestamptz
           AND b.actual_cost_amount IS NOT DISTINCT FROM (line->>'actual')::numeric)
       ) THEN RAISE EXCEPTION 'Job costs changed. Refresh the forecast before finalizing.' USING ERRCODE='40001'; END IF;
    p_payload := jsonb_set(p_payload,'{frozen}','true'::jsonb);

  WHEN 'billing_plan' THEN
    v_amount := (p_payload->>'expected')::numeric;
    IF p_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' OR v_amount IS NULL OR abs(v_amount)>9999999999.99
      OR (p_payload->>'retainage')::numeric NOT BETWEEN 0 AND 9999999999.99
      THEN RAISE EXCEPTION 'Enter a valid month and billing plan.'; END IF;
  WHEN 'receipt' THEN
    IF NOT EXISTS (SELECT 1 FROM public.job_pay_applications WHERE job_id=p_job_id AND id=p_key::uuid AND status='billed')
      OR jsonb_typeof(p_payload->'paid') IS DISTINCT FROM 'boolean'
      OR (p_payload->>'date')::date > current_date
    THEN RAISE EXCEPTION 'Select an issued bill and a valid receipt date.'; END IF;
  ELSE RAISE EXCEPTION 'Unknown financial record type.';
  END CASE;
  INSERT INTO public.job_financial_v2_records(job_id,kind,record_key,revision,payload,created_by)
    VALUES(p_job_id,p_kind,p_key,prior+1,p_payload,actor) RETURNING * INTO saved;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.record_job_financial_v2(uuid,text,text,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_job_financial_v2(uuid,text,text,integer,jsonb) TO authenticated;

-- Return just the current revision of each record using the caller's RLS.
CREATE FUNCTION public.read_job_financial_v2(p_job_id uuid)
RETURNS SETOF public.job_financial_v2_records
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT ON (kind,record_key) * FROM public.job_financial_v2_records
    WHERE job_id=p_job_id ORDER BY kind,record_key,revision DESC;
$$;
REVOKE ALL ON FUNCTION public.read_job_financial_v2(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_job_financial_v2(uuid) TO authenticated;

-- Finalize the user-reviewed snapshot and update only the existing forecast
-- columns in one transaction, retaining existing audit and stale-row guards.
CREATE FUNCTION public.finalize_job_financial_v2(
  p_job_id uuid,p_month text,p_snapshot jsonb,p_patches jsonb
) RETURNS public.job_financial_v2_records
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE saved public.job_financial_v2_records;
BEGIN
  IF jsonb_typeof(p_patches) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid forecast updates.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_patches) e WHERE jsonb_typeof(e) <> 'object'
    OR NOT (e ? 'id' AND e ? 'expected_updated_at')
    OR (e - ARRAY['id','expected_updated_at','forecast_to_complete_amount','forecast_final_amount']) <> '{}'::jsonb
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot->'lines') line
      WHERE (line->>'id')::uuid = (e->>'id')::uuid
        AND ((NOT e ? 'forecast_to_complete_amount') OR (line->>'monthly')::numeric = (e->>'forecast_to_complete_amount')::numeric)
        AND ((NOT e ? 'forecast_final_amount') OR (line->>'final')::numeric = (e->>'forecast_final_amount')::numeric))
    ) THEN
    RAISE EXCEPTION 'Only forecast amounts may be updated.';
  END IF;
  saved := public.record_job_financial_v2(p_job_id,'forecast',p_month,0,p_snapshot);
  IF jsonb_array_length(p_patches)>0 THEN
    PERFORM public.save_job_financial_batch(p_job_id,p_patches,NULL);
  END IF;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_job_financial_v2(uuid,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_job_financial_v2(uuid,text,jsonb,jsonb) TO authenticated;
