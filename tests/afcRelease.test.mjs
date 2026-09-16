import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {demo} from '../src/modules/afc/engine.mjs';
import {importStudy,studyResults,releaseIssues,blankStudy} from '../src/modules/afc/model.mjs';
import {releaseStudy} from '../supabase/functions/_shared/afc/release.mjs';
import {afcPdf} from '../supabase/functions/_shared/afc/pdf.mjs';
const fixture=()=>{const d=importStudy(demo()).document;d.nodes=d.nodes.slice(0,2);d.title='Test study';d.reference='Fixture site';d.preparedBy='Test preparer';return d;};
const body=()=>({id:crypto.randomUUID(),version:1,requestId:crypto.randomUUID(),note:'Synthetic reviewed scope'});
test('AFC release trusts server inputs and actor, verifies uploads, and commits only afterward',async()=>{
 const inputs=body(),stored=new Map(),calls=[],document=fixture();
 const user={rpc:async()=>({data:{document,actor:'verified-user',revision:1,reviewer_name:'Verified reviewer',reviewed_at:'2026-09-15T23:00:00Z'}})};
 const admin={storage:{from:()=>({upload:async(path,bytes,opts)=>{assert.equal(opts.upsert,false);stored.set(path,bytes);return {};},download:async path=>({data:new Blob([stored.get(path)])})})},rpc:async(name,args)=>{calls.push({name,args});return {data:{status:'reviewed'}};}};
 const response=await releaseStudy({user,admin,body:{...inputs,actor:'spoofed',results:{fake:true}}});assert.equal(response.status,'reviewed');
 assert.equal(stored.size,document.nodes.length+3);assert.equal(calls.length,1);assert.equal(calls[0].args.p_actor,'verified-user');assert.deepEqual(calls[0].args.p_results.errors,[]);
 for(const f of calls[0].args.p_files){assert.equal(f.sha256.length,64);assert.equal(f.size,stored.get(f.storage_path).length);}
 const pdf=await PDFDocument.load(stored.get(calls[0].args.p_files.find(f=>f.kind==='labels').storage_path));assert.equal(pdf.getPageCount(),2);assert.deepEqual(pdf.getPage(0).getSize(),{width:288,height:216});
});
test('AFC rejected review and invalid inputs never upload or finalize',async()=>{
 let touched=false;const admin=new Proxy({},{get(){touched=true;throw Error('Must not touch admin');}});
 await assert.rejects(()=>releaseStudy({user:{rpc:async()=>({error:Error('Reviewer denied')})},admin,body:body()}),/Reviewer denied/);
 await assert.rejects(()=>releaseStudy({user:{rpc:async()=>({data:{document:blankStudy()}})},admin,body:body()}),/Enter study title/);
 assert.equal(touched,false);
 const receipt={status:'reviewed'};assert.deepEqual(await releaseStudy({user:{rpc:async()=>({data:{receipt}})},admin,body:body()}),receipt);
});
test('AFC corrupt storage bytes cannot be finalized',async()=>{
 let finalized=false;const document=fixture();
 const user={rpc:async()=>({data:{document,actor:'user',revision:1,reviewer_name:'Reviewer',reviewed_at:'2026-09-15T23:00:00Z'}})};
 const admin={storage:{from:()=>({upload:async()=>({}),download:async()=>({data:new Blob(['wrong'])})})},rpc:async()=>{finalized=true;}};
 await assert.rejects(()=>releaseStudy({user,admin,body:body()}),/verification failed/);assert.equal(finalized,false);
});
test('AFC malformed optional input and partial alternate method fields block new outputs',async()=>{
 for(const layers of [[],false,{generators:[null]},{motors:[false]},{unexpected:[]}]){const d=fixture();d.layers=layers;assert.doesNotThrow(()=>studyResults(d));assert.ok(studyResults(d).errors.length);}
 const d=fixture();d.layers={generators:[{id:'generator',name:'Partial',method:'known',bus:'service',kva:100,known:'',feeder:{length:0}}]};assert.ok(releaseIssues(d).length);
 const broken=studyResults(d);await assert.rejects(()=>afcPdf({document:d,results:broken}),/Resolve calculation/);
});
