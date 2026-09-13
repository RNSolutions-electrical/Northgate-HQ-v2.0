-- Applied as 20260913164527 through the controlled migration endpoint.
-- Opt-in draft editor; legacy estimates and their pricing are not converted.
ALTER TABLE public.estimates ADD COLUMN editor_version integer NOT NULL DEFAULT 1 CHECK(editor_version IN (1,2));
ALTER TABLE public.items ADD COLUMN price_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.items ADD COLUMN labor_value_source text NOT NULL DEFAULT 'unverified'
  CHECK(labor_value_source IN ('unverified','internal'));
UPDATE public.items SET price_confirmed=true WHERE price_per_unit>0;

CREATE TABLE public.estimate_workbenches (
 estimate_id uuid PRIMARY KEY REFERENCES public.estimates(id),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object'),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.estimate_workbenches ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.estimate_workbenches TO authenticated;
REVOKE ALL ON public.estimate_workbenches FROM anon;
CREATE POLICY workbench_read ON public.estimate_workbenches FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.estimates e WHERE e.id=estimate_id AND e.archived_at IS NULL
 AND (public.current_user_can_read_division(e.division,'can_estimate') OR public.current_user_can_read_division(e.division,'can_approve_estimates'))));
CREATE POLICY workbench_write ON public.estimate_workbenches FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.estimates e WHERE e.id=estimate_id AND e.editor_version=2 AND e.status='draft' AND e.archived_at IS NULL AND public.current_user_can_edit_division(e.division,'can_estimate')))
 WITH CHECK(EXISTS(SELECT 1 FROM public.estimates e WHERE e.id=estimate_id AND e.editor_version=2 AND e.status='draft' AND e.archived_at IS NULL AND public.current_user_can_edit_division(e.division,'can_estimate')));

CREATE FUNCTION public.guard_workbench_header() RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.editor_version IS DISTINCT FROM OLD.editor_version THEN
  RAISE EXCEPTION 'Existing estimates cannot switch editors' USING ERRCODE='22023';
 END IF;
 IF NEW.editor_version=2 AND (NEW.status<>'draft' OR COALESCE(current_setting('northgate.workbench_save',true),'')<>'yes') THEN
  RAISE EXCEPTION 'Use the new draft editor. Approval and conversion are not enabled for these drafts yet' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_workbench_header() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_workbench_header BEFORE INSERT OR UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION public.guard_workbench_header();

CREATE FUNCTION public.audit_material_values() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE actor text:=auth.jwt()->>'sub'; source_id uuid:=NULLIF(current_setting('northgate.material_estimate',true),'')::uuid;
 source_name text:='catalogue'; target public.estimates; changed boolean;
BEGIN
 changed:=NEW.price_per_unit IS DISTINCT FROM OLD.price_per_unit OR NEW.labor_rate_hrs IS DISTINCT FROM OLD.labor_rate_hrs
 OR NEW.price_confirmed IS DISTINCT FROM OLD.price_confirmed OR NEW.labor_value_source IS DISTINCT FROM OLD.labor_value_source;
 IF NOT changed THEN RETURN NEW; END IF;
 IF actor IS NULL OR public.current_user_can_edit_division(OLD.division,'can_edit_catalog') IS NOT TRUE THEN
  RAISE EXCEPTION 'Existing catalogue edit permission is required' USING ERRCODE='42501';
 END IF;
 IF NEW.price_per_unit<0 OR NEW.price_per_unit::text IN ('NaN','Infinity','-Infinity')
 OR NEW.labor_rate_hrs<0 OR NEW.labor_rate_hrs::text IN ('NaN','Infinity','-Infinity') THEN
  RAISE EXCEPTION 'Material price and hours must be finite and nonnegative' USING ERRCODE='22023';
 END IF;
 IF source_id IS NOT NULL THEN
  SELECT * INTO target FROM public.estimates WHERE id=source_id AND archived_at IS NULL AND status='draft';
  IF target.id IS NULL OR public.current_user_can_edit_division(target.division,'can_estimate') IS NOT TRUE THEN
   RAISE EXCEPTION 'Editable source estimate is required' USING ERRCODE='42501';
  END IF;
  source_name:='estimate';
 END IF;
 IF NEW.price_per_unit IS DISTINCT FROM OLD.price_per_unit THEN NEW.price_confirmed:=true; END IF;
 IF NEW.labor_rate_hrs IS DISTINCT FROM OLD.labor_rate_hrs THEN NEW.labor_value_source:='internal'; END IF;
 NEW.updated_at:=clock_timestamp();
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,public.change_order_actor(),'items',NEW.id::text,'update',to_jsonb(OLD),to_jsonb(NEW),
 jsonb_build_object('source',source_name,'estimate_id',source_id,'workflow','material_values')::text);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_material_values() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_material_values BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.audit_material_values();

CREATE FUNCTION public.save_material_catalogue_values(p_item_id uuid,p_changes jsonb,p_expected_updated_at timestamptz,p_estimate_id uuid DEFAULT NULL)
RETURNS public.items LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE target public.items; previous text:=current_setting('northgate.material_estimate',true); k text;
BEGIN
 IF auth.jwt()->>'sub' IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='28000'; END IF;
 IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'object' OR p_changes='{}'::jsonb
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_changes) f WHERE f NOT IN ('price_per_unit','labor_rate_hrs')) THEN
  RAISE EXCEPTION 'Only material price and labor hours can be saved here' USING ERRCODE='22023';
 END IF;
 FOR k IN SELECT jsonb_object_keys(p_changes) LOOP
  IF jsonb_typeof(p_changes->k)<>'number' OR (p_changes->>k)::numeric<0 THEN
   RAISE EXCEPTION 'Enter nonnegative numeric values; blank values must be omitted' USING ERRCODE='22023';
  END IF;
 END LOOP;
 SELECT * INTO target FROM public.items WHERE id=p_item_id AND is_active AND NOT is_archived FOR UPDATE;
 IF target.id IS NULL OR public.current_user_can_edit_division(target.division,'can_edit_catalog') IS NOT TRUE THEN
  RAISE EXCEPTION 'Material unavailable or catalogue edit permission missing' USING ERRCODE='42501';
 END IF;
 IF target.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Catalogue item changed. Reload and review before saving' USING ERRCODE='40001'; END IF;
 PERFORM set_config('northgate.material_estimate',COALESCE(p_estimate_id::text,''),true);
 UPDATE public.items SET
  price_per_unit=CASE WHEN p_changes?'price_per_unit' THEN (p_changes->>'price_per_unit')::numeric ELSE price_per_unit END,
  price_confirmed=CASE WHEN p_changes?'price_per_unit' THEN true ELSE price_confirmed END,
  labor_rate_hrs=CASE WHEN p_changes?'labor_rate_hrs' THEN (p_changes->>'labor_rate_hrs')::numeric ELSE labor_rate_hrs END,
  labor_value_source=CASE WHEN p_changes?'labor_rate_hrs' THEN 'internal' ELSE labor_value_source END
 WHERE id=target.id RETURNING * INTO target;
 PERFORM set_config('northgate.material_estimate',COALESCE(previous,''),true);
 RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.save_material_catalogue_values(uuid,jsonb,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_material_catalogue_values(uuid,jsonb,timestamptz,uuid) TO authenticated;

CREATE FUNCTION public.audit_estimate_workbench() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE target public.estimates; actor text:=auth.jwt()->>'sub';
BEGIN
 SELECT * INTO target FROM public.estimates WHERE id=NEW.estimate_id AND status='draft' AND archived_at IS NULL AND editor_version=2;
 IF actor IS NULL OR target.id IS NULL OR public.current_user_can_edit_division(target.division,'can_estimate') IS NOT TRUE
 OR COALESCE(current_setting('northgate.workbench_save',true),'')<>'yes' THEN
  RAISE EXCEPTION 'Use the authenticated estimate save workflow' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,public.change_order_actor(),'estimate_workbenches',NEW.estimate_id::text,
 CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'update' END,
 CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW),'Estimate draft saved');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_estimate_workbench() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_estimate_workbench BEFORE INSERT OR UPDATE ON public.estimate_workbenches FOR EACH ROW EXECUTE FUNCTION public.audit_estimate_workbench();

CREATE FUNCTION public.save_estimate_workbench(p_estimate_id uuid,p_division text,p_document jsonb,p_expected_revision integer,p_catalogue_updates jsonb DEFAULT '[]')
RETURNS public.estimate_workbenches LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE target public.estimates; oldrow public.estimate_workbenches; saved public.estimate_workbenches;
 patch jsonb; previous text:=current_setting('northgate.workbench_save',true);
BEGIN
 IF auth.jwt()->>'sub' IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='28000'; END IF;
 IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR octet_length(p_document::text)>2097152
 OR NULLIF(btrim(p_document->>'name'),'') IS NULL OR jsonb_typeof(p_document->'entries') IS DISTINCT FROM 'array'
 OR COALESCE(p_document->>'approvedAt','')<>'' THEN RAISE EXCEPTION 'Valid draft estimate required' USING ERRCODE='22023'; END IF;
 IF p_catalogue_updates IS NULL OR jsonb_typeof(p_catalogue_updates)<>'array' OR jsonb_array_length(p_catalogue_updates)>200 THEN
  RAISE EXCEPTION 'Invalid catalogue updates' USING ERRCODE='22023';
 END IF;
 PERFORM set_config('northgate.workbench_save','yes',true);
 IF p_estimate_id IS NULL THEN
  IF public.current_user_can_edit_division(p_division,'can_estimate') IS NOT TRUE THEN RAISE EXCEPTION 'Estimate permission required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.estimates(division,title,customer_name,created_by,editor_version)
  VALUES(p_division,btrim(p_document->>'name'),p_document->>'customer',auth.jwt()->>'sub',2) RETURNING * INTO target;
 ELSE
  SELECT * INTO target FROM public.estimates WHERE id=p_estimate_id AND editor_version=2 AND status='draft' AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL OR public.current_user_can_edit_division(target.division,'can_estimate') IS NOT TRUE THEN RAISE EXCEPTION 'Editable draft not found' USING ERRCODE='42501'; END IF;
  SELECT * INTO oldrow FROM public.estimate_workbenches WHERE estimate_id=target.id FOR UPDATE;
  IF oldrow.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Estimate changed. Reopen it before saving; your unsaved input has been retained' USING ERRCODE='40001'; END IF;
  UPDATE public.estimates SET title=btrim(p_document->>'name'),customer_name=p_document->>'customer' WHERE id=target.id;
 END IF;
 FOR patch IN SELECT value FROM jsonb_array_elements(p_catalogue_updates) LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_document->'entries') e
    CROSS JOIN LATERAL jsonb_array_elements(e->'items') i CROSS JOIN LATERAL jsonb_array_elements(i->'lines') l
    WHERE l->>'catalogueId'=patch->>'item_id'
    AND (NOT (patch->'changes'?'price_per_unit') OR (l->>'price')::numeric=(patch->'changes'->>'price_per_unit')::numeric)
    AND (NOT (patch->'changes'?'labor_rate_hrs') OR (l->>'hours')::numeric=(patch->'changes'->>'labor_rate_hrs')::numeric)) THEN
   RAISE EXCEPTION 'Catalogue changes must match a material in this estimate' USING ERRCODE='22023';
  END IF;
  PERFORM public.save_material_catalogue_values((patch->>'item_id')::uuid,patch->'changes',(patch->>'expected_updated_at')::timestamptz,target.id);
 END LOOP;
 IF oldrow.estimate_id IS NULL THEN
  INSERT INTO public.estimate_workbenches(estimate_id,revision,document)
  VALUES(target.id,1,p_document) RETURNING * INTO saved;
 ELSE
  UPDATE public.estimate_workbenches SET revision=oldrow.revision+1,document=p_document,updated_at=clock_timestamp()
  WHERE estimate_id=target.id RETURNING * INTO saved;
 END IF;
 PERFORM set_config('northgate.workbench_save',COALESCE(previous,''),true);
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.save_estimate_workbench(uuid,text,jsonb,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_estimate_workbench(uuid,text,jsonb,integer,jsonb) TO authenticated;
