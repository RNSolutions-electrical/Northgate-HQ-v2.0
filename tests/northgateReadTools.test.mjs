import test from 'node:test';
import assert from 'node:assert/strict';
import {runReadTool,READ_TOOLS,validateToolArgs} from '../netlify/functions/_shared/northgateReadTools.mjs';
import {createNorthgateMcp} from '../netlify/functions/_shared/northgateMcp.mjs';
import handler from '../netlify/functions/northgate-read.js';
const id='00000000-0000-4000-8000-000000000001';
function mock({flags={can_inventory_transactions:true,can_estimate:true},items=[],job={id,name:'Visible job',job_type:'job'},auditError=false}={}){
 const calls=[];return {calls,
 async rpc(name,args){calls.push({name,args});if(name==='northgate_read_context')return {data:{actor:'fixture',permissions:flags}};return auditError?{error:Error('Audit unavailable')}:{data:null};},
 from(table){let filters=[],fields='',single=false,range=[0,999];const q={select(f){fields=f;return this;},eq(k,v){filters.push([k,v]);return this;},is(){return this;},order(){return this;},range(a,b){range=[a,b];return this;},limit(){return this;},maybeSingle(){single=true;return this;},then(resolve,reject){calls.push({table,fields,filters});let rows=table==='items'?items:table==='jobs'?(job?[job]:[]):table==='bins'?[{id,bin_code:'BIN-1'}]:table==='inventory_cart_candidates_view'?[{bin_id:id,quantity_on_hand:null,quantity_recorded:false}]:[];rows=rows.filter(r=>filters.every(([k,v])=>r[k]===v||(['is_active','is_archived'].includes(k)))).slice(range[0],range[1]+1);return Promise.resolve({data:single?rows[0]||null:rows,error:null}).then(resolve,reject);}};return q;}
 };
}
test('Read tool schemas expose only five bounded read operations',()=>{
 assert.equal(READ_TOOLS.length,5);assert.ok(READ_TOOLS.every(t=>t.annotations.readOnlyHint&&!t.annotations.destructiveHint&&!t.annotations.openWorldHint));
 assert.throws(()=>validateToolArgs('run_sql',{sql:'select 1'}),/Unsupported/);
 assert.throws(()=>validateToolArgs('get_job_summary',{id,table:'users'}),/Invalid/);
 assert.throws(()=>validateToolArgs('get_job_summary',{id:'../other'}),/canonical/);
 assert.throws(()=>validateToolArgs('search_catalog',{query:'wire',limit:1000}),/limit/);
});
test('Read tools retain user client, select operational columns and audit success',async()=>{
 const client=mock(),r=await runReadTool(client,'get_job_summary',{id});assert.equal(r.data.job.name,'Visible job');
 assert.deepEqual(client.calls.filter(x=>x.name==='northgate_audit_read').map(x=>x.args.p_outcome),['started','succeeded']);
 assert.ok(!/price|budget|cost|revenue|\*/.test(client.calls.find(x=>x.table==='jobs').fields));
});
test('Denied record, module access and failed auditing do not return business data',async()=>{
 const missing=mock({job:null});await assert.rejects(()=>runReadTool(missing,'get_job_summary',{id}),/unavailable/);
 assert.equal(missing.calls.at(-1).args.p_outcome,'failed');
 const denied=mock({flags:{}});await assert.rejects(()=>runReadTool(denied,'get_inventory_location',{id,kind:'bin'}),/Inventory access/);assert.equal(denied.calls.filter(x=>x.table).length,0);
 const noAudit=mock({auditError:true});await assert.rejects(()=>runReadTool(noAudit,'get_job_summary',{id}),/Audit unavailable/);assert.equal(noAudit.calls.filter(x=>x.table).length,0);
});
test('Material resolution preserves aliases, ambiguity and confirmation; unknown stock stays unknown',async()=>{
 const items=[{id,name:'Fixture wire A',material_code:'A',item_aliases:[{id:'alias1',alias:'Test wire'}]},{id:id.replace(/1$/,'2'),name:'Fixture wire B',material_code:'B',item_aliases:[{id:'alias2',alias:'Test wire'}]}];
 const r=await runReadTool(mock({items}),'resolve_material',{query:'Test wire'});assert.equal(r.data.ambiguous,true);assert.equal(r.data.requiresConfirmation,true);assert.equal(r.data.candidates.length,2);
 const inventory=await runReadTool(mock(),'get_inventory_location',{id,kind:'bin'});assert.equal(inventory.data.stock[0].quantity_on_hand,null);assert.equal(inventory.data.stock[0].quantity_recorded,false);
});
test('MCP transport requires a configured authorizer and validates origins, methods and protocols',async()=>{
 assert.throws(()=>createNorthgateMcp(),/verified OAuth/);
 const endpoint=createNorthgateMcp({authorize:async()=>mock(),resourceMetadataUrl:'https://example.com/.well-known/oauth-protected-resource',allowedOrigins:['https://example.com']});
 const request=(message,headers={})=>new Request('https://example.com/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream',...headers},body:JSON.stringify(message)});
 const init=await (await endpoint(request({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}}))).json();assert.equal(init.result.protocolVersion,'2025-11-25');
 const list=await (await endpoint(request({jsonrpc:'2.0',id:2,method:'tools/list'}))).json();assert.equal(list.result.tools.length,5);
 assert.equal((await endpoint(request({jsonrpc:'2.0',method:'notifications/initialized'}))).status,202);
 assert.equal((await endpoint(request({}, {origin:'https://evil.example'}))).status,403);
 assert.equal((await endpoint(request({}, {'mcp-protocol-version':'invalid'}))).status,400);
 const denied=createNorthgateMcp({authorize:async()=>{throw Error('bad token');},resourceMetadataUrl:'https://example.com/.well-known/oauth-protected-resource'});const response=await denied(request({}));assert.equal(response.status,401);assert.match(response.headers.get('www-authenticate'),/northgate:read/);
 const call=await (await endpoint(request({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'delete_job',arguments:{id}}}))).json();assert.equal(call.result.isError,true);
});
test('Internal read endpoint defaults disabled and rejects cross-origin requests',async()=>{
 const previous=globalThis.Netlify;
 try{
  delete globalThis.Netlify;assert.equal((await handler(new Request('https://example.com/read',{method:'POST'}))).status,503);
  globalThis.Netlify={env:{get:name=>name==='NORTHGATE_READ_TOOLS_ENABLED'?'true':undefined}};
  assert.equal((await handler(new Request('https://example.com/read',{method:'POST'}))).status,401);
  assert.equal((await handler(new Request('https://example.com/read',{method:'POST',headers:{authorization:'Bearer fixture',origin:'https://evil.example'}}))).status,403);
 }finally{globalThis.Netlify=previous;}
});
