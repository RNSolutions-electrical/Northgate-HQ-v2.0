ALTER TABLE public.job_budget_lines
  ADD COLUMN current_budget_override_amount numeric;
ALTER TABLE public.job_budget_lines
  ADD CONSTRAINT job_budget_current_override_valid CHECK (
    current_budget_override_amount IS NULL OR
    (current_budget_override_amount >= 0 AND current_budget_override_amount < 'Infinity'::numeric)
  );
COMMENT ON COLUMN public.job_budget_lines.current_budget_override_amount IS
  'NULL calculates original plus approved adjustments and CO postings. Non-null is an audited, fixed Current Budget override, including zero.';

CREATE OR REPLACE FUNCTION public.guard_financial_budget_changes()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.budget_amount IS DISTINCT FROM OLD.budget_amount
    OR NEW.cost_code IS DISTINCT FROM OLD.cost_code
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.is_protected_financial IS DISTINCT FROM OLD.is_protected_financial)
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
CREATE TRIGGER guard_financial_budget_changes
BEFORE INSERT OR UPDATE ON public.job_budget_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_financial_budget_changes();

CREATE OR REPLACE FUNCTION public.save_job_financial_batch(p_job_id uuid, p_lines jsonb, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor_id text := NULLIF(auth.jwt()->>'sub', '');
  actor_name text;
  target_job public.jobs%ROWTYPE;
  prior public.job_budget_lines%ROWTYPE;
  draft public.job_budget_lines%ROWTYPE;
  saved public.job_budget_lines%ROWTYPE;
  entry jsonb;
  patch jsonb;
  result jsonb := '[]'::jsonb;
  batch_reason text := NULLIF(BTRIM(p_reason, E' \t\n\r'), '');
  line_reason text;
  combined_reason text;
  previous_reason text := current_setting('northgate.financial_reason', true);
  previous_workflow text := current_setting('northgate.financial_workflow', true);
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '28000'; END IF;
  IF public.current_user_can_edit_job(p_job_id, 'can_approve_budget') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial edit permission is required for this job' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Financial lines must be an array'; END IF;
  IF jsonb_array_length(p_lines) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Submit between 1 and 500 lines'; END IF;
  IF octet_length(p_lines::text) > 2097152 THEN RAISE EXCEPTION 'Financial batch exceeds 2 MB'; END IF;
  IF length(batch_reason) > 4000 THEN RAISE EXCEPTION 'Batch reason exceeds 4000 characters'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) e WHERE NULLIF(e->>'id','') IS NOT NULL
    GROUP BY e->>'id' HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate financial line in batch'; END IF;

  SELECT * INTO target_job FROM public.jobs WHERE id = p_job_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active job not found'; END IF;
  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor_id) INTO actor_name
    FROM public.user_permissions WHERE clerk_user_id = actor_id AND is_active;
  IF actor_name IS NULL THEN RAISE EXCEPTION 'Active user required' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('northgate.financial_workflow', 'financial.save', true);

  FOR entry IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid financial line'; END IF;
    patch := entry - ARRAY['id','expected_updated_at','reason','source'];
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(patch) k WHERE k NOT IN (
      'project_division_id','category','is_protected_financial','cost_code','description',
      'budget_amount','budget_change_amount','actual_cost_amount','committed_cost_amount',
      'forecast_to_complete_amount','forecast_final_amount','schedule_of_values_amount',
      'current_budget_override_amount','note')) THEN RAISE EXCEPTION 'Unsupported financial field'; END IF;
    prior := NULL;
    IF NULLIF(entry->>'id','') IS NOT NULL THEN
      SELECT * INTO prior FROM public.job_budget_lines
        WHERE id = (entry->>'id')::uuid AND job_id = p_job_id AND archived_at IS NULL FOR UPDATE;
      IF prior.id IS NULL THEN RAISE EXCEPTION 'Active financial line not found'; END IF;
      IF public.current_user_can_read_project_financial_line(p_job_id, prior.id) IS NOT TRUE THEN
        RAISE EXCEPTION 'This financial line is outside your access' USING ERRCODE = '42501';
      END IF;
      IF entry ? 'expected_updated_at' AND prior.updated_at IS DISTINCT FROM (entry->>'expected_updated_at')::timestamptz THEN
        RAISE EXCEPTION 'This financial line changed. Reload before saving.' USING ERRCODE = '40001';
      END IF;
      draft := jsonb_populate_record(prior, patch);
    ELSE
      draft := jsonb_populate_record(NULL::public.job_budget_lines,
        jsonb_build_object('category','other','is_protected_financial',false,'budget_amount',0,
          'budget_change_amount',0,'actual_cost_amount',0,'committed_cost_amount',0,
          'forecast_to_complete_amount',0,'forecast_final_amount',COALESCE((patch->>'budget_amount')::numeric,0),
          'schedule_of_values_amount',0) || patch);
    END IF;
    draft.description := NULLIF(BTRIM(draft.description), '');
    draft.cost_code := NULLIF(BTRIM(draft.cost_code), '');
    IF draft.description IS NULL THEN RAISE EXCEPTION 'Description is required'; END IF;
    IF draft.project_division_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.job_budget_divisions WHERE id=draft.project_division_id AND job_id=p_job_id AND archived_at IS NULL
    ) THEN RAISE EXCEPTION 'Project division does not belong to this active job'; END IF;
    IF draft.is_protected_financial AND public.current_user_can_access_job(p_job_id,'can_view_protected_project_financials') IS NOT TRUE THEN
      RAISE EXCEPTION 'Protected financial access is required' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each_text(to_jsonb(draft)) n WHERE n.key IN (
      'budget_amount','budget_change_amount','actual_cost_amount','committed_cost_amount',
      'forecast_to_complete_amount','forecast_final_amount','schedule_of_values_amount','current_budget_override_amount')
      AND n.value IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Amounts must be finite'; END IF;

    line_reason := NULLIF(BTRIM(entry->>'reason', E' \t\n\r'), '');
    IF length(line_reason) > 4000 THEN RAISE EXCEPTION 'Line reason exceeds 4000 characters'; END IF;
    combined_reason := NULLIF(concat_ws(E'\n',
      CASE WHEN batch_reason IS NOT NULL THEN 'Batch: ' || batch_reason END,
      CASE WHEN line_reason IS NOT NULL THEN 'Line: ' || line_reason END), '');
    IF prior.id IS NOT NULL AND draft.project_division_id IS DISTINCT FROM prior.project_division_id AND combined_reason IS NULL THEN
      RAISE EXCEPTION 'A reason is required to move a financial line to another division';
    END IF;
    PERFORM set_config('northgate.financial_reason', COALESCE(combined_reason,''), true);
    IF prior.id IS NULL THEN
      INSERT INTO public.job_budget_lines(job_id,division,project_division_id,category,is_protected_financial,
        cost_code,description,budget_amount,budget_change_amount,actual_cost_amount,committed_cost_amount,
        forecast_to_complete_amount,forecast_final_amount,schedule_of_values_amount,current_budget_override_amount,note,created_by)
      VALUES (p_job_id,target_job.division,draft.project_division_id,draft.category,draft.is_protected_financial,
        draft.cost_code,draft.description,draft.budget_amount,draft.budget_change_amount,draft.actual_cost_amount,
        draft.committed_cost_amount,draft.forecast_to_complete_amount,draft.forecast_final_amount,
        draft.schedule_of_values_amount,draft.current_budget_override_amount,draft.note,actor_id)
      RETURNING * INTO saved;
    ELSE
      UPDATE public.job_budget_lines SET project_division_id=draft.project_division_id, category=draft.category,
        is_protected_financial=draft.is_protected_financial,cost_code=draft.cost_code,description=draft.description,
        budget_amount=draft.budget_amount,budget_change_amount=draft.budget_change_amount,actual_cost_amount=draft.actual_cost_amount,
        committed_cost_amount=draft.committed_cost_amount,forecast_to_complete_amount=draft.forecast_to_complete_amount,
        forecast_final_amount=draft.forecast_final_amount,schedule_of_values_amount=draft.schedule_of_values_amount,
        current_budget_override_amount=draft.current_budget_override_amount,note=draft.note
      WHERE id=prior.id RETURNING * INTO saved;
    END IF;
    INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
      VALUES(actor_id,actor_name,'job_budget_lines',saved.id::text,
        CASE WHEN prior.id IS NULL THEN 'create' ELSE 'update' END,
        CASE WHEN prior.id IS NULL THEN NULL ELSE to_jsonb(prior) END,
        to_jsonb(saved) || jsonb_build_object('_audit', jsonb_build_object('workflow','financial.save',
          'batch_reason',batch_reason,'line_reason',line_reason,'source',entry->'source')),combined_reason);
    result := result || jsonb_build_array(to_jsonb(saved));
  END LOOP;
  PERFORM set_config('northgate.financial_reason', COALESCE(previous_reason,''), true);
  PERFORM set_config('northgate.financial_workflow', COALESCE(previous_workflow,''), true);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_job_financial_batch(uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_job_financial_batch(uuid,jsonb,text) TO authenticated;
-- Preserve the existing RPC signature for older clients without overwriting overrides.
CREATE OR REPLACE FUNCTION public.save_job_financial_line(p_job_id uuid, p_line_id uuid, p_project_division_id uuid, p_category text, p_is_protected_financial boolean, p_cost_code text, p_description text, p_budget_amount numeric, p_budget_change_amount numeric, p_actual_cost_amount numeric, p_committed_cost_amount numeric, p_forecast_to_complete_amount numeric, p_forecast_final_amount numeric, p_schedule_of_values_amount numeric, p_note text, p_reason text)
 RETURNS job_budget_lines
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE saved public.job_budget_lines; payload jsonb;
BEGIN
  payload := jsonb_build_object('id',p_line_id,'project_division_id',p_project_division_id,
    'category',COALESCE(NULLIF(BTRIM(p_category),''),'other'),'is_protected_financial',COALESCE(p_is_protected_financial,false),
    'cost_code',p_cost_code,'description',p_description,'budget_amount',COALESCE(p_budget_amount,0),
    'budget_change_amount',COALESCE(p_budget_change_amount,0),'actual_cost_amount',COALESCE(p_actual_cost_amount,0),
    'committed_cost_amount',COALESCE(p_committed_cost_amount,0),'forecast_to_complete_amount',COALESCE(p_forecast_to_complete_amount,0),
    'forecast_final_amount',COALESCE(p_forecast_final_amount,p_budget_amount,0),'schedule_of_values_amount',COALESCE(p_schedule_of_values_amount,0),'note',p_note);
  SELECT * INTO saved FROM jsonb_populate_record(NULL::public.job_budget_lines,
    public.save_job_financial_batch(p_job_id,jsonb_build_array(payload),p_reason)->0);
  RETURN saved;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_financial_catalogue_to_job(p_job_id uuid, p_catalogue_ids uuid[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE actor_id TEXT := auth.jwt() ->> 'sub'; actor_name TEXT; previous_reason TEXT := current_setting('northgate.financial_reason', true); target_job public.jobs%ROWTYPE; catalog public.financial_line_catalogue%ROWTYPE; project_division public.job_budget_divisions%ROWTYPE; existing_line public.job_budget_lines%ROWTYPE; added_count INTEGER := 0; aligned_count INTEGER := 0; division_count INTEGER := 0; BEGIN IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE='28000'; END IF; IF p_job_id IS NULL OR COALESCE(array_length(p_catalogue_ids,1),0)=0 THEN RAISE EXCEPTION 'job and at least one catalogue line are required'; END IF; IF NOT public.current_user_can_edit_job(p_job_id,'can_approve_budget') THEN RAISE EXCEPTION 'can_approve_budget is required' USING ERRCODE='42501'; END IF; SELECT * INTO target_job FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL FOR UPDATE; IF target_job.id IS NULL THEN RAISE EXCEPTION 'active job not found'; END IF; SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor_id) INTO actor_name FROM public.user_permissions WHERE clerk_user_id=actor_id LIMIT 1; PERFORM set_config('northgate.financial_reason', COALESCE(BTRIM(p_reason),''), true); FOR catalog IN SELECT * FROM public.financial_line_catalogue WHERE id=ANY(p_catalogue_ids) AND is_active ORDER BY division_code,sort_order,cost_code LOOP SELECT * INTO project_division FROM public.job_budget_divisions WHERE job_id=p_job_id AND archived_at IS NULL AND UPPER(BTRIM(COALESCE(code,'')))=UPPER(BTRIM(catalog.division_code)) LIMIT 1 FOR UPDATE; IF project_division.id IS NULL THEN INSERT INTO public.job_budget_divisions(job_id,code,name,sort_order) VALUES(p_job_id,catalog.division_code,catalog.division_name,COALESCE(NULLIF(regexp_replace(catalog.division_code,'\D','','g'),'')::INTEGER,999)) RETURNING * INTO project_division; division_count:=division_count+1; END IF; SELECT * INTO existing_line FROM public.job_budget_lines WHERE job_id=p_job_id AND archived_at IS NULL AND UPPER(BTRIM(COALESCE(cost_code,'')))=UPPER(BTRIM(catalog.cost_code)) LIMIT 1 FOR UPDATE; IF existing_line.id IS NULL THEN INSERT INTO public.job_budget_lines(job_id,division,project_division_id,category,is_protected_financial,cost_code,description,budget_amount,budget_change_amount,actual_cost_amount,committed_cost_amount,forecast_to_complete_amount,forecast_final_amount,schedule_of_values_amount,note,sort_order,created_by) VALUES(p_job_id,target_job.division,project_division.id,catalog.category,catalog.is_protected_financial,catalog.cost_code,catalog.description,0,0,0,0,0,0,0,NULLIF(BTRIM(catalog.notes),''),catalog.sort_order,actor_id); added_count:=added_count+1; ELSIF existing_line.project_division_id IS DISTINCT FROM project_division.id OR existing_line.description IS DISTINCT FROM catalog.description OR existing_line.category IS DISTINCT FROM catalog.category OR existing_line.is_protected_financial IS DISTINCT FROM catalog.is_protected_financial THEN UPDATE public.job_budget_lines SET project_division_id=project_division.id,description=catalog.description,category=catalog.category,is_protected_financial=catalog.is_protected_financial,note=COALESCE(NULLIF(BTRIM(catalog.notes),''),note),updated_at=NOW() WHERE id=existing_line.id; aligned_count:=aligned_count+1; END IF; END LOOP; INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note) VALUES(actor_id,actor_name,'financial_line_catalogue',p_job_id::TEXT,'update',jsonb_build_object('catalogue_ids',p_catalogue_ids,'divisions_added',division_count,'lines_added',added_count,'lines_aligned',aligned_count),BTRIM(p_reason)); PERFORM set_config('northgate.financial_reason', COALESCE(previous_reason,''), true); RETURN jsonb_build_object('divisions_added',division_count,'lines_added',added_count,'lines_aligned',aligned_count); END; $function$
;

-- Self-service contact edits are routine; role/division are not exposed here.
CREATE OR REPLACE FUNCTION public.update_current_employee_profile(p_display_name text, p_phone text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  actor public.user_permissions%ROWTYPE;
  previous_profile public.employee_profiles%ROWTYPE;
  saved_profile public.employee_profiles%ROWTYPE;
  normalized_name TEXT := NULLIF(BTRIM(COALESCE(p_display_name, '')), '');
  normalized_phone TEXT := NULLIF(BTRIM(COALESCE(p_phone, '')), '');
  normalized_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
BEGIN
  IF actor_id IS NULL OR length(BTRIM(actor_id)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '42501';
  END IF;
  IF normalized_name IS NULL OR length(normalized_name) > 120 THEN
    RAISE EXCEPTION 'display name is required and must be 120 characters or fewer' USING ERRCODE = '22023';
  END IF;
  IF normalized_phone IS NOT NULL AND length(normalized_phone) > 60 THEN
    RAISE EXCEPTION 'phone must be 60 characters or fewer' USING ERRCODE = '22023';
  END IF;
  IF length(normalized_reason) > 500 THEN
    RAISE EXCEPTION 'Optional profile note must be 500 characters or fewer' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO actor
  FROM public.user_permissions up
  WHERE up.clerk_user_id = actor_id
    AND up.is_active = TRUE
  FOR UPDATE;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO previous_profile
  FROM public.employee_profiles ep
  WHERE ep.clerk_user_id = actor_id
    AND ep.archived_at IS NULL
  FOR UPDATE;

  UPDATE public.user_permissions
  SET display_name = normalized_name,
      updated_at = NOW()
  WHERE id = actor.id;

  IF previous_profile.id IS NULL THEN
    INSERT INTO public.employee_profiles (
      email, display_name, role, division, phone, clerk_user_id, linked_at, created_by
    ) VALUES (
      actor.email, normalized_name, actor.role, actor.division, normalized_phone, actor_id, NOW(), actor_id
    ) RETURNING * INTO saved_profile;
  ELSE
    UPDATE public.employee_profiles
    SET display_name = normalized_name,
        phone = normalized_phone,
        updated_at = NOW()
    WHERE id = previous_profile.id
    RETURNING * INTO saved_profile;
  END IF;

  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note
  ) VALUES (
    actor_id,
    COALESCE(NULLIF(normalized_name, ''), actor_id),
    'employee_profiles',
    saved_profile.id::TEXT,
    'update',
    CASE WHEN previous_profile.id IS NULL THEN NULL ELSE jsonb_build_object('display_name', previous_profile.display_name, 'phone', previous_profile.phone) END,
    jsonb_build_object('display_name', saved_profile.display_name, 'phone', saved_profile.phone),
    normalized_reason
  );
END;
$function$
;


-- Division label synchronization is a narrow, audited system workflow.
CREATE OR REPLACE FUNCTION public.ensure_project_division_change_order_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  target_job public.jobs%ROWTYPE;
  existing_line public.job_budget_lines%ROWTYPE;
  saved_line public.job_budget_lines%ROWTYPE;
  normalized_code TEXT := NULLIF(BTRIM(COALESCE(NEW.code, '')), '');
  actor_id TEXT := COALESCE(NULLIF(auth.jwt() ->> 'sub', ''), 'system:project-division-co-line');
  actor_name TEXT := 'System project-division sync';
  previous_reason TEXT := current_setting('northgate.financial_reason', true);
BEGIN
  IF NEW.archived_at IS NOT NULL OR normalized_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO target_job
  FROM public.jobs AS j
  WHERE j.id = NEW.job_id
    AND j.archived_at IS NULL;

  IF target_job.id IS NULL THEN
    RAISE EXCEPTION 'active job is required for project division Change Order line'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO existing_line
  FROM public.job_budget_lines AS line
  WHERE line.project_division_id = NEW.id
    AND line.archived_at IS NULL
    AND UPPER(BTRIM(COALESCE(line.cost_code, ''))) LIKE '%.CO'
  ORDER BY line.created_at, line.id
  LIMIT 1
  FOR UPDATE;

  IF existing_line.id IS NULL THEN
    INSERT INTO public.job_budget_lines (
      job_id,
      division,
      project_division_id,
      category,
      cost_code,
      description,
      budget_amount,
      budget_change_amount,
      actual_cost_amount,
      committed_cost_amount,
      forecast_to_complete_amount,
      forecast_final_amount,
      schedule_of_values_amount,
      note,
      created_by
    ) VALUES (
      NEW.job_id,
      target_job.division,
      NEW.id,
      'other',
      normalized_code || '.CO',
      NEW.name || ' Change Orders',
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      'System-managed change-order allocation line.',
      actor_id
    )
    RETURNING * INTO saved_line;
    PERFORM set_config('northgate.financial_reason', COALESCE(previous_reason,''), true);

    INSERT INTO public.change_logs (
      user_id, user_name, table_name, record_id, action, before_data, after_data, note
    ) VALUES (
      actor_id,
      actor_name,
      'job_budget_lines',
      saved_line.id::TEXT,
      'create',
      NULL,
      TO_JSONB(saved_line),
      'Automatically created the project division Change Order allocation line.'
    );
  ELSIF existing_line.cost_code IS DISTINCT FROM normalized_code || '.CO'
    OR existing_line.description IS DISTINCT FROM NEW.name || ' Change Orders' THEN
    PERFORM set_config('northgate.financial_reason', 'System project-division label sync', true);
    UPDATE public.job_budget_lines
    SET cost_code = normalized_code || '.CO',
        description = NEW.name || ' Change Orders',
        note = 'System-managed change-order allocation line.',
        updated_at = NOW()
    WHERE id = existing_line.id
    RETURNING * INTO saved_line;
    PERFORM set_config('northgate.financial_reason', COALESCE(previous_reason,''), true);

    INSERT INTO public.change_logs (
      user_id, user_name, table_name, record_id, action, before_data, after_data, note
    ) VALUES (
      actor_id,
      actor_name,
      'job_budget_lines',
      saved_line.id::TEXT,
      'update',
      TO_JSONB(existing_line),
      TO_JSONB(saved_line),
      'Synchronized the project division Change Order allocation line.'
    );
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.save_job_change_order_draft(p_change_order_id uuid, p_job_id uuid, p_division text, p_co_number text, p_title text, p_description text, p_change_order_date date, p_internal_notes text, p_lines jsonb, p_reason text)
 RETURNS change_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  actor_id TEXT := auth.jwt()->>'sub'; actor_name TEXT; target public.change_orders%ROWTYPE;
  saved public.change_orders%ROWTYPE; line JSONB; budget_line public.job_budget_lines%ROWTYPE;
  normalized_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason,'')),''); total NUMERIC := 0; before_lines JSONB := '[]'::JSONB;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE='28000'; END IF;
  IF p_job_id IS NULL OR NULLIF(BTRIM(p_co_number),'') IS NULL OR NULLIF(BTRIM(p_title),'') IS NULL THEN RAISE EXCEPTION 'project, number, and title are required'; END IF;
  IF jsonb_typeof(COALESCE(p_lines,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'lines must be an array'; END IF;
  actor_name := public.change_order_actor();
  IF p_change_order_id IS NULL THEN
    IF NOT public.current_user_can_edit_division(p_division,'can_create_change_orders') THEN RAISE EXCEPTION 'can_create_change_orders is required' USING ERRCODE='42501'; END IF;
    INSERT INTO public.change_orders(job_id,division,co_number,title,description,change_order_date,internal_notes,status,price_amount,cost_amount,created_by,updated_by)
    VALUES(p_job_id,p_division,BTRIM(p_co_number),BTRIM(p_title),NULLIF(BTRIM(COALESCE(p_description,'')),''),COALESCE(p_change_order_date,CURRENT_DATE),NULLIF(BTRIM(COALESCE(p_internal_notes,'')),''),'draft',0,0,actor_id,actor_id)
    RETURNING * INTO saved;
  ELSE
    SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;
    IF target.id IS NULL OR target.job_id<>p_job_id OR target.division<>p_division THEN RAISE EXCEPTION 'change order not found'; END IF;
    IF target.status<>'draft' THEN RAISE EXCEPTION 'only draft change orders may be edited'; END IF;
    IF NOT public.current_user_can_edit_division(p_division,'can_create_change_orders') AND NOT (target.revision_of_id IS NOT NULL AND public.current_user_can_edit_division(p_division,'can_revise_change_orders')) THEN RAISE EXCEPTION 'can_create_change_orders or revision edit authority is required' USING ERRCODE='42501'; END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(col) ORDER BY col.sort_order,col.id),'[]'::JSONB) INTO before_lines FROM public.change_order_lines col WHERE col.change_order_id=target.id;
    UPDATE public.change_orders SET co_number=BTRIM(p_co_number),title=BTRIM(p_title),description=NULLIF(BTRIM(COALESCE(p_description,'')),''),change_order_date=COALESCE(p_change_order_date,CURRENT_DATE),internal_notes=NULLIF(BTRIM(COALESCE(p_internal_notes,'')),''),updated_by=actor_id,updated_at=NOW() WHERE id=target.id RETURNING * INTO saved;
    DELETE FROM public.change_order_lines WHERE change_order_id=target.id;
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines,'[]'::jsonb)) LOOP
    SELECT * INTO budget_line FROM public.job_budget_lines WHERE id=(line->>'job_budget_line_id')::UUID AND job_id=p_job_id AND archived_at IS NULL;
    IF budget_line.id IS NULL THEN RAISE EXCEPTION 'each line must reference an active project financial line'; END IF;
    IF NULLIF(BTRIM(line->>'description'),'') IS NULL THEN RAISE EXCEPTION 'each line requires a description'; END IF;
    IF COALESCE(NULLIF(line->>'material_amount','')::NUMERIC,0)<0 OR COALESCE(NULLIF(line->>'labor_amount','')::NUMERIC,0)<0 OR COALESCE(NULLIF(line->>'equipment_amount','')::NUMERIC,0)<0 OR COALESCE(NULLIF(line->>'subcontract_amount','')::NUMERIC,0)<0 OR COALESCE(NULLIF(line->>'other_amount','')::NUMERIC,0)<0 OR COALESCE(NULLIF(line->>'markup_amount','')::NUMERIC,0)<0 THEN RAISE EXCEPTION 'line amounts cannot be negative'; END IF;
    INSERT INTO public.change_order_lines(change_order_id,job_budget_line_id,division,cost_code,description,vendor_name,material_amount,labor_amount,equipment_amount,subcontract_amount,other_amount,markup_amount,sort_order,created_by,updated_by)
    VALUES(saved.id,budget_line.id,p_division,budget_line.cost_code,BTRIM(line->>'description'),NULLIF(BTRIM(COALESCE(line->>'vendor_name','')),''),COALESCE(NULLIF(line->>'material_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'labor_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'equipment_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'subcontract_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'other_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'markup_amount','')::NUMERIC,0),COALESCE(NULLIF(line->>'sort_order','')::INTEGER,0),actor_id,actor_id);
  END LOOP;
  SELECT COALESCE(SUM(line_total),0) INTO total FROM public.change_order_lines WHERE change_order_id=saved.id;
  UPDATE public.change_orders SET price_amount=total,cost_amount=GREATEST(total-COALESCE((SELECT SUM(markup_amount) FROM public.change_order_lines WHERE change_order_id=saved.id),0),0),updated_at=NOW() WHERE id=saved.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note) VALUES(actor_id,actor_name,'change_orders',saved.id::TEXT,CASE WHEN target.id IS NULL THEN 'create' ELSE 'update' END,CASE WHEN target.id IS NULL THEN NULL ELSE to_jsonb(target)||jsonb_build_object('lines',before_lines) END,to_jsonb(saved)||jsonb_build_object('lines',p_lines),normalized_reason);
  RETURN saved;
END $function$;
NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.create_vehicle(p_vehicle_number text, p_name text, p_classification text, p_description text, p_holds_stock boolean, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE caller public.user_permissions%ROWTYPE; saved public.vehicles%ROWTYPE; normalized_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), ''); BEGIN
  SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND is_active LIMIT 1;
  IF NOT FOUND OR COALESCE((public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides)->>'can_manage_vehicles')::BOOLEAN, FALSE) IS NOT TRUE THEN RAISE EXCEPTION 'vehicle management permission is required' USING ERRCODE = '42501'; END IF;
  IF (NULLIF(trim(COALESCE(p_vehicle_number, '')), '') IS NULL AND NULLIF(trim(COALESCE(p_name, '')), '') IS NULL) THEN RAISE EXCEPTION 'vehicle unit or name is required' USING ERRCODE = '22004'; END IF;
  INSERT INTO public.vehicles (vehicle_number, name, display_name, classification, description, holds_stock, is_active)
  VALUES (NULLIF(trim(p_vehicle_number), ''), NULLIF(trim(p_name), ''), COALESCE(NULLIF(trim(p_vehicle_number), ''), NULLIF(trim(p_name), '')), NULLIF(trim(p_classification), ''), NULLIF(trim(p_description), ''), COALESCE(p_holds_stock, FALSE), TRUE)
  RETURNING * INTO saved;
  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, after_data, note) VALUES (auth.jwt() ->> 'sub', COALESCE(caller.display_name, caller.email, auth.jwt() ->> 'sub'), 'vehicles', saved.id::TEXT, 'create', to_jsonb(saved), normalized_reason);
  RETURN saved.id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.assign_vehicle_to_user(p_vehicle_id uuid, p_user_id text, p_reason text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  target_user public.user_permissions%ROWTYPE;
  target_vehicle public.vehicles%ROWTYPE;
  current_assignment public.vehicle_assignments%ROWTYPE;
  inserted_assignment public.vehicle_assignments%ROWTYPE;
  normalized_user_id TEXT := NULLIF(trim(COALESCE(p_user_id, '')), '');
  normalized_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  actor_label TEXT;
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '28000';
  END IF;

  IF p_vehicle_id IS NULL OR normalized_user_id IS NULL THEN
    RAISE EXCEPTION 'vehicle and employee are required' USING ERRCODE = '22004';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501';
  END IF;

  caller_permissions := public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides);
  IF COALESCE((caller_permissions ->> 'can_manage_vehicles')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'can_manage_vehicles permission is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_user
  FROM public.user_permissions up
  WHERE up.clerk_user_id = normalized_user_id AND up.is_active = TRUE
  LIMIT 1;

  IF target_user.id IS NULL OR public.current_user_can_read_division(target_user.division) IS NOT TRUE THEN
    RAISE EXCEPTION 'employee is not available in your approved scope' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_vehicle
  FROM public.vehicles v
  WHERE v.id = p_vehicle_id AND v.is_active = TRUE
  LIMIT 1;

  IF target_vehicle.id IS NULL THEN
    RAISE EXCEPTION 'active vehicle not found' USING ERRCODE = 'P0002';
  END IF;

  actor_label := COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject);

  SELECT * INTO current_assignment
  FROM public.vehicle_assignments va
  WHERE va.user_id = normalized_user_id AND va.unassigned_at IS NULL
  ORDER BY va.assigned_at DESC, va.id DESC
  LIMIT 1
  FOR UPDATE;

  IF current_assignment.id IS NOT NULL AND current_assignment.vehicle_id = p_vehicle_id THEN
    RAISE EXCEPTION 'employee is already assigned to this vehicle' USING ERRCODE = '23505';
  END IF;

  IF current_assignment.id IS NOT NULL THEN
    UPDATE public.vehicle_assignments
    SET unassigned_at = NOW()
    WHERE id = current_assignment.id;

    INSERT INTO public.change_logs (
      user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at
    ) VALUES (
      jwt_subject,
      actor_label,
      'vehicle_assignments',
      current_assignment.id::TEXT,
      'update',
      to_jsonb(current_assignment),
      to_jsonb(current_assignment) || jsonb_build_object('unassigned_at', NOW()),
      concat_ws(': ', 'Transferred vehicle assignment', normalized_reason),
      NOW()
    );
  END IF;

  INSERT INTO public.vehicle_assignments (user_id, vehicle_id, assigned_by, note)
  VALUES (normalized_user_id, p_vehicle_id, jwt_subject, normalized_reason)
  RETURNING * INTO inserted_assignment;

  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at
  ) VALUES (
    jwt_subject,
    actor_label,
    'vehicle_assignments',
    inserted_assignment.id::TEXT,
    'create',
    NULL,
    to_jsonb(inserted_assignment),
    normalized_reason,
    NOW()
  );

  RETURN inserted_assignment.id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_vehicle_assignment(p_assignment_id bigint, p_reason text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  caller_permissions JSONB;
  target_assignment public.vehicle_assignments%ROWTYPE;
  normalized_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  actor_label TEXT;
  released_at TIMESTAMPTZ := NOW();
BEGIN
  IF jwt_subject IS NULL OR length(trim(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '28000';
  END IF;

  IF p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'active assignment is required' USING ERRCODE = '22004';
  END IF;

  SELECT * INTO caller
  FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject AND up.is_active = TRUE
  LIMIT 1;

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501';
  END IF;

  caller_permissions := public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides);
  IF COALESCE((caller_permissions ->> 'can_manage_vehicles')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'can_manage_vehicles permission is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_assignment
  FROM public.vehicle_assignments va
  WHERE va.id = p_assignment_id AND va.unassigned_at IS NULL
  FOR UPDATE;

  IF target_assignment.id IS NULL THEN
    RAISE EXCEPTION 'active vehicle assignment not found' USING ERRCODE = 'P0002';
  END IF;

  actor_label := COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject);

  UPDATE public.vehicle_assignments
  SET unassigned_at = released_at
  WHERE id = target_assignment.id;

  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at
  ) VALUES (
    jwt_subject,
    actor_label,
    'vehicle_assignments',
    target_assignment.id::TEXT,
    'update',
    to_jsonb(target_assignment),
    to_jsonb(target_assignment) || jsonb_build_object('unassigned_at', released_at),
    concat_ws(': ', 'Released vehicle assignment', normalized_reason),
    released_at
  );

  RETURN target_assignment.id;
END;
$function$
;
