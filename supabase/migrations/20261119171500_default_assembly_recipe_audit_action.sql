-- Correct the audit action to the existing change_logs contract.
-- Keep validation, permissions, storage, and the atomic audit unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION public.create_default_assembly_recipe(p_division text,p_recipe jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  VALUES(actor,actor,'default_assembly_recipes',r.id::text,'create',NULL,to_jsonb(r)-'request_id',jsonb_build_object('workflow','default_assembly_recipe','action','reviewed_shared_copy')::text);
 END IF;
 RETURN jsonb_build_object('id',r.id,'division',r.division,'name',r.name,'recipe',r.recipe,'created_at',r.created_at);
END $$;
COMMIT;
