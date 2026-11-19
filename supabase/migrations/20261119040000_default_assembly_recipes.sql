-- Immutable reviewed Default assembly copies, separate from legacy library rows.
-- No seeds, no existing estimate/library/snapshot rewrites. Accounting v3 required.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF public.blank_slate_accounting_version()<>3 THEN RAISE EXCEPTION 'Reviewed accounting v3 required'; END IF;
END $$;
CREATE SCHEMA assembly_recipe_private;
REVOKE ALL ON SCHEMA assembly_recipe_private FROM PUBLIC,anon,authenticated;
CREATE TABLE assembly_recipe_private.recipes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 division text NOT NULL CHECK(division IN ('Construction','Electrical','Admin')),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 300),
 recipe jsonb NOT NULL CHECK(jsonb_typeof(recipe)='object' AND octet_length(recipe::text)<=1000000),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by text NOT NULL,
 request_id uuid NOT NULL,
 UNIQUE(created_by,request_id)
);
ALTER TABLE assembly_recipe_private.recipes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assembly_recipe_private.recipes FROM PUBLIC,anon,authenticated;
CREATE FUNCTION assembly_recipe_private.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Shared recipes are immutable; save a new copy' USING ERRCODE='42501'; END $$;
CREATE TRIGGER recipe_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON assembly_recipe_private.recipes
 FOR EACH STATEMENT EXECUTE FUNCTION assembly_recipe_private.immutable();
CREATE FUNCTION assembly_recipe_private.actor() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=auth.jwt()->>'sub'; BEGIN
 IF nullif(btrim(actor),'') IS NULL OR coalesce(auth.jwt()->>'is_anonymous','false')<>'false'
 OR NOT EXISTS(SELECT 1 FROM public.user_permissions u WHERE u.clerk_user_id=actor AND u.is_active) THEN
 RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 RETURN actor; -- Production: existing active-user and scoped library permissions below.
END $$;
CREATE FUNCTION assembly_recipe_private.can_read(p_division text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.current_user_can_read_division(p_division,'can_estimate') OR public.current_user_can_read_division(p_division,'can_approve_estimates')
$$;
CREATE FUNCTION assembly_recipe_private.object(p jsonb,keys text[]) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' THEN RAISE EXCEPTION 'Recipe object required' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT k=ANY(keys)) THEN RAISE EXCEPTION 'Unknown or private recipe field' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION assembly_recipe_private.text_field(p jsonb,k text,required boolean,max_length integer) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF NOT p?k AND NOT required THEN RETURN; END IF;
 IF jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR length(p->>k)>max_length OR (required AND length(btrim(p->>k))=0)
 THEN RAISE EXCEPTION 'Invalid recipe text: %',k USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION assembly_recipe_private.validate(p jsonb) RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE l jsonb;q jsonb;a jsonb;k text;settings jsonb;lines jsonb:='[]';quotes jsonb:='[]';n integer:=0;replacements integer:=0;d jsonb;
BEGIN
 IF public.blank_slate_accounting_version()<>3 THEN RAISE EXCEPTION 'Reviewed accounting v3 required' USING ERRCODE='22023'; END IF;
 IF octet_length(p::text)>1000000 THEN RAISE EXCEPTION 'Recipe exceeds 1 MB' USING ERRCODE='22023'; END IF;
 PERFORM assembly_recipe_private.object(p,ARRAY['schemaVersion','kind','name','defaultWorkQuantity','settings','lines','quotes']);
 IF p->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR p->>'kind' IS DISTINCT FROM 'default_estimator_assembly' THEN RAISE EXCEPTION 'Unsupported recipe schema' USING ERRCODE='22023'; END IF;
 PERFORM assembly_recipe_private.text_field(p,'name',true,300);
 IF public.blank_slate_number(p->>'defaultWorkQuantity','Work quantity')<=0 THEN RAISE EXCEPTION 'Work quantity must be positive' USING ERRCODE='22023'; END IF;
 settings:=p->'settings';
 PERFORM assembly_recipe_private.object(settings,ARRAY['laborRateOverride','blankSlateHardRate','materialMarkupOverride']);
 FOREACH k IN ARRAY ARRAY['laborRateOverride','blankSlateHardRate','materialMarkupOverride'] LOOP PERFORM public.blank_slate_number(settings->>k,k); END LOOP;
 IF jsonb_typeof(p->'lines') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'quotes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Recipe collections required' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p->'lines')>2000 OR jsonb_array_length(p->'quotes')>500 THEN RAISE EXCEPTION 'Recipe collection limit exceeded' USING ERRCODE='22023'; END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
  PERFORM assembly_recipe_private.object(l,ARRAY['name','unit','qty','price','hours','fixed','notes','stage','blankResourceKind','materialAdjustment','laborAdjustment','materialDiscount','laborDiscount']);
  PERFORM assembly_recipe_private.text_field(l,'name',true,1000);
  PERFORM assembly_recipe_private.text_field(l,'unit',false,100);
  PERFORM assembly_recipe_private.text_field(l,'notes',false,20000);
  PERFORM assembly_recipe_private.text_field(l,'stage',false,200);
  FOREACH k IN ARRAY ARRAY['qty','price','hours'] LOOP PERFORM public.blank_slate_number(l->>k,k); END LOOP;
  IF jsonb_typeof(l->'fixed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Explicit fixed quantity flag required' USING ERRCODE='22023'; END IF;
  IF l?'blankResourceKind' AND coalesce(l->>'blankResourceKind','') NOT IN ('material','labor') THEN RAISE EXCEPTION 'Invalid resource kind' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['materialAdjustment','laborAdjustment','materialDiscount','laborDiscount'] LOOP
   a:=l->k;
   IF a IS NULL OR a='null'::jsonb THEN CONTINUE; END IF;
   PERFORM assembly_recipe_private.object(a,CASE WHEN k LIKE '%Adjustment' THEN ARRAY['direction','type','value'] ELSE ARRAY['type','value'] END);
   IF coalesce(a->>'type','') NOT IN ('percent','amount') OR (k LIKE '%Adjustment' AND coalesce(a->>'direction','') NOT IN ('addition','discount')) THEN RAISE EXCEPTION 'Invalid resource adjustment' USING ERRCODE='22023'; END IF;
   PERFORM public.blank_slate_number(a->>'value','Adjustment');
   IF a->>'type'='percent' AND coalesce(a->>'direction','discount')='discount' AND (a->>'value')::numeric>100 THEN RAISE EXCEPTION 'Discount exceeds 100 percent' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF (l->'materialAdjustment' IS NOT NULL AND l->'materialAdjustment'<>'null'::jsonb AND l->'materialDiscount' IS NOT NULL AND l->'materialDiscount'<>'null'::jsonb)
  OR (l->'laborAdjustment' IS NOT NULL AND l->'laborAdjustment'<>'null'::jsonb AND l->'laborDiscount' IS NOT NULL AND l->'laborDiscount'<>'null'::jsonb)
  THEN RAISE EXCEPTION 'Conflicting recipe adjustment fields' USING ERRCODE='22023'; END IF;
  n:=n+1;lines:=lines||jsonb_build_array(l||jsonb_build_object('id','resource-'||n));
 END LOOP;
 n:=0;
 FOR q IN SELECT value FROM jsonb_array_elements(p->'quotes') LOOP
  PERFORM assembly_recipe_private.object(q,ARRAY['name','cost','markup','mode']);
  PERFORM assembly_recipe_private.text_field(q,'name',true,1000);
  IF coalesce(q->>'mode','') NOT IN ('add','replace','reference') THEN RAISE EXCEPTION 'Invalid quote mode' USING ERRCODE='22023'; END IF;
  PERFORM public.blank_slate_number(q->>'markup','Quote markup');
  IF q->>'mode'<>'reference' OR nullif(q->>'cost','') IS NOT NULL THEN PERFORM public.blank_slate_number(q->>'cost','Quote cost'); END IF;
  IF q->>'mode'='replace' THEN replacements:=replacements+1; END IF;
  n:=n+1;quotes:=quotes||jsonb_build_array(q||jsonb_build_object('id','quote-'||n));
 END LOOP;
 IF replacements>1 THEN RAISE EXCEPTION 'Only one replacement quote permitted' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(lines)=0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(quotes) x WHERE x->>'mode'<>'reference') THEN RAISE EXCEPTION 'Recipe requires priced resources or an active quote' USING ERRCODE='22023'; END IF;
 d:=jsonb_build_object('blankSlateVersion',1,'rate',settings->'laborRateOverride','blankSlateHardRate',settings->'blankSlateHardRate','materialMarkup',settings->'materialMarkupOverride','feePercent',0,'proposal','{}'::jsonb,
 'entries',jsonb_build_array(jsonb_build_object('id','entry','number',1,'items',jsonb_build_array(settings||jsonb_build_object('id','item','number',1,'name',p->>'name','qty',p->'defaultWorkQuantity','lines',lines,'blankQuotes',quotes)))));
 PERFORM public.blank_slate_pricing(d);
 -- Also validate preserved reference resources when a replacement quote excludes
 -- them. Otherwise malformed/over-discounted dormant resources could be shared.
 IF replacements>0 AND jsonb_array_length(lines)>0 THEN
  d:=jsonb_set(d,'{entries,0,items,0,blankQuotes}','[]'); PERFORM public.blank_slate_pricing(d);
 END IF;
END $$;
CREATE FUNCTION public.default_assembly_recipe_version() RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM assembly_recipe_private.actor(); RETURN 1; END $$;
CREATE FUNCTION public.list_default_assembly_recipes(p_division text,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,division text,name text,created_at timestamptz,resource_count integer,quote_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM assembly_recipe_private.actor();
 IF assembly_recipe_private.can_read(p_division) IS NOT TRUE THEN RAISE EXCEPTION 'Assembly read permission required' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Choose 1 to 200 recipes per page' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT r.id,r.division,r.name,r.created_at,jsonb_array_length(r.recipe->'lines'),jsonb_array_length(r.recipe->'quotes') FROM assembly_recipe_private.recipes r WHERE r.division=p_division AND (p_after IS NULL OR r.id>p_after) ORDER BY r.id LIMIT p_limit;
END $$;
CREATE FUNCTION public.read_default_assembly_recipe(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r assembly_recipe_private.recipes; BEGIN
 PERFORM assembly_recipe_private.actor();
 SELECT * INTO r FROM assembly_recipe_private.recipes WHERE id=p_id;
 IF NOT FOUND OR assembly_recipe_private.can_read(r.division) IS NOT TRUE THEN RAISE EXCEPTION 'Assembly unavailable or read permission missing' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',r.id,'division',r.division,'name',r.name,'recipe',r.recipe,'created_at',r.created_at);
END $$;
CREATE FUNCTION public.create_default_assembly_recipe(p_division text,p_recipe jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text; r assembly_recipe_private.recipes; BEGIN
 actor:=assembly_recipe_private.actor();
 IF public.current_user_can_edit_division(p_division,'can_estimate') IS NOT TRUE THEN RAISE EXCEPTION 'Assembly edit permission required' USING ERRCODE='42501'; END IF;
 IF p_division IS NULL OR p_division NOT IN ('Construction','Electrical','Admin') OR p_request_id IS NULL THEN RAISE EXCEPTION 'Division and request identifier required' USING ERRCODE='22023'; END IF;
 PERFORM assembly_recipe_private.validate(p_recipe);
 PERFORM pg_advisory_xact_lock(hashtextextended('assembly-recipe:'||actor||':'||p_request_id::text,0));
 SELECT * INTO r FROM assembly_recipe_private.recipes WHERE created_by=actor AND request_id=p_request_id;
 IF FOUND THEN
  IF r.division IS DISTINCT FROM p_division OR r.recipe IS DISTINCT FROM p_recipe THEN RAISE EXCEPTION 'Request identifier already used for different shared content' USING ERRCODE='22023'; END IF;
 ELSE
  INSERT INTO assembly_recipe_private.recipes(division,name,recipe,created_by,request_id) VALUES(p_division,btrim(p_recipe->>'name'),p_recipe,actor,p_request_id) RETURNING * INTO r;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(actor,actor,'default_assembly_recipes',r.id::text,'insert',NULL,to_jsonb(r)-'request_id',jsonb_build_object('workflow','default_assembly_recipe','action','reviewed_shared_copy')::text);
 END IF;
 RETURN jsonb_build_object('id',r.id,'division',r.division,'name',r.name,'recipe',r.recipe,'created_at',r.created_at);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA assembly_recipe_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.default_assembly_recipe_version(),public.list_default_assembly_recipes(text,uuid,integer),public.read_default_assembly_recipe(uuid),public.create_default_assembly_recipe(text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.default_assembly_recipe_version(),public.list_default_assembly_recipes(text,uuid,integer),public.read_default_assembly_recipe(uuid),public.create_default_assembly_recipe(text,jsonb,uuid) TO authenticated;
-- Production has no tool-availability registry or pre-request hook.
-- Do not introduce unrelated staging infrastructure. Existing permission checks remain.
NOTIFY pgrst,'reload schema';
COMMIT;
