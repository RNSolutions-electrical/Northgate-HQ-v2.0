-- Preserve Tools RLS. Invoker RPC performs writes; the trigger records trusted audit atomically.
CREATE OR REPLACE FUNCTION public.audit_tool_catalogue_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE actor text := auth.jwt()->>'sub';
  workflow text := current_setting('northgate.tool_workflow',true);
  reason text := NULLIF(regexp_replace(COALESCE(current_setting('northgate.tool_reason',true),''),'^\s+|\s+$','','g'),'');
  action text;
BEGIN
  IF actor IS NULL OR public.current_user_can_edit_division(NEW.division,'can_manage_inventory') IS NOT TRUE THEN
    RAISE EXCEPTION 'Tool catalogue management permission is required' USING ERRCODE='42501';
  END IF;
  IF workflow NOT IN ('save','archive','restore') OR workflow IS NULL THEN
    RAISE EXCEPTION 'Use the current Tools save workflow; refresh the app before retrying' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.division<>OLD.division OR NEW.created_at<>OLD.created_at THEN
      RAISE EXCEPTION 'Tool identity and division cannot be changed here' USING ERRCODE='22023';
    END IF;
    IF reason IS NULL THEN RAISE EXCEPTION 'A reason is required for catalogue edits, archive and restore' USING ERRCODE='22023'; END IF;
    action := CASE WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN 'archive'
      WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN 'restore' ELSE 'update' END;
  ELSE
    IF NEW.status='retired' AND reason IS NULL THEN RAISE EXCEPTION 'Retirement requires a reason' USING ERRCODE='22023'; END IF;
    action := 'create';
  END IF;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,public.change_order_actor(),'tools',NEW.id::text,action,
    CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW),reason);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_tool_catalogue_mutation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_audit_tool_catalogue_mutation AFTER INSERT OR UPDATE ON public.tools
FOR EACH ROW EXECUTE FUNCTION public.audit_tool_catalogue_mutation();

CREATE OR REPLACE FUNCTION public.save_tool_catalogue(
  p_tool_id uuid, p_division text, p_changes jsonb, p_action text DEFAULT 'save',
  p_reason text DEFAULT NULL, p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS public.tools LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE actor text := auth.jwt()->>'sub'; target public.tools; candidate public.tools; saved public.tools;
  reason text := NULLIF(regexp_replace(COALESCE(p_reason,''),'^\s+|\s+$','','g'),'');
  previous_workflow text := current_setting('northgate.tool_workflow',true);
  previous_reason text := current_setting('northgate.tool_reason',true);
  allowed text[] := ARRAY['tool_number','name','category','brand','model','serial_number','description',
    'condition','status','home_location','current_location','assigned_to','purchase_date','notes'];
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication is required' USING ERRCODE='28000'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('save','archive','restore') THEN RAISE EXCEPTION 'Invalid tool action' USING ERRCODE='22023'; END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'object' OR octet_length(p_changes::text)>65536 THEN
    RAISE EXCEPTION 'Tool changes must be an object under 64 KB' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_changes) k WHERE NOT k=ANY(allowed)) THEN
    RAISE EXCEPTION 'Unsupported tool field' USING ERRCODE='22023';
  END IF;
  IF length(reason)>4000 THEN RAISE EXCEPTION 'Reason must not exceed 4000 characters' USING ERRCODE='22023'; END IF;
  IF p_action<>'save' AND p_changes<>'{}'::jsonb THEN RAISE EXCEPTION 'Archive/restore cannot also edit catalogue fields' USING ERRCODE='22023'; END IF;
  IF p_tool_id IS NOT NULL THEN
    SELECT * INTO target FROM public.tools WHERE id=p_tool_id FOR UPDATE;
    IF target.id IS NULL OR public.current_user_can_edit_division(target.division,'can_manage_inventory') IS NOT TRUE THEN
      RAISE EXCEPTION 'Tool not found or management permission missing' USING ERRCODE='42501';
    END IF;
    IF p_expected_updated_at IS NULL OR target.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'This tool changed since you opened it. Refresh and review before saving' USING ERRCODE='40001';
    END IF;
    IF p_action='save' AND target.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Restore the tool before editing' USING ERRCODE='22023'; END IF;
    IF (p_action='archive' AND target.archived_at IS NOT NULL) OR (p_action='restore' AND target.archived_at IS NULL) THEN
      RAISE EXCEPTION 'Tool is no longer in the expected archive state' USING ERRCODE='40001';
    END IF;
    candidate := jsonb_populate_record(target,p_changes);
    IF p_action='save' AND to_jsonb(candidate)=to_jsonb(target) THEN RETURN target; END IF;
    IF reason IS NULL THEN RAISE EXCEPTION 'A reason is required for catalogue edits, archive and restore' USING ERRCODE='22023'; END IF;
  ELSE
    IF p_action<>'save' OR public.current_user_can_edit_division(p_division,'can_manage_inventory') IS NOT TRUE THEN
      RAISE EXCEPTION 'Tool catalogue management permission is required' USING ERRCODE='42501';
    END IF;
    candidate := jsonb_populate_record(NULL::public.tools,p_changes);
    candidate.status := COALESCE(candidate.status,'active');
    candidate.condition := COALESCE(candidate.condition,'unknown');
  END IF;
  IF p_action='save' AND NULLIF(btrim(candidate.name),'') IS NULL THEN RAISE EXCEPTION 'Tool name is required' USING ERRCODE='22023'; END IF;
  IF p_action='save' AND (candidate.status IS NULL OR candidate.status NOT IN ('active','inactive','retired','missing')
    OR candidate.condition IS NULL OR candidate.condition NOT IN ('unknown','good','fair','poor','damaged')) THEN
    RAISE EXCEPTION 'Invalid tool status or condition' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('northgate.tool_workflow',p_action,true);
  PERFORM set_config('northgate.tool_reason',COALESCE(reason,''),true);
  IF p_tool_id IS NULL THEN
    INSERT INTO public.tools(division,tool_number,name,category,brand,model,serial_number,description,condition,status,
      home_location,current_location,assigned_to,purchase_date,notes)
    VALUES(p_division,candidate.tool_number,btrim(candidate.name),candidate.category,candidate.brand,candidate.model,
      candidate.serial_number,candidate.description,candidate.condition,candidate.status,candidate.home_location,
      candidate.current_location,candidate.assigned_to,candidate.purchase_date,candidate.notes) RETURNING * INTO saved;
  ELSIF p_action='save' THEN
    UPDATE public.tools SET tool_number=candidate.tool_number,name=btrim(candidate.name),category=candidate.category,
      brand=candidate.brand,model=candidate.model,serial_number=candidate.serial_number,description=candidate.description,
      condition=candidate.condition,status=candidate.status,home_location=candidate.home_location,
      current_location=candidate.current_location,assigned_to=candidate.assigned_to,purchase_date=candidate.purchase_date,
      notes=candidate.notes WHERE id=target.id RETURNING * INTO saved;
  ELSE
    UPDATE public.tools SET archived_at=CASE WHEN p_action='archive' THEN clock_timestamp() ELSE NULL END,
      archived_by=CASE WHEN p_action='archive' THEN actor ELSE NULL END,
      archive_reason=CASE WHEN p_action='archive' THEN reason ELSE NULL END WHERE id=target.id RETURNING * INTO saved;
  END IF;
  PERFORM set_config('northgate.tool_workflow',COALESCE(previous_workflow,''),true);
  PERFORM set_config('northgate.tool_reason',COALESCE(previous_reason,''),true);
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.save_tool_catalogue(uuid,text,jsonb,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_tool_catalogue(uuid,text,jsonb,text,text,timestamptz) TO authenticated;
