-- Tool availability controls. Inert until the separate enforcement review/activation.
-- This migration deliberately does not change authenticator or PostgREST settings.
BEGIN;
CREATE SCHEMA hq_tool_private;
REVOKE ALL ON SCHEMA hq_tool_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA hq_tool_private TO authenticated,anon;
CREATE TABLE hq_tool_private.tools (
 module_key text PRIMARY KEY, is_enabled boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text
);
INSERT INTO hq_tool_private.tools(module_key) VALUES
 ('daybook'),('hq-time'),('afc'),('electrical-inspections'),('add-on-tools'),('inventory'),('jobs'),
 ('estimates'),('employees'),('vehicles'),('tools'),('documents'),('reports'),('accounting'),('eos'),('silas'),('panel-directory');
CREATE TABLE hq_tool_private.enforcement (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 reviewed boolean NOT NULL DEFAULT false, reviewed_at timestamptz,
 review_notes text
);
INSERT INTO hq_tool_private.enforcement(singleton) VALUES(true);
CREATE TABLE hq_tool_private.history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, module_key text NOT NULL REFERENCES hq_tool_private.tools,
 actor_id text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 before_enabled boolean NOT NULL, after_enabled boolean NOT NULL,
 before_version integer NOT NULL, after_version integer NOT NULL
);
CREATE TABLE hq_tool_private.resource_map (
 resource_kind text NOT NULL CHECK(resource_kind IN ('rpc','table')),
 resource_name text NOT NULL CHECK(resource_name ~ '^[a-z][a-z0-9_]*$'),
 module_key text NOT NULL REFERENCES hq_tool_private.tools,
 PRIMARY KEY(resource_kind,resource_name,module_key)
);
ALTER TABLE hq_tool_private.tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE hq_tool_private.enforcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE hq_tool_private.history ENABLE ROW LEVEL SECURITY;
ALTER TABLE hq_tool_private.resource_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hq_tool_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hq_tool_private FROM PUBLIC,anon,authenticated;
CREATE FUNCTION hq_tool_private.active_actor() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT nullif(auth.jwt()->>'sub','') IS NOT NULL
 AND coalesce(auth.jwt()->>'is_anonymous','false')='false'
 AND EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active)
$$;
CREATE FUNCTION hq_tool_private.developer() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT hq_tool_private.active_actor() AND coalesce(public.current_user_has_developer_access(),false)
$$;
CREATE FUNCTION hq_tool_private.allowed(p_module_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT hq_tool_private.active_actor() AND EXISTS(
 SELECT 1 FROM hq_tool_private.tools t WHERE t.module_key=p_module_key AND (t.is_enabled OR hq_tool_private.developer()))
$$;
CREATE FUNCTION hq_tool_private.ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT reviewed FROM hq_tool_private.enforcement WHERE singleton),false)
 AND current_setting('pgrst.db_pre_request',true)='public.hq_tool_pre_request'
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname='pg_graphql')
$$;
CREATE FUNCTION hq_tool_private.resource_allowed(p_kind text,p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT hq_tool_private.developer() OR NOT EXISTS(
 SELECT 1 FROM hq_tool_private.resource_map m JOIN hq_tool_private.tools t USING(module_key)
 WHERE m.resource_kind=p_kind AND m.resource_name=p_name AND NOT t.is_enabled)
$$;
CREATE FUNCTION hq_tool_private.reject_history_changes() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Tool availability history is immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER tool_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON hq_tool_private.history
FOR EACH STATEMENT EXECUTE FUNCTION hq_tool_private.reject_history_changes();
CREATE FUNCTION public.read_tool_availability()
RETURNS TABLE(module_key text,is_enabled boolean,version integer,updated_at timestamptz,enforcement_ready boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT hq_tool_private.active_actor() THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT t.module_key,t.is_enabled,t.version,t.updated_at,hq_tool_private.ready()
 FROM hq_tool_private.tools t ORDER BY t.module_key;
END $$;
CREATE FUNCTION public.require_tool_available(p_module_key text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT hq_tool_private.allowed(p_module_key) THEN
  RAISE EXCEPTION 'This tool is currently unavailable' USING ERRCODE='42501';
 END IF;
 RETURN true;
END $$;
CREATE FUNCTION public.set_tool_availability(p_module_key text,p_enabled boolean,p_expected_version integer)
RETURNS TABLE(module_key text,is_enabled boolean,version integer,updated_at timestamptz,enforcement_ready boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old hq_tool_private.tools;
BEGIN
 IF NOT hq_tool_private.developer() THEN RAISE EXCEPTION 'Developer access required' USING ERRCODE='42501'; END IF;
 IF p_enabled IS NULL OR p_expected_version IS NULL THEN RAISE EXCEPTION 'Enabled state and version are required' USING ERRCODE='22023'; END IF;
 SELECT * INTO old FROM hq_tool_private.tools t WHERE t.module_key=p_module_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or protected tool' USING ERRCODE='22023'; END IF;
 IF old.version<>p_expected_version THEN RAISE EXCEPTION 'Tool settings changed in another session. Refresh and try again.' USING ERRCODE='40001'; END IF;
 IF NOT p_enabled AND NOT hq_tool_private.ready() THEN
  RAISE EXCEPTION 'Server enforcement is not activated and verified; no tools were disabled' USING ERRCODE='55000';
 END IF;
 IF old.is_enabled IS DISTINCT FROM p_enabled THEN
  UPDATE hq_tool_private.tools t SET is_enabled=p_enabled,version=t.version+1,updated_at=clock_timestamp(),updated_by=auth.jwt()->>'sub' WHERE t.module_key=p_module_key;
  INSERT INTO hq_tool_private.history(module_key,actor_id,before_enabled,after_enabled,before_version,after_version)
  VALUES(p_module_key,auth.jwt()->>'sub',old.is_enabled,p_enabled,old.version,old.version+1);
 END IF;
 RETURN QUERY SELECT t.module_key,t.is_enabled,t.version,t.updated_at,hq_tool_private.ready() FROM hq_tool_private.tools t WHERE t.module_key=p_module_key;
END $$;
-- Data API hook. Existing grants, RLS, RPC authorization still run after this check.
-- Unknown Data API surfaces fail closed whenever any tool is disabled.
CREATE FUNCTION public.hq_tool_pre_request() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE request_path text:=current_setting('request.path',true); resource text; kind text;
BEGIN
 IF hq_tool_private.developer() THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM hq_tool_private.tools WHERE NOT is_enabled) THEN RETURN; END IF;
 IF request_path LIKE '/rpc/%' THEN kind:='rpc'; resource:=substring(request_path FROM 6);
 ELSIF request_path ~ '^/[a-z][a-z0-9_]*$' THEN kind:='table'; resource:=substring(request_path FROM 2);
 ELSE RAISE EXCEPTION 'This API entry point is unavailable while tools are disabled' USING ERRCODE='42501'; END IF;
 -- Identity/bootstrap only, never business records; their original checks remain.
 IF kind='rpc' AND resource=ANY(ARRAY['get_or_create_user_permissions','get_current_user_addons','current_user_can_manage_eos','current_user_can_track_hq_time','read_tool_availability','require_tool_available','set_tool_availability']) THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM hq_tool_private.resource_map WHERE resource_kind=kind AND resource_name=resource)
 OR NOT hq_tool_private.resource_allowed(kind,resource) THEN
  RAISE EXCEPTION 'This tool is currently unavailable' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hq_tool_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION hq_tool_private.resource_allowed(text,text) TO authenticated,anon;
REVOKE ALL ON FUNCTION public.read_tool_availability(),public.require_tool_available(text),public.set_tool_availability(text,boolean,integer),public.hq_tool_pre_request() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_tool_availability(),public.require_tool_available(text),public.set_tool_availability(text,boolean,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hq_tool_pre_request() TO authenticated,anon;
-- RESOURCE_MAP_BEGIN: generated from source/migration inventory; verify hosted coverage before activation.
INSERT INTO hq_tool_private.resource_map(resource_kind,resource_name,module_key) VALUES
 ('rpc','acknowledge_job_budget_health','jobs'),
 ('rpc','add_inventory_cart_item','inventory'),
 ('rpc','afc_can_read','afc'),
 ('rpc','afc_file_access','afc'),
 ('rpc','afc_finalize_release','afc'),
 ('rpc','afc_guard_document','afc'),
 ('rpc','afc_jobs','afc'),
 ('rpc','afc_read','afc'),
 ('rpc','afc_release_context','afc'),
 ('rpc','afc_save','afc'),
 ('rpc','afc_validate_draft','afc'),
 ('rpc','apply_financial_catalogue_to_job','jobs'),
 ('rpc','apply_job_division_name_override','jobs'),
 ('rpc','apply_job_sov_line_change','jobs'),
 ('rpc','apply_job_sov_template','jobs'),
 ('rpc','apply_v5_estimate_linked_destination','estimates'),
 ('rpc','apply_v5_estimate_promotion','estimates'),
 ('rpc','apply_v5_job_financial_proposal','jobs'),
 ('rpc','apply_v5_job_sov_proposal','jobs'),
 ('rpc','approve_estimate','estimates'),
 ('rpc','approve_job_change_order','jobs'),
 ('rpc','approve_workbench_estimate','estimates'),
 ('rpc','approve_workbench_estimate_internal','estimates'),
 ('rpc','archive_assembly_library','estimates'),
 ('rpc','archive_change_order_document','documents'),
 ('rpc','archive_current_employee_profile_note','employees'),
 ('rpc','archive_current_employee_profile_todo','employees'),
 ('rpc','archive_estimate','estimates'),
 ('rpc','archive_estimate_document','estimates'),
 ('rpc','archive_failed_document_upload','documents'),
 ('rpc','archive_job','jobs'),
 ('rpc','archive_job_budget_line','jobs'),
 ('rpc','archive_job_buyout_line','jobs'),
 ('rpc','archive_job_change_order','jobs'),
 ('rpc','archive_job_document','documents'),
 ('rpc','archive_job_schedule_item','jobs'),
 ('rpc','archive_pending_employee_profile','employees'),
 ('rpc','assembly_rate_number','estimates'),
 ('rpc','assign_vehicle_to_user','vehicles'),
 ('rpc','attach_signed_job_change_order_document','documents'),
 ('rpc','audit_assembly_library','estimates'),
 ('rpc','audit_assembly_rate_settings','estimates'),
 ('rpc','audit_estimate_workbench','estimates'),
 ('rpc','audit_tool_catalogue_mutation','tools'),
 ('rpc','award_job_buyout_quote','jobs'),
 ('rpc','blank_slate_accounting_version','estimates'),
 ('rpc','blank_slate_discount','estimates'),
 ('rpc','blank_slate_number','estimates'),
 ('rpc','blank_slate_pricing','estimates'),
 ('rpc','block_archived_job_schedule_item_updates','jobs'),
 ('rpc','change_order_actor','jobs'),
 ('rpc','change_order_allocation_total','jobs'),
 ('rpc','clear_inventory_item_price','inventory'),
 ('rpc','clock_in_hq_time_entry','hq-time'),
 ('rpc','clock_out_hq_time_entry','hq-time'),
 ('rpc','create_inventory_location','inventory'),
 ('rpc','create_job','jobs'),
 ('rpc','create_job_pay_application','jobs'),
 ('rpc','create_job_pay_application_correction','jobs'),
 ('rpc','create_vehicle','vehicles'),
 ('rpc','create_workbench_revision','estimates'),
 ('rpc','delete_empty_job_budget_line','jobs'),
 ('rpc','delete_empty_job_sov_line','jobs'),
 ('rpc','delete_panel_directory','panel-directory'),
 ('rpc','delete_unbilled_job_pay_application','jobs'),
 ('rpc','deny_job_change_order','jobs'),
 ('rpc','developer_delete_job_pay_application','jobs'),
 ('rpc','document_owner_can_manage','documents'),
 ('rpc','document_section_default','documents'),
 ('rpc','edit_inventory_location','inventory'),
 ('rpc','eos_assignment_roster_read_v1','eos'),
 ('rpc','eos_assignment_roster_save_v1','eos'),
 ('rpc','eos_audit_row','eos'),
 ('rpc','eos_award_pursuit','eos'),
 ('rpc','eos_guard_pursuit','eos'),
 ('rpc','eos_manager_directory','eos'),
 ('rpc','eos_member_directory_v1','eos'),
 ('rpc','eos_reverse_award','eos'),
 ('rpc','eos_save_pursuit','eos'),
 ('rpc','eos_save_pursuit_v1','eos'),
 ('rpc','eos_save_pursuit_v2','eos'),
 ('rpc','eos_scorecard_bulk_apply_v1','eos'),
 ('rpc','eos_scorecard_bulk_export_v1','eos'),
 ('rpc','eos_scorecard_bulk_preview_v1','eos'),
 ('rpc','eos_scorecard_bulk_receipt_v1','eos'),
 ('rpc','eos_scorecard_history_v1','eos'),
 ('rpc','eos_scorecard_import_apply_v1','eos'),
 ('rpc','eos_scorecard_import_notes_apply_v1','eos'),
 ('rpc','eos_scorecard_import_notes_preview_v1','eos'),
 ('rpc','eos_scorecard_import_notes_receipt_v1','eos'),
 ('rpc','eos_scorecard_import_notes_restore_v1','eos'),
 ('rpc','eos_scorecard_import_preview_v1','eos'),
 ('rpc','eos_scorecard_import_receipt_v1','eos'),
 ('rpc','eos_scorecard_quarters_read_v1','eos'),
 ('rpc','eos_scorecard_quarters_save_v1','eos'),
 ('rpc','eos_scorecard_read_v1','eos'),
 ('rpc','eos_scorecard_save_category_v1','eos'),
 ('rpc','eos_scorecard_save_metric_v1','eos'),
 ('rpc','eos_scorecard_save_observations_v1','eos'),
 ('rpc','eos_scorecard_save_period_v1','eos'),
 ('rpc','eos_set_pursuit_job','eos'),
 ('rpc','eos_set_pursuit_removed','eos'),
 ('rpc','eos_touch','eos'),
 ('rpc','finalize_historical_job_pay_application','jobs'),
 ('rpc','finalize_inventory_cart','inventory'),
 ('rpc','finalize_job_pay_application','jobs'),
 ('rpc','get_daybook_workspace','daybook'),
 ('rpc','get_job_pay_applications','jobs'),
 ('rpc','guard_active_inventory_posting','inventory'),
 ('rpc','guard_archived_personal_estimate','estimates'),
 ('rpc','guard_catalogue_stock_decision','inventory'),
 ('rpc','guard_catalogue_stock_submission','inventory'),
 ('rpc','guard_document_audit_mutation','documents'),
 ('rpc','guard_estimate_review_request','estimates'),
 ('rpc','guard_estimate_revision_lineage','estimates'),
 ('rpc','guard_estimate_workflow_handoff','estimates'),
 ('rpc','guard_inventory_location_parent','inventory'),
 ('rpc','guard_job_contract_closeout','jobs'),
 ('rpc','guard_job_financial_submission','jobs'),
 ('rpc','guard_job_sov_submission','jobs'),
 ('rpc','guard_pending_standalone_estimate_archive','estimates'),
 ('rpc','handoff_estimate_to_destination','estimates'),
 ('rpc','hi_action','electrical-inspections'),
 ('rpc','hi_actor','electrical-inspections'),
 ('rpc','hi_audit','electrical-inspections'),
 ('rpc','hi_can_edit','electrical-inspections'),
 ('rpc','hi_can_read','electrical-inspections'),
 ('rpc','hi_file_access','electrical-inspections'),
 ('rpc','hi_file_archive','electrical-inspections'),
 ('rpc','hi_file_finish','electrical-inspections'),
 ('rpc','hi_file_reserve','electrical-inspections'),
 ('rpc','hi_flag','electrical-inspections'),
 ('rpc','hi_guard_document','electrical-inspections'),
 ('rpc','hi_job_register','electrical-inspections'),
 ('rpc','hi_job_register_save','electrical-inspections'),
 ('rpc','hi_jobs','electrical-inspections'),
 ('rpc','hi_managed_file','electrical-inspections'),
 ('rpc','hi_managed_path','electrical-inspections'),
 ('rpc','hi_original','electrical-inspections'),
 ('rpc','hi_people','electrical-inspections'),
 ('rpc','hi_read','electrical-inspections'),
 ('rpc','hi_save','electrical-inspections'),
 ('rpc','hi_scope','electrical-inspections'),
 ('rpc','hi_target_eligible','electrical-inspections'),
 ('rpc','hi_validate_document','electrical-inspections'),
 ('rpc','hq_time_default_performer','hq-time'),
 ('rpc','initialize_job_sov_from_financials','jobs'),
 ('rpc','intake_inventory_count','inventory'),
 ('rpc','job_billing_can_manage','jobs'),
 ('rpc','job_billing_can_view','jobs'),
 ('rpc','job_contract_closeout_counts','jobs'),
 ('rpc','list_daybook_history','daybook'),
 ('rpc','list_hq_time_entries','hq-time'),
 ('rpc','list_hq_time_entry_history','hq-time'),
 ('rpc','list_panel_directories','panel-directory'),
 ('rpc','maintain_owner_document','documents'),
 ('rpc','manage_estimate_checklist','estimates'),
 ('rpc','map_material_to_inventory_bin','inventory'),
 ('rpc','open_inventory_cart','inventory'),
 ('rpc','permanently_delete_storage_location','inventory'),
 ('rpc','prepare_storage_location_deletion','inventory'),
 ('rpc','read_archived_estimate_directory','estimates'),
 ('rpc','read_archived_owner_documents','documents'),
 ('rpc','read_catalogue_stock_locations','inventory'),
 ('rpc','read_catalogue_stock_reviews','inventory'),
 ('rpc','read_current_employee_dashboard_todo_reminders','employees'),
 ('rpc','read_current_employee_profile','employees'),
 ('rpc','read_current_employee_profile_notes','employees'),
 ('rpc','read_current_employee_profile_todos','employees'),
 ('rpc','read_current_employee_vehicle_assignments','vehicles'),
 ('rpc','read_employee_vehicle_assignment_directory','vehicles'),
 ('rpc','read_eos_access_directory','eos'),
 ('rpc','read_estimate_change_history','estimates'),
 ('rpc','read_inventory_cart_items','inventory'),
 ('rpc','read_inventory_transaction_history','inventory'),
 ('rpc','read_job_assignment_directory','jobs'),
 ('rpc','read_job_assignment_directory_v5','jobs'),
 ('rpc','read_job_change_history','jobs'),
 ('rpc','read_job_financial_baseline','jobs'),
 ('rpc','read_job_financial_names','jobs'),
 ('rpc','read_job_responsibilities','jobs'),
 ('rpc','read_my_job_responsibilities','jobs'),
 ('rpc','read_my_vehicle_assignments','vehicles'),
 ('rpc','read_pending_employee_profiles','employees'),
 ('rpc','read_personal_estimate_directory','estimates'),
 ('rpc','read_retired_bin_assignments','inventory'),
 ('rpc','read_standalone_estimate_reviews','estimates'),
 ('rpc','read_tool_change_history','tools'),
 ('rpc','read_v5_estimate_review_queue','estimates'),
 ('rpc','read_v5_estimate_task_queue','estimates'),
 ('rpc','read_v5_job_financial_review_queue','jobs'),
 ('rpc','read_v5_job_sov_review_queue','jobs'),
 ('rpc','read_vehicle_assignment_directory','vehicles'),
 ('rpc','reassign_job_division','jobs'),
 ('rpc','record_document_metadata_audit','documents'),
 ('rpc','record_job_change_order_export','jobs'),
 ('rpc','release_vehicle_assignment','vehicles'),
 ('rpc','remove_inventory_cart_item','inventory'),
 ('rpc','reopen_submitted_job_change_order','jobs'),
 ('rpc','restore_estimate','estimates'),
 ('rpc','restore_retired_bin_assignment','inventory'),
 ('rpc','retire_bin_item','inventory'),
 ('rpc','retire_unsigned_change_order_documents','documents'),
 ('rpc','review_catalogue_stock','inventory'),
 ('rpc','review_standalone_estimate','estimates'),
 ('rpc','revise_job_change_order','jobs'),
 ('rpc','save_assembly_library','estimates'),
 ('rpc','save_assembly_library_settings','estimates'),
 ('rpc','save_change_order_allocations','jobs'),
 ('rpc','save_change_order_sov_allocations','jobs'),
 ('rpc','save_contract_adjustment','jobs'),
 ('rpc','save_current_employee_profile_note','employees'),
 ('rpc','save_current_employee_profile_todo','employees'),
 ('rpc','save_daybook_workspace','daybook'),
 ('rpc','save_employee_profile','employees'),
 ('rpc','save_estimate_workbench','estimates'),
 ('rpc','save_full_material_catalogue','inventory'),
 ('rpc','save_guided_change_order_draft','silas'),
 ('rpc','save_hq_time_entry','hq-time'),
 ('rpc','save_job_change_order','jobs'),
 ('rpc','save_job_change_order_draft','jobs'),
 ('rpc','save_job_change_order_draft_with_all_markups','jobs'),
 ('rpc','save_job_change_order_draft_with_client_details','jobs'),
 ('rpc','save_job_change_order_draft_with_rates','jobs'),
 ('rpc','save_job_financial_batch','jobs'),
 ('rpc','save_job_financial_line','jobs'),
 ('rpc','save_job_pay_application_change_order','jobs'),
 ('rpc','save_job_pay_application_header','jobs'),
 ('rpc','save_job_pay_application_line','jobs'),
 ('rpc','save_job_revenue_line','jobs'),
 ('rpc','save_job_sov_template','jobs'),
 ('rpc','save_material_alias','inventory'),
 ('rpc','save_material_catalogue_values','inventory'),
 ('rpc','save_panel_directory','panel-directory'),
 ('rpc','save_tool_catalogue','tools'),
 ('rpc','save_v5_job_financial_proposal','jobs'),
 ('rpc','save_v5_job_sov_proposal','jobs'),
 ('rpc','save_v5_working_copy','estimates'),
 ('rpc','save_workbench_assembly','estimates'),
 ('rpc','set_contract_adjustment_status','jobs'),
 ('rpc','set_current_employee_profile_todo_complete','employees'),
 ('rpc','set_document_section','documents'),
 ('rpc','set_document_tags','documents'),
 ('rpc','set_documents_updated_at','documents'),
 ('rpc','set_eos_access','eos'),
 ('rpc','set_hq_time_entry_archived','hq-time'),
 ('rpc','set_inventory_count_quantity','inventory'),
 ('rpc','set_inventory_item_price','inventory'),
 ('rpc','set_inventory_location_archived','inventory'),
 ('rpc','set_job_billing_fee_presentation','jobs'),
 ('rpc','set_job_pay_application_status','jobs'),
 ('rpc','set_job_responsibility','jobs'),
 ('rpc','set_job_sub_divisions','jobs'),
 ('rpc','set_job_user_assignment','jobs'),
 ('rpc','set_job_user_assignment_v5','jobs'),
 ('rpc','set_official_estimate_archived','estimates'),
 ('rpc','set_personal_estimate_archived','estimates'),
 ('rpc','snapshot_assembly_item_price_source','estimates'),
 ('rpc','storage_location_deletion_snapshot','inventory'),
 ('rpc','submit_estimate_for_review','estimates'),
 ('rpc','submit_estimate_for_review_v2','estimates'),
 ('rpc','submit_job_change_order','jobs'),
 ('rpc','submit_standalone_estimate_review','estimates'),
 ('rpc','submit_v5_estimate_for_review','estimates'),
 ('rpc','submit_v5_job_financial_proposal','jobs'),
 ('rpc','submit_v5_job_sov_proposal','jobs'),
 ('rpc','svc_activate_cost_snapshot','jobs'),
 ('rpc','svc_archive_call','jobs'),
 ('rpc','svc_create_manual_cost_snapshot','jobs'),
 ('rpc','svc_post_invoice','jobs'),
 ('rpc','svc_read_calls','jobs'),
 ('rpc','svc_read_stages','jobs'),
 ('rpc','svc_save_call','jobs'),
 ('rpc','svc_save_commercial','jobs'),
 ('rpc','svc_save_stage','jobs'),
 ('rpc','svc_validate_money','jobs'),
 ('rpc','svc_void_billing','jobs'),
 ('rpc','sync_job_pay_application_change_orders','jobs'),
 ('rpc','touch_job_financial_baseline','jobs'),
 ('rpc','touch_material_alias_version','inventory'),
 ('rpc','update_current_employee_profile','employees'),
 ('rpc','update_inventory_balance','inventory'),
 ('rpc','update_pending_employee_profile','employees'),
 ('rpc','validate_estimate_checklist_definition','estimates'),
 ('rpc','void_approved_job_change_order','jobs'),
 ('rpc','void_job_pay_application','jobs'),
 ('table','afc_files','afc'),
 ('table','afc_requests','afc'),
 ('table','afc_revisions','afc'),
 ('table','afc_studies','afc'),
 ('table','assemblies','estimates'),
 ('table','assembly_items','estimates'),
 ('table','assembly_library_settings','estimates'),
 ('table','bays','inventory'),
 ('table','bin_items','inventory'),
 ('table','bins','inventory'),
 ('table','change_order_allocations','jobs'),
 ('table','change_order_financial_postings','jobs'),
 ('table','change_order_lines','jobs'),
 ('table','change_order_sov_allocations','jobs'),
 ('table','change_orders','jobs'),
 ('table','documents','documents'),
 ('table','employee_profile_notes','employees'),
 ('table','employee_profile_todos','employees'),
 ('table','employee_profiles','employees'),
 ('table','eos_access_grants','eos'),
 ('table','eos_clients','eos'),
 ('table','eos_leadership_reminders','eos'),
 ('table','eos_pursuit_managers','eos'),
 ('table','eos_pursuits','eos'),
 ('table','eos_scorecard_audit','eos'),
 ('table','eos_scorecard_categories','eos'),
 ('table','eos_scorecard_definitions','eos'),
 ('table','eos_scorecard_metrics','eos'),
 ('table','eos_scorecard_observations','eos'),
 ('table','eos_scorecard_periods','eos'),
 ('table','estimate_checklist_definitions','estimates'),
 ('table','estimate_handoff_financial_allocations','estimates'),
 ('table','estimate_pricing_lines','estimates'),
 ('table','estimate_quote_packages','estimates'),
 ('table','estimate_review_requests','estimates'),
 ('table','estimate_snapshots','estimates'),
 ('table','estimate_takeoff_lines','estimates'),
 ('table','estimate_takeoffs','estimates'),
 ('table','estimate_workbenches','estimates'),
 ('table','estimate_workflow_handoffs','estimates'),
 ('table','estimates','estimates'),
 ('table','financial_division_catalogue','jobs'),
 ('table','financial_line_catalogue','jobs'),
 ('table','grand_master_inventory_view','inventory'),
 ('table','health_inspection_files','electrical-inspections'),
 ('table','health_inspection_imports','electrical-inspections'),
 ('table','health_inspection_revisions','electrical-inspections'),
 ('table','health_inspections','electrical-inspections'),
 ('table','hq_time_entries','hq-time'),
 ('table','hq_time_entry_audit','hq-time'),
 ('table','inspection_action_requests','electrical-inspections'),
 ('table','inventory_balances','inventory'),
 ('table','inventory_cart_candidates_view','inventory'),
 ('table','inventory_cart_items','inventory'),
 ('table','inventory_carts','inventory'),
 ('table','inventory_destination_users_view','inventory'),
 ('table','inventory_destination_vehicles_view','inventory'),
 ('table','inventory_transactions','inventory'),
 ('table','item_aliases','inventory'),
 ('table','item_price_history','inventory'),
 ('table','items','inventory'),
 ('table','job_budget_divisions','jobs'),
 ('table','job_budget_health_acknowledgements','jobs'),
 ('table','job_budget_lines','jobs'),
 ('table','job_buyout_lines','jobs'),
 ('table','job_buyout_vendor_quotes','jobs'),
 ('table','job_financial_baselines','jobs'),
 ('table','job_inspections','jobs'),
 ('table','job_materials','jobs'),
 ('table','job_pay_application_change_orders','jobs'),
 ('table','job_pay_application_lines','jobs'),
 ('table','job_pay_applications','jobs'),
 ('table','job_permits','jobs'),
 ('table','job_responsibilities','jobs'),
 ('table','job_revenue_lines','jobs'),
 ('table','job_schedule_items','jobs'),
 ('table','job_sov_template_lines','jobs'),
 ('table','job_sov_templates','jobs'),
 ('table','job_sub_divisions','jobs'),
 ('table','job_transaction_log','jobs'),
 ('table','job_user_assignments','jobs'),
 ('table','jobs','jobs'),
 ('table','material_catalogue_save_requests','inventory'),
 ('table','panel_directories','panel-directory'),
 ('table','shelves','inventory'),
 ('table','silas_conversations','silas'),
 ('table','silas_messages','silas'),
 ('table','silas_settings','silas'),
 ('table','storage_units','inventory'),
 ('table','svc_call_financials','jobs'),
 ('table','svc_cost_snapshots','jobs'),
 ('table','svc_invoice_groups','jobs'),
 ('table','svc_invoices','jobs'),
 ('table','svc_labor_lines','jobs'),
 ('table','svc_monthly_performance','jobs'),
 ('table','svc_payments','jobs'),
 ('table','svc_service_profiles','jobs'),
 ('table','svc_stage_definitions','jobs'),
 ('table','svc_visits','jobs'),
 ('table','tools','tools'),
 ('table','transaction_items','inventory'),
 ('table','vehicle_assignments','vehicles'),
 ('table','vehicle_bin_items','inventory'),
 ('table','vehicle_bins','vehicles'),
 ('table','vehicles','vehicles');
-- RESOURCE_MAP_END
-- Additional restrictive policies do not grant any access or replace existing policies.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT DISTINCT m.resource_name FROM hq_tool_private.resource_map m
 JOIN pg_class c ON c.relname=m.resource_name JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE m.resource_kind='table' AND n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity LOOP
  EXECUTE format('CREATE POLICY hq_tool_availability ON public.%I AS RESTRICTIVE FOR ALL TO authenticated,anon USING ((SELECT hq_tool_private.resource_allowed(''table'',%L))) WITH CHECK ((SELECT hq_tool_private.resource_allowed(''table'',%L)))',r.resource_name,r.resource_name,r.resource_name);
 END LOOP;
END $$;
-- Preserve the reviewed directory views' existing permission semantics. These
-- four views intentionally expose a filtered directory over user_permissions;
-- switching blindly to invoker would shrink ordinary users' directory results.
DO $$ DECLARE view_name text; definition text; BEGIN
 FOREACH view_name IN ARRAY ARRAY['inventory_cart_candidates_view','inventory_destination_users_view','inventory_destination_vehicles_view','job_transaction_log'] LOOP
  IF to_regclass('public.'||view_name) IS NOT NULL THEN
   SELECT pg_get_viewdef(to_regclass('public.'||view_name),true) INTO definition;
   EXECUTE format('CREATE OR REPLACE VIEW public.%I AS SELECT * FROM (%s) original WHERE (SELECT hq_tool_private.resource_allowed(''table'',%L))',view_name,rtrim(definition,E';\n\r '),view_name);
  END IF;
 END LOOP;
END $$;
-- Storage uses separate APIs and does not run the Data API pre-request hook.
CREATE FUNCTION hq_tool_private.storage_allowed(p_bucket text,p_path text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_module text;
BEGIN
 IF p_bucket IS DISTINCT FROM 'northgate-files' THEN RETURN true; END IF;
 IF hq_tool_private.developer() THEN RETURN true; END IF;
 IF p_path LIKE 'afc/%' THEN owner_module:='afc';
 ELSIF public.hi_managed_path(p_path) THEN owner_module:='electrical-inspections';
 ELSIF p_path LIKE 'documents/estimate/%' THEN owner_module:='estimates';
 ELSIF p_path LIKE 'documents/job/%' OR p_path LIKE 'documents/change_order/%' THEN owner_module:='jobs';
 ELSE owner_module:='documents'; END IF;
 RETURN NOT EXISTS(SELECT 1 FROM hq_tool_private.tools t WHERE NOT t.is_enabled AND
 (t.module_key=owner_module OR (p_path LIKE 'documents/%' AND t.module_key='documents')));
END $$;
REVOKE ALL ON FUNCTION hq_tool_private.storage_allowed(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION hq_tool_private.storage_allowed(text,text) TO anon,authenticated;
DO $$ BEGIN
 IF to_regclass('storage.objects') IS NOT NULL THEN
  CREATE POLICY hq_tool_availability ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated,anon
  USING (hq_tool_private.storage_allowed(bucket_id,name)) WITH CHECK (hq_tool_private.storage_allowed(bucket_id,name));
 END IF;
END $$;
COMMIT;
