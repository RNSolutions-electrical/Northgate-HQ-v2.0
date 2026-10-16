-- Controlled repair template. NOT a migration; never auto-run.
-- Required SESSION settings, supplied by the release owner after fresh review:
-- request.jwt.claims: real authorized actor context
-- northgate.repair_job_id: exact approved job UUID
-- northgate.repair_expected_lines_hash: fresh full-row hash (including archived)
-- northgate.repair_expected_total: active row count
-- northgate.repair_prefix_counts: JSON object of approved numeric prefix counts
-- northgate.repair_reason: meaningful controlled-correction reason
-- Compute the hash with md5(coalesce(string_agg(md5(to_jsonb(l)::text),''
-- ORDER BY l.id),'')) FROM public.job_budget_lines l WHERE l.job_id = :job_id.
-- Uses ordinary enabled triggers, the immediate FK and audited financial RPC.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $repair$
DECLARE
  target_id uuid := nullif(current_setting('northgate.repair_job_id',true),'')::uuid;
  expected_hash text := nullif(current_setting('northgate.repair_expected_lines_hash',true),'');
  expected_total integer := nullif(current_setting('northgate.repair_expected_total',true),'')::integer;
  expected_prefixes jsonb := nullif(current_setting('northgate.repair_prefix_counts',true),'')::jsonb;
  reason text := nullif(btrim(current_setting('northgate.repair_reason',true)),'');
  actor text := nullif(auth.jwt()->>'sub','');
  actor_name text;
  actual_hash text;
  actual_prefixes jsonb;
  mapping record;
  payload jsonb;
  target_job public.jobs%ROWTYPE;
  totals_before jsonb;
  totals_after jsonb;
BEGIN
  IF target_id IS NULL OR expected_hash IS NULL OR expected_total IS NULL
    OR jsonb_typeof(expected_prefixes) IS DISTINCT FROM 'object' OR expected_prefixes='{}'
    OR reason IS NULL OR length(reason)>4000 THEN
    RAISE EXCEPTION 'Explicit reviewed repair parameters are required';
  END IF;
  IF actor IS NULL OR public.current_user_can_edit_job(target_id,'can_approve_budget') IS NOT TRUE THEN
    RAISE EXCEPTION 'Authorized financial repair actor required' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(nullif(display_name,''),nullif(email,''),actor) INTO actor_name
    FROM public.user_permissions WHERE clerk_user_id=actor AND is_active;
  IF actor_name IS NULL THEN RAISE EXCEPTION 'Active repair actor required' USING ERRCODE='42501'; END IF;
  IF current_setting('session_replication_role')<>'origin' OR EXISTS(
    SELECT 1 FROM pg_trigger WHERE tgrelid IN ('public.job_budget_lines'::regclass,'public.job_budget_divisions'::regclass)
      AND NOT tgisinternal AND tgenabled<>'O'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_trigger WHERE tgrelid='public.job_budget_divisions'::regclass
      AND tgname='attach_existing_change_order_line_to_project_division_trigger' AND tgtype=5
      AND tgfoid='public.attach_existing_change_order_line_to_project_division()'::regprocedure
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_constraint WHERE conrelid='public.job_budget_lines'::regclass
      AND conname='job_budget_lines_project_division_id_fkey'
      AND confrelid='public.job_budget_divisions'::regclass AND convalidated AND NOT condeferrable
  ) THEN RAISE EXCEPTION 'Normal triggers and corrected immediate parent FK are required'; END IF;

  SELECT * INTO target_job FROM public.jobs WHERE id=target_id AND archived_at IS NULL FOR UPDATE;
  IF target_job.id IS NULL THEN RAISE EXCEPTION 'Active repair job not found'; END IF;
  PERFORM 1 FROM public.job_budget_lines WHERE job_id=target_id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.job_budget_divisions WHERE job_id=target_id) THEN
    RAISE EXCEPTION 'Project division setup changed; obtain a new reviewed plan';
  END IF;
  SELECT md5(coalesce(string_agg(md5(to_jsonb(l)::text),'' ORDER BY l.id),''))
    INTO actual_hash FROM public.job_budget_lines l WHERE job_id=target_id;
  IF actual_hash IS DISTINCT FROM expected_hash THEN RAISE EXCEPTION 'Repair source changed; refresh review'; END IF;
  IF (SELECT count(*) FROM public.job_budget_lines WHERE job_id=target_id AND archived_at IS NULL)<>expected_total
    OR EXISTS(SELECT 1 FROM public.job_budget_lines WHERE job_id=target_id AND archived_at IS NULL AND project_division_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Expected active unlinked lines changed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.job_budget_lines l WHERE job_id=target_id AND archived_at IS NULL
    AND (public.current_user_can_read_project_financial_line(target_id,l.id) IS NOT TRUE
      OR (l.is_protected_financial AND public.current_user_can_access_job(target_id,'can_view_protected_project_financials') IS NOT TRUE))) THEN
    RAISE EXCEPTION 'Line-level financial access required' USING ERRCODE='42501';
  END IF;
  CREATE TEMP TABLE repair_before ON COMMIT DROP AS
    SELECT l.*,substring(btrim(coalesce(l.cost_code,'')) FROM '^([0-9]+)') AS repair_prefix
    FROM public.job_budget_lines l WHERE job_id=target_id;
  CREATE TEMP TABLE repair_audit_before ON COMMIT DROP AS SELECT id FROM public.change_logs
    WHERE table_name='job_budget_lines' AND record_id IN (SELECT id::text FROM repair_before);
  SELECT jsonb_object_agg(prefix,n) INTO actual_prefixes FROM (
    SELECT repair_prefix AS prefix,count(*) AS n FROM repair_before
      WHERE archived_at IS NULL AND repair_prefix IS NOT NULL GROUP BY repair_prefix
  ) s;
  IF actual_prefixes IS DISTINCT FROM expected_prefixes THEN RAISE EXCEPTION 'Reviewed prefix counts changed'; END IF;
  -- The ordinary RPC trims descriptions/cost codes. Refuse noncanonical source
  -- bytes instead of silently normalizing them during a relationship repair.
  IF EXISTS(SELECT 1 FROM repair_before WHERE archived_at IS NULL AND repair_prefix IS NOT NULL
    AND (description IS NULL OR description='' OR description IS DISTINCT FROM btrim(description)
      OR cost_code IS DISTINCT FROM btrim(cost_code))) THEN
    RAISE EXCEPTION 'Noncanonical description/cost code needs separate exact-byte review';
  END IF;
  CREATE TEMP TABLE repair_divisions(prefix text PRIMARY KEY,name text NOT NULL,id uuid) ON COMMIT DROP;
  FOR mapping IN SELECT key AS prefix FROM jsonb_each(expected_prefixes) ORDER BY key LOOP
    IF mapping.prefix !~ '^[0-9]{2}$' OR
      (SELECT count(*) FROM repair_before WHERE archived_at IS NULL AND cost_code=mapping.prefix||'.CO')<>1 OR
      (SELECT count(DISTINCT division_name) FROM public.financial_line_catalogue
        WHERE is_active AND upper(btrim(division_code))=mapping.prefix)<>1 THEN
      RAISE EXCEPTION 'Each approved prefix needs one canonical CO and one catalogue division name';
    END IF;
    INSERT INTO repair_divisions(prefix,name)
      SELECT mapping.prefix,min(division_name) FROM public.financial_line_catalogue
      WHERE is_active AND upper(btrim(division_code))=mapping.prefix;
  END LOOP;
  -- Snapshot outside-job financial records; any unexpected side effect aborts.
  CREATE TEMP TABLE repair_other_before ON COMMIT DROP AS
    SELECT id,to_jsonb(l) AS data FROM public.job_budget_lines l WHERE job_id<>target_id;

  FOR mapping IN SELECT * FROM repair_divisions ORDER BY prefix LOOP
    INSERT INTO public.job_budget_divisions(job_id,code,name,sort_order)
      VALUES(target_id,mapping.prefix,mapping.name,mapping.prefix::integer)
      RETURNING id INTO mapping.id;
    UPDATE repair_divisions SET id=mapping.id WHERE prefix=mapping.prefix;
  END LOOP;
  -- Explicitly audit the null->instance CO link. The existing attachment
  -- trigger has no per-link audit insert; the ensure trigger separately logs
  -- its temporary label/note sync. No audit entry is deleted or overwritten.
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
    SELECT actor,actor_name,'job_budget_lines',b.id::text,'update',
      to_jsonb(b)-'repair_prefix',to_jsonb(l)||jsonb_build_object('_audit',jsonb_build_object(
        'workflow','controlled.division_link_repair','phase','co_trigger_attachment','reason',reason)),reason
    FROM repair_before b JOIN public.job_budget_lines l USING(id)
    WHERE b.archived_at IS NULL AND b.cost_code=b.repair_prefix||'.CO';

  SELECT jsonb_agg(jsonb_build_object('id',b.id,'expected_updated_at',l.updated_at,
    'project_division_id',d.id,'description',b.description,'cost_code',b.cost_code,'note',b.note)
    ORDER BY b.id) INTO payload
    FROM repair_before b JOIN public.job_budget_lines l USING(id)
    JOIN repair_divisions d ON d.prefix=b.repair_prefix WHERE b.archived_at IS NULL;
  -- Restores original CO descriptions/notes/codes and links the other numbered
  -- lines through the same permission, stale-check, reason and audit adapter.
  PERFORM public.save_job_financial_batch(target_id,payload,reason);

  IF (SELECT count(*) FROM public.job_budget_lines WHERE job_id=target_id)<>(SELECT count(*) FROM repair_before)
    OR EXISTS(SELECT 1 FROM repair_before b FULL JOIN public.job_budget_lines l ON l.id=b.id AND l.job_id=target_id
      WHERE (b.id IS NOT NULL OR l.job_id=target_id) AND
      (b.id IS NULL OR l.id IS NULL OR
       CASE WHEN b.archived_at IS NULL AND b.repair_prefix IS NOT NULL THEN
         (to_jsonb(l)-ARRAY['project_division_id','updated_at']) IS DISTINCT FROM
         (to_jsonb(b)-ARRAY['project_division_id','updated_at','repair_prefix'])
       ELSE to_jsonb(l) IS DISTINCT FROM (to_jsonb(b)-'repair_prefix') END)) THEN
    RAISE EXCEPTION 'Exact line-field preservation check failed';
  END IF;
  IF EXISTS(SELECT 1 FROM repair_before b JOIN public.job_budget_lines l USING(id)
    JOIN repair_divisions d ON d.prefix=b.repair_prefix WHERE b.archived_at IS NULL AND l.project_division_id IS DISTINCT FROM d.id)
    OR (SELECT count(*) FROM public.job_budget_divisions WHERE job_id=target_id)<>(SELECT count(*) FROM repair_divisions)
    OR EXISTS(SELECT 1 FROM repair_divisions d WHERE
      (SELECT count(*) FROM public.job_budget_lines l WHERE l.job_id=target_id AND l.archived_at IS NULL AND l.cost_code=d.prefix||'.CO')<>1) THEN
    RAISE EXCEPTION 'Exact division/CO-link verification failed';
  END IF;
  IF EXISTS(SELECT 1 FROM repair_other_before b FULL JOIN
    (SELECT id,to_jsonb(l) AS data FROM public.job_budget_lines l WHERE job_id<>target_id) a USING(id)
    WHERE b.data IS DISTINCT FROM a.data) THEN RAISE EXCEPTION 'Unrelated financial row changed'; END IF;
  IF (SELECT count(DISTINCT c.record_id) FROM public.change_logs c
    JOIN repair_before b ON b.id::text=c.record_id
    WHERE c.table_name='job_budget_lines' AND NOT EXISTS(SELECT 1 FROM repair_audit_before old WHERE old.id=c.id)
      AND c.before_data->'project_division_id'='null'::jsonb
      AND c.after_data->>'project_division_id' IS NOT NULL)<>jsonb_array_length(payload) THEN
    RAISE EXCEPTION 'Current-transaction before/after link audit coverage incomplete';
  END IF;
  SELECT jsonb_build_object('original',sum(budget_amount),'changes',sum(budget_change_amount),
    'actual',sum(actual_cost_amount),'committed',sum(committed_cost_amount),
    'monthly_forecast',sum(forecast_to_complete_amount),'completion_forecast',sum(forecast_final_amount),
    'sov',sum(schedule_of_values_amount),'override',sum(current_budget_override_amount))
    INTO totals_before FROM repair_before;
  SELECT jsonb_build_object('original',sum(budget_amount),'changes',sum(budget_change_amount),
    'actual',sum(actual_cost_amount),'committed',sum(committed_cost_amount),
    'monthly_forecast',sum(forecast_to_complete_amount),'completion_forecast',sum(forecast_final_amount),
    'sov',sum(schedule_of_values_amount),'override',sum(current_budget_override_amount))
    INTO totals_after FROM public.job_budget_lines WHERE job_id=target_id;
  IF totals_after IS DISTINCT FROM totals_before THEN RAISE EXCEPTION 'Financial column totals changed'; END IF;
  CREATE TEMP TABLE repair_receipt ON COMMIT DROP AS SELECT jsonb_build_object(
    'job_id',target_id,'actor',actor,'reason',reason,'divisions_created',(SELECT count(*) FROM repair_divisions),
    'numbered_lines_linked',jsonb_array_length(payload),'active_lines',expected_total,
    'co_links_explicitly_audited',(SELECT count(*) FROM repair_divisions),
    'original_fields_preserved',true,'unmapped_lines_untouched',true,'outside_job_rows_unchanged',true,
    'totals_before',totals_before,'totals_after',totals_after) AS result;
END;
$repair$;
SELECT result FROM repair_receipt;
COMMIT;
