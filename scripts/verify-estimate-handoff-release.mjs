import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
const dir=process.argv[2];
assert.ok(dir,'Pass the exact tested build directory');
const base=process.argv[3]||'https://rnsolutions.net';
const marker='CEDAR-ESTIMATE-HANDOFF-20260915-001';
const hash=v=>createHash('sha256').update(v).digest('hex');
const local=await readFile(path.join(dir,'index.html'));
const response=await fetch(base+'/northgate/?release='+marker,{headers:{'Cache-Control':'no-cache'}});
assert.equal(response.status,200);
assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(local),'HTML differs from tested build');
const assets=await readdir(path.join(dir,'assets'));
for(const file of assets){
 const r=await fetch(base+'/northgate/assets/'+file);
 assert.equal(r.status,200,file);
 if(/\.m?js$/.test(file))assert.match(r.headers.get('content-type'),/javascript/,file);
 if(file.endsWith('.css'))assert.match(r.headers.get('content-type'),/text\/css/,file);
 assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(await readFile(path.join(dir,'assets',file))),file);
}
const mainPath=local.toString().match(/src="([^"]+\.js)"/)[1];
const main=await readFile(path.join(dir,mainPath.replace('/northgate/','')),'utf8');
assert.ok(main.includes('https://keogysnoukbendfkfjcn.supabase.co'),'Supabase URL missing');
assert.match(main,/pk_live_/,'Clerk production key missing');
assert.ok(!main.includes('fixture.invalid'),'Fixture configuration in production');
const workbench=await readFile(path.join(dir,'assets',assets.find(n=>n.startsWith('WorkbenchRoute-')&&n.endsWith('.js'))),'utf8');
for(const value of ['submit_estimate_for_review','Submit for review','Create new','Source version'])assert.ok(workbench.includes(value),value);
assert.ok(main.includes('Review as service call quoted amount'),'Service quote review missing');
for(const route of ['jobs','estimates','inventory?view=storage']){
 const r=await fetch(base+'/northgate/'+route);assert.equal(r.status,200,route);
 assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(local),route+' HTML');
}
const key=main.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]||(main.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]).find(v=>{
 try{const p=JSON.parse(Buffer.from(v.split('.')[1],'base64url'));return p.role==='anon'&&p.ref==='keogysnoukbendfkfjcn';}catch{return false;}
});
assert.ok(key,'Public Supabase configuration missing');
const denial=await fetch('https://keogysnoukbendfkfjcn.supabase.co/rest/v1/rpc/submit_estimate_for_review',{
 method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_estimate_id:null,p_expected_revision:1,p_destination:'job',p_job_id:null,p_new_job:null,p_co_number:null,p_line_targets:{}})});
assert.ok([401,403].includes(denial.status),'Anonymous endpoint should be denied');
console.log(`PASS: ${assets.length} assets and HTML match by SHA-256; MIME, public production config, estimate/service features, deep links and anonymous RPC denial verified.`);
