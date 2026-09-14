-- Correct INSERT to the existing audit action vocabulary; no policy changes.
CREATE OR REPLACE FUNCTION public.audit_assembly_library() RETURNS trigger
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
  VALUES(actor,public.change_order_actor(),TG_TABLE_NAME,NEW.id::text,CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'update' END,old_data,to_jsonb(NEW),
   jsonb_build_object('workflow','assembly_library','source',COALESCE(NULLIF(current_setting('northgate.assembly_source',true),''),'assembly_library'),
    'estimate_id',NULLIF(current_setting('northgate.assembly_estimate',true),''))::text);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_assembly_library() FROM PUBLIC,anon,authenticated;
