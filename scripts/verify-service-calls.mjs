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
 const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
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
  await page.getByLabel('Subtotal',{exact:true}).fill('100');
  await page.getByLabel('Sales Tax %',{exact:true}).fill('7.25');
  await page.getByLabel('Credit Card Fee %',{exact:true}).fill('3');
  assert.equal(await page.getByLabel('Invoice total',{exact:true}).innerText(),'$110.47');
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
  assert.equal(request.args.p_data.sales_tax,7.25);
  assert.equal(request.args.p_data.credit_card_fee,3.22);
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
 for(const [width,height] of [[1440,1000],[768,1024],[390,844]]) {
  await page.setViewportSize({width,height});await page.goto(url+'?stages');
  await page.locator('td[data-label="Work stage"]').filter({hasText:'Payment Received'}).waitFor();
  await page.locator('td[data-label="Work stage"]').filter({hasText:'Invoice Sent · Payment overdue'}).waitFor();
  const colors=[];
  for(const tone of ['Payment Received','Invoice Sent · Payment overdue','Complete / ready to invoice']) {
   const cells=page.locator('tr.svc-stage-row').filter({has:page.locator('td[data-label="Work stage"]',{hasText:tone})}).locator('td');
   assert.ok(await cells.count()>0,tone+' row exists');
   const backgrounds=await cells.evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundColor));
   assert.equal(new Set(backgrounds).size,1,'Whole row has consistent highlighting');
   assert.ok(!['rgba(0, 0, 0, 0)','rgb(255, 255, 255)'].includes(backgrounds[0]),tone+' is visibly tinted');
   colors.push(backgrounds[0]);
  }
  assert.equal(new Set(colors).size,3,'Paid, overdue and ready have distinct colors');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Stage directory fits viewport');
  await page.screenshot({path:'.temp/service-calls/screenshots/stages-'+width+'.png',fullPage:true});
  await page.getByLabel('View',{exact:true}).selectOption('payment_received');
  assert.equal(await page.locator('tbody tr').count(),1);
  await page.getByLabel('View',{exact:true}).selectOption('invoice_sent');
  assert.equal(await page.locator('tbody tr').count(),1);
  assert.equal(await page.evaluate(()=>window.serviceFixture.requests.some(r=>!['svc_read_calls','svc_read_stages'].includes(r.name))),false,'Directory display never writes billing');
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(url);
 await page.getByRole('button',{name:'Import preview',exact:true}).click();
 await page.getByLabel('Job-number registry export',{exact:false}).setInputFiles({name:'registry.csv',mimeType:'text/csv',buffer:Buffer.from('JOB NUMBER,Customer,Job Stage\\n26-001,Fixture business,Upcoming\\n'.replaceAll('\\n','\n'))});
 await page.getByLabel('Electrical scorecard',{exact:false}).setInputFiles({name:'scorecard.csv',mimeType:'text/csv',buffer:Buffer.from('Job #,Business Name,Amount Billed,Cost\\n26-001,Fixture business,100,25\\n'.replaceAll('\\n','\n'))});
 await page.getByRole('cell',{name:'Exact number match',exact:true}).click();
 await page.getByRole('heading',{name:'26-001 — source comparison',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.serviceFixture.requests.some(r=>!['svc_read_calls','svc_read_stages'].includes(r.name))),false,'Preview must not call a write RPC');
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
 assert.equal(await page.getByRole('region',{name:'Service call profit summary'}).count(),0,'No financial summaries for restricted users');
 for(const [size,width,height] of [['desktop',1440,1000],['tablet',768,1024],['phone',390,844]]){
  await page.setViewportSize({width,height});await page.goto(url+'?profit');
  await page.getByLabel('Reporting year',{exact:true}).selectOption('2026');
  await page.getByRole('button',{name:'Financial scorecard',exact:true}).click();
  await page.locator('th').filter({hasText:'Profit %'}).waitFor({state:'attached'});
  assert.equal(await page.locator('td[data-label="Profit %"]').filter({hasText:'80.0%'}).count(),1);
  const summary=page.getByRole('region',{name:'Service call profit summary'});
  assert.ok((await summary.innerText()).includes('35.0%'),'Weighted annual profit');
  await page.getByLabel('Reporting quarter',{exact:true}).selectOption('1');
  await page.locator('td[data-label="Customer / call"]').filter({hasText:'Service fixture 1'}).waitFor();
  assert.equal(await page.locator('td[data-label="Customer / call"]').filter({hasText:'Service fixture 2'}).count(),0);
  assert.ok((await summary.innerText()).includes('80.0%'),'Q1 profit');
  await page.screenshot({path:'.temp/service-calls/screenshots/'+size+'-profit.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,size+' profit controls overflow');
  await page.getByLabel('Reporting quarter',{exact:true}).selectOption('2');
  assert.equal(await page.locator('td[data-label="Customer / call"]').filter({hasText:'Service fixture 1'}).count(),0);
  await page.locator('td[data-label="Customer / call"]').filter({hasText:'Service fixture 2'}).waitFor();
  await page.getByLabel('Group calls by',{exact:true}).selectOption('paid');
  assert.equal(await page.locator('td[data-label="Customer / call"]').filter({hasText:'Service fixture 2'}).count(),0);
  await page.getByLabel('Show calls with no reporting date for review',{exact:true}).check();
  assert.equal(await page.locator('td[data-label="Reporting date"]').filter({hasText:'Needs review'}).count(),2);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: service-call desktop/tablet/phone editing, invoice allocation, confirmation, archive, CSV preview without writes, creation, readonly controls, profit margins, quarter/date filters, missing dates and resource navigation; zero runtime errors.');
} finally {await browser?.close();await server.close();}
