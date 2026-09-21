-- Full catalogue editor and a separate, exact-payload v5 stock review destination.
-- Local implementation only. Production application requires separate approval.
ALTER TABLE public.items
 ADD COLUMN vendor_prices jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(vendor_prices)='array'),
 ADD COLUMN neca_labor_input jsonb CHECK(neca_labor_input IS NULL OR jsonb_typeof(neca_labor_input)='object'),
 ADD COLUMN catalogue_notes text NOT NULL DEFAULT '' CHECK(length(catalogue_notes)<=10000);

-- Named additional permissions use the existing template/override store; no role
-- promotion, automatic grants, or parallel grant store is introduced.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.default_permissions_for_role(text)'::regprocedure) INTO definition;
 EXECUTE replace(definition,'public.default_permissions_for_role','public.default_permissions_before_catalogue_review');
END $$;
REVOKE ALL ON FUNCTION public.default_permissions_before_catalogue_review(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.default_permissions_before_catalogue_review(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.default_permissions_for_role(p_role text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT public.default_permissions_before_catalogue_review(p_role)
  || '{"can_inventory_manager":false,"can_inventory_administrator":false}'::jsonb
$$;
REVOKE ALL ON FUNCTION public.default_permissions_for_role(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.default_permissions_for_role(text) TO authenticated;
DO $$ DECLARE rule text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO rule FROM pg_constraint
 WHERE conrelid='public.user_permission_overrides'::regclass AND conname='user_permission_overrides_permission_flag_check';
 IF rule IS NULL THEN RAISE EXCEPTION 'Expected permission constraint missing'; END IF;
 ALTER TABLE public.user_permission_overrides DROP CONSTRAINT user_permission_overrides_permission_flag_check;
 EXECUTE 'ALTER TABLE public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_permission_flag_check CHECK (('||rule||') OR permission_flag IN (''can_inventory_manager'',''can_inventory_administrator''))';
END $$;

CREATE FUNCTION public.can_review_material_stock(p_division text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.authorization_actions WHERE action_id='CAT-STOCK-REVIEW' AND is_active) AND EXISTS(SELECT 1 FROM public.user_permissions u WHERE u.clerk_user_id=auth.jwt()->>'sub' AND u.is_active
 AND (public.current_user_has_developer_access() OR (u.division=p_division AND (
 coalesce((public.effective_permissions_for_user(u.role,u.division,u.permission_overrides)->>'can_inventory_manager')::boolean,false)
 OR coalesce((public.effective_permissions_for_user(u.role,u.division,u.permission_overrides)->>'can_inventory_administrator')::boolean,false)))))
$$;
REVOKE ALL ON FUNCTION public.can_review_material_stock(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_review_material_stock(text) TO authenticated;

INSERT INTO public.authorization_actions(action_id,action_key,module,description,minimum_business_role,required_permission,capability,scope_rule,specification_status)
VALUES('CAT-STOCK-REVIEW','catalogue.stock.review','Inventory','Review catalogue stock observations and confirm on-hand inventory',NULL,NULL,'CAN_APPROVE','CATALOGUE_STOCK_DEPARTMENT','CONFIRMED');
-- Extend the current evaluator in place so existing dependent functions retain
-- their OID and all existing action behavior. Only the new action is intercepted.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.current_scoped_authorization_decision(text,jsonb)'::regprocedure) INTO definition;
 definition:=regexp_replace(definition,E'BEGIN\n',E'BEGIN\n  IF p_action_id = ''CAT-STOCK-REVIEW'' THEN\n    RETURN jsonb_build_object(''allowed'', public.can_review_material_stock(p_context->>''division'') AND EXISTS(SELECT 1 FROM public.authorization_actions WHERE action_id=p_action_id AND is_active), ''action_id'', p_action_id, ''scope_rule'', ''CATALOGUE_STOCK_DEPARTMENT'');\n  END IF;\n');
 IF position('CAT-STOCK-REVIEW' in definition)=0 THEN RAISE EXCEPTION 'Authorization evaluator shape changed; reconcile before applying'; END IF;
 EXECUTE definition;
END $$;

CREATE FUNCTION public.catalogue_nonnegative(p_value text,p_label text,p_optional boolean DEFAULT false)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE value numeric;
BEGIN
 IF nullif(btrim(p_value),'') IS NULL THEN
  IF p_optional THEN RETURN NULL; END IF;
  RAISE EXCEPTION '% is required',p_label USING ERRCODE='22023';
 END IF;
 value:=p_value::numeric;
 IF value<0 OR value::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION '% must be finite and nonnegative',p_label USING ERRCODE='22023'; END IF;
 RETURN value;
END $$;
CREATE FUNCTION public.catalogue_vendor_average(p_quotes jsonb) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE quote jsonb;amount numeric;quantity numeric;total numeric:=0;n integer:=0;vendors text[]:='{}';vendor_key text;
BEGIN
 IF p_quotes IS NULL OR jsonb_typeof(p_quotes)<>'array' OR jsonb_array_length(p_quotes)>100 THEN RAISE EXCEPTION 'Supply up to 100 vendor quotes'; END IF;
 FOR quote IN SELECT value FROM jsonb_array_elements(p_quotes) LOOP
  vendor_key:=lower(btrim(quote->>'vendor'));
  IF jsonb_typeof(quote)<>'object' OR coalesce(length(vendor_key),0) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Each quote needs a vendor name'; END IF;
  IF vendor_key=ANY(vendors) THEN RAISE EXCEPTION 'Use one current quote per vendor'; END IF;
  vendors:=array_append(vendors,vendor_key);
  IF coalesce(length(quote->>'url'),0)>2000 OR (coalesce(quote->>'url','')<>'' AND (quote->>'url') !~* '^https?://[^[:space:]]+$') THEN RAISE EXCEPTION 'Vendor links must use HTTP or HTTPS'; END IF;
  amount:=public.catalogue_nonnegative(quote->>'price','Vendor price');
  quantity:=public.catalogue_nonnegative(quote->>'quantity','Vendor pricing quantity');
  IF quantity=0 THEN RAISE EXCEPTION 'Vendor pricing quantity must be positive'; END IF;
  total:=total+amount/quantity;n:=n+1;
 END LOOP;
 RETURN CASE WHEN n=0 THEN NULL ELSE total/n END;
END $$;
CREATE FUNCTION public.catalogue_labor_hours(p_input jsonb,p_unit text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE hours numeric;per numeric;factor numeric;
BEGIN
 IF p_input IS NULL OR p_input='null'::jsonb THEN RETURN NULL; END IF;
 IF jsonb_typeof(p_input)<>'object' THEN RAISE EXCEPTION 'Labor input must be an object'; END IF;
 hours:=public.catalogue_nonnegative(p_input->>'hours','Labor hours',true);
 IF hours IS NULL THEN RETURN NULL; END IF;
 per:=public.catalogue_nonnegative(p_input->>'per','Labor basis quantity');
 factor:=public.catalogue_nonnegative(p_input->>'units_per_catalogue_unit','Labor conversion');
 IF per=0 OR factor=0 OR coalesce(length(btrim(p_input->>'unit')),0) NOT BETWEEN 1 AND 30 OR coalesce(length(p_input->>'reference'),0)>500 THEN RAISE EXCEPTION 'Enter a labor unit and positive conversion quantities'; END IF;
 IF upper(btrim(p_input->>'unit'))=upper(btrim(p_unit)) AND factor<>1 THEN RAISE EXCEPTION 'Matching labor and catalogue units must use conversion 1'; END IF;
 RETURN hours/per*factor;
END $$;
REVOKE ALL ON FUNCTION public.catalogue_nonnegative(text,text,boolean),public.catalogue_vendor_average(jsonb),public.catalogue_labor_hours(jsonb,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_full_catalogue_details() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE average numeric;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.vendor_prices IS DISTINCT FROM OLD.vendor_prices OR NEW.neca_labor_input IS DISTINCT FROM OLD.neca_labor_input OR NEW.catalogue_notes IS DISTINCT FROM OLD.catalogue_notes)
 AND public.current_user_can_edit_division(OLD.division,'can_edit_catalog') IS NOT TRUE THEN RAISE EXCEPTION 'Catalogue edit permission required' USING ERRCODE='42501'; END IF;
 average:=public.catalogue_vendor_average(NEW.vendor_prices);
 IF average IS NOT NULL THEN
  NEW.estimating_price_per_unit:=average;
  NEW.price_per_unit:=coalesce(NEW.inventory_price_per_unit,average);
  NEW.price_confirmed:=true;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.vendor_prices IS DISTINCT FROM OLD.vendor_prices OR NEW.neca_labor_input IS DISTINCT FROM OLD.neca_labor_input OR NEW.catalogue_notes IS DISTINCT FROM OLD.catalogue_notes) THEN NEW.updated_at:=clock_timestamp(); END IF;
 IF TG_OP='UPDATE' AND NEW.neca_labor_input IS NOT DISTINCT FROM OLD.neca_labor_input AND NEW.labor_rate_hrs IS DISTINCT FROM OLD.labor_rate_hrs THEN
  -- Older authorized labor-edit workflows cannot leave an obsolete source rate.
  NEW.neca_labor_input:=NULL;
 ELSIF NEW.neca_labor_input IS NOT NULL THEN
  NEW.labor_rate_hrs:=public.catalogue_labor_hours(NEW.neca_labor_input,NEW.unit_of_measure);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_full_catalogue_details() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a_full_catalogue_details BEFORE INSERT OR UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.guard_full_catalogue_details();

CREATE TABLE public.material_catalogue_save_requests(
 actor text NOT NULL REFERENCES public.user_permissions(clerk_user_id),request_id uuid NOT NULL,
 payload_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor,request_id));
ALTER TABLE public.material_catalogue_save_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.material_catalogue_save_requests FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.save_full_material_catalogue(p_request_id uuid,p_item_id uuid,p_division text,p_values jsonb,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=auth.jwt()->>'sub';previous public.items;saved public.items;prior public.material_catalogue_save_requests;
 request_hash text;code text;price numeric;hours numeric;alias text;aliases jsonb;stock jsonb;payload jsonb;copy jsonb;submission jsonb;result jsonb;
 stock_requested boolean;destination_id uuid;previous_stock_context text:=current_setting('northgate.catalogue_stock_item',true);
BEGIN
 IF actor IS NULL OR p_request_id IS NULL OR p_item_id IS NULL OR p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR pg_column_size(p_values)>262144 THEN RAISE EXCEPTION 'Authenticated user, request ID, item ID and bounded material details required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('catalogue-save:'||actor||':'||p_request_id::text,0));
 request_hash:=public.v5_payload_hash(jsonb_build_object('item',p_item_id,'division',p_division,'values',p_values,'version',p_expected_updated_at));
 SELECT * INTO prior FROM public.material_catalogue_save_requests WHERE material_catalogue_save_requests.actor=(auth.jwt()->>'sub') AND request_id=p_request_id;
 IF prior.request_id IS NOT NULL THEN
  IF prior.payload_hash<>request_hash THEN RAISE EXCEPTION 'Request ID already used for different material details'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=actor AND is_active) THEN RAISE EXCEPTION 'Active user required'; END IF;
  RETURN prior.result;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_item_id::text,0));
 SELECT * INTO previous FROM public.items WHERE id=p_item_id FOR UPDATE;
 IF public.current_user_can_edit_division(coalesce(previous.division,p_division),'can_edit_catalog') IS NOT TRUE THEN RAISE EXCEPTION 'Catalogue edit permission required' USING ERRCODE='42501'; END IF;
 IF previous.id IS NOT NULL AND (NOT previous.is_active OR previous.is_archived) THEN RAISE EXCEPTION 'Restore the material before editing'; END IF;
 IF previous.id IS NOT NULL AND previous.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Material changed. Reload before saving' USING ERRCODE='40001'; END IF;
 IF previous.id IS NULL AND p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Material no longer exists'; END IF;
 IF coalesce(length(btrim(p_values->>'name')),0) NOT BETWEEN 1 AND 500 OR coalesce(length(btrim(p_values->>'unit')),0) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Description and catalogue unit are required'; END IF;
 IF previous.id IS NOT NULL AND previous.unit_of_measure IS DISTINCT FROM btrim(p_values->>'unit') THEN RAISE EXCEPTION 'Existing material units cannot be changed through catalogue editing'; END IF;
 price:=public.catalogue_vendor_average(p_values->'vendor_prices');
 IF price IS NULL THEN price:=public.catalogue_nonnegative(p_values->>'price','Average material price',true); END IF;
 hours:=public.catalogue_labor_hours(p_values->'neca_labor',p_values->>'unit');
 aliases:=p_values->'aliases';
 IF aliases IS NULL OR jsonb_typeof(aliases)<>'array' OR jsonb_array_length(aliases)>100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(aliases) a WHERE jsonb_typeof(a)<>'string' OR length(btrim(a#>>'{}')) NOT BETWEEN 1 AND 160) THEN RAISE EXCEPTION 'Supply up to 100 aliases of 1 to 160 characters'; END IF;
 code:=coalesce(nullif(btrim(p_values->>'material_code'),''),'DRAFT-'||p_item_id::text);
 IF length(code)>160 THEN RAISE EXCEPTION 'Catalogue number is too long'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('catalogue-code:'||upper(code),0));
 IF EXISTS(SELECT 1 FROM public.items WHERE upper(btrim(material_code))=upper(code) AND id<>p_item_id) THEN RAISE EXCEPTION 'Catalogue number already exists'; END IF;
 IF previous.id IS NULL THEN
  INSERT INTO public.items(id,material_code,name,division,unit_of_measure,price_per_unit,price_confirmed,estimating_price_per_unit,labor_rate_hrs,labor_value_source,catalogue_draft,vendor_prices,neca_labor_input,catalogue_notes)
  VALUES(p_item_id,code,btrim(p_values->>'name'),p_division,btrim(p_values->>'unit'),coalesce(price,0),price IS NOT NULL,price,hours,CASE WHEN hours IS NULL THEN 'unverified' ELSE 'internal' END,nullif(btrim(p_values->>'material_code'),'') IS NULL,p_values->'vendor_prices',nullif(p_values->'neca_labor','null'::jsonb),coalesce(p_values->>'catalogue_notes','')) RETURNING * INTO saved;
 ELSE
  UPDATE public.items SET material_code=code,name=btrim(p_values->>'name'),estimating_price_per_unit=price,
   labor_rate_hrs=hours,neca_labor_input=nullif(p_values->'neca_labor','null'::jsonb),vendor_prices=p_values->'vendor_prices',
   catalogue_notes=coalesce(p_values->>'catalogue_notes',''),catalogue_draft=nullif(btrim(p_values->>'material_code'),'') IS NULL,updated_at=clock_timestamp()
  WHERE id=p_item_id RETURNING * INTO saved;
 END IF;
 FOR alias IN SELECT a.alias FROM public.item_aliases a WHERE a.item_id=p_item_id AND a.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(aliases) x WHERE lower(regexp_replace(btrim(x),'\s+',' ','g'))=a.alias_key) LOOP
  PERFORM public.save_material_alias(p_item_id,alias,true,'Alias removed in catalogue editor');
 END LOOP;
 FOR alias IN SELECT value FROM jsonb_array_elements_text(aliases) LOOP
  PERFORM public.save_material_alias(p_item_id,alias,false,'Alias saved in catalogue editor');
 END LOOP;
 SELECT * INTO saved FROM public.items WHERE id=p_item_id;
 stock:=coalesce(p_values->'stock','{}'::jsonb);
 IF jsonb_typeof(stock)<>'object' OR EXISTS(SELECT 1 FROM jsonb_each_text(stock) s WHERE s.key IN ('storage_unit','shelf','bay','bin') AND length(s.value)>160) THEN RAISE EXCEPTION 'Invalid stock location details'; END IF;
 PERFORM public.catalogue_nonnegative(stock->>'quantity','Suggested quantity',true);
 stock_requested:=coalesce((stock->>'in_stock')::boolean,false) OR nullif(stock->>'quantity','') IS NOT NULL OR EXISTS(SELECT 1 FROM jsonb_each_text(stock) s WHERE s.key IN ('storage_unit','shelf','bay','bin') AND nullif(btrim(s.value),'') IS NOT NULL);
 IF stock_requested THEN
  payload:=jsonb_build_object('item_id',saved.id,'name',saved.name,'material_code',saved.material_code,'unit',saved.unit_of_measure,'division',saved.division,'stock',stock);
  copy:=public.save_v5_working_copy(gen_random_uuid(),NULL,NULL,'inventory','catalogue_stock',jsonb_build_object('division',saved.division),payload,'items',saved.id::text,saved.updated_at::text);
  PERFORM set_config('northgate.catalogue_stock_item',saved.id::text,true);
  submission:=public.submit_v5_working_copy(gen_random_uuid(),(copy->>'id')::uuid,(copy->>'version')::integer,
   jsonb_build_array(jsonb_build_object('destination_key','catalogue_stock','action_id','CAT-STOCK-REVIEW','context',jsonb_build_object('division',saved.division),'payload',payload,'items',jsonb_build_array(jsonb_build_object('item_key',saved.id::text,'before_value',NULL,'after_value',stock)))),'Stock observation from material catalogue');
  PERFORM set_config('northgate.catalogue_stock_item',coalesce(previous_stock_context,''),true);
  SELECT id INTO destination_id FROM public.v5_change_set_destinations WHERE change_set_id=(submission->>'id')::uuid AND destination_key='catalogue_stock';
 END IF;
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(actor,public.change_order_actor(),'items',saved.id::text,CASE WHEN previous.id IS NULL THEN 'create' ELSE 'update' END,CASE WHEN previous.id IS NULL THEN NULL ELSE to_jsonb(previous) END,to_jsonb(saved),'Full material catalogue save');
 result:=jsonb_build_object('item',to_jsonb(saved)||jsonb_build_object('item_aliases',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM public.item_aliases a WHERE a.item_id=saved.id),'[]'::jsonb)),'stock_review_id',destination_id);
 INSERT INTO public.material_catalogue_save_requests(actor,request_id,payload_hash,result) VALUES(actor,p_request_id,request_hash,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_full_material_catalogue(uuid,uuid,text,jsonb,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_full_material_catalogue(uuid,uuid,text,jsonb,timestamptz) TO authenticated;

CREATE FUNCTION public.read_catalogue_stock_reviews() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(row ORDER BY (row.status='pending') DESC,row.created_at),'[]'::jsonb) FROM (
  SELECT d.*,s.initiated_by,coalesce(u.display_name,u.email,s.initiated_by) AS submitted_by_name,
   public.can_review_material_stock(i.division) AS can_review
  FROM public.v5_change_set_destinations d JOIN public.v5_change_sets s ON s.id=d.change_set_id
  JOIN public.user_permissions u ON u.clerk_user_id=s.initiated_by
  JOIN public.items i ON i.id::text=d.proposed_payload->>'item_id'
  WHERE d.destination_key='catalogue_stock' AND d.action_id='CAT-STOCK-REVIEW'
   AND EXISTS(SELECT 1 FROM public.material_catalogue_save_requests r WHERE r.actor=s.initiated_by AND r.result->>'stock_review_id'=d.id::text)
   AND EXISTS(SELECT 1 FROM public.user_permissions me WHERE me.clerk_user_id=auth.jwt()->>'sub' AND me.is_active)
   AND (s.initiated_by=auth.jwt()->>'sub' OR public.can_review_material_stock(i.division))
  ORDER BY (d.status='pending') DESC,CASE WHEN d.status='pending' THEN d.created_at END,d.created_at DESC LIMIT 200
 ) row
$$;

CREATE FUNCTION public.read_catalogue_stock_locations(p_item_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE material public.items;result jsonb;
BEGIN
 SELECT * INTO material FROM public.items WHERE id=p_item_id AND is_active AND NOT is_archived;
 IF material.id IS NULL OR public.can_review_material_stock(material.division) IS NOT TRUE THEN RAISE EXCEPTION 'Stock review permission required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'label',concat_ws(' / ',u.unit_code,s.shelf_code,b.bay_code,n.bin_code),
  'quantity',balance.quantity,'balance_updated_at',balance.last_rebuilt,'bin_item_id',binding.id) ORDER BY u.unit_code,s.shelf_code,b.bay_code,n.bin_code),'[]'::jsonb)
 INTO result FROM public.bins n JOIN public.bays b ON b.id=n.bay_id JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id
 LEFT JOIN public.bin_items binding ON binding.bin_id=n.id AND binding.item_id=material.id
 LEFT JOIN public.inventory_balances balance ON balance.bin_item_id=binding.id
 WHERE u.division=material.division AND public.can_review_material_stock(u.division)
 AND u.archived_at IS NULL AND s.archived_at IS NULL AND b.archived_at IS NULL AND n.archived_at IS NULL AND binding.archived_at IS NULL;
 RETURN result;
END $$;

CREATE FUNCTION public.review_catalogue_stock(p_destination_id uuid,p_expected_version integer,p_expected_payload_hash text,
 p_decision text,p_bin_id uuid,p_confirmed_quantity numeric,p_expected_quantity numeric,p_expected_balance_updated_at timestamptz,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor text:=auth.jwt()->>'sub';d public.v5_change_set_destinations;source public.v5_change_sets;
 material public.items;binding public.bin_items;balance public.inventory_balances;dept text;tx uuid;line_id uuid;
 note text:=nullif(btrim(p_note),'');result jsonb;previous_review_context text:=current_setting('northgate.catalogue_stock_review',true);
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('approve','return','decline') OR note IS NULL OR length(note)>1000 THEN RAISE EXCEPTION 'Decision and review note of 1 to 1000 characters required'; END IF;
 SELECT * INTO d FROM public.v5_change_set_destinations WHERE id=p_destination_id FOR UPDATE;
 IF d.id IS NULL OR d.destination_key<>'catalogue_stock' OR d.action_id<>'CAT-STOCK-REVIEW' THEN RAISE EXCEPTION 'Stock request not found'; END IF;
 SELECT * INTO source FROM public.v5_change_sets WHERE id=d.change_set_id;
 IF NOT EXISTS(SELECT 1 FROM public.material_catalogue_save_requests r WHERE r.actor=source.initiated_by AND r.result->>'stock_review_id'=d.id::text) THEN RAISE EXCEPTION 'Stock request did not originate in the catalogue workflow'; END IF;
 SELECT * INTO material FROM public.items WHERE id=(d.proposed_payload->>'item_id')::uuid AND is_active AND NOT is_archived FOR SHARE;
 IF material.id IS NULL OR public.can_review_material_stock(material.division) IS NOT TRUE
 OR d.scope_context->>'division' IS DISTINCT FROM material.division THEN RAISE EXCEPTION 'An authorized inventory reviewer is required' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR p_expected_payload_hash IS NULL OR d.status<>'pending' OR d.version<>p_expected_version OR d.payload_hash<>p_expected_payload_hash THEN RAISE EXCEPTION 'Request changed or was already reviewed. Reload before deciding' USING ERRCODE='40001'; END IF;
 PERFORM set_config('northgate.catalogue_stock_review',d.id::text,true);
 IF p_decision<>'approve' THEN
  result:=public.review_v5_change_destination(d.id,d.version,d.payload_hash,p_decision,note);
  PERFORM set_config('northgate.catalogue_stock_review',coalesce(previous_review_context,''),true);
  RETURN result;
 END IF;
 IF material.unit_of_measure IS DISTINCT FROM d.proposed_payload->>'unit' THEN RAISE EXCEPTION 'Material unit changed. Return the request for correction'; END IF;
 PERFORM public.catalogue_nonnegative(p_confirmed_quantity::text,'Confirmed quantity');
 IF p_bin_id IS NULL THEN RAISE EXCEPTION 'Select the actual stock bin'; END IF;
 -- Existing intake and count workflows use these same locks. Recheck the balance
 -- observed by the reviewer after acquiring them, before creating any ledger entry.
 PERFORM pg_advisory_xact_lock(hashtext(p_bin_id::text||':'||material.id::text));
 SELECT u.division INTO dept FROM public.bins n JOIN public.bays b ON b.id=n.bay_id
 JOIN public.shelves s ON s.id=b.shelf_id JOIN public.storage_units u ON u.id=s.unit_id
 WHERE n.id=p_bin_id AND n.archived_at IS NULL AND b.archived_at IS NULL AND s.archived_at IS NULL AND u.archived_at IS NULL FOR SHARE OF n,b,s,u;
 IF dept IS DISTINCT FROM material.division OR public.can_review_material_stock(dept) IS NOT TRUE THEN RAISE EXCEPTION 'Choose an active bin in the material Department' USING ERRCODE='42501'; END IF;
 SELECT * INTO binding FROM public.bin_items WHERE bin_id=p_bin_id AND item_id=material.id FOR UPDATE;
 IF binding.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Retired material links require a separate history review'; END IF;
 IF binding.id IS NULL THEN
  IF p_expected_quantity IS NOT NULL OR p_expected_balance_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Stock changed. Reload before approving' USING ERRCODE='40001'; END IF;
  INSERT INTO public.bin_items(bin_id,item_id,min_quantity) VALUES(p_bin_id,material.id,0) RETURNING * INTO binding;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,after_data,note)
  VALUES(actor,public.change_order_actor(),'bin_items',binding.id::text,'create',to_jsonb(binding),note);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext(binding.id::text));
 SELECT * INTO balance FROM public.inventory_balances WHERE bin_item_id=binding.id FOR UPDATE;
 IF balance.quantity IS DISTINCT FROM p_expected_quantity OR balance.last_rebuilt IS DISTINCT FROM p_expected_balance_updated_at THEN RAISE EXCEPTION 'On-hand inventory changed. Reload and confirm the new count' USING ERRCODE='40001'; END IF;
 -- This is the existing physical-count ledger contract: target_quantity is the
 -- confirmed total in this bin, never an increment and never a direct balance write.
 INSERT INTO public.inventory_transactions(transaction_type,user_id,performed_by_name,source_vehicle_id,notes)
 VALUES('physical_count_correction',actor,public.change_order_actor(),NULL,note) RETURNING id INTO tx;
 INSERT INTO public.transaction_items(transaction_id,bin_item_id,item_id,quantity,target_quantity,unit_cost_at_time,transaction_type,destination_type,destination_id,cost_code_id,status,note,occurred_at)
 VALUES(tx,binding.id,material.id,0,p_confirmed_quantity,coalesce(material.price_per_unit,0),'physical_count_correction',NULL,NULL,material.default_cost_code_id,'approved',note,clock_timestamp()) RETURNING id INTO line_id;
 result:=jsonb_build_object('item_id',material.id,'bin_id',p_bin_id,'bin_item_id',binding.id,'transaction_id',tx,'transaction_item_id',line_id,'confirmed_quantity',p_confirmed_quantity,'prior_quantity',balance.quantity,'suggested_stock',d.proposed_payload->'stock');
 result:=public.complete_v5_destination_application(d.id,d.version,d.payload_hash,actor,result,note);
 PERFORM set_config('northgate.catalogue_stock_review',coalesce(previous_review_context,''),true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_catalogue_stock_reviews(),public.read_catalogue_stock_locations(uuid),public.review_catalogue_stock(uuid,integer,text,text,uuid,numeric,numeric,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_catalogue_stock_reviews(),public.read_catalogue_stock_locations(uuid),public.review_catalogue_stock(uuid,integer,text,text,uuid,numeric,numeric,timestamptz,text) TO authenticated;

-- Existing notification contract, extended with the new Inventory destination.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.read_my_review_task_inbox(integer)'::regprocedure) INTO definition;
 definition:=replace(definition,'CASE destination.destination_key WHEN ''official_estimate'' THEN ''Estimate reviews''',
  'CASE destination.destination_key WHEN ''catalogue_stock'' THEN ''Stock reviews'' WHEN ''official_estimate'' THEN ''Estimate reviews''');
 definition:=replace(definition,'CASE WHEN destination.destination_key=''catalogue_updates'' THEN ''inventory''',
  'CASE WHEN destination.destination_key IN (''catalogue_updates'',''catalogue_stock'') THEN ''inventory''');
 definition:=replace(definition,'CASE destination.destination_key WHEN ''official_estimate'' THEN coalesce',
  'CASE destination.destination_key WHEN ''catalogue_stock'' THEN destination.proposed_payload->>''name'' WHEN ''official_estimate'' THEN coalesce');
 definition:=replace(definition,'AND change_set.initiated_by IS DISTINCT FROM auth.jwt()->>''sub''','AND (destination.destination_key=''catalogue_stock'' OR change_set.initiated_by IS DISTINCT FROM auth.jwt()->>''sub'')');
 IF position('Stock reviews' in definition)=0 OR position('catalogue_stock' in definition)=0 THEN RAISE EXCEPTION 'Review inbox shape changed; reconcile before applying'; END IF;
 EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';

-- The generic v5 return/decline endpoint must enforce the same stock-specific
-- reviewer and real-item scope checks as the atomic application adapter.
CREATE FUNCTION public.guard_catalogue_stock_decision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE dept text;initiator text;
BEGIN
 IF OLD.destination_key='catalogue_stock' AND NEW.status IS DISTINCT FROM OLD.status THEN
  IF nullif(current_setting('northgate.catalogue_stock_review',true),'') IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'Use the stock review workflow to decide this request' USING ERRCODE='42501'; END IF;
  SELECT i.division INTO dept FROM public.items i WHERE i.id=(OLD.proposed_payload->>'item_id')::uuid;
  SELECT s.initiated_by INTO initiator FROM public.v5_change_sets s WHERE s.id=OLD.change_set_id;
  IF NOT EXISTS(SELECT 1 FROM public.material_catalogue_save_requests r WHERE r.actor=initiator AND r.result->>'stock_review_id'=OLD.id::text) THEN RAISE EXCEPTION 'Stock request did not originate in the catalogue workflow'; END IF;
  IF OLD.action_id<>'CAT-STOCK-REVIEW' OR dept IS DISTINCT FROM OLD.scope_context->>'division'
   OR public.can_review_material_stock(dept) IS NOT TRUE THEN
   RAISE EXCEPTION 'An authorized inventory reviewer is required' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_catalogue_stock_decision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_catalogue_stock_decision BEFORE UPDATE ON public.v5_change_set_destinations
 FOR EACH ROW EXECUTE FUNCTION public.guard_catalogue_stock_decision();

-- Alias-only edits participate in the material optimistic version, preventing a
-- full editor opened earlier from silently replacing a newer alias list.
CREATE FUNCTION public.touch_material_alias_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.items SET updated_at=clock_timestamp() WHERE id=NEW.item_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.touch_material_alias_version() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER touch_material_alias_version AFTER INSERT OR UPDATE ON public.item_aliases
 FOR EACH ROW EXECUTE FUNCTION public.touch_material_alias_version();

CREATE FUNCTION public.audit_full_catalogue_metadata() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
 VALUES(auth.jwt()->>'sub',public.change_order_actor(),'items',NEW.id::text,'update',to_jsonb(OLD),to_jsonb(NEW),'Catalogue vendor quotes, source labor or notes updated');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_full_catalogue_metadata() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_full_catalogue_metadata AFTER UPDATE ON public.items FOR EACH ROW
 WHEN (OLD.vendor_prices IS DISTINCT FROM NEW.vendor_prices OR OLD.neca_labor_input IS DISTINCT FROM NEW.neca_labor_input OR OLD.catalogue_notes IS DISTINCT FROM NEW.catalogue_notes)
 EXECUTE FUNCTION public.audit_full_catalogue_metadata();

-- Extend catalogue visibility only within the authorized editor/reviewer scope.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.current_user_can_read_catalog(text)'::regprocedure) INTO definition;
 definition:=replace(definition,'SELECT public.current_user_can_read_division',
  'SELECT public.current_user_can_edit_division(p_division,''can_edit_catalog'') OR public.can_review_material_stock(p_division) OR public.current_user_can_read_division');
 IF position('can_review_material_stock(p_division)' in definition)=0 THEN RAISE EXCEPTION 'Catalogue read helper shape changed; reconcile before applying'; END IF;
 EXECUTE definition;
END $$;

-- Generic v5 submission cannot forge stock requests or spam reviewer inboxes.
-- Only the constrained atomic catalogue save establishes this transaction-local
-- context; client roles cannot call the trigger or set it through a public RPC.
CREATE FUNCTION public.guard_catalogue_stock_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE material public.items;
BEGIN
 IF NEW.destination_key='catalogue_stock' OR NEW.action_id='CAT-STOCK-REVIEW' THEN
  IF NEW.destination_key<>'catalogue_stock' OR NEW.action_id<>'CAT-STOCK-REVIEW'
   OR nullif(current_setting('northgate.catalogue_stock_item',true),'') IS DISTINCT FROM NEW.proposed_payload->>'item_id' THEN
   RAISE EXCEPTION 'Use the material catalogue workflow to request stock review' USING ERRCODE='42501';
  END IF;
  SELECT * INTO material FROM public.items WHERE id::text=NEW.proposed_payload->>'item_id' AND is_active AND NOT is_archived;
  IF material.id IS NULL OR public.current_user_can_edit_division(material.division,'can_edit_catalog') IS NOT TRUE
   OR NEW.scope_context->>'division' IS DISTINCT FROM material.division
   OR NEW.proposed_payload->>'name' IS DISTINCT FROM material.name
   OR NEW.proposed_payload->>'unit' IS DISTINCT FROM material.unit_of_measure THEN
   RAISE EXCEPTION 'Stock request does not match the authorized material' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_catalogue_stock_submission() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_catalogue_stock_submission BEFORE INSERT ON public.v5_change_set_destinations
 FOR EACH ROW EXECUTE FUNCTION public.guard_catalogue_stock_submission();

CREATE UNIQUE INDEX material_catalogue_stock_origin ON public.material_catalogue_save_requests((result->>'stock_review_id'))
 WHERE result->>'stock_review_id' IS NOT NULL;
NOTIFY pgrst,'reload schema';
