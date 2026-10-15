import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {checklistIssues,answerConsideration,answerNumber} from '../src/modules/estimates/workbench/finalizationChecklist.mjs';
import {sumPricing} from '../src/modules/estimates/workbench/pricing.mjs';
import {proposalCharges} from '../src/modules/estimates/workbench/proposalCharges.mjs';
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
 await db.exec(await read('supabase/migrations/20260918173055_job_financial_exports_deletion_sov_templates.sql'));
 await db.exec(await read('supabase/migrations/20260918180036_fix_job_revenue_line_save_rls.sql'));
 await db.exec(await read('supabase/migrations/20260916200942_workbench_decimal_validation.sql'));
 await db.exec(await read('supabase/migrations/20261012220350_assembly_library_labor_rates.sql'));

 const preMigrationSnapshots=await q('select id,workbench_document,pricing_total from estimate_snapshots order by id');
 await db.exec(await read('supabase/migrations/20261015135754_estimate_proposal_charges.sql'));
 assert.deepEqual((await q('select id,workbench_document,pricing_total from estimate_snapshots order by id')).rows,preMigrationSnapshots.rows);
 for(const role of ['anon','authenticated'])assert.equal(await one("select has_function_privilege($1,'workbench_proposal_charges(numeric,jsonb)','EXECUTE')",[role]),false);
 for(let n=0;n<120;n++){
  const amount=(n*7919%100000)/100,proposal={salesTaxPercent:String((n*357%10000)/100),creditCardPercent:String((n*117%10000)/100)};
  const sql=await one('select workbench_proposal_charges($1,$2)',[amount,proposal]);
  assert.deepEqual(sql,proposalCharges(amount,proposal));
 }
 await actor('developer');
 const doc=completed();doc.proposal={scope:'Charge fixture',salesTaxPercent:'7.25',creditCardPercent:'3'};
 const saved=await save(doc),reloaded=await one('select document from estimate_workbenches where estimate_id=$1',[saved.estimate_id]);
 assert.deepEqual(reloaded.proposal,doc.proposal);
 assert.deepEqual(sumPricing(reloaded.entries.flatMap(e=>e.items),reloaded),sumPricing(doc.entries.flatMap(e=>e.items),doc));
 // A charge-bearing handoff must fail before creating a destination or losing charges.
 await assert.rejects(()=>send(saved.estimate_id),/destination accounting review/);
 const snapshotId=await approve(saved.estimate_id);
 const snapshot=await one('select row_to_json(s) from estimate_snapshots s where id=$1',[snapshotId]);
 const expected=sumPricing(doc.entries.flatMap(e=>e.items),doc);
 assert.equal(Number(snapshot.pricing_total),expected.price);
 assert.deepEqual(snapshot.workbench_document.proposalChargeSnapshot,proposalCharges(expected.preTaxTotal,doc.proposal));
 for(const key of ['salesTaxPercent','creditCardPercent'])for(const invalid of ['','-1','101','NaN','Infinity','1e2','0.00001',' 3',true]){
  const bad=structuredClone(doc);bad.proposal[key]=invalid;
  await assert.rejects(()=>save(bad),/percentages/);
 }
 const zero=completed();zero.proposal={salesTaxPercent:0,creditCardPercent:0};
 const legacy=await save(zero),legacySnapshot=await approve(legacy.estimate_id);
 assert.equal(Number(await one('select pricing_total from estimate_snapshots where id=$1',[legacySnapshot])),sumPricing(zero.entries.flatMap(e=>e.items),zero).price);
 console.log('PASS: isolated PostgreSQL migration; 120 SQL/JS rounding parity cases; authenticated save/reload and approval; immutable snapshot breakdown; invalid input rejection; anonymous denial; charged handoff rejection; historical snapshot preservation; zero compatibility.');
}catch(e){console.error(e.message,e.detail||'',e.where||'',e.position);process.exitCode=1;}finally{await db.close();}
