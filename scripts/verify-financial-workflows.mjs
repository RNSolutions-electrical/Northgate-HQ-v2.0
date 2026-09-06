import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const mocks = path.resolve('tests/fixtures/financial-workflows-mocks.js');
const server = await createServer({cacheDir:path.join(tmpdir(),`financial-fixture-${process.pid}`),
  plugins:[{name:'financial-fixture',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||id.endsWith('/services/supabaseClient.js'))return mocks;}}],
  server:{host:'127.0.0.1',port:5190,strictPort:true}});
await server.listen();let browser;
try {
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
  const page=await browser.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:5190/northgate/tests/fixtures/financial-workflows.html';
  await mkdir('.temp/financial-workflows/screenshots',{recursive:true});
  for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['phone',390,844]]){
    await page.setViewportSize({width,height});await page.goto(url);
    await page.getByText('101 - Budget Fixture',{exact:true}).click();
    if(await page.locator('.workspace-tabs__mobile-trigger').isVisible()) await page.locator('.workspace-tabs__mobile-trigger').click();
    await page.getByRole('button',{name:/^Financials/}).click();
    await page.locator('.job-budget-division__toggle').first().click();
    await page.getByRole('button',{name:'Edit current budget for Material',exact:true}).click();
    await page.getByLabel('Current budget for Material',{exact:true}).fill('1300');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Manual override',{exact:true}).waitFor();
    assert.equal(await page.getByRole('alertdialog').count(),0);
    const first=await page.evaluate(()=>window.financialFixture.calls.find(c=>c.name==='save_job_financial_batch'));
    assert.equal(first.args.p_reason,null);
    assert.equal(first.args.p_lines[0].current_budget_override_amount,1300);
    assert.equal(first.args.p_lines[0].budget_amount,1000);
    await page.getByText('Calculated: $1,150.00',{exact:true}).waitFor();
    await page.screenshot({path:`.temp/financial-workflows/screenshots/${name}-override.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.locator('.job-budget-division__title').evaluate(el=>{
      const box=el.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth;
    }),true,'Division header must stay onscreen');
    await page.getByRole('button',{name:'Edit current budget for Material',exact:true}).click();
    await page.getByRole('button',{name:'Use calculated budget',exact:true}).click();
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Calculated',{exact:true}).waitFor();
    assert.equal(await page.getByText('Manual override',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Edit original estimate for Material',exact:true}).click();
    await page.getByLabel('Original budget for Material',{exact:true}).fill('1200');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByRole('alertdialog').waitFor();
    await page.getByRole('button',{name:'Cancel',exact:true}).last().click();
    assert.equal(await page.getByLabel('Original budget for Material',{exact:true}).inputValue(),'1200');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByRole('alertdialog').getByRole('textbox').fill('Correct original from signed estimate');
    await page.getByRole('button',{name:'Save financial line',exact:true}).click();
    await page.waitForFunction(()=>window.financialFixture.rows()[0].budget_amount===1200);
    assert.equal(await page.getByRole('alertdialog').count(),0);
    await page.getByRole('button',{name:'Edit current budget for Material',exact:true}).click();
    await page.getByLabel('Current budget for Material',{exact:true}).fill('1400');
    await page.evaluate(()=>window.financialFixture.failNext=true);
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Fixture rejected save',{exact:true}).first().waitFor();
    assert.equal(await page.getByLabel('Current budget for Material',{exact:true}).inputValue(),'1400');
  }
  await page.goto(url+'?readonly');await page.getByText('101 - Budget Fixture',{exact:true}).click();
  if(await page.locator('.workspace-tabs__mobile-trigger').isVisible()) await page.locator('.workspace-tabs__mobile-trigger').click();
  await page.getByRole('button',{name:/^Financials/}).click();await page.locator('.job-budget-division__toggle').first().click();
  assert.equal(await page.getByRole('button',{name:'Edit current budget for Material',exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: integrated Jobs override/reset, protected reason dialog, cancelled reason preserves draft, failed save retention, readonly, desktop/tablet/phone.');
} finally {await browser?.close();await server.close();}
