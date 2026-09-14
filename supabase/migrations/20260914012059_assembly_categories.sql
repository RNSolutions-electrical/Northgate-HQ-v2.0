-- Applied as 20260914012059 through the controlled migration endpoint.
-- Nullable preserves legacy single-category rows without rewriting audited data.
ALTER TABLE public.assemblies ADD COLUMN categories text[];
-- Existing permissions, audit trigger, and atomic save behavior are unchanged.
CREATE OR REPLACE FUNCTION public.save_assembly_library(p_division text,p_assembly jsonb,p_estimate_id uuid DEFAULT NULL) RETURNS public.assemblies
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.assemblies; e public.estimates; component public.assembly_items;
 line jsonb; aid uuid; lid uuid; kept uuid[]:='{}'; position integer:=0;
 value numeric; k text; target_division text:=p_division; selected_categories text[];
BEGIN
 IF auth.jwt()->>'sub' IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='28000'; END IF;
 IF p_estimate_id IS NOT NULL THEN
  SELECT * INTO e FROM public.estimates WHERE id=p_estimate_id AND archived_at IS NULL AND status='draft' AND editor_version=2;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Editable estimate required' USING ERRCODE='42501'; END IF;
  target_division:=e.division;
 END IF;
 IF public.current_user_can_edit_division(target_division,'can_estimate') IS NOT TRUE THEN
  RAISE EXCEPTION 'Assembly edit permission required' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_assembly) IS DISTINCT FROM 'object' OR COALESCE(btrim(p_assembly->>'name'),'')=''
 OR jsonb_typeof(p_assembly->'lines') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Assembly name and components required' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_assembly->'lines') NOT BETWEEN 1 AND 2000 THEN
  RAISE EXCEPTION 'Assembly must contain 1 to 2000 components' USING ERRCODE='22023';
 END IF;
 IF p_assembly?'categories' THEN
  IF jsonb_typeof(p_assembly->'categories') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Categories must be a list' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_assembly->'categories')>50 OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_assembly->'categories') c
   WHERE jsonb_typeof(c)<>'string' OR length(btrim(c#>>'{}')) NOT BETWEEN 1 AND 80
  ) THEN RAISE EXCEPTION 'Choose up to 50 categories, each 1 to 80 characters' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(array_agg(label ORDER BY label),'{}') INTO selected_categories
  FROM (SELECT min(btrim(cat.label)) AS label FROM jsonb_array_elements_text(p_assembly->'categories') AS cat(label) GROUP BY lower(btrim(cat.label))) c;
 END IF;
 aid:=NULLIF(p_assembly->>'id','')::uuid;
 PERFORM set_config('northgate.assembly_source',CASE WHEN p_estimate_id IS NOT NULL AND aid IS NULL THEN 'estimate' ELSE 'assembly_library' END,true);
 PERFORM set_config('northgate.assembly_estimate',COALESCE(e.id::text,''),true);
 IF aid IS NULL THEN
  INSERT INTO public.assemblies(division,name,description,unit,created_by,source_estimate_id,categories)
  VALUES(target_division,btrim(p_assembly->>'name'),COALESCE(p_assembly->>'notes',''),'EA',auth.jwt()->>'sub',e.id,COALESCE(selected_categories,'{}'))
  RETURNING * INTO a;
 ELSE
  SELECT * INTO a FROM public.assemblies WHERE id=aid AND archived_at IS NULL AND is_library_item FOR UPDATE;
  IF a.id IS NULL OR public.current_user_can_edit_division(a.division,'can_estimate') IS NOT TRUE THEN
   RAISE EXCEPTION 'Assembly unavailable or edit permission missing' USING ERRCODE='42501';
  END IF;
  IF a.updated_at IS DISTINCT FROM (p_assembly->>'updatedAt')::timestamptz THEN
   RAISE EXCEPTION 'Assembly changed. Refresh the library and review before saving' USING ERRCODE='40001';
  END IF;
  UPDATE public.assemblies SET name=btrim(p_assembly->>'name'),description=COALESCE(p_assembly->>'notes',''),categories=CASE WHEN p_assembly?'categories' THEN selected_categories ELSE categories END
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
 SELECT * INTO a FROM public.assemblies WHERE id=a.id;
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.save_assembly_library(text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_assembly_library(text,jsonb,uuid) TO authenticated;
