-- One-time, owner-approved reconciliation for Carolina Retina NGG-CO-9-R1.
-- Run after 20261002174322_contract_adjustment_state_model_integration.sql.
-- The approved revision remains $1,477.60; immutable historical postings,
-- Original Budget, and billed Pay Apps are deliberately not rewritten.

DO $guard$
DECLARE old_definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO old_definition
  FROM pg_constraint c
  WHERE c.conrelid='public.change_order_financial_postings'::regclass
    AND c.conname='change_order_financial_postings_posting_kind_check';
  IF old_definition IS NULL THEN
    RAISE EXCEPTION 'Posting-kind constraint is missing; abort CO9 reconciliation';
  ELSIF old_definition = 'CHECK ((posting_kind = ANY (ARRAY[''approval''::text, ''void''::text])))' THEN
    ALTER TABLE public.change_order_financial_postings
      DROP CONSTRAINT change_order_financial_postings_posting_kind_check;
    ALTER TABLE public.change_order_financial_postings
      ADD CONSTRAINT change_order_financial_postings_posting_kind_check
      CHECK (posting_kind IN ('approval','void','reconciliation'));
  ELSIF old_definition NOT LIKE '%reconciliation%' THEN
    RAISE EXCEPTION 'Unexpected posting-kind constraint: %',old_definition;
  END IF;
END $guard$;

DO $repair$
DECLARE
  expected_amount CONSTANT numeric := 1477.60;
  job public.jobs;
  root_co public.change_orders;
  revision_co public.change_orders;
  budget_line public.job_budget_lines;
  existing_reconciliation public.change_order_financial_postings;
  inserted_reconciliation public.change_order_financial_postings;
  family_count integer;
  posting_count integer;
  family_net numeric;
BEGIN
  SELECT * INTO STRICT job FROM public.jobs
  WHERE job_number='Carolina Retina' AND name='Carolina Retina Institute' FOR UPDATE;
  SELECT * INTO STRICT root_co FROM public.change_orders
  WHERE job_id=job.id AND co_number='NGG-CO-9' FOR UPDATE;
  SELECT * INTO STRICT revision_co FROM public.change_orders
  WHERE job_id=job.id AND co_number='NGG-CO-9-R1' FOR UPDATE;
  SELECT * INTO STRICT budget_line FROM public.job_budget_lines
  WHERE job_id=job.id AND cost_code='16.CO'
    AND description='Electrical Change Orders' FOR UPDATE;

  IF root_co.status<>'voided' OR root_co.voided_at IS NULL
    OR root_co.void_reason<>'Voiding Duplicate CO' OR root_co.price_amount<>expected_amount
    OR revision_co.revision_of_id<>root_co.id
    OR revision_co.status<>'approved' OR revision_co.voided_at IS NOT NULL
    OR revision_co.archived_at IS NOT NULL OR revision_co.price_amount<>expected_amount
    OR budget_line.budget_amount<>0
    OR budget_line.budget_change_amount<>0 THEN
    RAISE EXCEPTION 'CO9 records or budget line differ from reviewed baseline; no repair made';
  END IF;
  SELECT count(*) INTO family_count FROM public.change_orders
  WHERE id=root_co.id OR revision_of_id=root_co.id;
  IF family_count<>2 OR EXISTS(SELECT 1 FROM public.change_orders WHERE revision_of_id=revision_co.id) THEN
    RAISE EXCEPTION 'CO9 revision family changed; no repair made';
  END IF;

  SELECT count(*),coalesce(sum(amount_delta),0)
  INTO posting_count,family_net
  FROM public.change_order_financial_postings
  WHERE change_order_id IN (root_co.id,revision_co.id);
  IF (SELECT count(*) FROM public.change_order_financial_postings p
     WHERE p.change_order_id IN (root_co.id,revision_co.id)
       AND p.job_id=job.id AND p.job_budget_line_id=budget_line.id
       AND p.division='Electrical' AND p.cost_code='16.CO'
       AND ((p.change_order_id=root_co.id AND p.posting_kind='approval' AND p.amount_delta=expected_amount)
         OR (p.change_order_id=root_co.id AND p.posting_kind='void' AND p.amount_delta=-expected_amount)
         OR (p.change_order_id=revision_co.id AND p.posting_kind='approval' AND p.amount_delta=0)))<>3 THEN
    RAISE EXCEPTION 'CO9 historical posting fingerprint changed; no repair made';
  END IF;
  SELECT * INTO existing_reconciliation
  FROM public.change_order_financial_postings
  WHERE change_order_id=revision_co.id AND job_budget_line_id=budget_line.id
    AND posting_kind='reconciliation';
  IF existing_reconciliation.id IS NOT NULL THEN
    IF posting_count<>4 OR family_net<>expected_amount
      OR existing_reconciliation.amount_delta<>expected_amount
      OR existing_reconciliation.job_id<>job.id THEN
      RAISE EXCEPTION 'Existing CO9 reconciliation does not match the reviewed repair';
    END IF;
    RETURN; -- Proven idempotent: no duplicate posting or audit record.
  END IF;
  IF posting_count<>3 OR family_net<>0 THEN
    RAISE EXCEPTION 'CO9 posting fingerprint changed; no repair made';
  END IF;

  INSERT INTO public.change_order_financial_postings
    (change_order_id,job_id,job_budget_line_id,division,cost_code,amount_delta,posted_by,posting_kind)
  VALUES (revision_co.id,job.id,budget_line.id,'Electrical','16.CO',expected_amount,
    'release:CO-INTEGRATION-20261002-CO9','reconciliation')
  RETURNING * INTO inserted_reconciliation;
  INSERT INTO public.change_logs
    (user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES ('release:CO-INTEGRATION-20261002-CO9','Northgate release reconciliation',
    'change_order_financial_postings',inserted_reconciliation.id::text,'create',
    jsonb_build_object('family_posted_total',0,'approved_revision_value',expected_amount,
      'original_budget',budget_line.budget_amount,'manual_budget_change',budget_line.budget_change_amount),
    to_jsonb(inserted_reconciliation),
    'Owner confirmed NGG-CO-9-R1 remains approved at $1,477.60. Compensates the earlier root void without changing historical postings, Original Budget, or billed Pay Apps.');
  IF (SELECT sum(amount_delta) FROM public.change_order_financial_postings
      WHERE change_order_id IN (root_co.id,revision_co.id))<>expected_amount THEN
    RAISE EXCEPTION 'CO9 financial reconciliation failed; abort entire transaction';
  END IF;
END $repair$;
