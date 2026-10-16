// Runs only against the disposable loopback PostgreSQL fixture created for this task.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from '../.temp/postgres-runtime/node_modules/pg/lib/index.js';
const {Client}=pg;
export async function verifyStandaloneRaces({doc,save,submit,actor,one,rootOne,checks}){
 const clients=[new Client({host:'127.0.0.1',port:55439,user:'postgres',database:'postgres'}),new Client({host:'127.0.0.1',port:55439,user:'postgres',database:'postgres'})];
 await Promise.all(clients.map(c=>c.connect()));const [a,b]=clients;
 async function race(id,first,second,roles=['developer','developer'],expectBlock=true){
  for(let i=0;i<2;i++){await clients[i].query('reset role');await clients[i].query("select set_config('test.actor',$1,false)",[roles[i]]);}
  for(const c of clients)await c.query('set role authenticated;set statement_timeout=5000;set lock_timeout=4000');
  // Root fixture coordinator holds the row regardless of the reviewer's direct-table RLS.
  await a.query('reset role;begin');
  assert.equal((await a.query('select id from estimates where id=$1 for update',[id])).rowCount,1);
  await a.query('set role authenticated');
  const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
  const pending=b.query(second.sql,second.args).then(value=>({value}),error=>({error}));
  let blocked=false;
  for(let i=0;i<40;i++){
   if(await rootOne("select count(*)::int from pg_stat_activity where pid=$1 and wait_event_type='Lock'",[pid])){blocked=true;break;}
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  if(expectBlock&&!blocked){await a.query('rollback');const outcome=await pending;assert.fail('second real PostgreSQL session must block: '+(outcome.error?.message||'completed without blocking'));}
  let winner;try{winner=await a.query(first.sql,first.args);await a.query('commit');}catch(error){await a.query('rollback');throw error;}
  return {winner,loser:await pending};
 }
 const submission=(id,request,note='Race fixture')=>({sql:'select row_to_json(r) result from submit_standalone_estimate_review($1,$2,1,$3) r',args:[request,id,note]});
 const decision=(r,value)=>({sql:'select review_standalone_estimate($1,$2,$3,$4,$5) result',args:[r.id,r.source_revision,r.source_hash,value,'Race decision']});
 try{
  await actor('developer');let saved=await save(),request=randomUUID(),op=submission(saved.estimate_id,request);
  let result=await race(saved.estimate_id,op,op);assert.ifError(result.loser.error);assert.equal(result.winner.rows[0].result.id,result.loser.value.rows[0].result.id);
  assert.equal(await one('select count(*)::int from estimate_review_requests where estimate_id=$1',[saved.estimate_id]),1);
  saved=await save();result=await race(saved.estimate_id,submission(saved.estimate_id,randomUUID()),submission(saved.estimate_id,randomUUID(),'Different reason'));assert.equal(result.loser.error?.code,'PT409');
  let r=await submit(saved.estimate_id,1,'Race fixture');op=decision(r,'approve');
  result=await race(saved.estimate_id,op,op,['reviewer','reviewer']);assert.ifError(result.loser.error);
  assert.equal(await one('select count(*)::int from estimate_snapshots where estimate_id=$1',[saved.estimate_id]),1);
  saved=await save();r=await submit(saved.estimate_id);
  result=await race(saved.estimate_id,decision(r,'approve'),decision(r,'return'),['reviewer','reviewer']);assert.equal(result.loser.error?.code,'PT409');
  assert.equal(await one('select status from estimates where id=$1',[saved.estimate_id]),'approved');
  saved=await save();r=await submit(saved.estimate_id);
  result=await race(saved.estimate_id,decision(r,'approve'),{sql:"select save_estimate_workbench($1,'Electrical',$2,1,'[]')",args:[saved.estimate_id,doc]},['reviewer','developer'],false);assert.match(result.loser.error?.message,/Editable draft not found/);assert.equal(await one('select revision from estimate_workbenches where estimate_id=$1',[saved.estimate_id]),1);
  op={sql:"select row_to_json(h) result from handoff_estimate_to_destination($1,1,'service_call',null,$2,null,'{}','{}') h",args:[saved.estimate_id,{number:'RACE-SVC',name:'Concurrent fixture'}]};
  result=await race(saved.estimate_id,op,op);assert.ifError(result.loser.error);assert.equal(result.winner.rows[0].result.id,result.loser.value.rows[0].result.id);
  assert.equal(await rootOne("select count(*)::int from jobs where job_number='RACE-SVC'"),1);
  checks.push('real PostgreSQL two-session lock contention: duplicate submit/approve/handoff idempotence; competing submission/decision conflicts PT409; concurrent save of submitted scope rejected before approval completes');
 }finally{await Promise.all(clients.map(c=>c.end()));}
}
