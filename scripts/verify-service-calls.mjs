import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const mocks=path.resolve('tests/fixtures/service-calls-mocks.js');
const server=await createServer({cacheDir:path.join(tmpdir(),'svc-fixture-'+process.pid),
 plugins:[{name:'svc-fixture',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||id.endsWith('/services/supabaseClient.js'))return mocks;}}],
 server:{host:'127.0.0.1',port:5198,strictPort:true}});
await server.listen(); let browser;
try {
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
 const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mkdir('.temp/service-calls/screenshots',{recursive:true});
 const url='http://127.0.0.1:5198/northgate/tests/fixtures/service-calls.html';
 for(const [size,width,height] of [['desktop',1440,1000],['tablet',768,1024],['phone',390,844]]){
  await page.setViewportSize({width,height});await page.goto(url);
  await page.getByText('Service fixture 1',{exact:true}).click();
  await page.getByRole('button',{name:'Edit details / link call'}).click();
  await page.getByLabel('Related service call',{exact:false}).selectOption('00000000-0000-4000-8000-000000000002');
  await page.getByRole('button',{name:'Save service call',exact:true}).click();
  await page.getByRole('button',{name:'Costs & Billing',exact:true}).click();
  await page.getByRole('button',{name:'Record invoice',exact:true}).click();
  await page.getByLabel('Invoice number',{exact:true}).fill('INV-TEST');
  await page.getByLabel('Total before tax',{exact:true}).fill('100');
  await page.getByLabel('Sales tax',{exact:true}).fill('7');
  await page.getByLabel('Allocated amount',{exact:true}).fill('60');
  await page.getByRole('button',{name:'Add another call'}).click();
  await page.getByLabel('Allocated amount',{exact:true}).nth(1).fill('40');
  await page.screenshot({path:'.temp/service-calls/screenshots/'+size+'-invoice.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,size+' invoice overflow');
  assert.deepEqual(await page.locator('input:invalid,select:invalid').evaluateAll(elements=>elements.map(e=>({type:e.type,value:e.value,message:e.validationMessage}))),[],size+' invoice inputs must be valid');
  // Restore control focus after a full-page mobile screenshot changes scroll.
  await page.getByRole('button',{name:'Review & record invoice'}).focus();
  await page.getByRole('button',{name:'Review & record invoice'}).click();
  await page.screenshot({path:'.temp/service-calls/screenshots/'+size+'-confirmation.png',fullPage:true});
  await page.getByRole('button',{name:'Confirm & record'}).click();
  await page.getByText('Invoice recorded with reconciled call allocations.',{exact:true}).waitFor();
  const request=await page.evaluate(()=>window.serviceFixture.requests.find(r=>r.name==='svc_post_invoice'));
  assert.equal(request.args.p_data.allocations.length,2);
  assert.equal(request.args.p_data.allocations.reduce((s,a)=>s+Number(a.amount),0),100);
  await page.getByRole('button',{name:'Details & linked calls',exact:true}).click();
  await page.getByRole('button',{name:'Archive',exact:true}).click();
  await page.getByLabel('Reason',{exact:false}).fill('Completed test call');
  await page.getByRole('alertdialog').getByRole('button',{name:'Archive',exact:true}).click();
  await page.getByText('Service call archived.',{exact:true}).waitFor();
  await page.screenshot({path:'.temp/service-calls/screenshots/'+size+'-archived.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,size+' directory overflow');
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(url);
 await page.getByRole('button',{name:'Import preview',exact:true}).click();
 await page.getByLabel('Job-number registry export',{exact:false}).setInputFiles({name:'registry.csv',mimeType:'text/csv',buffer:Buffer.from('JOB NUMBER,Customer,Job Stage\\n26-001,Fixture business,Upcoming\\n'.replaceAll('\\n','\n'))});
 await page.getByLabel('Electrical scorecard',{exact:false}).setInputFiles({name:'scorecard.csv',mimeType:'text/csv',buffer:Buffer.from('Job #,Business Name,Amount Billed,Cost\\n26-001,Fixture business,100,25\\n'.replaceAll('\\n','\n'))});
 await page.getByRole('cell',{name:'Exact number match',exact:true}).click();
 await page.getByRole('heading',{name:'26-001 — source comparison',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.serviceFixture.requests.some(r=>r.name!=='svc_read_calls')),false,'Preview must not call a write RPC');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Create Service Call',exact:true}).click();
 await page.getByLabel('Service call / job number',{exact:true}).fill('26-003');
 await page.getByLabel('Call name / customer',{exact:true}).fill('Created service call');
 await page.getByRole('button',{name:'Save service call',exact:true}).click();
 await page.getByRole('heading',{name:'26-003 — Created service call',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.serviceFixture.requests.find(r=>r.name==='svc_save_call').args.p_job_id),null);
 await page.goto(url+'?readonly');
 assert.equal(await page.getByRole('button',{name:'Create Service Call',exact:true}).count(),0);
 await page.getByText('Service fixture 1',{exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Costs & Billing',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Edit details / link call'}).count(),0);
 await page.getByRole('button',{name:'Documents',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.serviceFixture.navigation),'documents');
 assert.deepEqual(errors,[]);
 console.log('PASS: service-call desktop/tablet/phone editing, invoice allocation, confirmation, archive, CSV preview without writes, creation, readonly controls and resource navigation; zero runtime errors.');
} finally {await browser?.close();await server.close();}
