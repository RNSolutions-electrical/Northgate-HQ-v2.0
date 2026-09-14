-- Applied through the controlled migration endpoint as 20260914002830.
-- Preserve the reviewed editor's component semantics in the existing library.
ALTER TABLE public.assembly_items
 ADD COLUMN stage text NOT NULL DEFAULT 'Rough-in',
 ADD COLUMN fixed_quantity boolean NOT NULL DEFAULT false,
 ADD COLUMN price_missing boolean NOT NULL DEFAULT false,
 ADD COLUMN labor_missing boolean NOT NULL DEFAULT false;

-- Soft-removal must remain visible to the same scoped readers during UPDATE.
-- Application lists still explicitly exclude archived components.
DROP POLICY assembly_items_read ON public.assembly_items;
CREATE POLICY assembly_items_read ON public.assembly_items FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.assemblies a WHERE a.id=assembly_id
 AND a.archived_at IS NULL AND a.division=assembly_items.division
 AND (public.current_user_can_read_division(a.division,'can_estimate')
 OR public.current_user_can_read_division(a.division,'can_approve_estimates'))));

-- Trigger-only privilege elevation: library writes retain their existing RLS.
CREATE FUNCTION public.audit_assembly_library() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=auth.jwt()->>'sub'; old_data jsonb; parent_id uuid;
BEGIN
 IF actor IS NULL OR public.current_user_can_edit_division(NEW.division,'can_estimate') IS NOT TRUE THEN
  RAISE EXCEPTION 'Assembly edit permission required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' THEN
  old_data:=to_jsonb(OLD);
  IF NEW.division IS DISTINCT FROM OLD.division THEN
   RAISE EXCEPTION 'Assembly division cannot be changed here' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME='assembly_items' THEN
   IF NEW.assembly_id IS DISTINCT FROM OLD.assembly_id THEN
    RAISE EXCEPTION 'Assembly component cannot be moved here' USING ERRCODE='42501';
   END IF;
  END IF;
 END IF;
 NEW.updated_at:=clock_timestamp();
 IF TG_TABLE_NAME='assembly_items' THEN
  parent_id:=NEW.assembly_id;
  -- Also invalidate stale editors when a component is edited in the old UI.
  UPDATE public.assemblies SET updated_at=clock_timestamp() WHERE id=parent_id;
 END IF;
 IF TG_OP='INSERT' OR (old_data-'updated_at') IS DISTINCT FROM (to_jsonb(NEW)-'updated_at') THEN
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,public.change_order_actor(),TG_TABLE_NAME,NEW.id::text,lower(TG_OP),old_data,to_jsonb(NEW),
   jsonb_build_object('workflow','assembly_library','source',COALESCE(NULLIF(current_setting('northgate.assembly_source',true),''),'assembly_library'),
    'estimate_id',NULLIF(current_setting('northgate.assembly_estimate',true),''))::text);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_assembly_library() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_audit_assembly_library BEFORE INSERT OR UPDATE ON public.assemblies
 FOR EACH ROW EXECUTE FUNCTION public.audit_assembly_library();
CREATE TRIGGER zz_audit_assembly_library BEFORE INSERT OR UPDATE ON public.assembly_items
 FOR EACH ROW EXECUTE FUNCTION public.audit_assembly_library();

CREATE FUNCTION public.save_workbench_assembly(
 p_estimate_id uuid,p_division text,p_document jsonb,p_expected_revision integer,
 p_catalogue_updates jsonb,p_assembly jsonb
) RETURNS public.estimate_workbenches
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.assemblies; e public.estimates; component public.assembly_items;
 line jsonb; aid uuid; lid uuid; kept uuid[]:='{}'; position integer:=0;
 result public.estimate_workbenches; value numeric; k text;
BEGIN
 IF auth.jwt()->>'sub' IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='28000'; END IF;
 SELECT * INTO e FROM public.estimates WHERE id=p_estimate_id AND archived_at IS NULL AND status='draft' AND editor_version=2;
 IF e.id IS NULL OR public.current_user_can_edit_division(e.division,'can_estimate') IS NOT TRUE THEN
  RAISE EXCEPTION 'Editable estimate required' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_assembly) IS DISTINCT FROM 'object' OR COALESCE(btrim(p_assembly->>'name'),'')=''
 OR jsonb_typeof(p_assembly->'lines') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Assembly name and components required' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_assembly->'lines') NOT BETWEEN 1 AND 2000 THEN
  RAISE EXCEPTION 'Assembly must contain 1 to 2000 components' USING ERRCODE='22023';
 END IF;
 aid:=NULLIF(p_assembly->>'id','')::uuid;
 PERFORM set_config('northgate.assembly_source',CASE WHEN aid IS NULL THEN 'estimate' ELSE 'assembly_library' END,true);
 PERFORM set_config('northgate.assembly_estimate',e.id::text,true);
 IF aid IS NULL THEN
  INSERT INTO public.assemblies(division,name,description,unit,created_by,source_estimate_id)
  VALUES(e.division,btrim(p_assembly->>'name'),COALESCE(p_assembly->>'notes',''),'EA',auth.jwt()->>'sub',e.id)
  RETURNING * INTO a;
 ELSE
  SELECT * INTO a FROM public.assemblies WHERE id=aid AND archived_at IS NULL AND is_library_item FOR UPDATE;
  IF a.id IS NULL OR public.current_user_can_edit_division(a.division,'can_estimate') IS NOT TRUE THEN
   RAISE EXCEPTION 'Assembly unavailable or edit permission missing' USING ERRCODE='42501';
  END IF;
  IF a.updated_at IS DISTINCT FROM (p_assembly->>'updatedAt')::timestamptz THEN
   RAISE EXCEPTION 'Assembly changed. Refresh the library and review before saving' USING ERRCODE='40001';
  END IF;
  UPDATE public.assemblies SET name=btrim(p_assembly->>'name'),description=COALESCE(p_assembly->>'notes','')
   WHERE id=a.id;
 END IF;
 FOR line IN SELECT v FROM jsonb_array_elements(p_assembly->'lines') v LOOP
  IF COALESCE(btrim(line->>'name'),'')='' THEN RAISE EXCEPTION 'Component description required' USING ERRCODE='22023'; END IF;
  FOR k IN SELECT unnest(ARRAY['qty','price','hours']) LOOP
   IF k='qty' OR (line->k IS NOT NULL AND line->k<>'null'::jsonb AND line->>k<>'') THEN
    value:=(line->>k)::numeric;
    IF value IS NULL OR value<0 OR value::text IN ('NaN','Infinity','-Infinity') THEN
     RAISE EXCEPTION 'Component quantities and values must be finite and nonnegative' USING ERRCODE='22023';
    END IF;
   END IF;
  END LOOP;
  IF NULLIF(line->>'catalogueId','') IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.items WHERE id=(line->>'catalogueId')::uuid AND is_active AND NOT is_archived AND estimating_enabled
  ) THEN RAISE EXCEPTION 'Linked catalogue material is unavailable' USING ERRCODE='42501'; END IF;
  lid:=NULLIF(line->>'libraryLineId','')::uuid;
  IF lid=ANY(kept) THEN RAISE EXCEPTION 'Duplicate component' USING ERRCODE='22023'; END IF;
  IF lid IS NOT NULL THEN
   SELECT * INTO component FROM public.assembly_items WHERE id=lid AND assembly_id=a.id AND archived_at IS NULL FOR UPDATE;
   IF component.id IS NULL THEN RAISE EXCEPTION 'Component no longer belongs to this assembly' USING ERRCODE='40001'; END IF;
   UPDATE public.assembly_items SET item_id=NULLIF(line->>'catalogueId','')::uuid,description=btrim(line->>'name'),
    quantity=(line->>'qty')::numeric,waste_percent=0,unit=COALESCE(NULLIF(line->>'unit',''),'EA'),
    unit_cost_snapshot=COALESCE(NULLIF(line->>'price','')::numeric,0),
    labor_rate_hrs_snapshot=COALESCE(NULLIF(line->>'hours','')::numeric,0),
    stage=COALESCE(NULLIF(line->>'stage',''),'Rough-in'),fixed_quantity=COALESCE((line->>'fixed')::boolean,false),
    price_missing=NULLIF(line->>'price','') IS NULL,labor_missing=NULLIF(line->>'hours','') IS NULL,
    note=COALESCE(line->>'notes',''),sort_order=position WHERE id=lid;
  ELSE
   INSERT INTO public.assembly_items(assembly_id,division,item_id,description,quantity,unit,
    unit_cost_snapshot,labor_rate_hrs_snapshot,stage,fixed_quantity,price_missing,labor_missing,note,sort_order,created_by)
   VALUES(a.id,a.division,NULLIF(line->>'catalogueId','')::uuid,btrim(line->>'name'),(line->>'qty')::numeric,
    COALESCE(NULLIF(line->>'unit',''),'EA'),COALESCE(NULLIF(line->>'price','')::numeric,0),
    COALESCE(NULLIF(line->>'hours','')::numeric,0),COALESCE(NULLIF(line->>'stage',''),'Rough-in'),
    COALESCE((line->>'fixed')::boolean,false),NULLIF(line->>'price','') IS NULL,NULLIF(line->>'hours','') IS NULL,
    COALESCE(line->>'notes',''),position,auth.jwt()->>'sub') RETURNING id INTO lid;
  END IF;
  kept:=array_append(kept,lid);position:=position+1;
 END LOOP;
 UPDATE public.assembly_items SET archived_at=clock_timestamp(),archived_by=auth.jwt()->>'sub',
  archive_reason='Removed during assembly composition update'
 WHERE assembly_id=a.id AND archived_at IS NULL AND NOT(id=ANY(kept));
 -- A failed draft/catalogue save rolls back the library and its audit too.
 result:=public.save_estimate_workbench(p_estimate_id,p_division,p_document,p_expected_revision,p_catalogue_updates);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_workbench_assembly(uuid,text,jsonb,integer,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_workbench_assembly(uuid,text,jsonb,integer,jsonb,jsonb) TO authenticated;
