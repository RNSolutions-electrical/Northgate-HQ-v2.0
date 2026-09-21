-- V5 price precedence and immutable price-source snapshots.
-- Compatibility: items.price_per_unit remains the effective price consumed by
-- existing inventory, estimating and checkout code.

ALTER TABLE public.items
  ADD COLUMN estimating_price_per_unit numeric,
  ADD COLUMN inventory_price_per_unit numeric,
  ADD COLUMN effective_price_source text NOT NULL DEFAULT 'unverified'
    CHECK (effective_price_source IN ('unverified','estimating_master','inventory_explicit')),
  ADD COLUMN estimating_price_updated_at timestamptz,
  ADD COLUMN estimating_price_updated_by text,
  ADD COLUMN inventory_price_updated_at timestamptz,
  ADD COLUMN inventory_price_updated_by text;

UPDATE public.items
SET estimating_price_per_unit = price_per_unit,
    effective_price_source = 'estimating_master',
    estimating_price_updated_at = COALESCE(updated_at, created_at, clock_timestamp())
WHERE price_confirmed OR price_per_unit > 0;

ALTER TABLE public.items
  ADD CONSTRAINT items_estimating_price_nonnegative CHECK (estimating_price_per_unit IS NULL OR estimating_price_per_unit >= 0),
  ADD CONSTRAINT items_inventory_price_nonnegative CHECK (inventory_price_per_unit IS NULL OR inventory_price_per_unit >= 0);

CREATE FUNCTION public.initialize_item_price_sources() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.inventory_price_per_unit IS NOT NULL THEN
  NEW.price_per_unit:=NEW.inventory_price_per_unit; NEW.effective_price_source:='inventory_explicit';
  NEW.inventory_price_updated_at:=COALESCE(NEW.inventory_price_updated_at,clock_timestamp());
 ELSIF NEW.estimating_price_per_unit IS NOT NULL OR NEW.price_confirmed OR NEW.price_per_unit>0 THEN
  NEW.estimating_price_per_unit:=COALESCE(NEW.estimating_price_per_unit,NEW.price_per_unit);
  NEW.price_per_unit:=NEW.estimating_price_per_unit; NEW.effective_price_source:='estimating_master';
  NEW.estimating_price_updated_at:=COALESCE(NEW.estimating_price_updated_at,clock_timestamp());
 ELSE
  NEW.price_per_unit:=0; NEW.effective_price_source:='unverified';
 END IF;
 NEW.price_confirmed:=NEW.effective_price_source<>'unverified';
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.initialize_item_price_sources() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER initialize_item_price_sources BEFORE INSERT ON public.items
FOR EACH ROW EXECUTE FUNCTION public.initialize_item_price_sources();

CREATE TABLE public.item_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  effective_price numeric NOT NULL CHECK (effective_price >= 0),
  price_source text NOT NULL CHECK (price_source IN ('unverified','estimating_master','inventory_explicit')),
  estimating_price numeric,
  inventory_price numeric,
  source_estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  changed_by text,
  changed_by_name text,
  reason text,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX item_price_history_item_recorded_idx ON public.item_price_history(item_id,recorded_at DESC);
ALTER TABLE public.item_price_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.item_price_history TO authenticated;
REVOKE ALL ON public.item_price_history FROM anon;
CREATE POLICY item_price_history_read ON public.item_price_history FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.items i WHERE i.id=item_id AND public.current_user_can_read_catalog(i.division)));

CREATE OR REPLACE FUNCTION public.audit_material_values() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE actor text:=auth.jwt()->>'sub'; source_id uuid:=NULLIF(current_setting('northgate.material_estimate',true),'')::uuid;
 source_name text:='catalogue'; target public.estimates; changed boolean;
 old_effective numeric:=OLD.price_per_unit; old_source text:=OLD.effective_price_source;
 inventory_write boolean:=COALESCE(current_setting('northgate.inventory_price_write',true),'')='yes';
 reason text:=NULLIF(current_setting('northgate.price_reason',true),'');
BEGIN
 changed:=NEW.price_per_unit IS DISTINCT FROM OLD.price_per_unit OR NEW.labor_rate_hrs IS DISTINCT FROM OLD.labor_rate_hrs
 OR NEW.price_confirmed IS DISTINCT FROM OLD.price_confirmed OR NEW.labor_value_source IS DISTINCT FROM OLD.labor_value_source
 OR NEW.estimating_price_per_unit IS DISTINCT FROM OLD.estimating_price_per_unit
 OR NEW.inventory_price_per_unit IS DISTINCT FROM OLD.inventory_price_per_unit;
 IF NOT changed THEN RETURN NEW; END IF;
 IF actor IS NULL OR (NOT inventory_write AND public.current_user_can_edit_division(OLD.division,'can_edit_catalog') IS NOT TRUE)
 OR (inventory_write AND COALESCE((public.current_scoped_authorization_decision('V3-013','{}'::jsonb)->>'allowed')::boolean,false) IS NOT TRUE) THEN
  RAISE EXCEPTION 'Existing catalogue edit permission is required' USING ERRCODE='42501';
 END IF;
 IF NEW.inventory_price_per_unit IS DISTINCT FROM OLD.inventory_price_per_unit AND NOT inventory_write THEN
  RAISE EXCEPTION 'Use the inventory price approval workflow' USING ERRCODE='42501';
 END IF;
 IF source_id IS NOT NULL THEN
  SELECT * INTO target FROM public.estimates WHERE id=source_id AND archived_at IS NULL AND status='draft';
  IF target.id IS NULL OR public.current_user_can_edit_division(target.division,'can_estimate') IS NOT TRUE THEN
   RAISE EXCEPTION 'Editable source estimate is required' USING ERRCODE='42501';
  END IF;
  source_name:='estimate';
 END IF;
 -- Legacy writers update price_per_unit. Interpret that as the estimating master
 -- unless this is the guarded inventory-override path.
 IF NEW.price_per_unit IS DISTINCT FROM OLD.price_per_unit AND NOT inventory_write THEN
  NEW.estimating_price_per_unit:=CASE WHEN NEW.price_confirmed THEN NEW.price_per_unit ELSE NULL END;
 END IF;
 IF NEW.estimating_price_per_unit IS DISTINCT FROM OLD.estimating_price_per_unit THEN
  NEW.estimating_price_updated_at:=clock_timestamp(); NEW.estimating_price_updated_by:=actor;
 END IF;
 IF NEW.inventory_price_per_unit IS DISTINCT FROM OLD.inventory_price_per_unit THEN
  NEW.inventory_price_updated_at:=clock_timestamp(); NEW.inventory_price_updated_by:=actor;
 END IF;
 NEW.price_per_unit:=COALESCE(NEW.inventory_price_per_unit,NEW.estimating_price_per_unit,0);
 NEW.effective_price_source:=CASE WHEN NEW.inventory_price_per_unit IS NOT NULL THEN 'inventory_explicit'
   WHEN NEW.estimating_price_per_unit IS NOT NULL THEN 'estimating_master' ELSE 'unverified' END;
 NEW.price_confirmed:=NEW.effective_price_source<>'unverified';
 IF NEW.labor_rate_hrs IS DISTINCT FROM OLD.labor_rate_hrs THEN NEW.labor_value_source:='internal'; END IF;
 IF NEW.price_per_unit<0 OR NEW.labor_rate_hrs<0 THEN RAISE EXCEPTION 'Material price and hours must be nonnegative' USING ERRCODE='22023'; END IF;
 NEW.updated_at:=clock_timestamp();
 IF NEW.price_per_unit IS DISTINCT FROM old_effective OR NEW.effective_price_source IS DISTINCT FROM old_source THEN
  INSERT INTO public.item_price_history(item_id,effective_price,price_source,estimating_price,inventory_price,source_estimate_id,changed_by,changed_by_name,reason)
  VALUES(NEW.id,NEW.price_per_unit,NEW.effective_price_source,NEW.estimating_price_per_unit,NEW.inventory_price_per_unit,source_id,actor,public.change_order_actor(),reason);
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,public.change_order_actor(),'items',NEW.id::text,'update',to_jsonb(OLD),to_jsonb(NEW),
 jsonb_build_object('source',source_name,'estimate_id',source_id,'price_source',NEW.effective_price_source,'workflow','material_values')::text);
 RETURN NEW;
END $$;

ALTER TABLE public.transaction_items
  ADD COLUMN unit_cost_source text NOT NULL DEFAULT 'legacy_snapshot',
  ADD COLUMN unit_cost_source_updated_at timestamptz,
  ADD COLUMN unit_cost_snapshotted_at timestamptz NOT NULL DEFAULT clock_timestamp();

CREATE FUNCTION public.snapshot_transaction_item_price_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source public.items;
BEGIN
 SELECT * INTO source FROM public.items WHERE id=NEW.item_id;
 IF source.id IS NOT NULL THEN
  NEW.unit_cost_source:=source.effective_price_source;
  NEW.unit_cost_source_updated_at:=CASE source.effective_price_source
   WHEN 'inventory_explicit' THEN source.inventory_price_updated_at
   WHEN 'estimating_master' THEN source.estimating_price_updated_at ELSE NULL END;
 END IF;
 NEW.unit_cost_snapshotted_at:=clock_timestamp();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.snapshot_transaction_item_price_source() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER snapshot_transaction_item_price_source BEFORE INSERT ON public.transaction_items
FOR EACH ROW EXECUTE FUNCTION public.snapshot_transaction_item_price_source();

ALTER TABLE public.assembly_items
  ADD COLUMN unit_cost_source text NOT NULL DEFAULT 'legacy_snapshot',
  ADD COLUMN unit_cost_source_updated_at timestamptz,
  ADD COLUMN unit_cost_snapshotted_at timestamptz NOT NULL DEFAULT clock_timestamp();

CREATE FUNCTION public.snapshot_assembly_item_price_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source public.items;
BEGIN
 IF NEW.item_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO source FROM public.items WHERE id=NEW.item_id;
 IF source.id IS NOT NULL THEN
  NEW.unit_cost_source:=source.effective_price_source;
  NEW.unit_cost_source_updated_at:=CASE source.effective_price_source
   WHEN 'inventory_explicit' THEN source.inventory_price_updated_at
   WHEN 'estimating_master' THEN source.estimating_price_updated_at ELSE NULL END;
  NEW.unit_cost_snapshotted_at:=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.snapshot_assembly_item_price_source() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER snapshot_assembly_item_price_source BEFORE INSERT OR UPDATE OF item_id,unit_cost_snapshot ON public.assembly_items
FOR EACH ROW EXECUTE FUNCTION public.snapshot_assembly_item_price_source();

CREATE FUNCTION public.set_inventory_item_price(p_item_id uuid,p_price numeric,p_reason text)
RETURNS public.items LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.items; decision jsonb; previous text:=current_setting('northgate.inventory_price_write',true);
BEGIN
 IF p_price IS NULL OR p_price<0 OR p_price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Enter a valid nonnegative inventory price'; END IF;
 IF NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A shared-price change reason is required'; END IF;
 decision:=public.current_scoped_authorization_decision('V3-013','{}'::jsonb);
 IF COALESCE((decision->>'allowed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION '%',COALESCE(decision->>'denial_reason','Inventory price approval permission required') USING ERRCODE='42501'; END IF;
 SELECT * INTO target FROM public.items WHERE id=p_item_id AND is_active AND NOT is_archived FOR UPDATE;
 IF target.id IS NULL THEN RAISE EXCEPTION 'Active material not found'; END IF;
 PERFORM set_config('northgate.inventory_price_write','yes',true);
 PERFORM set_config('northgate.price_reason',btrim(p_reason),true);
 UPDATE public.items SET inventory_price_per_unit=p_price WHERE id=p_item_id RETURNING * INTO target;
 PERFORM set_config('northgate.inventory_price_write',COALESCE(previous,''),true);
 RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.set_inventory_item_price(uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_item_price(uuid,numeric,text) TO authenticated;

CREATE FUNCTION public.clear_inventory_item_price(p_item_id uuid,p_reason text)
RETURNS public.items LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.items; decision jsonb; previous text:=current_setting('northgate.inventory_price_write',true);
BEGIN
 IF NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A shared-price change reason is required'; END IF;
 decision:=public.current_scoped_authorization_decision('V3-013','{}'::jsonb);
 IF COALESCE((decision->>'allowed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION '%',COALESCE(decision->>'denial_reason','Inventory price approval permission required') USING ERRCODE='42501'; END IF;
 SELECT * INTO target FROM public.items WHERE id=p_item_id AND is_active AND NOT is_archived FOR UPDATE;
 IF target.id IS NULL THEN RAISE EXCEPTION 'Active material not found'; END IF;
 PERFORM set_config('northgate.inventory_price_write','yes',true);
 PERFORM set_config('northgate.price_reason',btrim(p_reason),true);
 UPDATE public.items SET inventory_price_per_unit=NULL WHERE id=p_item_id RETURNING * INTO target;
 PERFORM set_config('northgate.inventory_price_write',COALESCE(previous,''),true);
 RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.clear_inventory_item_price(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clear_inventory_item_price(uuid,text) TO authenticated;
