import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const mocks = path.resolve('tests/fixtures/financial-workflows-mocks.js');
const server = await createServer({ cacheDir:'.temp/financial-add-vite', plugins: [{name:'fixture',enforce:'pre',resolveId(id) {
  if (id==='@clerk/clerk-react'||id.endsWith('/services/supabaseClient.js')) return mocks;
}}], server:{host:'127.0.0.1',port:5191,strictPort:true}});
await server.listen();
let browser;
const evidence=[];
const output='.temp/financial-add-qa';
try {
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(60000);
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  // The fixture must never contact a real backend.
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await mkdir(output,{recursive:true});
  async function open(query='') {
    await page.goto(`http://127.0.0.1:5191/northgate/tests/fixtures/financial-workflows.html${query}`);
    await page.getByText('101 - Budget Fixture',{exact:true}).click();
    if(await page.locator('.workspace-tabs__mobile-trigger').isVisible()) await page.locator('.workspace-tabs__mobile-trigger').click();
    if(!query.includes('no-financial-access')) await page.getByRole('button',{name:/^Financials/}).click();
  }
  const picker=page.getByRole('region',{name:'Choose financial line division'});
  const topAdd=page.getByRole('button',{name:'Add Financial Line',exact:true});
  for(const [name,width,height] of [['desktop',1440,1000],['phone',390,844]]) {
    await page.setViewportSize({width,height});
    await open();
    const before=await page.evaluate(()=>JSON.stringify(window.financialFixture.rows()[0]));
    await topAdd.click();
    await picker.getByRole('button',{name:'Division 26 - Communications',exact:true}).waitFor();
    assert.equal(await picker.getByRole('button',{name:/^Division /}).count(),2);
    assert.equal(await picker.getByText(/Archived|Other job/).count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${output}/${name}-division-picker.png`,fullPage:true});
    await picker.getByRole('button',{name:'Cancel adding financial line'}).click();
    assert.equal(await picker.count(),0);
    await topAdd.click(); await topAdd.click();
    assert.equal(await picker.count(),0,'Repeated top clicks toggle a single picker');
    await topAdd.click();
    await picker.getByRole('button',{name:'Division 26 - Communications',exact:true}).click();
    assert.equal(await page.getByLabel('Financial line description',{exact:true}).count(),1);
    assert.equal(await topAdd.isDisabled(),true);
    await page.getByLabel('Financial line description',{exact:true}).fill('Discarded draft');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await topAdd.click();
    await picker.getByRole('button',{name:'Division 26 - Communications',exact:true}).click();
    assert.equal(await page.getByLabel('Financial line description',{exact:true}).inputValue(),'');
    const description=`Synthetic ${name}`;
    await page.getByLabel('Financial line description',{exact:true}).fill(description);
    await page.getByLabel(`Cost code for ${description}`,{exact:true}).fill('26.999');
    await page.getByLabel(`Original budget for ${description}`,{exact:true}).fill('123.45');
    await page.evaluate(()=>window.financialFixture.failNext=true);
    await page.getByRole('button',{name:'Save',exact:true}).click();
    try { await page.getByRole('alert').getByText('Fixture rejected save',{exact:true}).waitFor(); }
    catch(error) {
      console.log(JSON.stringify(await page.evaluate(()=>({calls:window.financialFixture.calls,failNext:window.financialFixture.failNext,alerts:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent),inputs:[...document.querySelectorAll('input[aria-label]')].map(e=>({label:e.getAttribute('aria-label'),value:e.value,valid:e.checkValidity()}))})),null,2));
      await page.screenshot({path:`${output}/${name}-failure-debug.png`,fullPage:true});throw error;
    }
    const feedback=await page.getByRole('alert').evaluate(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight,scrollY};});
    if(feedback.top<0||feedback.bottom>feedback.height){console.log('Feedback bounds',name,feedback);await page.screenshot({path:`${output}/${name}-feedback-position.png`});}
    assert.ok(feedback.top>=0&&feedback.bottom<=feedback.height,'Save feedback stays in the viewport');
    assert.equal(await page.getByLabel('Financial line description',{exact:true}).inputValue(),description);
    assert.equal(await page.getByLabel(`Original budget for ${description}`,{exact:true}).inputValue(),'123.45');
    await page.screenshot({path:`${output}/${name}-rejected-save.png`,fullPage:true});
    await page.evaluate(()=>window.financialFixture.delaySave=true);
    await page.getByRole('button',{name:'Save',exact:true}).dblclick();
    await page.getByRole('status').getByText(`${description} added in Financials.`,{exact:true}).waitFor();
    const result=await page.evaluate(()=>({calls:window.financialFixture.calls.filter(c=>c.name==='save_job_financial_batch'),rows:window.financialFixture.rows(),reads:window.financialFixture.reads}));
    assert.equal(result.calls.length,2,'One rejected request plus one retry; double click must not duplicate');
    assert.equal(JSON.stringify(result.rows[0]),before,'Existing financial values must remain unchanged');
    assert.equal(result.rows.length,2);
    assert.equal(result.rows[1].project_division_id,'d2');
    assert.equal(result.rows[1].budget_amount,123.45);
    assert.equal(result.calls[1].args.p_reason,null,'Routine creates retain automatic audit policy');
    assert.deepEqual(result.reads.find(r=>r.table==='job_budget_divisions').filters,[['job_id','j1'],['archived_at',null]]);
    await page.screenshot({path:`${output}/${name}-saved.png`,fullPage:true});
    evidence.push({scenario:name,checks:'multiple divisions, scoped active-only query, cancel/reopen, repeated clicks, rejected save/retry, single create, existing values preserved',calls:result.calls});
    await open('?empty');
    await topAdd.click();
    await picker.getByRole('button',{name:'Division 16 - Electrical',exact:true}).click();
    await page.getByLabel('Financial line description',{exact:true}).fill('First synthetic line');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByRole('status').getByText('First synthetic line added in Financials.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.financialFixture.rows().length),1);
    evidence.push({scenario:`${name} empty budget`,passed:true});
  }
  await open('?no-divisions'); await topAdd.click();
  await picker.getByText('No active project divisions',{exact:true}).waitFor();
  assert.equal(await picker.getByRole('button',{name:/^Division /}).count(),0);
  assert.equal(await page.evaluate(()=>window.financialFixture.calls.filter(c=>c.name.includes('save')).length),0);
  await open(); await page.evaluate(()=>window.financialFixture.failDivisions=true); await topAdd.click();
  await picker.getByText('Fixture division access denied',{exact:true}).waitFor();
  await picker.getByRole('button',{name:'Cancel adding financial line'}).click();
  await page.evaluate(()=>window.financialFixture.failDivisions=false); await topAdd.click();
  await picker.getByRole('button',{name:'Division 16 - Electrical',exact:true}).waitFor();
  evidence.push({scenario:'missing divisions and rejected division read/reopen',passed:true});
  await open('?readonly'); await topAdd.click();
  await picker.getByRole('button',{name:'Division 16 - Electrical',exact:true}).click();
  await page.getByLabel('Financial line description',{exact:true}).fill('Contributor synthetic proposal');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('status').getByText('Contributor synthetic proposal was submitted for financial review.',{exact:true}).waitFor();
  const proposals=await page.evaluate(()=>window.financialFixture.calls.filter(c=>c.name.includes('save')||c.name.includes('submit')));
  assert.deepEqual(proposals.map(c=>c.name),['save_v5_job_financial_proposal','submit_v5_job_financial_proposal']);
  assert.equal(proposals[0].args.p_lines[0].project_division_id,'d1');
  assert.equal(await page.evaluate(()=>window.financialFixture.rows().length),1,'Contributor must not directly change official financials');
  evidence.push({scenario:'contributor proposal routing',calls:proposals});
  await open('?no-financial-access');
  assert.equal(await page.getByRole('button',{name:/^Financials/}).count(),0);
  assert.equal(await topAdd.count(),0);
  evidence.push({scenario:'no financial permission',passed:true});
  assert.deepEqual(pageErrors,[]);
  await writeFile(`${output}/evidence.json`,JSON.stringify({evidence,pageErrors},null,2));
  console.log(`PASS: ${evidence.length} scenarios, desktop and phone, no browser exceptions. Evidence: ${output}`);
} finally {await browser?.close();await server.close();}
