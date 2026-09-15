import {PGlite} from '../.temp/inspection-checks/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {handoffPreview} from '../src/modules/estimates/workbench/handoff.mjs';
const db=new PGlite(),q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
const actor=async name=>{await db.exec('reset role');await q("select set_config('test.actor',$1,false)",[name]);await db.exec('set role authenticated');};
const doc={name:'Estimate integration',rate:75,materialMarkup:30,feePercent:30,proposal:{scope:'Install lighting'},entries:[{id:'entry',number:1,location:'Office',section:'Power',items:[{id:'one',number:1,name:'Install light',qty:2,lines:[{qty:1,price:10.05,hours:0.15}]},{id:'two',number:2,name:'Labor',qty:1,lines:[{qty:1,price:0,hours:0.1}]}]}]};
try{
 await db.exec(await readFile('tests/fixtures/inspectionPrerequisites.sql','utf8'));
 await db.exec('set check_function_bodies=off');await db.exec(await readFile('tests/fixtures/inspectionAuthFunctions.sql','utf8'));
 await db.exec(await readFile('tests/fixtures/estimateHandoffDependencies.sql','utf8'));await db.exec('set check_function_bodies=on');
 await db.exec("insert into svc_stage_definitions(key,label,kind,job_status,background_color)values('pursuit','Pursuit','work','on_hold','#ffffdd'); insert into user_permissions(clerk_user_id,role,division,display_name)values('developer','Developer','Electrical','Developer Fixture'),('user','User','Electrical','User Fixture'),('inactive','Developer','Electrical','Inactive');update user_permissions set is_active=false where clerk_user_id='inactive';");
 await db.exec(await readFile('supabase/migrations/20260915194050_estimate_workflow_handoffs.sql','utf8'));
 const job=await one("insert into jobs(name,division,job_type)values('Test job','Electrical','job')returning id");
 const b=await one("insert into job_budget_lines(job_id,division,cost_code,description,category)values($1,'Electrical','16.CO','Electrical Change Orders','Other')returning id",[job]);
 const make=async(document=doc)=>{await db.exec('reset role');const id=await one("insert into estimates(title,division,editor_version,status,version_number)values('Estimate integration','Electrical',2,'draft',1)returning id");await q('insert into estimate_workbenches(estimate_id,revision,document)values($1,1,$2)',[id,document]);await actor('developer');return id;};
 const send=(id,destination='change_order',target=job,newJob=null,revision=1,targets={'entry:one':b,'entry:two':b})=>one('select row_to_json(h) from submit_estimate_for_review($1,$2,$3,$4,$5,NULL,$6) h',[id,revision,destination,target,newJob,targets]);
 assert.equal(await one("select has_function_privilege('anon','public.submit_estimate_for_review(uuid,integer,text,uuid,jsonb,text,jsonb)','EXECUTE')"),false);
 assert.equal(await one("select has_table_privilege('authenticated','public.estimate_workflow_handoffs','INSERT')"),false);
 let id=await make();await assert.rejects(()=>send(id,'change_order',job,null,0),/changed/);
 await assert.rejects(()=>send(id,'change_order',job,null,1,{}),/active project-division/);
 await actor('user');await assert.rejects(()=>send(id),/permission/);await actor('inactive');await assert.rejects(()=>send(id),/active signed/);await actor('developer');
 await db.exec('reset role');await q("insert into user_permission_overrides(user_id,permission_flag,granted)values('developer','can_view_protected_project_financials',false)");await actor('developer');await assert.rejects(()=>send(id),/protected financial/);await db.exec('reset role');await q("delete from user_permission_overrides where user_id='developer'");await actor('developer');
 const wrongJob=await (async()=>{await db.exec('reset role');const other=await one("insert into jobs(name,division,job_type)values('Other','Electrical','job')returning id");await actor('developer');return other;})();
 await assert.rejects(()=>send(id,'change_order',wrongJob),/active project-division/);
 const result=await send(id),preview=handoffPreview(doc);assert.equal(Number(result.pricing.total),preview.total);assert.equal(result.destination,'change_order');
 await db.exec('reset role');const co=(await q('select * from change_orders where id=$1',[result.change_order_id])).rows[0];
 assert.equal(co.status,'draft');assert.equal(Number(co.price_amount),preview.total);assert.equal(co.submitted_at,null);assert.equal(co.approved_at,null);
 const lines=(await q('select * from change_order_lines where change_order_id=$1 order by sort_order',[co.id])).rows;
 for(let i=0;i<lines.length;i++)for(const key of ['material_amount','labor_amount','other_amount','markup_amount','line_total'])assert.equal(Number(lines[i][key]),preview.lines[i][key],key);
 await q("update change_orders set description='Reviewer amended scope' where id=$1",[co.id]);
 await q("update estimate_workbenches set revision=2,document=jsonb_set(document,'{rate}','150') where estimate_id=$1",[id]);
 await actor('developer');assert.equal((await send(id)).id,result.id);
 await db.exec('reset role');assert.equal(await one('select count(*)::int from change_orders'),1);assert.equal(await one('select description from change_orders where id=$1',[co.id]),'Reviewer amended scope');
 assert.equal(await one("select source_document->>'rate' from estimate_workflow_handoffs where id=$1",[result.id]),'75');
 await assert.rejects(()=>q('update estimate_workflow_handoffs set source_revision=2 where id=$1',[result.id]),/immutable/);
 await actor('user');assert.equal(await one('select count(*)::int from estimate_workflow_handoffs'),0);
 await assert.rejects(()=>q('delete from estimate_workflow_handoffs where id=$1',[result.id]),/permission denied/);
 id=await make();const newJob=await send(id,'job',null,{number:'EST-1',name:'New test job'});await db.exec('reset role');assert.equal(await one('select status from jobs where id=$1',[newJob.job_id]),'on_hold');
 id=await make();const call=await send(id,'service_call',null,{number:'SC-1',name:'New service call'});await db.exec('reset role');
 assert.equal(await one('select work_stage from svc_service_profiles where job_id=$1',[call.job_id]),'pursuit');assert.equal(await one('select quote_amount from svc_service_profiles where job_id=$1',[call.job_id]),null);
 id=await make();await assert.rejects(()=>send(id,'service_call',job),/correct type/);
 id=await make();await assert.rejects(()=>send(id,'job',null,{number:'EST-1',name:'Duplicate'}),/already assigned/);
 id=await make();await db.exec('reset role');await q("update estimates set status='approved' where id=$1",[id]);await actor('developer');await assert.rejects(()=>send(id),/approved snapshot/);
 await db.exec('reset role');await q('insert into estimate_snapshots(estimate_id,pricing_total)values($1,$2)',[id,preview.total]);await actor('developer');assert.equal((await send(id)).destination,'change_order');
 id=await make();const existingCall=await send(id,'service_call',call.job_id);assert.equal(existingCall.job_id,call.job_id);
 await assert.rejects(()=>send(id,'job',job),/already has a destination/);
 // Randomized non-negative decimals exercise server/preview cent reconciliation.
 await db.exec('reset role');
 for(let n=1;n<=35;n++){
  const varied=structuredClone(doc);varied.feePercent=n/7;varied.materialMarkup=n/3;varied.entries[0].items[0].qty=n/9;
  varied.entries[0].items[0].lines[0]={qty:n/11,price:n/13,hours:n/17,fixed:n%2===0};
  const calculated=await one('select workbench_handoff_pricing($1)',[varied]),expected=handoffPreview(varied);
  assert.equal(Number(calculated.total),expected.total);assert.equal(Number(calculated.fee),expected.fee);
  calculated.lines.forEach((line,i)=>{for(const key of ['material_amount','labor_amount','other_amount','markup_amount','line_total'])assert.equal(Number(line[key]),expected.lines[i][key],`${n}: ${key}`);});
 }
 const quoteDoc=structuredClone(doc);quoteDoc.entries[0].items.push({id:'quote',number:3,name:'Awarded gear',qty:1,quoteId:'q',lines:[]});quoteDoc.quotes=[{id:'q',materialAmount:100.25,otherAmount:50.01}];
 id=await make(quoteDoc);const quoted=await send(id,'job',job);assert.equal(Number(quoted.pricing.total),handoffPreview(quoteDoc).total);
 for(const value of ['',-1,'NaN',null]){const bad=structuredClone(doc);bad.entries[0].items[0].lines[0].hours=value;id=await make(bad);await assert.rejects(()=>send(id),/valid non-negative/);}
 // Failure at the final audit must roll back the CO and its source snapshot.
 id=await make();await db.exec('reset role');const before=await one('select count(*)::int from change_orders');
 await db.exec("create function fail_handoff_audit() returns trigger language plpgsql as $$begin if new.table_name='estimate_workflow_handoffs' then raise exception 'Injected audit failure';end if;return new;end$$;create trigger fail_handoff before insert on change_logs for each row execute function fail_handoff_audit()");
 await actor('developer');await assert.rejects(()=>send(id),/Injected audit/);await db.exec('reset role');assert.equal(await one('select count(*)::int from change_orders'),before);assert.equal(await one('select count(*)::int from estimate_workflow_handoffs where estimate_id=$1',[id]),0);
 console.log('PASS: server/preview reconciliation, material/labor/fee/quote mapping; CO draft only; repeat and stale protection; source immutability; actual destination functions for new On Hold job and Pursuit service call; no actual-cost/quote posting; permission denial/RLS; invalid components; audit-failure rollback. Isolated database, not a live/concurrent-session test.');
}catch(e){console.error(e.message,e.detail||'',e.where||'',e.position,e.query?.slice(Math.max(0,Number(e.position)-220),Number(e.position)+220));process.exitCode=1;}finally{await db.close();}
