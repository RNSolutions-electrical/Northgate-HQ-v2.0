-- Run with the migration inside BEGIN / ROLLBACK. No retained test records.
INSERT INTO public.user_permissions(clerk_user_id,email,role,division,is_active,permission_overrides)
VALUES('__workbench_test','workbench@example.invalid','Developer','Admin',true,'{}'),
('__workbench_denied','workbench-denied@example.invalid','User','Electrical',true,'{"can_estimate":false,"can_edit_catalog":false}'),
('__workbench_allowed','workbench-allowed@example.invalid','User','Electrical',true,'{"can_estimate":true,"can_edit_catalog":true}');
INSERT INTO public.items(material_code,name,division) VALUES('__workbench_test','Workbench test material','Electrical');
CREATE FUNCTION pg_temp.reject_workbench_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.table_name='items' AND NEW.after_data->>'price_per_unit'='999' THEN
RAISE EXCEPTION 'Injected audit failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER test_workbench_audit BEFORE INSERT ON public.change_logs FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_workbench_audit();
SELECT set_config('request.jwt.claims','{"sub":"__workbench_test","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE material public.items; w public.estimate_workbenches; saved public.estimate_workbenches;
 doc jsonb; updates jsonb; before_item jsonb;
BEGIN
 SELECT * INTO material FROM public.items WHERE material_code='__workbench_test';
 doc:=jsonb_build_object('name','Workbench validation','customer','Test','entries',jsonb_build_array(jsonb_build_object('items',jsonb_build_array(jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('catalogueId',material.id,'price',12,'hours',0.25)))))));
 w:=public.save_estimate_workbench(NULL,'Electrical',doc,NULL,'[]');
 IF w.revision<>1 THEN RAISE EXCEPTION 'Initial save failed'; END IF;
 IF (SELECT price_per_unit FROM public.items WHERE id=material.id)<>0 THEN RAISE EXCEPTION 'Project-only touched catalogue'; END IF;
 updates:=jsonb_build_array(jsonb_build_object('item_id',material.id,'expected_updated_at',material.updated_at,'changes',jsonb_build_object('price_per_unit',12,'labor_rate_hrs',0.25)));
 w:=public.save_estimate_workbench(w.estimate_id,'Electrical',doc,w.revision,updates);
 SELECT * INTO material FROM public.items WHERE id=material.id;
 IF material.price_per_unit<>12 OR material.labor_rate_hrs<>0.25 OR NOT material.price_confirmed OR material.labor_value_source<>'internal' THEN RAISE EXCEPTION 'Shared values failed'; END IF;
 IF w.revision<>2 THEN RAISE EXCEPTION 'Revision failed'; END IF;
 BEGIN PERFORM public.save_estimate_workbench(w.estimate_id,'Electrical',doc,1,'[]');RAISE EXCEPTION 'Stale draft accepted';
 EXCEPTION WHEN serialization_failure THEN NULL;END;
 BEGIN PERFORM public.save_estimate_workbench(w.estimate_id,'Electrical',doc,2,updates);RAISE EXCEPTION 'Stale catalogue accepted';
 EXCEPTION WHEN serialization_failure THEN NULL;END;
 before_item:=to_jsonb(material);
 doc:=jsonb_set(doc,'{entries,0,items,0,lines,0,price}','999');
 updates:=jsonb_build_array(jsonb_build_object('item_id',material.id,'expected_updated_at',material.updated_at,'changes',jsonb_build_object('price_per_unit',999)));
 BEGIN PERFORM public.save_estimate_workbench(w.estimate_id,'Electrical',doc,w.revision,updates);RAISE EXCEPTION 'Audit failure ignored';
 EXCEPTION WHEN check_violation THEN NULL;END;
 IF (SELECT to_jsonb(i) FROM public.items i WHERE id=material.id)<>before_item THEN RAISE EXCEPTION 'Partial catalogue write';END IF;
 IF (SELECT revision FROM public.estimate_workbenches WHERE estimate_id=w.estimate_id)<>2 THEN RAISE EXCEPTION 'Partial draft write';END IF;
 material:=public.save_material_catalogue_values(material.id,'{"price_per_unit":0}',material.updated_at,NULL);
 IF material.labor_rate_hrs<>0.25 OR NOT material.price_confirmed THEN RAISE EXCEPTION 'Zero / partial patch failure';END IF;
 BEGIN PERFORM public.save_material_catalogue_values(material.id,'{"division":"Admin"}',material.updated_at,NULL);RAISE EXCEPTION 'Unsupported field accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN UPDATE public.estimate_workbenches SET document=doc WHERE estimate_id=w.estimate_id;RAISE EXCEPTION 'Direct write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claims','{"sub":"__workbench_allowed","role":"authenticated"}',true);
 material:=public.save_material_catalogue_values(material.id,'{"labor_rate_hrs":0}',material.updated_at,w.estimate_id);
 IF material.labor_rate_hrs<>0 THEN RAISE EXCEPTION 'Existing normal-user permission failed';END IF;
 BEGIN PERFORM public.save_estimate_workbench(NULL,'Admin',doc,NULL,'[]');RAISE EXCEPTION 'Wrong division accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claims','{"sub":"__workbench_denied","role":"authenticated"}',true);
 BEGIN PERFORM public.save_estimate_workbench(w.estimate_id,'Electrical',doc,2,'[]');RAISE EXCEPTION 'Denied estimate accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.save_material_catalogue_values(material.id,'{"price_per_unit":1}',material.updated_at,NULL);RAISE EXCEPTION 'Denied catalogue accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.change_logs WHERE user_id='__workbench_test' AND table_name='estimate_workbenches')<>2 THEN RAISE EXCEPTION 'Duplicate draft audit';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.change_logs WHERE user_id='__workbench_test' AND table_name='items' AND note::jsonb->>'source'='estimate' AND note::jsonb->>'estimate_id' IS NOT NULL) THEN RAISE EXCEPTION 'Missing source audit';END IF;
 IF has_function_privilege('anon','public.save_estimate_workbench(uuid,text,jsonb,integer,jsonb)','execute') THEN RAISE EXCEPTION 'Anonymous RPC exposed';END IF;
 IF has_function_privilege('authenticated','public.audit_material_values()','execute') THEN RAISE EXCEPTION 'Audit helper exposed';END IF;
END $$;
