-- Keep system-managed ##.CO synchronization from being mistaken for a user
-- editing an Original Budget field. All ordinary protected-field edits remain
-- reason-gated by the audited financial workflow.
CREATE OR REPLACE FUNCTION public.guard_financial_budget_changes()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  system_co_sync boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    system_co_sync := COALESCE(OLD.note, '') = 'System-managed change-order allocation line.'
      AND COALESCE(NEW.note, '') = 'System-managed change-order allocation line.'
      AND NEW.budget_amount IS NOT DISTINCT FROM OLD.budget_amount
      AND NEW.budget_change_amount IS NOT DISTINCT FROM OLD.budget_change_amount
      AND NEW.actual_cost_amount IS NOT DISTINCT FROM OLD.actual_cost_amount
      AND NEW.committed_cost_amount IS NOT DISTINCT FROM OLD.committed_cost_amount
      AND NEW.forecast_to_complete_amount IS NOT DISTINCT FROM OLD.forecast_to_complete_amount
      AND NEW.forecast_final_amount IS NOT DISTINCT FROM OLD.forecast_final_amount
      AND NEW.schedule_of_values_amount IS NOT DISTINCT FROM OLD.schedule_of_values_amount
      AND NEW.current_budget_override_amount IS NOT DISTINCT FROM OLD.current_budget_override_amount
      AND NEW.category IS NOT DISTINCT FROM OLD.category
      AND NEW.is_protected_financial IS NOT DISTINCT FROM OLD.is_protected_financial;
  END IF;

  IF TG_OP = 'UPDATE' AND (NEW.budget_amount IS DISTINCT FROM OLD.budget_amount
    OR NEW.cost_code IS DISTINCT FROM OLD.cost_code
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.is_protected_financial IS DISTINCT FROM OLD.is_protected_financial)
    AND NOT system_co_sync
    AND NULLIF(BTRIM(current_setting('northgate.financial_reason', true), E' \t\n\r'), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to change the Original Budget or protected financial fields' USING ERRCODE = '22023';
  END IF;
  IF ((TG_OP = 'INSERT' AND NEW.current_budget_override_amount IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND NEW.current_budget_override_amount IS DISTINCT FROM OLD.current_budget_override_amount))
    AND COALESCE(current_setting('northgate.financial_workflow', true), '') <> 'financial.save' THEN
    RAISE EXCEPTION 'Use the audited financial workflow to change Current Budget' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_financial_budget_changes() FROM PUBLIC, anon, authenticated;

-- Immutable, cent-precise record of how estimate cost components entered Job
-- Financials. The unique bucket key makes handoff retries idempotent.
CREATE TABLE public.estimate_handoff_financial_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id uuid NOT NULL REFERENCES public.estimate_workflow_handoffs(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  job_budget_line_id uuid NOT NULL REFERENCES public.job_budget_lines(id) ON DELETE RESTRICT,
  catalogue_id uuid REFERENCES public.financial_line_catalogue(id) ON DELETE SET NULL,
  bucket_key text NOT NULL,
  estimate_reference text NOT NULL,
  estimate_description text NOT NULL,
  cost_kind text NOT NULL CHECK (cost_kind IN ('material_amount','labor_amount','other_amount','markup_amount')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (handoff_id, bucket_key)
);
CREATE INDEX estimate_handoff_financial_allocations_job_idx
  ON public.estimate_handoff_financial_allocations(job_id, job_budget_line_id);
ALTER TABLE public.estimate_handoff_financial_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.estimate_handoff_financial_allocations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_estimate_for_review_v2(
  p_estimate_id uuid,
  p_expected_revision integer,
  p_destination text,
  p_job_id uuid,
  p_new_job jsonb,
  p_co_number text,
  p_line_targets jsonb,
  p_financial_targets jsonb DEFAULT '{}'::jsonb
)
RETURNS public.estimate_workflow_handoffs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor text := NULLIF(auth.jwt()->>'sub', '');
  saved public.estimate_workflow_handoffs;
  target_job public.jobs%ROWTYPE;
  target_line public.job_budget_lines%ROWTYPE;
  catalogue_line public.financial_line_catalogue%ROWTYPE;
  project_division public.job_budget_divisions%ROWTYPE;
  pricing_line jsonb;
  cost_kind text;
  bucket_key text;
  target_key text;
  target_id uuid;
  amount numeric(14,2);
  allocation_id uuid;
  expected_total numeric(14,2) := 0;
  posted_total numeric(14,2) := 0;
  allocation_count integer := 0;
  previous_reason text := current_setting('northgate.financial_reason', true);
  previous_workflow text := current_setting('northgate.financial_workflow', true);
BEGIN
  saved := public.submit_estimate_for_review(
    p_estimate_id,p_expected_revision,p_destination,p_job_id,p_new_job,p_co_number,p_line_targets
  );

  IF p_destination <> 'job' THEN
    RETURN saved;
  END IF;
  IF actor IS NULL OR public.current_user_can_edit_job(saved.job_id,'can_approve_budget') IS NOT TRUE THEN
    RAISE EXCEPTION 'Budget approval permission is required to import estimate costs' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_financial_targets,'{}'::jsonb)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Choose a financial cost code for every non-zero estimate cost' USING ERRCODE='22023';
  END IF;
  SELECT * INTO target_job FROM public.jobs WHERE id=saved.job_id AND archived_at IS NULL FOR UPDATE;
  IF target_job.id IS NULL THEN RAISE EXCEPTION 'Active destination job was not found' USING ERRCODE='P0002'; END IF;

  SELECT count(*),COALESCE(sum(amount),0) INTO allocation_count,posted_total
  FROM public.estimate_handoff_financial_allocations WHERE handoff_id=saved.id;
  IF allocation_count > 0 THEN
    IF posted_total IS DISTINCT FROM round((saved.pricing->>'total')::numeric,2) THEN
      RAISE EXCEPTION 'Existing estimate financial allocations do not reconcile; review before retrying' USING ERRCODE='23514';
    END IF;
    RETURN saved;
  END IF;

  PERFORM set_config('northgate.financial_workflow','financial.save',true);
  PERFORM set_config('northgate.financial_reason','Estimate handoff '||saved.id||' imported to Original Budget.',true);

  FOR pricing_line IN SELECT value FROM jsonb_array_elements(COALESCE(saved.pricing->'lines','[]'::jsonb)) LOOP
    FOREACH cost_kind IN ARRAY ARRAY['material_amount','labor_amount','other_amount','markup_amount'] LOOP
      amount := round(COALESCE((pricing_line->>cost_kind)::numeric,0),2);
      IF amount <= 0 THEN CONTINUE; END IF;
      expected_total := expected_total + amount;
      bucket_key := pricing_line->>'key'||':'||cost_kind;
      target_key := NULLIF(BTRIM(p_financial_targets->>bucket_key),'');
      IF target_key IS NULL OR target_key !~ '^(budget|catalogue):[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'Choose a valid financial cost code for %', bucket_key USING ERRCODE='22023';
      END IF;
      target_id := split_part(target_key,':',2)::uuid;
      catalogue_line := NULL;
      target_line := NULL;

      IF target_key LIKE 'budget:%' THEN
        SELECT * INTO target_line FROM public.job_budget_lines
        WHERE id=target_id AND job_id=saved.job_id AND archived_at IS NULL
          AND UPPER(BTRIM(COALESCE(cost_code,''))) !~ '[.]CO$' FOR UPDATE;
        IF target_line.id IS NULL THEN RAISE EXCEPTION 'Selected job financial line is unavailable' USING ERRCODE='22023'; END IF;
      ELSE
        SELECT * INTO catalogue_line FROM public.financial_line_catalogue
        WHERE id=target_id AND is_active AND UPPER(BTRIM(cost_code)) !~ '[.]CO$';
        IF catalogue_line.id IS NULL THEN RAISE EXCEPTION 'Selected catalogue financial line is unavailable' USING ERRCODE='22023'; END IF;
        SELECT * INTO project_division FROM public.job_budget_divisions
        WHERE job_id=saved.job_id AND archived_at IS NULL
          AND UPPER(BTRIM(COALESCE(code,'')))=UPPER(BTRIM(catalogue_line.division_code))
        ORDER BY created_at,id LIMIT 1 FOR UPDATE;
        IF project_division.id IS NULL THEN
          INSERT INTO public.job_budget_divisions(job_id,code,name,sort_order)
          VALUES(saved.job_id,catalogue_line.division_code,catalogue_line.division_name,
            COALESCE(NULLIF(regexp_replace(catalogue_line.division_code,'\D','','g'),'')::integer,999))
          RETURNING * INTO project_division;
        END IF;
        SELECT * INTO target_line FROM public.job_budget_lines
        WHERE job_id=saved.job_id AND archived_at IS NULL
          AND UPPER(BTRIM(COALESCE(cost_code,'')))=UPPER(BTRIM(catalogue_line.cost_code))
        ORDER BY created_at,id LIMIT 1 FOR UPDATE;
        IF target_line.id IS NULL THEN
          INSERT INTO public.job_budget_lines(job_id,division,project_division_id,category,is_protected_financial,
            cost_code,description,budget_amount,budget_change_amount,actual_cost_amount,committed_cost_amount,
            forecast_to_complete_amount,forecast_final_amount,schedule_of_values_amount,note,sort_order,created_by)
          VALUES(saved.job_id,target_job.division,project_division.id,catalogue_line.category,
            catalogue_line.is_protected_financial,catalogue_line.cost_code,catalogue_line.description,
            0,0,0,0,0,0,0,NULLIF(BTRIM(catalogue_line.notes),''),catalogue_line.sort_order,actor)
          RETURNING * INTO target_line;
        END IF;
      END IF;

      INSERT INTO public.estimate_handoff_financial_allocations(
        handoff_id,job_id,job_budget_line_id,catalogue_id,bucket_key,estimate_reference,
        estimate_description,cost_kind,amount,created_by
      ) VALUES (
        saved.id,saved.job_id,target_line.id,catalogue_line.id,bucket_key,
        COALESCE(pricing_line->>'reference','Estimate'),COALESCE(pricing_line->>'description','Estimate cost'),
        cost_kind,amount,actor
      ) RETURNING id INTO allocation_id;

      UPDATE public.job_budget_lines
      SET budget_amount=budget_amount+amount,
          forecast_final_amount=forecast_final_amount+amount,
          updated_at=now()
      WHERE id=target_line.id;
      posted_total := posted_total + amount;
    END LOOP;
  END LOOP;

  IF expected_total <= 0 OR expected_total IS DISTINCT FROM round((saved.pricing->>'total')::numeric,2)
    OR posted_total IS DISTINCT FROM expected_total THEN
    RAISE EXCEPTION 'Estimate financial allocations do not reconcile to the estimate total' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
  VALUES(actor,public.change_order_actor(),'estimate_handoff_financial_allocations',saved.id::text,'create',
    jsonb_build_object('job_id',saved.job_id,'estimate_id',saved.estimate_id,'amount',posted_total),
    'Estimate internal costs imported to mapped Job Financials lines.');
  PERFORM set_config('northgate.financial_reason',COALESCE(previous_reason,''),true);
  PERFORM set_config('northgate.financial_workflow',COALESCE(previous_workflow,''),true);
  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_estimate_for_review_v2(uuid,integer,text,uuid,jsonb,text,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_estimate_for_review_v2(uuid,integer,text,uuid,jsonb,text,jsonb,jsonb)
  TO authenticated;

COMMENT ON TABLE public.estimate_handoff_financial_allocations IS
  'Immutable, idempotent mapping of estimate cost components to Job Financials Original Budget lines.';
NOTIFY pgrst,'reload schema';
