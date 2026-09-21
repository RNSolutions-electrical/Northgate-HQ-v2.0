-- Retain OH&P / Fee source lines in the internal SOV while allowing each job
-- to present fee separately or distribute it across direct work. Billed Pay
-- Apps remain immutable and are never rebuilt by this migration.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS billing_fee_presentation text NOT NULL DEFAULT 'distributed';

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_billing_fee_presentation_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_billing_fee_presentation_check
  CHECK (billing_fee_presentation IN ('distributed','separate'));

CREATE OR REPLACE FUNCTION public.set_job_billing_fee_presentation(
  p_job_id uuid,
  p_mode text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  normalized_mode text := lower(nullif(btrim(coalesce(p_mode,'')),''));
  before_job public.jobs%rowtype;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  IF normalized_mode NOT IN ('distributed','separate') THEN
    RAISE EXCEPTION 'Fee presentation must be distributed or separate.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO before_job FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL FOR UPDATE;
  IF before_job.id IS NULL THEN RAISE EXCEPTION 'Active job not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.job_billing_can_manage(p_job_id) THEN
    RAISE EXCEPTION 'Billing management permission is required' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_pay_applications WHERE job_id=p_job_id AND status='billed') THEN
    RAISE EXCEPTION 'Fee presentation is locked because this job has billed Pay App history.' USING ERRCODE='55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_pay_applications WHERE job_id=p_job_id AND status='approved') THEN
    RAISE EXCEPTION 'Return the active Pay App to Draft before changing fee presentation.' USING ERRCODE='55000';
  END IF;
  UPDATE public.jobs SET billing_fee_presentation=normalized_mode,updated_at=now() WHERE id=p_job_id;
  INSERT INTO public.change_logs(user_id,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,'jobs',p_job_id::text,'update',
    jsonb_build_object('billing_fee_presentation',before_job.billing_fee_presentation),
    jsonb_build_object('billing_fee_presentation',normalized_mode),
    'Updated the customer-facing SOV fee presentation.');
  RETURN jsonb_build_object('job_id',p_job_id,'billing_fee_presentation',normalized_mode);
END
$function$;

CREATE OR REPLACE FUNCTION public.initialize_job_sov_from_financials(p_job_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  legacy_count integer;
  contract_total numeric(14,2);
  scheduled_total numeric(14,2);
  created_count integer := 0;
  presentation text;
BEGIN
  IF actor IS NULL OR NOT public.job_billing_can_manage(p_job_id) THEN
    RAISE EXCEPTION 'Billing management permission is required' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Enter an SOV initialization reason.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_pay_applications WHERE job_id=p_job_id AND status IN ('approved','billed')) THEN
    RAISE EXCEPTION 'SOV cannot be initialized after Pay App approval; use a controlled reallocation.';
  END IF;
  SELECT billing_fee_presentation INTO presentation FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL FOR UPDATE;
  IF presentation IS NULL THEN RAISE EXCEPTION 'Active job not found' USING ERRCODE='P0002'; END IF;
  SELECT count(*) INTO legacy_count FROM public.job_revenue_lines
  WHERE job_id=p_job_id AND archived_at IS NULL AND source_budget_line_id IS NULL;
  IF legacy_count > 0 THEN
    RAISE EXCEPTION 'Existing manual SOV lines require controlled reallocation before initialization.';
  END IF;
  SELECT coalesce(sum(round(budget_amount,2)),0) INTO contract_total
  FROM public.job_budget_lines WHERE job_id=p_job_id AND archived_at IS NULL;
  IF contract_total <= 0 THEN
    RAISE EXCEPTION 'Financials must contain a positive original budget before SOV initialization.';
  END IF;

  WITH base AS (
    SELECT b.*, d.code AS division_code,
      coalesce(sum(round(b.budget_amount,2)) FILTER (WHERE b.category='ohp_fee') OVER (PARTITION BY b.project_division_id),0) AS division_fee,
      coalesce(sum(round(b.budget_amount,2)) FILTER (WHERE b.category<>'ohp_fee' AND b.budget_amount>0) OVER (PARTITION BY b.project_division_id),0) AS division_direct,
      coalesce(sum(round(b.budget_amount,2)) FILTER (WHERE b.category<>'ohp_fee' AND b.budget_amount>0)
        OVER (PARTITION BY b.project_division_id ORDER BY coalesce(b.cost_code,''),b.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS direct_before,
      coalesce(sum(round(b.budget_amount,2)) FILTER (WHERE b.category<>'ohp_fee' AND b.budget_amount>0)
        OVER (PARTITION BY b.project_division_id ORDER BY coalesce(b.cost_code,''),b.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),0) AS direct_through
    FROM public.job_budget_lines b
    LEFT JOIN public.job_budget_divisions d ON d.id=b.project_division_id
    WHERE b.job_id=p_job_id AND b.archived_at IS NULL AND b.budget_amount>=0
  ), calculated AS (
    SELECT base.*,
      CASE WHEN presentation='distributed' AND category<>'ohp_fee' AND division_direct>0
        THEN round(division_fee*direct_through/division_direct,2)-round(division_fee*direct_before/division_direct,2)
        ELSE 0 END AS fee_alloc
    FROM base
  )
  INSERT INTO public.job_revenue_lines
    (job_id,division,sov_line,description,scheduled_value_amount,approved_change_amount,billed_to_date_amount,
     note,created_by,source_budget_line_id,source_project_division_id,source_original_budget_amount,
     allocation_percent,allocated_fee_amount,is_protected_financial)
  SELECT p_job_id,division,coalesce(cost_code,division_code||'.00'),description,
    round(CASE WHEN category='ohp_fee' AND presentation='distributed' THEN 0 ELSE budget_amount+fee_alloc END,2),
    0,0,
    CASE WHEN category='ohp_fee' AND presentation='distributed'
      THEN 'Internal OH&P / Fee source; distributed across customer-facing work lines. '
      ELSE 'Initialized from Financials. ' END || btrim(p_reason),
    actor,id,project_division_id,budget_amount,
    round((CASE WHEN category='ohp_fee' AND presentation='distributed' THEN 0 ELSE budget_amount+fee_alloc END)*100/contract_total,6),
    fee_alloc,(is_protected_financial OR category='ohp_fee')
  FROM calculated
  ON CONFLICT (source_budget_line_id) WHERE source_budget_line_id IS NOT NULL AND archived_at IS NULL DO UPDATE
  SET division=excluded.division,sov_line=excluded.sov_line,description=excluded.description,
      scheduled_value_amount=excluded.scheduled_value_amount,
      source_project_division_id=excluded.source_project_division_id,
      source_original_budget_amount=excluded.source_original_budget_amount,
      allocation_percent=excluded.allocation_percent,allocated_fee_amount=excluded.allocated_fee_amount,
      is_protected_financial=excluded.is_protected_financial,note=excluded.note;
  GET DIAGNOSTICS created_count = ROW_COUNT;

  SELECT coalesce(sum(scheduled_value_amount),0) INTO scheduled_total
  FROM public.job_revenue_lines
  WHERE job_id=p_job_id AND archived_at IS NULL AND source_budget_line_id IS NOT NULL;
  IF scheduled_total <> contract_total THEN
    RAISE EXCEPTION 'SOV fee presentation did not reconcile: scheduled % versus contract %',scheduled_total,contract_total;
  END IF;
  RETURN jsonb_build_object('contract_value',contract_total,'scheduled_value',scheduled_total,
    'fee_presentation',presentation,'sov_lines_written',created_count);
END
$function$;

REVOKE ALL ON FUNCTION public.set_job_billing_fee_presentation(uuid,text),
  public.initialize_job_sov_from_financials(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_job_billing_fee_presentation(uuid,text),
  public.initialize_job_sov_from_financials(uuid,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
