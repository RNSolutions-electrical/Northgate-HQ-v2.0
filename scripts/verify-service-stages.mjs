import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import {DEFAULT_SERVICE_STAGES} from '../src/modules/service-calls/serviceStages.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const mocks=path.resolve('tests/fixtures/service-calls-mocks.js');
const server=await createServer({cacheDir:path.join(tmpdir(),'svc-stages-'+process.pid),plugins:[{name:'fixture',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||id.endsWith('/services/supabaseClient.js'))return mocks;}}],server:{host:'127.0.0.1',port:5195,strictPort:true}});
await server.listen();const browser=await chromium.launch({headless:true,channel:'msedge'});
const rgb=hex=>'rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';
try {
 await mkdir('.temp/service-calls/stages',{recursive:true});
 for(const width of [1440,390]) {
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5195/northgate/tests/fixtures/service-calls.html?palette');
  for(const mode of ['Operations','Financial scorecard']){
   await page.getByRole('button',{name:mode,exact:true}).click();
   if(mode==='Financial scorecard')await page.getByLabel('Show calls with no reporting date for review').check();
   await page.getByLabel('View',{exact:true}).selectOption('active');
   for(const [index,stage] of DEFAULT_SERVICE_STAGES.entries()){
    if(stage.key==='archived')await page.getByLabel('View',{exact:true}).selectOption('archived');
    const row=page.locator('tr.svc-stage-row').filter({has:page.getByRole('button',{name:'Open service call COLOR-'+index,exact:true})});
    await row.waitFor();
    const cells=await row.locator('td').evaluateAll(nodes=>nodes.map(n=>({bg:getComputedStyle(n).backgroundColor,fg:getComputedStyle(n).color,dec:getComputedStyle(n).textDecorationLine})));
    assert.ok(cells.every(c=>c.bg===rgb(stage.background_color)),mode+': '+stage.label+' has full-row color');
    if(stage.key==='void')assert.ok(cells.every(c=>c.fg==='rgb(255, 255, 255)'&&c.dec.includes('line-through')));
    if(stage.key==='not_proceeding')assert.ok(cells.every(c=>c.dec.includes('line-through')));
   }
   await page.getByLabel('View',{exact:true}).selectOption('active');
   await page.screenshot({path:'.temp/service-calls/stages/'+mode.replaceAll(' ','-')+'-'+width+'.png',fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.goto('http://127.0.0.1:5195/northgate/tests/fixtures/service-calls.html?no-charge');
  await page.getByText('Service fixture 1',{exact:true}).click();
  await page.getByRole('button',{name:'Costs & Billing',exact:true}).click();
  await page.getByRole('button',{name:'Record invoice',exact:true}).click();
  await page.getByLabel('Invoice number',{exact:true}).fill('ZERO-TEST');
  assert.equal(await page.getByRole('button',{name:'Review & record invoice',exact:true}).isDisabled(),true);
  await page.getByLabel(/I confirm the work is complete/).check();
  await page.getByRole('button',{name:'Review & record invoice',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Confirm & record',exact:true}).click();
  await page.getByText('Closed with no payment due. Void the closeout invoice if this needs correction.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Record invoice',exact:true}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.serviceFixture.calls[0].financials.invoices[0].payments.length),0);
  await page.goto('http://127.0.0.1:5195/northgate/tests/fixtures/service-calls.html?stage-console');
  await page.getByLabel('Stage name',{exact:true}).fill('Awaiting equipment');
  await page.getByLabel('Highlight color',{exact:true}).evaluate(e=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'#663399');
   e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.getByLabel('Audit reason',{exact:true}).fill('Stage configuration test');
  await page.getByRole('button',{name:'Add stage',exact:true}).click();
  await page.getByText('Service stages updated',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Stage to edit',{exact:true}).inputValue(),'custom_fixture');
  const request=await page.evaluate(()=>window.serviceFixture.requests.find(r=>r.name==='svc_save_stage'));
  assert.equal(request.args.p_color,'#663399');
  assert.equal(await page.getByLabel('Stage color preview').evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');
  await page.screenshot({path:'.temp/service-calls/stages/console-'+width+'.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: all requested stage colors/strikethrough in both views, archive priority, desktop/mobile layout, no-charge confirmation/closeout, Developer stage creation and color preview.');
} finally {await browser.close();await server.close();}
