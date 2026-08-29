-- Northgate Job > Billing authoritative SOV and Pay Application workflow.
-- Authoritative Job > Billing evolution. Existing job_revenue_lines remains the
-- one SOV table; this migration adds source and allocation metadata rather than
-- creating a parallel SOV.
ALTER TABLE public.job_revenue_lines
  ADD COLUMN IF NOT EXISTS source_budget_line_id UUID REFERENCES public.job_budget_lines(id),
  ADD COLUMN IF NOT EXISTS source_project_division_id UUID REFERENCES public.job_budget_divisions(id),
  ADD COLUMN IF NOT EXISTS source_original_budget_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS allocation_percent NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS allocated_fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_locked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS job_revenue_lines_source_budget_line_active_key
  ON public.job_revenue_lines (source_budget_line_id)
  WHERE source_budget_line_id IS NOT NULL AND archived_at IS NULL;

CREATE TABLE public.job_pay_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  pay_app_number INTEGER NOT NULL CHECK (pay_app_number > 0),
  billing_period_start DATE,
  billing_period_end DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','billed','voided')),
  original_contract_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_change_order_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_contract_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  original_previous_billed NUMERIC(14,2) NOT NULL DEFAULT 0,
  original_current_billed NUMERIC(14,2) NOT NULL DEFAULT 0,
  change_order_previous_billed NUMERIC(14,2) NOT NULL DEFAULT 0,
  change_order_current_billed NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_previous_billed NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_current_billed NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_billed_to_date NUMERIC(14,2) NOT NULL DEFAULT 0,
  remaining_contract_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  billed_at TIMESTAMPTZ,
  billed_by TEXT,
  finalization_key UUID,
  pay_app_kind TEXT NOT NULL DEFAULT 'standard' CHECK (pay_app_kind IN ('standard','correction','reversal')),
  correction_of_id UUID REFERENCES public.job_pay_applications(id),
  retainage_percent NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (retainage_percent BETWEEN 0 AND 100),
  retainage_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  template_key TEXT NOT NULL DEFAULT 'aia_g702_g703',
  template_document_id UUID REFERENCES public.documents(id),
  approval_note TEXT,
  billed_note TEXT,
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  void_reason TEXT,
  UNIQUE (job_id, pay_app_number),
  UNIQUE (finalization_key)
);
CREATE INDEX job_pay_applications_job_status_idx ON public.job_pay_applications (job_id, status, pay_app_number DESC);

CREATE TABLE public.job_pay_application_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_application_id UUID NOT NULL REFERENCES public.job_pay_applications(id) ON DELETE CASCADE,
  sov_line_id UUID REFERENCES public.job_revenue_lines(id),
  source_budget_line_id UUID REFERENCES public.job_budget_lines(id),
  project_division_id UUID REFERENCES public.job_budget_divisions(id),
  project_division_code TEXT,
  project_division_name TEXT,
  cost_code TEXT,
  description TEXT NOT NULL,
  original_budget_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  source_fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  allocated_fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  scheduled_value_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (scheduled_value_amount >= 0),
  previous_billed_percent NUMERIC(9,6) NOT NULL DEFAULT 0,
  additional_percent NUMERIC(9,6) NOT NULL DEFAULT 0,
  resulting_percent NUMERIC(9,6) NOT NULL DEFAULT 0,
  previous_billed_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  calculated_current_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  final_current_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  override_reason TEXT,
  overridden_by TEXT,
  overridden_at TIMESTAMPTZ,
  billed_to_date_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pay_application_id, sov_line_id)
);
CREATE INDEX job_pay_application_lines_pay_app_idx ON public.job_pay_application_lines(pay_application_id);

CREATE TABLE public.job_pay_application_change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_application_id UUID NOT NULL REFERENCES public.job_pay_applications(id) ON DELETE CASCADE,
  change_order_id UUID NOT NULL REFERENCES public.change_orders(id),
  co_number TEXT NOT NULL,
  description TEXT,
  approved_value NUMERIC(14,2) NOT NULL,
  previous_billed_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  additional_percent NUMERIC(9,6) NOT NULL DEFAULT 0,
  calculated_current_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  final_current_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  override_reason TEXT,
  overridden_by TEXT,
  overridden_at TIMESTAMPTZ,
  billed_to_date_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  source_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pay_application_id, change_order_id)
);
CREATE INDEX job_pay_application_change_orders_pay_app_idx ON public.job_pay_application_change_orders(pay_application_id);

ALTER TABLE public.job_pay_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_pay_application_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_pay_application_change_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_pay_applications, public.job_pay_application_lines, public.job_pay_application_change_orders FROM anon, authenticated;

-- Billing remains RPC-only. Security-definer functions verify both the caller
-- and their granular project permission before bypassing source-table RLS.
CREATE OR REPLACE FUNCTION public.job_billing_can_manage(p_job_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT public.current_user_can_access_job(p_job_id, 'can_approve_budget')
$$;

CREATE OR REPLACE FUNCTION public.initialize_job_sov_from_financials(p_job_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor TEXT := auth.jwt()->>'sub'; legacy_count INTEGER; contract_total NUMERIC(14,2); created_count INTEGER := 0;
BEGIN
  IF actor IS NULL OR NOT public.job_billing_can_manage(p_job_id) THEN RAISE EXCEPTION 'Billing management permission is required' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.job_pay_applications WHERE job_id=p_job_id AND status IN ('approved','billed')) THEN RAISE EXCEPTION 'SOV cannot be initialized after Pay App approval; use a controlled reallocation.'; END IF;
  SELECT count(*) INTO legacy_count FROM public.job_revenue_lines WHERE job_id=p_job_id AND archived_at IS NULL AND source_budget_line_id IS NULL;
  IF legacy_count > 0 THEN RAISE EXCEPTION 'Existing legacy SOV lines require controlled reallocation before initialization.'; END IF;
  SELECT COALESCE(sum(round(budget_amount,2)),0) INTO contract_total FROM public.job_budget_lines WHERE job_id=p_job_id AND archived_at IS NULL;
  IF contract_total <= 0 THEN RAISE EXCEPTION 'Financials must contain a positive original budget before SOV initialization.'; END IF;
  WITH base AS (
    SELECT b.*, d.code, d.name, COALESCE(sum(budget_amount) FILTER (WHERE category='ohp_fee') OVER (PARTITION BY project_division_id),0) division_fee,
      COALESCE(sum(budget_amount) FILTER (WHERE category<>'ohp_fee' AND budget_amount>0) OVER (PARTITION BY project_division_id),0) division_direct
    FROM public.job_budget_lines b LEFT JOIN public.job_budget_divisions d ON d.id=b.project_division_id
    WHERE b.job_id=p_job_id AND b.archived_at IS NULL AND b.category<>'ohp_fee' AND b.budget_amount>=0
  ), source AS (
    SELECT *, round(CASE WHEN division_direct=0 THEN 0 ELSE division_fee * budget_amount / division_direct END,2) fee_alloc FROM base
  )
  INSERT INTO public.job_revenue_lines (job_id,division,sov_line,description,scheduled_value_amount,approved_change_amount,billed_to_date_amount,note,created_by,source_budget_line_id,source_project_division_id,source_original_budget_amount,allocation_percent,allocated_fee_amount,is_protected_financial)
  SELECT p_job_id, division, COALESCE(cost_code, code || '.00'), description, round(budget_amount+fee_alloc,2),0,0,'Initialized from Financials: '||BTRIM(p_reason),actor,id,project_division_id,budget_amount,round((budget_amount+fee_alloc)*100/contract_total,6),fee_alloc,FALSE FROM source
  ON CONFLICT (source_budget_line_id) WHERE source_budget_line_id IS NOT NULL AND archived_at IS NULL DO UPDATE
    SET scheduled_value_amount=EXCLUDED.scheduled_value_amount, source_original_budget_amount=EXCLUDED.source_original_budget_amount, allocation_percent=EXCLUDED.allocation_percent, allocated_fee_amount=EXCLUDED.allocated_fee_amount, note=EXCLUDED.note;
  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN jsonb_build_object('contract_value',contract_total,'sov_lines_written',created_count);
END; $$;

CREATE OR REPLACE FUNCTION public.create_job_pay_application(p_job_id UUID, p_period_end DATE, p_template_key TEXT, p_template_document_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor TEXT := auth.jwt()->>'sub'; app_id UUID; n INTEGER; contract_value NUMERIC(14,2); co_value NUMERIC(14,2);
BEGIN
  IF actor IS NULL OR NOT public.job_billing_can_manage(p_job_id) THEN RAISE EXCEPTION 'Billing management permission is required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_job_id::TEXT));
  IF EXISTS (SELECT 1 FROM public.job_pay_applications WHERE job_id=p_job_id AND status IN ('draft','approved')) THEN RAISE EXCEPTION 'This job already has an active Draft or Approved Pay App.'; END IF;
  SELECT COALESCE(sum(scheduled_value_amount),0) INTO contract_value FROM public.job_revenue_lines WHERE job_id=p_job_id AND archived_at IS NULL;
  IF contract_value<=0 THEN RAISE EXCEPTION 'Initialize and reconcile the SOV before creating a Pay App.'; END IF;
  SELECT COALESCE(sum(price_amount),0) INTO co_value FROM public.change_orders WHERE job_id=p_job_id AND status='approved' AND voided_at IS NULL AND archived_at IS NULL;
  SELECT COALESCE(max(pay_app_number),0)+1 INTO n FROM public.job_pay_applications WHERE job_id=p_job_id;
  INSERT INTO public.job_pay_applications(job_id,pay_app_number,billing_period_end,original_contract_value,approved_change_order_value,current_contract_value,remaining_contract_value,created_by,template_key,template_document_id)
  VALUES(p_job_id,n,COALESCE(p_period_end,CURRENT_DATE),contract_value,co_value,contract_value+co_value,contract_value+co_value,actor,p_template_key,p_template_document_id) RETURNING id INTO app_id;
  INSERT INTO public.job_pay_application_lines(pay_application_id,sov_line_id,source_budget_line_id,project_division_id,project_division_code,project_division_name,cost_code,description,original_budget_amount,allocated_fee_amount,scheduled_value_amount,previous_billed_amount,billed_to_date_amount,remaining_amount,snapshot)
  SELECT app_id,r.id,r.source_budget_line_id,r.source_project_division_id,d.code,d.name,r.sov_line,r.description,r.source_original_budget_amount,r.allocated_fee_amount,r.scheduled_value_amount,COALESCE(prior.amount,0),COALESCE(prior.amount,0),r.scheduled_value_amount-COALESCE(prior.amount,0),jsonb_build_object('sov_line',r.sov_line,'description',r.description)
  FROM public.job_revenue_lines r LEFT JOIN public.job_budget_divisions d ON d.id=r.source_project_division_id
  LEFT JOIN LATERAL (SELECT sum(l.final_current_amount) AS amount FROM public.job_pay_application_lines l JOIN public.job_pay_applications h ON h.id=l.pay_application_id WHERE h.job_id=p_job_id AND h.status='billed' AND l.sov_line_id=r.id) prior ON TRUE
  WHERE r.job_id=p_job_id AND r.archived_at IS NULL;
  INSERT INTO public.job_pay_application_change_orders(pay_application_id,change_order_id,co_number,description,approved_value,previous_billed_amount,billed_to_date_amount,remaining_amount,source_snapshot)
  SELECT app_id,c.id,c.co_number,c.title,c.price_amount,COALESCE(prior.amount,0),COALESCE(prior.amount,0),c.price_amount-COALESCE(prior.amount,0),jsonb_build_object('co_number',c.co_number,'title',c.title,'approved_value',c.price_amount)
  FROM public.change_orders c LEFT JOIN LATERAL (SELECT sum(x.final_current_amount) AS amount FROM public.job_pay_application_change_orders x JOIN public.job_pay_applications h ON h.id=x.pay_application_id WHERE h.job_id=p_job_id AND h.status='billed' AND x.change_order_id=c.id) prior ON TRUE
  WHERE c.job_id=p_job_id AND c.status='approved' AND c.voided_at IS NULL AND c.archived_at IS NULL;
  RETURN app_id;
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_job_pay_application(p_pay_app_id UUID, p_finalization_key UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE app public.job_pay_applications%ROWTYPE; actor TEXT := auth.jwt()->>'sub'; original_current NUMERIC(14,2); co_current NUMERIC(14,2);
BEGIN
  SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;
  IF app.id IS NULL THEN RAISE EXCEPTION 'Pay App not found'; END IF;
  IF actor IS NULL OR NOT public.job_billing_can_manage(app.job_id) THEN RAISE EXCEPTION 'Billing finalization permission is required' USING ERRCODE='42501'; END IF;
  IF app.status='billed' AND app.finalization_key=p_finalization_key THEN RETURN jsonb_build_object('id',app.id,'status','billed','idempotent',true); END IF;
  IF app.status<>'approved' THEN RAISE EXCEPTION 'Only an Approved Pay App can be marked Billed.'; END IF;
  IF EXISTS (SELECT 1 FROM public.job_pay_application_lines WHERE pay_application_id=app.id AND final_current_amount<0) OR EXISTS (SELECT 1 FROM public.job_pay_application_lines WHERE pay_application_id=app.id AND previous_billed_amount+final_current_amount>scheduled_value_amount) THEN RAISE EXCEPTION 'A scheduled line exceeds its available value.'; END IF;
  IF EXISTS (SELECT 1 FROM public.job_pay_application_change_orders WHERE pay_application_id=app.id AND approved_value>=0 AND (final_current_amount<0 OR previous_billed_amount+final_current_amount>approved_value)) THEN RAISE EXCEPTION 'A change order exceeds its approved value.'; END IF;
  SELECT COALESCE(sum(final_current_amount),0) INTO original_current FROM public.job_pay_application_lines WHERE pay_application_id=app.id;
  SELECT COALESCE(sum(final_current_amount),0) INTO co_current FROM public.job_pay_application_change_orders WHERE pay_application_id=app.id;
  UPDATE public.job_pay_application_lines SET billed_to_date_amount=previous_billed_amount+final_current_amount, remaining_amount=scheduled_value_amount-(previous_billed_amount+final_current_amount), resulting_percent=CASE WHEN scheduled_value_amount=0 THEN 0 ELSE round((previous_billed_amount+final_current_amount)*100/scheduled_value_amount,6) END WHERE pay_application_id=app.id;
  UPDATE public.job_pay_application_change_orders SET billed_to_date_amount=previous_billed_amount+final_current_amount, remaining_amount=approved_value-(previous_billed_amount+final_current_amount) WHERE pay_application_id=app.id;
  UPDATE public.job_pay_applications SET status='billed',finalization_key=p_finalization_key,billed_at=NOW(),billed_by=actor,billed_note=p_note,original_current_billed=original_current,change_order_current_billed=co_current,total_current_billed=original_current+co_current,original_previous_billed=(SELECT COALESCE(sum(original_current_billed),0) FROM public.job_pay_applications WHERE job_id=app.job_id AND status='billed'),change_order_previous_billed=(SELECT COALESCE(sum(change_order_current_billed),0) FROM public.job_pay_applications WHERE job_id=app.job_id AND status='billed'),total_billed_to_date=(SELECT COALESCE(sum(total_current_billed),0) FROM public.job_pay_applications WHERE job_id=app.job_id AND status='billed')+original_current+co_current,remaining_contract_value=app.current_contract_value-((SELECT COALESCE(sum(total_current_billed),0) FROM public.job_pay_applications WHERE job_id=app.job_id AND status='billed')+original_current+co_current) WHERE id=app.id;
  RETURN jsonb_build_object('id',app.id,'status','billed','idempotent',false);
END; $$;

CREATE OR REPLACE FUNCTION public.save_job_pay_application_line(p_line_id UUID, p_additional_percent NUMERIC, p_override_amount NUMERIC DEFAULT NULL, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE line public.job_pay_application_lines%ROWTYPE; app public.job_pay_applications%ROWTYPE; amount NUMERIC(14,2);
BEGIN
  SELECT * INTO line FROM public.job_pay_application_lines WHERE id=p_line_id FOR UPDATE;
  SELECT * INTO app FROM public.job_pay_applications WHERE id=line.pay_application_id FOR UPDATE;
  IF app.id IS NULL OR NOT public.job_billing_can_manage(app.job_id) OR app.status<>'draft' THEN RAISE EXCEPTION 'Only authorized Draft Pay App lines can be edited' USING ERRCODE='42501'; END IF;
  amount := COALESCE(p_override_amount, round(line.scheduled_value_amount * COALESCE(p_additional_percent,0)/100,2));
  IF amount<0 OR line.previous_billed_amount+amount>line.scheduled_value_amount THEN RAISE EXCEPTION 'Current billing exceeds the scheduled value.'; END IF;
  IF p_override_amount IS NOT NULL AND NULLIF(BTRIM(COALESCE(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'A reason is required for a billing override.'; END IF;
  UPDATE public.job_pay_application_lines SET additional_percent=COALESCE(p_additional_percent,0),calculated_current_amount=round(line.scheduled_value_amount*COALESCE(p_additional_percent,0)/100,2),final_current_amount=amount,override_reason=CASE WHEN p_override_amount IS NULL THEN NULL ELSE BTRIM(p_reason) END,overridden_by=CASE WHEN p_override_amount IS NULL THEN NULL ELSE auth.jwt()->>'sub' END,overridden_at=CASE WHEN p_override_amount IS NULL THEN NULL ELSE NOW() END,updated_at=NOW() WHERE id=p_line_id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_job_pay_application_status(p_pay_app_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE app public.job_pay_applications%ROWTYPE;
BEGIN
  SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;
  IF app.id IS NULL OR NOT public.job_billing_can_manage(app.job_id) THEN RAISE EXCEPTION 'Billing management permission is required' USING ERRCODE='42501'; END IF;
  IF p_status='approved' AND app.status='draft' THEN UPDATE public.job_pay_applications SET status='approved',approved_at=NOW(),approved_by=auth.jwt()->>'sub',approval_note=p_note,updated_at=NOW() WHERE id=app.id;
  ELSIF p_status='draft' AND app.status='approved' THEN UPDATE public.job_pay_applications SET status='draft',approved_at=NULL,approved_by=NULL,approval_note=p_note,updated_at=NOW() WHERE id=app.id;
  ELSE RAISE EXCEPTION 'Invalid Pay App status transition.'; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.initialize_job_sov_from_financials(UUID,TEXT), public.create_job_pay_application(UUID,DATE,TEXT,UUID), public.finalize_job_pay_application(UUID,UUID,TEXT), public.save_job_pay_application_line(UUID,NUMERIC,NUMERIC,TEXT), public.set_job_pay_application_status(UUID,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.initialize_job_sov_from_financials(UUID,TEXT), public.create_job_pay_application(UUID,DATE,TEXT,UUID), public.finalize_job_pay_application(UUID,UUID,TEXT), public.save_job_pay_application_line(UUID,NUMERIC,NUMERIC,TEXT), public.set_job_pay_application_status(UUID,TEXT,TEXT) TO authenticated;
