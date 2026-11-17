import test from 'node:test';
import assert from 'node:assert/strict';
import {DAYBOOK_JOB_FIELDS,daybookJobOption,fetchDaybookHqJobs} from './daybookJobs.js';
const job = (id,status='active') => ({id,job_number:'26-001',name:'Project',status,address_line1:'1 Main St',address_line2:'Unit 2',city:'Cary',state:'NC',postal_code:'27513',budget:999999,notes:'private notes',client:'do not infer'});
function mock(pages,availability=()=>true) {
 const calls=[]; let page=0,checks=0;
 const client={
  rpc:async name=>{calls.push(['rpc',name]);return {data:[{module_key:'jobs',is_enabled:availability(++checks)}],error:null};},
  from:name=>{calls.push(['from',name]); const q={};
   for(const method of ['select','is','order','limit','gt'])q[method]=(...args)=>{calls.push([method,...args]);return q;};
   q.then=(resolve,reject)=>Promise.resolve(pages[page++]||{data:[],error:null}).then(resolve,reject);return q;
  },
 };
 return {client,calls};
}
test('jobs adapter whitelists operational fields and does not infer client',()=>{
 const result=daybookJobOption(job('a'));
 assert.deepEqual(Object.keys(result),['id','job_number','name','status','location','client']);
 assert.equal(result.location,'1 Main St, Unit 2, Cary, NC 27513');assert.equal(result.client,null);
 assert.doesNotMatch(DAYBOOK_JOB_FIELDS,/\*|budget|financial|notes|cost|revenue/);
});
test('read-only keyset paging continues after a short capped page',async()=>{
 const m=mock([{data:[job('a')],error:null},{data:[job('b','complete')],error:null},{data:[],error:null}]);
 const rows=await fetchDaybookHqJobs(m.client);
 assert.deepEqual(rows.map(r=>r.id),['a','b']);assert.equal(rows[1].status,'complete');
 assert.equal(m.calls.filter(c=>c[0]==='from').length,3);
 assert.ok(m.calls.filter(c=>c[0]==='select').every(c=>c[1]===DAYBOOK_JOB_FIELDS));
 assert.ok(m.calls.filter(c=>c[0]==='is').every(c=>c[1]==='archived_at'&&c[2]===null));
 assert.deepEqual(m.calls.filter(c=>c[0]==='gt'),[['gt','id','a'],['gt','id','b']]);
 assert.ok(m.calls.every(c=>['rpc','from','select','is','order','limit','gt'].includes(c[0])));
});
test('production adapter uses only existing read-only Jobs RLS, not missing availability RPC',async()=>{
 const m=mock([{data:[],error:null}]); await fetchDaybookHqJobs(m.client); assert.equal(m.calls.some(c=>c[0]==='rpc'),false);
});
test('jobs query failure propagates instead of empty success',async()=>{
 await assert.rejects(fetchDaybookHqJobs(mock([{data:null,error:new Error('RLS denied')}]).client),/RLS denied/);
});
test('duplicates, malformed rows and row cap reject rather than returning partial data',async()=>{
 for(const [pages,options,pattern] of [
  [[{data:[job('a'),job('a')]}],{},/changed while loading/],
  [[{data:[{}]}],{},/invalid job/],
  [[{data:[job('a'),job('b')]}],{maxRows:1},/No partial directory/],
 ])await assert.rejects(fetchDaybookHqJobs(mock(pages).client,options),pattern);
});
