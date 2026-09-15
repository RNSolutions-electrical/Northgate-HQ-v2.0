-- Phase 1 only. Additive catalogue / inventory foundation; no balance backfill.
CREATE TABLE public.item_aliases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 item_id uuid NOT NULL REFERENCES public.items(id),
 alias text NOT NULL CHECK (length(btrim(alias)) BETWEEN 1 AND 160),
 alias_key text GENERATED ALWAYS AS (lower(regexp_replace(btrim(alias), '\s+', ' ', 'g'))) STORED,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by text NOT NULL REFERENCES public.user_permissions(clerk_user_id),
 archived_at timestamptz,
 archived_by text REFERENCES public.user_permissions(clerk_user_id),
 archive_reason text,
 UNIQUE(item_id,alias_key)
);
CREATE INDEX item_aliases_lookup ON public.item_aliases(alias_key) WHERE archived_at IS NULL;
ALTER TABLE public.item_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.item_aliases FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.item_aliases TO authenticated;
CREATE POLICY item_aliases_catalog_read ON public.item_aliases FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_id AND
 (public.current_user_can_read_catalog(i.division) OR public.current_user_can_edit_division(i.division,'can_edit_catalog'))));

-- Controlled RPC: existing catalogue edit authorization; mutation and audit are atomic.
CREATE FUNCTION public.save_material_alias(p_item_id uuid,p_alias text,p_archived boolean,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE actor public.user_permissions; material public.items; existing public.item_aliases; saved public.item_aliases;
 clean text:=regexp_replace(btrim(p_alias),'\s+',' ','g');
BEGIN
 SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active;
 SELECT * INTO material FROM public.items WHERE id=p_item_id FOR UPDATE;
 IF actor.clerk_user_id IS NULL OR material.id IS NULL OR material.is_active IS NOT TRUE OR material.is_archived IS NOT FALSE
 OR public.current_user_can_edit_division(material.division,'can_edit_catalog') IS NOT TRUE THEN
  RAISE EXCEPTION 'Active material and catalogue edit permission are required' USING ERRCODE='42501';
 END IF;
 IF clean IS NULL OR length(clean) NOT BETWEEN 1 AND 160 OR p_archived IS NULL OR coalesce(btrim(p_reason),'')='' THEN
  RAISE EXCEPTION 'Enter an alias (1–160 characters) and a valid reason' USING ERRCODE='22023';
 END IF;
 SELECT * INTO existing FROM public.item_aliases WHERE item_id=p_item_id AND alias_key=lower(clean) FOR UPDATE;
 IF existing.id IS NOT NULL AND (existing.archived_at IS NOT NULL)=p_archived THEN RETURN to_jsonb(existing); END IF;
 IF existing.id IS NULL THEN
  IF p_archived THEN RAISE EXCEPTION 'Alias not found'; END IF;
  INSERT INTO public.item_aliases(item_id,alias,created_by) VALUES(p_item_id,clean,actor.clerk_user_id) RETURNING * INTO saved;
 ELSE
  UPDATE public.item_aliases SET archived_at=CASE WHEN p_archived THEN clock_timestamp() END,
   archived_by=CASE WHEN p_archived THEN actor.clerk_user_id END,archive_reason=CASE WHEN p_archived THEN btrim(p_reason) END
   WHERE id=existing.id RETURNING * INTO saved;
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.clerk_user_id),'item_aliases',saved.id::text,
 CASE WHEN existing.id IS NULL THEN 'create' WHEN p_archived THEN 'archive' ELSE 'restore' END,
 CASE WHEN existing.id IS NULL THEN NULL ELSE to_jsonb(existing) END,to_jsonb(saved),btrim(p_reason));
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.save_material_alias(uuid,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_material_alias(uuid,text,boolean,text) TO authenticated;

ALTER TABLE public.storage_units ADD COLUMN archived_at timestamptz, ADD COLUMN archived_by text REFERENCES public.user_permissions(clerk_user_id), ADD COLUMN archive_reason text;
ALTER TABLE public.shelves ADD COLUMN archived_at timestamptz, ADD COLUMN archived_by text REFERENCES public.user_permissions(clerk_user_id), ADD COLUMN archive_reason text;
ALTER TABLE public.bays ADD COLUMN archived_at timestamptz, ADD COLUMN archived_by text REFERENCES public.user_permissions(clerk_user_id), ADD COLUMN archive_reason text;
ALTER TABLE public.bins ADD COLUMN archived_at timestamptz, ADD COLUMN archived_by text REFERENCES public.user_permissions(clerk_user_id), ADD COLUMN archive_reason text;
ALTER TABLE public.storage_units ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE public.shelves ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE public.bays ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE public.bins ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);

-- Serialize active-child creation/restoration against parent archiving. Trigger also
-- covers the existing create/intake/restore RPCs without changing their contracts.
CREATE FUNCTION public.guard_inventory_location_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parent_table text; parent_id uuid; parent_archived timestamptz; parent_found boolean;
BEGIN
 IF NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;
 CASE TG_TABLE_NAME
 WHEN 'shelves' THEN parent_table:='storage_units';parent_id:=NEW.unit_id;
 WHEN 'bays' THEN parent_table:='shelves';parent_id:=NEW.shelf_id;
 WHEN 'bins' THEN parent_table:='bays';parent_id:=NEW.bay_id;
 WHEN 'bin_items' THEN parent_table:='bins';parent_id:=NEW.bin_id;
 ELSE RAISE EXCEPTION 'Unsupported inventory relationship';
 END CASE;
 EXECUTE format('SELECT archived_at,true FROM public.%I WHERE id=$1 FOR SHARE',parent_table)
 INTO parent_archived,parent_found USING parent_id;
 IF parent_found IS NOT TRUE OR parent_archived IS NOT NULL THEN
  RAISE EXCEPTION 'Parent location is archived or unavailable. Choose an active location.' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_inventory_location_parent() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_inventory_location_parent BEFORE INSERT OR UPDATE ON public.shelves FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_location_parent();
CREATE TRIGGER guard_inventory_location_parent BEFORE INSERT OR UPDATE ON public.bays FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_location_parent();
CREATE TRIGGER guard_inventory_location_parent BEFORE INSERT OR UPDATE ON public.bins FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_location_parent();
CREATE TRIGGER guard_inventory_location_parent BEFORE INSERT OR UPDATE ON public.bin_items FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_location_parent();

CREATE FUNCTION public.set_inventory_location_archived(p_kind text,p_id uuid,p_archived boolean,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.user_permissions; target_table text; child_table text; child_fk text; dept text;
 before_row jsonb; after_row jsonb; has_children boolean;
BEGIN
 SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active;
 IF p_archived IS NULL OR coalesce(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'A valid archive/restore reason is required' USING ERRCODE='22023'; END IF;
 CASE p_kind
 WHEN 'unit' THEN target_table:='storage_units';child_table:='shelves';child_fk:='unit_id';
 WHEN 'shelf' THEN target_table:='shelves';child_table:='bays';child_fk:='shelf_id';
 WHEN 'bay' THEN target_table:='bays';child_table:='bins';child_fk:='bay_id';
 WHEN 'bin' THEN target_table:='bins';child_table:='bin_items';child_fk:='bin_id';
 ELSE RAISE EXCEPTION 'Choose a valid location type'; END CASE;
 -- Serialize lifecycle actions; parent-share locks in creation/mapping prevent races.
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location-lifecycle',0));
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',target_table) INTO before_row USING p_id;
 CASE p_kind
 WHEN 'unit' THEN dept:=before_row->>'division';
 WHEN 'shelf' THEN SELECT u.division INTO dept FROM public.shelves s JOIN public.storage_units u ON u.id=s.unit_id WHERE s.id=p_id;
 WHEN 'bay' THEN SELECT u.division INTO dept FROM public.bays b JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id WHERE b.id=p_id;
 WHEN 'bin' THEN SELECT u.division INTO dept FROM public.bins n JOIN public.bays b ON b.id=n.bay_id JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id WHERE n.id=p_id;
 END CASE;
 IF actor.clerk_user_id IS NULL OR before_row IS NULL
 OR public.current_user_can_edit_division(dept,'can_manage_inventory') IS NOT TRUE
 OR public.current_user_can_edit_division(dept,'can_archive_records') IS NOT TRUE THEN
  RAISE EXCEPTION 'Inventory management and archive permission for this department are required' USING ERRCODE='42501';
 END IF;
 IF (before_row->>'archived_at' IS NOT NULL)=p_archived THEN RETURN before_row; END IF;
 IF p_archived THEN
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE %I=$1 AND archived_at IS NULL)',child_table,child_fk) INTO has_children USING p_id;
  IF has_children THEN
   RAISE EXCEPTION 'Location has active child locations or material links. Resolve those explicitly before archiving.' USING ERRCODE='22023';
  END IF;
  IF p_kind='bin' AND EXISTS(SELECT 1 FROM public.bin_items bi JOIN public.inventory_balances ib ON ib.bin_item_id=bi.id WHERE bi.bin_id=p_id AND ib.quantity<>0) THEN
   RAISE EXCEPTION 'This location still has a nonzero inventory balance. Reconcile the stock before archiving.' USING ERRCODE='22023';
  END IF;
 END IF;
 EXECUTE format('UPDATE public.%I SET archived_at=$2,archived_by=$3,archive_reason=$4,revision=revision+1 WHERE id=$1 RETURNING to_jsonb(%I)',target_table,target_table)
 INTO after_row USING p_id,CASE WHEN p_archived THEN clock_timestamp() END,
 CASE WHEN p_archived THEN actor.clerk_user_id END,CASE WHEN p_archived THEN btrim(p_reason) END;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.clerk_user_id),target_table,p_id::text,
 CASE WHEN p_archived THEN 'archive' ELSE 'restore' END,before_row,after_row,btrim(p_reason));
 RETURN after_row;
END $$;
REVOKE ALL ON FUNCTION public.set_inventory_location_archived(text,uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_location_archived(text,uuid,boolean,text) TO authenticated;

CREATE FUNCTION public.edit_inventory_location(p_kind text,p_id uuid,p_code text,p_label text,p_position integer,p_expected_revision integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.user_permissions; target_table text; code_field text; label_field text; parent_field text;
 dept text; parent_id uuid; before_row jsonb; after_row jsonb; duplicate boolean; clean_code text:=upper(btrim(p_code));
BEGIN
 SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active;
 CASE p_kind
 WHEN 'unit' THEN target_table:='storage_units';code_field:='unit_code';label_field:='name';
 WHEN 'shelf' THEN target_table:='shelves';code_field:='shelf_code';label_field:='label';parent_field:='unit_id';
 WHEN 'bay' THEN target_table:='bays';code_field:='bay_code';label_field:='label';parent_field:='shelf_id';
 WHEN 'bin' THEN target_table:='bins';code_field:='bin_code';label_field:='label';parent_field:='bay_id';
 ELSE RAISE EXCEPTION 'Choose a valid location type'; END CASE;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',target_table) INTO before_row USING p_id;
 CASE p_kind
 WHEN 'unit' THEN dept:=before_row->>'division';
 WHEN 'shelf' THEN SELECT u.division INTO dept FROM public.shelves s JOIN public.storage_units u ON u.id=s.unit_id WHERE s.id=p_id;
 WHEN 'bay' THEN SELECT u.division INTO dept FROM public.bays b JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id WHERE b.id=p_id;
 WHEN 'bin' THEN SELECT u.division INTO dept FROM public.bins n JOIN public.bays b ON b.id=n.bay_id JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id WHERE n.id=p_id;
 END CASE;
 IF actor.clerk_user_id IS NULL OR before_row IS NULL OR public.current_user_can_edit_division(dept,'can_manage_inventory') IS NOT TRUE THEN
  RAISE EXCEPTION 'Inventory management permission for this department is required' USING ERRCODE='42501'; END IF;
 IF before_row->>'archived_at' IS NOT NULL THEN RAISE EXCEPTION 'Restore this location before editing it'; END IF;
 IF p_expected_revision IS DISTINCT FROM (before_row->>'revision')::integer THEN
  RAISE EXCEPTION 'Location changed. Refresh and review the latest version before saving.' USING ERRCODE='40001'; END IF;
 IF clean_code IS NULL OR clean_code !~ '^[A-Z0-9][A-Z0-9._/-]{0,59}$'
 OR coalesce(length(btrim(p_label)),0) NOT BETWEEN 1 AND 160 OR p_position IS NULL OR p_position<0 OR coalesce(btrim(p_reason),'')='' THEN
  RAISE EXCEPTION 'Enter a valid code, name, nonnegative sort position, and reason' USING ERRCODE='22023'; END IF;
 IF parent_field IS NOT NULL THEN parent_id:=(before_row->>parent_field)::uuid; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location:'||p_kind||':'||coalesce(parent_id::text,'root')||':'||clean_code,0));
 IF parent_field IS NULL THEN
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id<>$1 AND upper(btrim(%I))=$2)',target_table,code_field) INTO duplicate USING p_id,clean_code;
 ELSE
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id<>$1 AND upper(btrim(%I))=$2 AND %I=$3)',target_table,code_field,parent_field) INTO duplicate USING p_id,clean_code,parent_id;
 END IF;
 IF duplicate THEN RAISE EXCEPTION 'This code already exists at this level. Choose another code.' USING ERRCODE='23505'; END IF;
 IF parent_field IS NULL THEN
  EXECUTE format('UPDATE public.%I SET %I=$2,%I=$3,revision=revision+1 WHERE id=$1 RETURNING to_jsonb(%I)',target_table,code_field,label_field,target_table)
   INTO after_row USING p_id,clean_code,btrim(p_label);
 ELSE
  EXECUTE format('UPDATE public.%I SET %I=$2,%I=$3,position=$4,revision=revision+1 WHERE id=$1 RETURNING to_jsonb(%I)',target_table,code_field,label_field,target_table)
   INTO after_row USING p_id,clean_code,btrim(p_label),p_position;
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.clerk_user_id),target_table,p_id::text,'update',before_row,after_row,btrim(p_reason));
 RETURN after_row;
END $$;
REVOKE ALL ON FUNCTION public.edit_inventory_location(text,uuid,text,text,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_inventory_location(text,uuid,text,text,integer,integer,text) TO authenticated;

CREATE FUNCTION public.map_material_to_inventory_bin(p_bin_id uuid,p_item_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.user_permissions; dept text; material public.items; binding public.bin_items; existing boolean;
BEGIN
 SELECT * INTO actor FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active;
 -- Same bin+item lock as intake to serialize retries and concurrent first counts.
 PERFORM pg_advisory_xact_lock(hashtext(p_bin_id::text||':'||p_item_id::text));
 SELECT u.division INTO dept FROM public.bins n JOIN public.bays b ON b.id=n.bay_id
 JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id
 WHERE n.id=p_bin_id AND n.archived_at IS NULL AND b.archived_at IS NULL AND s.archived_at IS NULL AND u.archived_at IS NULL FOR SHARE OF n;
 SELECT * INTO material FROM public.items WHERE id=p_item_id AND is_active AND NOT is_archived FOR SHARE;
 IF actor.clerk_user_id IS NULL OR dept IS NULL OR material.id IS NULL
 OR public.current_user_can_edit_division(dept,'can_manage_inventory') IS NOT TRUE
 OR public.current_user_can_read_catalog(material.division) IS NOT TRUE THEN
  RAISE EXCEPTION 'Choose an active material and a location within your inventory permissions' USING ERRCODE='42501';
 END IF;
 IF coalesce(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'A mapping reason is required' USING ERRCODE='22023'; END IF;
 SELECT * INTO binding FROM public.bin_items WHERE bin_id=p_bin_id AND item_id=p_item_id FOR UPDATE;
 IF binding.id IS NOT NULL THEN
  IF binding.archived_at IS NOT NULL THEN RAISE EXCEPTION 'This material link is retired. Ask a Developer to review its history; mapping cannot silently reactivate it.'; END IF;
  RETURN jsonb_build_object('bin_item_id',binding.id,'created',false);
 END IF;
 INSERT INTO public.bin_items(bin_id,item_id,min_quantity) VALUES(p_bin_id,p_item_id,0) RETURNING * INTO binding;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
 VALUES(actor.clerk_user_id,coalesce(actor.display_name,actor.clerk_user_id),'bin_items',binding.id::text,'create',
 to_jsonb(binding)||jsonb_build_object('workflow','location_mapping','quantity_recorded',false),btrim(p_reason));
 -- Deliberately no inventory balance / transaction write. Unknown is not zero.
 RETURN jsonb_build_object('bin_item_id',binding.id,'created',true);
END $$;
REVOKE ALL ON FUNCTION public.map_material_to_inventory_bin(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.map_material_to_inventory_bin(uuid,uuid,text) TO authenticated;

-- Close the race where an older count request passed its preflight just before
-- a link was retired / location archived. Existing RPC permissions still apply.
CREATE FUNCTION public.guard_active_inventory_posting() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.bin_item_id IS NULL THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.bin_items bi JOIN public.bins n ON n.id=bi.bin_id
 JOIN public.bays b ON b.id=n.bay_id JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id
 WHERE bi.id=NEW.bin_item_id AND bi.archived_at IS NULL AND n.archived_at IS NULL
 AND b.archived_at IS NULL AND s.archived_at IS NULL AND u.archived_at IS NULL FOR SHARE OF bi,n;
 IF NOT FOUND THEN RAISE EXCEPTION 'Material link or storage location is archived. Refresh before recording inventory.' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_active_inventory_posting() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_active_inventory_posting BEFORE INSERT ON public.transaction_items FOR EACH ROW EXECUTE FUNCTION public.guard_active_inventory_posting();

-- Retain legacy prev_balance for existing audit consumers; additionally record
-- whether it was known, its nullable observed value, and the unit at count time.
-- Existing historical rows are untouched.
CREATE OR REPLACE FUNCTION public.audit_physical_count_correction() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE prev_balance numeric;
BEGIN
 IF NEW.transaction_type='physical_count_correction' THEN
  SELECT quantity INTO prev_balance FROM public.inventory_balances WHERE bin_item_id=NEW.bin_item_id;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note,created_at)
  VALUES((SELECT user_id FROM public.inventory_transactions WHERE id=NEW.transaction_id),
   (SELECT performed_by_name FROM public.inventory_transactions WHERE id=NEW.transaction_id),
   'transaction_items',NEW.id::text,'physical_count_correction',
   jsonb_build_object('bin_item_id',NEW.bin_item_id,'prev_balance',coalesce(prev_balance,0),
     'previous_quantity_recorded',prev_balance IS NOT NULL,'previous_observed_quantity',prev_balance),
   jsonb_build_object('bin_item_id',NEW.bin_item_id,'target_quantity',NEW.target_quantity,'note',NEW.note,
     'unit_of_measure',(SELECT unit_of_measure FROM public.items WHERE id=NEW.item_id)),
   coalesce(NEW.note,'Physical count correction'),now());
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_physical_count_correction() FROM PUBLIC,anon,authenticated;

-- Keep the legacy column contract (including zero-coalesced quantity) for callers.
-- New clients use quantity_recorded to distinguish an uncounted mapping from zero.
CREATE OR REPLACE VIEW public.inventory_cart_candidates_view AS
WITH viewer AS (
 SELECT up.division,public.effective_permissions_for_user(up.role,up.division,up.permission_overrides) AS effective_permissions
 FROM public.user_permissions up WHERE up.clerk_user_id=auth.jwt()->>'sub' AND up.is_active=true LIMIT 1
)
SELECT bi.id AS bin_item_id,bi.item_id,b.id AS bin_id,b.bin_code,b.label AS bin_label,
 i.material_code,i.name AS item_name,i.unit_of_measure,i.division,i.price_per_unit,
 coalesce(ib.quantity,0::numeric) AS quantity_on_hand,bi.min_quantity,bi.created_at,
 (ib.bin_item_id IS NOT NULL) AS quantity_recorded
FROM public.bin_items bi JOIN public.items i ON i.id=bi.item_id JOIN public.bins b ON b.id=bi.bin_id
JOIN public.bays ba ON ba.id=b.bay_id JOIN public.shelves s ON s.id=ba.shelf_id JOIN public.storage_units u ON u.id=s.unit_id
LEFT JOIN public.inventory_balances ib ON ib.bin_item_id=bi.id CROSS JOIN viewer v
WHERE bi.archived_at IS NULL AND i.is_active=true AND i.is_archived=false
AND b.archived_at IS NULL AND ba.archived_at IS NULL AND s.archived_at IS NULL AND u.archived_at IS NULL
AND (coalesce((v.effective_permissions->>'can_view_all_divisions')::boolean,false) IS TRUE
 OR (v.division=ANY(ARRAY['Electrical','Construction','Admin']) AND i.division=v.division));
-- Preserve existing view authorization predicate; no broadened data-access scope.
NOTIFY pgrst,'reload schema';
