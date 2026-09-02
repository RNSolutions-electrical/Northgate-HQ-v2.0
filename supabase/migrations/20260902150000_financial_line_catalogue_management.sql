CREATE OR REPLACE FUNCTION public.replace_financial_line_catalogue(p_rows JSONB, p_reason TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE actor TEXT := auth.jwt() ->> 'sub'; row_data JSONB; saved_count INTEGER := 0;
BEGIN
  IF actor IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN RAISE EXCEPTION 'Developer access is required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows)=0 OR NULLIF(BTRIM(COALESCE(p_reason,'')), '') IS NULL THEN RAISE EXCEPTION 'catalogue rows and an audit reason are required'; END IF;
  FOR row_data IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF NULLIF(BTRIM(COALESCE(row_data->>'division_code','')), '') IS NULL OR NULLIF(BTRIM(COALESCE(row_data->>'division_name','')), '') IS NULL OR NULLIF(BTRIM(COALESCE(row_data->>'cost_code','')), '') IS NULL OR NULLIF(BTRIM(COALESCE(row_data->>'description','')), '') IS NULL THEN RAISE EXCEPTION 'each catalogue row needs division code, division name, cost code, and description'; END IF;
    INSERT INTO public.financial_line_catalogue(division_code,division_name,subdivision_name,cost_code,description,notes,category,is_protected_financial,sort_order,is_active,retired_at,retired_by,retirement_reason)
    VALUES(BTRIM(row_data->>'division_code'),BTRIM(row_data->>'division_name'),NULLIF(BTRIM(row_data->>'subdivision_name'),''),BTRIM(row_data->>'cost_code'),BTRIM(row_data->>'description'),NULLIF(BTRIM(row_data->>'notes'),''),COALESCE(NULLIF(BTRIM(row_data->>'category'),''),'other'),COALESCE((row_data->>'is_protected_financial')::BOOLEAN,FALSE),COALESCE((row_data->>'sort_order')::INTEGER,0),TRUE,NULL,NULL,NULL)
    ON CONFLICT (UPPER(BTRIM(cost_code))) DO UPDATE SET division_code=EXCLUDED.division_code,division_name=EXCLUDED.division_name,subdivision_name=EXCLUDED.subdivision_name,description=EXCLUDED.description,notes=EXCLUDED.notes,category=EXCLUDED.category,is_protected_financial=EXCLUDED.is_protected_financial,sort_order=EXCLUDED.sort_order,is_active=TRUE,retired_at=NULL,retired_by=NULL,retirement_reason=NULL,updated_at=NOW();
    saved_count := saved_count + 1;
  END LOOP;
  INSERT INTO public.change_logs(user_id,table_name,record_id,action,after_data,note) VALUES(actor,'financial_line_catalogue','catalogue','developer_import',jsonb_build_object('rows_processed',saved_count),BTRIM(p_reason));
  RETURN saved_count;
END; $$;
CREATE OR REPLACE FUNCTION public.retire_financial_line_catalogue_item(p_catalogue_id UUID,p_reason TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE actor TEXT:=auth.jwt()->>'sub';
BEGIN
 IF actor IS NULL OR public.current_user_has_developer_access() IS NOT TRUE THEN RAISE EXCEPTION 'Developer access is required' USING ERRCODE='42501'; END IF;
 IF p_catalogue_id IS NULL OR NULLIF(BTRIM(COALESCE(p_reason,'')), '') IS NULL THEN RAISE EXCEPTION 'catalogue line and retirement reason are required'; END IF;
 UPDATE public.financial_line_catalogue SET is_active=FALSE,retired_at=NOW(),retired_by=actor,retirement_reason=BTRIM(p_reason),updated_at=NOW() WHERE id=p_catalogue_id AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'active catalogue line not found'; END IF;
 INSERT INTO public.change_logs(user_id,table_name,record_id,action,note) VALUES(actor,'financial_line_catalogue',p_catalogue_id::TEXT,'retire',BTRIM(p_reason));
END; $$;
REVOKE ALL ON FUNCTION public.replace_financial_line_catalogue(JSONB,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.retire_financial_line_catalogue_item(UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_financial_line_catalogue(JSONB,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_financial_line_catalogue_item(UUID,TEXT) TO authenticated;
