-- Production acceptance smoke; synthetic records/audits roll back in entirety.
BEGIN;
SET LOCAL statement_timeout='25s';
SET LOCAL lock_timeout='3s';
CREATE TEMP TABLE estimating_smoke_result(result jsonb);
DO $$
DECLARE actor text; doc jsonb; w public.estimate_workbenches; a public.assemblies;
 m public.items; again public.items; candidate uuid:=gen_random_uuid(); snap uuid;
 blocked boolean; checklist_key text:='smoke_'||replace(gen_random_uuid()::text,'-','');
BEGIN
 SELECT clerk_user_id INTO STRICT actor FROM public.user_permissions WHERE lower(email)='crncmk@gmail.com' AND is_active;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 doc:='{"name":"ROLLBACK ONLY estimating integration","customer":"Synthetic release smoke","rate":75,"materialMarkup":30,"feePercent":30,"entries":[{"id":"entry","number":1,"items":[{"id":"work","number":1,"name":"Conduit run","qty":2,"laborRateOverride":95,"components":[{"id":"group","name":"Raceway"}],"lines":[{"id":"resource","componentId":"group","name":"Conduit","unit":"FT","qty":1,"price":7.8,"hours":0.1}]}]}],"finalizationChecklist":{"answers":{"available_fault_current":{"version":1,"status":"not_applicable"},"estimating_labor":{"version":1,"status":"included","values":{"hours":0}},"supervision_labor":{"version":1,"status":"excluded"}}}}';
 SET LOCAL ROLE authenticated;
 w:=public.save_estimate_workbench(NULL,'Electrical',doc,NULL,'[]');
 ASSERT w.document#>>'{entries,0,items,0,components,0,name}'='Raceway','Group missing';
 blocked:=false;BEGIN PERFORM public.save_estimate_workbench(w.estimate_id,'Electrical',doc,0,'[]');EXCEPTION WHEN serialization_failure THEN blocked:=true;END;ASSERT blocked,'Stale write accepted';
 snap:=public.approve_workbench_estimate(w.estimate_id,NULL);
 ASSERT (SELECT pricing_total=51.06 FROM public.estimate_snapshots WHERE id=snap),'Labor override / rounding mismatch';
 ASSERT (SELECT workbench_document#>>'{entries,0,items,0,laborRateOverride}'='95' FROM public.estimate_snapshots WHERE id=snap),'Snapshot missing override';
 a:=public.save_assembly_library('Electrical',jsonb_build_object('name','ROLLBACK ONLY grouped assembly','components',doc#>'{entries,0,items,0,components}','lines',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'componentId','group','name','Conduit','unit','FT','qty',1,'price',0,'hours',0))),NULL);
 ASSERT a.component_groups->0->>'id'='group','Library group missing';
 ASSERT EXISTS(SELECT 1 FROM public.assembly_items WHERE assembly_id=a.id AND component_group_id='group'),'Resource group missing';
 m:=public.save_estimating_catalogue_material(candidate,'Electrical','{"name":"ROLLBACK ONLY custom material","unit":"FT","price":"","hours":"0"}',NULL);
 ASSERT m.catalogue_draft AND NOT m.price_confirmed AND m.labor_rate_hrs=0,'Blank/zero catalogue semantics';
 again:=public.save_estimating_catalogue_material(candidate,'Electrical','{"name":"RETRY MUST NOT OVERWRITE","unit":"FT"}',NULL);
 ASSERT again.id=m.id AND again.name=m.name,'Retry not idempotent';
 PERFORM public.manage_estimate_checklist(checklist_key,'ROLLBACK ONLY checklist','',false,NULL);
 blocked:=false;BEGIN PERFORM public.manage_estimate_checklist(checklist_key,NULL,'',true,'');EXCEPTION WHEN raise_exception THEN blocked:=position('reason' in SQLERRM)>0;END;ASSERT blocked,'Retirement without reason';
 PERFORM public.manage_estimate_checklist(checklist_key,NULL,'',true,'Rollback-only verification');
 ASSERT NOT (SELECT enabled FROM public.estimate_checklist_definitions WHERE estimate_checklist_definitions.key=checklist_key),'Checklist not retired';
 RESET ROLE;
 ASSERT EXISTS(SELECT 1 FROM public.change_logs WHERE record_id=m.id::text),'Missing catalogue audit';
 ASSERT NOT has_function_privilege('anon','public.save_estimating_catalogue_material(uuid,text,jsonb,timestamptz)','EXECUTE'),'Anonymous catalogue RPC';
 ASSERT NOT has_function_privilege('authenticated','public.approve_workbench_estimate_internal(uuid,text)','EXECUTE'),'Internal approval exposed';
 INSERT INTO estimating_smoke_result VALUES(jsonb_build_object('pass',true,'checks','authenticated draft, stale rejection, approval snapshot/rate cents, grouped library, catalogue blank/zero/retry/audit, checklist addition/retirement, restricted RPCs; all rows rolled back'));
END $$;
SELECT result FROM estimating_smoke_result;
ROLLBACK;
