import {PGlite} from '../.temp/inspection-checks/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {checklistIssues,answerConsideration,answerNumber} from '../src/modules/estimates/workbench/finalizationChecklist.mjs';
import {handoffPreview} from '../src/modules/estimates/workbench/handoff.mjs';
const db=new PGlite(),read=p=>readFile(p,'utf8'),q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
const actor=async name=>{await db.exec('reset role');await q("select set_config('test.actor',$1,false)",[name]);await db.exec('set role authenticated');};
const defs=JSON.parse(await read('tests/fixtures/estimateChecklistDefinitions.json')),def=key=>defs.find(d=>d.key===key);
const draft={name:'Checklist integration',customer:'Fixture',rate:75,materialMarkup:30,feePercent:30,entries:[{id:'entry',number:1,location:'Office',section:'Power',items:[{id:'one',number:1,name:'Install light',qty:2,lines:[{qty:1,price:10.05,hours:0.15}]}]}]};
const completed=()=>['available_fault_current','estimating_labor','supervision_labor'].reduce((d,key)=>answerConsideration(d,def(key),key==='available_fault_current'?'not_applicable':'excluded'),structuredClone(draft));
const save=(document=draft,id=null,revision=null)=>one("select row_to_json(w) from save_estimate_workbench($1,'Electrical',$2,$3,'[]') w",[id,document,revision]);
const approve=id=>one('select approve_workbench_estimate($1,null)',[id]);
let job;
const send=(id,revision=1)=>one("select row_to_json(h) from submit_estimate_for_review($1,$2,'job',$3,null,null,'{}') h",[id,revision,job]);
try{
 await db.exec(await read('tests/fixtures/inspectionPrerequisites.sql'));
 await db.exec('set check_function_bodies=off');await db.exec(await read('tests/fixtures/inspectionAuthFunctions.sql'));
 await db.exec(await read('tests/fixtures/estimateHandoffDependencies.sql'));
 const catalogue=await read('supabase/migrations/20260913164527_estimate_workbench_catalogue.sql');
 const approval=await read('supabase/migrations/20260914103331_estimate_workbench_approval.sql');
 const snapshots=await read('supabase/migrations/20260816191500_estimate_approval_snapshots.sql');
 await db.exec('drop table estimate_snapshots');
 await db.exec(snapshots.slice(snapshots.indexOf('CREATE TABLE IF NOT EXISTS'),snapshots.indexOf('CREATE OR REPLACE FUNCTION public.approve_estimate')));
 await db.exec('alter table estimate_snapshots add column workbench_document jsonb');
 const directory=await read('supabase/migrations/20260816171500_estimate_directory_foundation.sql');
 await db.exec(directory.slice(directory.indexOf('ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY')));
 await db.exec(catalogue.slice(catalogue.indexOf('ALTER TABLE public.estimate_workbenches ENABLE'),catalogue.indexOf('CREATE FUNCTION public.guard_workbench_header')));
 await db.exec(approval.slice(approval.indexOf('CREATE OR REPLACE FUNCTION public.guard_workbench_header'),approval.indexOf('CREATE OR REPLACE FUNCTION public.approve_workbench_estimate')));
 await db.exec('create trigger guard_workbench_header before insert or update on estimates for each row execute function guard_workbench_header()');
 await db.exec(catalogue.slice(catalogue.indexOf('CREATE FUNCTION public.audit_estimate_workbench'),catalogue.indexOf('CREATE FUNCTION public.save_estimate_workbench')));
 await db.exec(await read('tests/fixtures/estimateChecklistFunctions.sql'));
 await db.exec("revoke all on function approve_workbench_estimate_internal(uuid,text) from public,anon,authenticated;revoke all on function approve_workbench_estimate(uuid,text),save_estimate_workbench(uuid,text,jsonb,integer,jsonb) from public,anon;grant execute on function approve_workbench_estimate(uuid,text),save_estimate_workbench(uuid,text,jsonb,integer,jsonb) to authenticated;");
 const revisions=await read('supabase/migrations/20260914121940_estimate_workbench_revisions.sql');
 await db.exec(revisions.slice(revisions.indexOf('CREATE UNIQUE INDEX')));
 await db.exec(await read('supabase/migrations/20260914123229_estimate_revision_archived_numbering.sql'));
 await db.exec(await read('supabase/migrations/20260915194050_estimate_workflow_handoffs.sql'));
 await db.exec('set check_function_bodies=on');
 await db.exec("insert into user_permissions(clerk_user_id,role,division,display_name)values('developer','Developer','Electrical','Developer fixture'),('user','User','Electrical','User fixture'),('inactive','Developer','Electrical','Inactive fixture'),('reviewer','User','Electrical','Reviewer fixture');update user_permissions set is_active=false where clerk_user_id='inactive';insert into user_permission_overrides(user_id,permission_flag,granted)values('reviewer','can_approve_estimates',true);");
 job=await one("insert into jobs(name,division,job_type)values('Checklist test job','Electrical','job')returning id");
 // A real pre-migration approval must remain usable after enabling the new rules.
 await actor('developer');const historical=await save(),historicalSnapshot=await approve(historical.estimate_id);
 const originalHistory=await one('select workbench_document from estimate_snapshots where id=$1',[historicalSnapshot]);
 await db.exec('reset role');
 await db.exec(await read('supabase/migrations/20260916103538_estimate_finalization_checklist.sql'));

 // Install actual assembly tables, grants, policies and existing save/audit functions.
 await db.exec(`CREATE TABLE public.items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),material_code text UNIQUE NOT NULL,name text NOT NULL,
 division text,unit_of_measure text,price_per_unit numeric NOT NULL DEFAULT 0,price_confirmed boolean NOT NULL DEFAULT false,
 labor_rate_hrs numeric,labor_value_source text DEFAULT 'unverified',catalogue_draft_placeholder boolean,
 is_active boolean DEFAULT true,is_archived boolean DEFAULT false,estimating_enabled boolean DEFAULT true,updated_at timestamptz DEFAULT now());
 GRANT SELECT,INSERT,UPDATE ON items TO authenticated;
 ALTER TABLE items ENABLE ROW LEVEL SECURITY;
 CREATE POLICY read_items ON items FOR SELECT TO authenticated USING(current_user_can_read_division(division,'can_estimate'));
 CREATE POLICY write_items ON items FOR ALL TO authenticated USING(current_user_can_edit_division(division,'can_edit_catalog')) WITH CHECK(current_user_can_edit_division(division,'can_edit_catalog'));`);
 await db.exec("create function touch_user_permissions_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$");
 const original=await read('supabase/migrations/20260823103000_estimating_catalog_assemblies_takeoffs.sql');
 await db.exec(original.slice(original.indexOf('CREATE TABLE IF NOT EXISTS public.assemblies ('),original.indexOf('GRANT SELECT, INSERT, UPDATE ON public.assembly_items TO authenticated;')+'GRANT SELECT, INSERT, UPDATE ON public.assembly_items TO authenticated;'.length));
 for(const name of ['20260914002830_workbench_assembly_library.sql','20260914004020_fix_assembly_audit_actions.sql','20260914010605_standalone_assembly_library.sql','20260914012059_assembly_categories.sql'])await db.exec(await read('supabase/migrations/'+name));
 await db.exec(catalogue.slice(catalogue.indexOf('CREATE FUNCTION public.audit_material_values'),catalogue.indexOf('CREATE FUNCTION public.audit_estimate_workbench')));
 await db.exec(await read('supabase/migrations/20260916173238_estimating_workspace_integration.sql'));
 await actor('developer');
 const doc=completed(),item=doc.entries[0].items[0];item.name='Grouped work';item.laborRateOverride='95';
 item.components=[{id:'group-one',name:'Conduit run'}];
 item.lines[0]={...item.lines[0],id:crypto.randomUUID(),name:'Conduit',unit:'FT',componentId:'group-one'};
 let row=await save(doc);assert.deepEqual(row.document.entries[0].items[0].components,item.components);
 const expected=handoffPreview(doc).total,handed=await send(row.estimate_id);
 assert.equal(Number(handed.pricing.total),expected,'handoff uses work-item labor override');
 const snapshotId=await approve(row.estimate_id),snapshot=(await q('select * from estimate_snapshots where id=$1',[snapshotId])).rows[0];
 assert.equal(Number(snapshot.pricing_total),expected,'approved server total matches browser and handoff');
 assert.deepEqual(snapshot.workbench_document.entries[0].items[0].components,item.components);
 await assert.rejects(()=>save(doc,row.estimate_id,row.revision),/draft|permission/);
 assert.deepEqual(await one('select workbench_document from estimate_snapshots where id=$1',[historicalSnapshot]),originalHistory);
 // Drafts retain blank inputs; finalization blocks missing groups and values.
 const blank=structuredClone(doc);blank.entries[0].items[0].lines[0].price=null;
 row=await save(blank);await assert.rejects(()=>approve(row.estimate_id),/non-negative|component/);await assert.rejects(()=>send(row.estimate_id),/price/);
 const empty=structuredClone(doc);empty.entries[0].items[0].components.push({id:'empty',name:'Empty'});
 row=await save(empty);await assert.rejects(()=>approve(row.estimate_id),/Every component/);await assert.rejects(()=>send(row.estimate_id),/Every component/);
 const zero=structuredClone(doc);zero.entries[0].items[0].lines[0].price=0;zero.entries[0].items[0].lines[0].hours=0;
 row=await save(zero);await approve(row.estimate_id);
 const malformed=structuredClone(doc);malformed.entries[0].items[0].laborRateOverride=-1;
 await assert.rejects(()=>save(malformed),/labor rate/);
 const orphan=structuredClone(doc);orphan.entries[0].items[0].lines[0].componentId='other';
 await assert.rejects(()=>save(orphan),/matching component/);
 row=await save(doc);await assert.rejects(()=>save(doc,row.estimate_id,0),/changed/);
 // Real library persistence, independent duplication and stale-save refusal.
 const assembly={name:'Grouped library',categories:['Commercial'],components:item.components,lines:item.lines};
 const libSave=a=>one("select row_to_json(a) from save_assembly_library('Electrical',$1,null) a",[a]);
 let lib=await libSave(assembly);assert.deepEqual(lib.component_groups,item.components);
 assert.equal(await one('select component_group_id from assembly_items where assembly_id=$1',[lib.id]),'group-one');
 const lib2=await libSave({...assembly,name:'Independent copy'});assert.notEqual(lib2.id,lib.id);
 await assert.rejects(()=>libSave({...assembly,id:lib.id,updatedAt:'2000-01-01'}),/changed/);
 // Catalogue missing/zero values, explicit metadata review and request retries.
 const materialId=crypto.randomUUID(),values={name:'Custom conduit',material_code:'',unit:'FT',price:'',hours:'0'};
 const catalog=(values,id=materialId,stamp=null,division='Electrical')=>one('select row_to_json(i) from save_estimating_catalogue_material($1,$2,$3,$4) i',[id,division,values,stamp]);
 let material=await catalog(values);assert.equal(material.catalogue_draft,true);assert.equal(material.price_confirmed,false);assert.equal(Number(material.labor_rate_hrs),0);
 assert.equal((await catalog(values)).id,material.id,'retry reuses candidate ID');
 material=await catalog({...values,material_code:'EMT-001',price:'0'},material.id,material.updated_at);assert.equal(material.catalogue_draft,false);assert.equal(material.price_confirmed,true);
 await assert.rejects(()=>catalog({...values,price:'10'},material.id,'2000-01-01'),/changed/);
 await assert.rejects(()=>catalog({...values,material_code:'EMT-001'},crypto.randomUUID()),/already exists/);
 // Clearing a formerly priced item must remain unconfirmed despite existing audit trigger.
 material=await catalog({...values,price:'5'},material.id,material.updated_at);
 material=await catalog(values,material.id,material.updated_at);assert.equal(material.price_confirmed,false);
 const shared=await one("select row_to_json(d) from manage_estimate_checklist('custom_safety','Safety review','',false,null) d");
 assert.equal(shared.enabled,true);
 await assert.rejects(()=>q("select manage_estimate_checklist('custom_safety',null,'',true,'')"),/reason/);
 await q("select manage_estimate_checklist('custom_safety',null,'',true,'Retire test consideration')");
 assert.equal(await one("select enabled from estimate_checklist_definitions where key='custom_safety'"),false);
 // Permission denials and direct-table protections.
 await actor('user');await assert.rejects(()=>catalog(values,crypto.randomUUID()),/permission/);
 await assert.rejects(()=>q("select manage_estimate_checklist('custom_user','Denied','',false,null)"),/permission/);
 await assert.rejects(()=>q("select manage_estimate_checklist('custom_safety',null,'',true,'No authority')"),/Developer/);
 await assert.rejects(()=>libSave(assembly),/permission/);
 await actor('inactive');await assert.rejects(()=>catalog(values,crypto.randomUUID()),/permission/);
 await db.exec('reset role');
 assert.equal(await one("select has_function_privilege('anon','save_estimating_catalogue_material(uuid,text,jsonb,timestamptz)','EXECUTE')"),false);
 assert.equal(await one("select has_function_privilege('authenticated','approve_workbench_estimate_internal(uuid,text)','EXECUTE')"),false);
 assert.equal(await one("select has_function_privilege('anon','manage_estimate_checklist(text,text,text,boolean,text)','EXECUTE')"),false);
 await db.exec("create function reject_integration_audit() returns trigger language plpgsql as $$begin if new.table_name='items' then raise exception 'Injected audit failure';end if;return new;end$$;create trigger reject_integration_audit before insert on change_logs for each row execute function reject_integration_audit()");
 await actor('developer');const rejectedId=crypto.randomUUID();await assert.rejects(()=>catalog(values,rejectedId),/Injected audit failure/);
 await db.exec('reset role');assert.equal(await one('select count(*)::int from items where id=$1',[rejectedId]),0);
 console.log('PASS: isolated Postgres migration, real save/approval/handoff with rate override, grouped library round trip, blank/zero/empty/orphan validation, immutable old snapshots, stale updates, catalogue create/retry/review/clear, permissions, checklist add/retire and atomic audit rollback. No live writes.');
}catch(e){console.error(e.message,e.detail||'',e.where||'',e.stack);process.exitCode=1;}finally{await db.close();}
