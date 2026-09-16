import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
const dir=process.argv[2],base=process.argv[3]||'https://rnsolutions.net',marker=process.argv[4]||'SEQUOIA-HQ-WORKFLOWS-20260916-001';
assert.ok(dir,'Pass the tested production build directory');
const hash=v=>createHash('sha256').update(v).digest('hex');
const local=await readFile(path.join(dir,'index.html'));
const r=await fetch(base+'/northgate/?release='+encodeURIComponent(marker),{headers:{'Cache-Control':'no-cache'}});
assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(local),'HTML differs from tested build');
const assets=await readdir(path.join(dir,'assets'));
for(const file of assets){const result=await fetch(base+'/northgate/assets/'+file);assert.equal(result.status,200,file);const mime=result.headers.get('content-type');
 if(/\.m?js$/.test(file))assert.match(mime,/javascript/,file);if(file.endsWith('.css'))assert.match(mime,/text\/css/,file);if(/\.png$/.test(file))assert.match(mime,/image\/png/,file);if(/\.jpg$/.test(file))assert.match(mime,/image\/jpeg/,file);
 assert.equal(hash(Buffer.from(await result.arrayBuffer())),hash(await readFile(path.join(dir,'assets',file))),file);
}
const mainPath=local.toString().match(/src="([^"]+\.js)"/)[1];const main=await readFile(path.join(dir,mainPath.replace('/northgate/','')),'utf8');
assert.ok(main.includes('https://keogysnoukbendfkfjcn.supabase.co'));assert.match(main,/pk_live_/);assert.ok(!main.includes('fixture.invalid'));
for(const value of ['can_review_afc_studies','afc-release','afc_save','Available Fault Current','set_document_section','Construction Documents','Electrical Documents','General Documents'])assert.ok(main.includes(value),value);
if(marker.startsWith('JUNIPER-'))for(const value of ['set_document_tags','Use parent physical location','materials_summary'])assert.ok(main.includes(value),value);
const workbench=await readFile(path.join(dir,'assets',assets.find(n=>n.startsWith('WorkbenchRoute-')&&n.endsWith('.js'))),'utf8');
// Consideration keys/labels are loaded from the database, not hard-coded in the bundle.
for(const value of ['Finalization checklist','Submit for review','Review & approve','finalizationChecklist'])assert.ok(workbench.includes(value),value);
for(const route of ['jobs','estimates','documents','afc','electrical-inspections','inventory?view=storage']){const response=await fetch(base+'/northgate/'+route);assert.equal(response.status,200,route);assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(local),route);}
const key=main.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]||(main.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]).find(v=>{try{const p=JSON.parse(Buffer.from(v.split('.')[1],'base64url'));return p.role==='anon'&&p.ref==='keogysnoukbendfkfjcn';}catch{return false;}});assert.ok(key);
for(const name of ['afc_read','northgate_read_context']){const denial=await fetch('https://keogysnoukbendfkfjcn.supabase.co/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{}'});assert.ok([401,403].includes(denial.status),name+' anonymous access');}
const disabled=await fetch(base+'/.netlify/functions/northgate-read',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(disabled.status,503);assert.match(await disabled.text(),/not enabled/);
const retained=await fetch(base+'/api/silas-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(retained.status,401,'Existing Silas function missing');assert.match(await retained.text(),/Authentication required/);
console.log('PASS: HTML/all '+assets.length+' assets match by SHA-256/MIME; production configuration/features/deep links; anonymous RPC denial; read endpoint disabled; existing Silas retained.');
