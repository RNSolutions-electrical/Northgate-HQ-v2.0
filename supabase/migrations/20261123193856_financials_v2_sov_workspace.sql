-- Separate SOV planning and progress from the existing billing ledger.
ALTER TABLE public.job_financial_v2_records DROP CONSTRAINT job_financial_v2_records_kind_check;
ALTER TABLE public.job_financial_v2_records ADD CONSTRAINT job_financial_v2_records_kind_check
  CHECK (kind IN ('contract','baseline','sales','labor','forecast','billing_plan','receipt','sov_workspace'));

CREATE FUNCTION public.save_job_sov_workspace_v2(
  p_job_id uuid, p_expected_revision integer, p_payload jsonb, p_publish boolean DEFAULT false
) RETURNS public.job_financial_v2_records
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  target public.jobs%rowtype;
  old_record public.job_financial_v2_records;
  new_record public.job_financial_v2_records;
  g jsonb; l jsonb; line_value numeric; division_target numeric; scheduled numeric;
  total numeric := 0; signed_amount numeric; division_ref uuid; link_ref uuid;
  group_list jsonb := '[]'; line_list jsonb; shape jsonb := '[]'; expected_shape jsonb;
  codes text[] := ARRAY[]::text[]; group_codes text[] := ARRAY[]::text[];
  row_ids uuid[] := ARRAY[]::uuid[]; billing_ids uuid[] := ARRAY[]::uuid[];
  line_count integer := 0; is_published boolean;
BEGIN
  IF actor IS NULL OR public.current_user_can_access_job(p_job_id,'can_view_project_financials') IS NOT TRUE
    OR public.current_user_can_access_job(p_job_id,'can_view_protected_project_financials') IS NOT TRUE
    OR public.current_user_can_edit_job(p_job_id,'can_approve_budget') IS NOT TRUE THEN
    RAISE EXCEPTION 'SOV edit permission is required.' USING ERRCODE='42501';
  END IF;
  IF p_publish IS TRUE THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_job_id::text));
    PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::text || ':contract:job',0));
  END IF;
  SELECT * INTO target FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Active job not found.'; END IF;
  SELECT * INTO old_record FROM public.job_financial_v2_records
    WHERE job_id=p_job_id AND kind='sov_workspace' AND record_key='job' ORDER BY revision DESC LIMIT 1;
  IF coalesce(old_record.revision,0) IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'This SOV changed. Refresh before saving.' USING ERRCODE='40001';
  END IF;
  IF jsonb_typeof(p_payload->'groups') IS DISTINCT FROM 'array' OR pg_column_size(p_payload)>262144
    OR jsonb_array_length(p_payload->'groups') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid divisions.'; END IF;
  is_published := coalesce((old_record.payload->>'published')::boolean,false);
  IF p_publish IS TRUE THEN
    IF old_record.id IS NULL OR is_published OR old_record.payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'Save and review the latest draft before using it for billing.';
    END IF;
    IF EXISTS(SELECT 1 FROM public.job_revenue_lines WHERE job_id=p_job_id)
      OR EXISTS(SELECT 1 FROM public.job_pay_applications WHERE job_id=p_job_id) THEN
      RAISE EXCEPTION 'This job already has a schedule or billing history. No records were replaced.';
    END IF;
  END IF;
  FOR g IN SELECT value FROM jsonb_array_elements(p_payload->'groups') LOOP
    IF coalesce(g->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR length(trim(coalesce(g->>'code',''))) NOT BETWEEN 1 AND 24
      OR length(trim(coalesce(g->>'name',''))) NOT BETWEEN 1 AND 160
      OR coalesce(g->>'target','') !~ '^\d{1,10}(\.\d{1,2})?$'
      OR jsonb_typeof(g->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid division data.'; END IF;
    IF upper(trim(g->>'code'))=ANY(group_codes) OR (g->>'id')::uuid=ANY(row_ids) THEN RAISE EXCEPTION 'Duplicate division.'; END IF;
    group_codes:=array_append(group_codes,upper(trim(g->>'code')));
    row_ids:=array_append(row_ids,(g->>'id')::uuid);
    division_target:=(g->>'target')::numeric;
    IF division_target<=0 OR division_target>9999999999.99 THEN RAISE EXCEPTION 'Enter a positive division total.'; END IF;
    division_ref:=nullif(g->>'divisionId','')::uuid;
    IF division_ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.job_budget_divisions
      WHERE id=division_ref AND job_id=p_job_id AND (is_published OR archived_at IS NULL)) THEN RAISE EXCEPTION 'Division is not available for this job.'; END IF;
    scheduled:=0;line_list:='[]';
    FOR l IN SELECT value FROM jsonb_array_elements(g->'lines') LOOP
      line_count:=line_count+1;
      IF line_count>300 OR coalesce(l->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR length(trim(coalesce(l->>'code',''))) NOT BETWEEN 1 AND 40
        OR length(trim(coalesce(l->>'description',''))) NOT BETWEEN 1 AND 160
        OR coalesce(l->>'basis','') NOT IN ('amount','percent')
        OR coalesce(l->>'value','') !~ '^\d{1,10}(\.\d{1,2})?$'
        OR coalesce(l->>'complete','') !~ '^\d{1,3}(\.\d{1,2})?$'
        THEN RAISE EXCEPTION 'Invalid SOV line.'; END IF;
      IF upper(trim(l->>'code'))=ANY(codes) OR (l->>'id')::uuid=ANY(row_ids) THEN RAISE EXCEPTION 'Duplicate SOV line.'; END IF;
      codes:=array_append(codes,upper(trim(l->>'code')));
      row_ids:=array_append(row_ids,(l->>'id')::uuid);
      line_value:=(l->>'value')::numeric;
      IF (l->>'complete')::numeric>100 OR (l->>'basis'='percent' AND line_value>100) OR line_value>9999999999.99 THEN RAISE EXCEPTION 'Amount or percentage exceeds its permitted range.'; END IF;
      IF l->>'basis'='percent' THEN line_value:=round(division_target*line_value/100,2); END IF;
      scheduled:=scheduled+line_value;
      link_ref:=nullif(l->>'link','')::uuid;
      IF link_ref IS NOT NULL THEN
        IF link_ref=ANY(billing_ids) OR NOT EXISTS(SELECT 1 FROM public.job_revenue_lines
          WHERE id=link_ref AND job_id=p_job_id AND (is_published OR archived_at IS NULL))
          THEN RAISE EXCEPTION 'Billing lines must be linked only once and belong to this job.'; END IF;
        billing_ids:=array_append(billing_ids,link_ref);
      END IF;
      IF p_publish IS TRUE THEN
        IF link_ref IS NOT NULL OR line_value<=0 THEN RAISE EXCEPTION 'Published lines must be positive and unlinked.'; END IF;
        INSERT INTO public.job_revenue_lines(job_id,division,sov_line,description,scheduled_value_amount,
          approved_change_amount,billed_to_date_amount,created_by,is_protected_financial,source_project_division_id)
          VALUES(p_job_id,target.division,trim(l->>'code'),trim(l->>'description'),line_value,0,0,actor,false,division_ref)
          RETURNING id INTO link_ref;
      END IF;
      line_list:=line_list||jsonb_build_object('id',l->>'id','code',trim(l->>'code'),'description',trim(l->>'description'),
         'basis',l->>'basis','value',l->>'value','complete',l->>'complete','link',link_ref);
    END LOOP;
    IF p_publish IS TRUE AND scheduled IS DISTINCT FROM division_target THEN RAISE EXCEPTION 'Fully allocate each division before using the schedule for billing.'; END IF;
    total:=total+division_target;
    group_list:=group_list||jsonb_build_object('id',g->>'id','code',trim(g->>'code'),'name',trim(g->>'name'),
      'target',g->>'target','divisionId',division_ref,'lines',line_list);
  END LOOP;
  IF p_publish IS TRUE THEN
    SELECT (payload->>'amount')::numeric INTO signed_amount FROM public.job_financial_v2_records
      WHERE job_id=p_job_id AND kind='contract' AND record_key='job' ORDER BY revision DESC LIMIT 1;
    IF signed_amount IS DISTINCT FROM total THEN RAISE EXCEPTION 'Reconcile division totals to the verified original contract before publishing.'; END IF;
    INSERT INTO public.change_logs(user_id,table_name,record_id,action,after_data,note)
      VALUES(actor,'job_revenue_lines',p_job_id::text,'create',
        jsonb_build_object('contract_amount',total,'lines_created',line_count),'Published the first SOV from the rebuilt workspace.');
  END IF;
  IF is_published THEN
    -- Only work progress is mutable after activation. Protect the issued ledger and the stored crosswalk.
    WITH x AS (SELECT value, ord FROM jsonb_array_elements(group_list) WITH ORDINALITY a(value,ord)),
      y AS (SELECT value, ord FROM jsonb_array_elements(old_record.payload->'groups') WITH ORDINALITY a(value,ord))
    SELECT
      (SELECT jsonb_agg(jsonb_set(value,'{lines}',coalesce((SELECT jsonb_agg(lv-'complete' ORDER BY lo)
        FROM jsonb_array_elements(value->'lines') WITH ORDINALITY b(lv,lo)),'[]'::jsonb)) ORDER BY ord) FROM x),
      (SELECT jsonb_agg(jsonb_set(value,'{lines}',coalesce((SELECT jsonb_agg(lv-'complete' ORDER BY lo)
        FROM jsonb_array_elements(value->'lines') WITH ORDINALITY b(lv,lo)),'[]'::jsonb)) ORDER BY ord) FROM y)
      INTO shape,expected_shape;
    IF shape IS DISTINCT FROM expected_shape THEN RAISE EXCEPTION 'Active schedules only permit work progress updates.'; END IF;
  END IF;
  INSERT INTO public.job_financial_v2_records(job_id,kind,record_key,revision,payload,created_by)
    VALUES(p_job_id,'sov_workspace','job',coalesce(old_record.revision,0)+1,
      jsonb_build_object('groups',group_list,'published',is_published OR p_publish IS TRUE),actor) RETURNING * INTO new_record;
  RETURN new_record;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_job_sov_workspace_v2(uuid,integer,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_job_sov_workspace_v2(uuid,integer,jsonb,boolean) TO authenticated;
INSERT INTO hq_tool_private.resource_map(resource_kind,resource_name,module_key)
VALUES ('rpc','save_job_sov_workspace_v2','jobs') ON CONFLICT DO NOTHING;
