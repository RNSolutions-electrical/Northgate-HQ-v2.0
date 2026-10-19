import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const mocks=path.resolve('tests/fixtures/remaining-budget-mocks.js');
const server=await createServer({cacheDir:'.temp/remaining-vite',plugins:[{name:'remaining-budget-fixture',enforce:'pre',resolveId(id){
  if(id==='@clerk/clerk-react'||id.endsWith('/services/supabaseClient.js'))return mocks;
}}],server:{host:'127.0.0.1',port:5192,strictPort:true}});
await server.listen();let browser;
const output='.temp/remaining-budget-qa',evidence=[];
await mkdir(output,{recursive:true});
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
const cases={toro:[5500,6729.59,-1229.59,5500],moved:[5500,6729.59,-1229.59,5500],credits:[0,-25.5,25.5,0],
  zero:[0,0,0,0],atBudget:[100,100,0,100],negativeBudget:[-200,-50,-150,-200],negative:[600,700,-100,600],overrides:[1200,200,1000,1200],decimals:[0.3,0.3,0,0.3],empty:[0,0,0,0],labels:[2500,1000,1500,2500]};
try {
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
  const page=await browser.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const card=label=>page.locator('.summary-card').filter({has:page.getByText(label,{exact:true})});
  const metric=(section,label)=>section.locator('.job-budget-division__metrics > span').filter({has:page.getByText(label,{exact:true})});
  async function open(scenario) {
    await page.goto(`http://127.0.0.1:5192/northgate/tests/fixtures/financial-workflows.html?case=${scenario}`);
    await page.getByText('101 - Budget Fixture',{exact:true}).click();
    if(await page.locator('.workspace-tabs__mobile-trigger').isVisible())await page.locator('.workspace-tabs__mobile-trigger').click();
    await page.getByRole('button',{name:/^Financials/}).click();
  }
  for(const [device,width,height] of (process.env.REMAINING_QUICK_LABELS ? [] : [['desktop',1440,1000],['tablet',768,1024],['phone',390,844]])) {
    await page.setViewportSize({width,height});
    for(const [scenario,[budget,actual,remaining,forecast]] of Object.entries(cases)) {
      await open(scenario);
      await card('Current Budget').getByText(money(budget),{exact:true}).waitFor();
      assert.equal(await card('Actual Costs').locator('strong').innerText(),money(actual));
      assert.equal(await card('Remaining Budget').locator('strong').innerText(),money(remaining));
      assert.equal(await card('Forecasted Remaining Budget').locator('strong').innerText(),money(forecast));
      assert.ok((await card('Remaining Budget').getAttribute('class')).includes(`summary-card--${remaining<0?'danger':remaining>0?'good':'default'}`));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${device}/${scenario}: page overflow`);
      if(scenario!=='empty') {
        const section=page.locator('.job-budget-division').first();
        assert.equal(await metric(section,'Remaining Budget').locator('strong').innerText(),money(remaining));
        assert.equal(await metric(section,'Forecasted Remaining Budget').locator('strong').innerText(),money(forecast));
        assert.ok((await metric(section,'Remaining Budget').getAttribute('class')).includes(remaining<0?'is-negative':remaining>0?'is-positive':'is-neutral'));
        const collapsed=await section.locator('.job-budget-division__metrics').innerText();
        assert.equal(await section.locator('table').count(),0);
        await section.locator('.job-budget-division__toggle').click();
        assert.equal(await section.locator('.job-budget-division__metrics').innerText(),collapsed);
        const headers=await section.locator('th').allTextContents();
        const index=headers.findIndex(text=>text.trim()==='Remaining Budget');assert.ok(index>=0);
        const rowBalances=await section.locator('tbody tr').evaluateAll((trs,index)=>trs.map(tr=>tr.cells[index]?.querySelector('strong')?.textContent),index);
        const parsed=rowBalances.map(value=>Number(value.replace(/[^\d.-]/g,'')));
        assert.equal(Math.round(parsed.reduce((sum,value)=>sum+value,0)*100)/100,remaining,'Expanded lines reconcile to division/job');
        if(scenario==='toro') {
          const costRow=section.locator('tbody tr').filter({hasText:'Materials'});
          assert.match(await costRow.getAttribute('class'),/over-budget/);
          assert.equal(await costRow.locator('.job-budget-health-cell strong').innerText(),'-$6,729.59');
          assert.equal(await costRow.locator('.job-budget-health-badge').innerText(),'OVER BUDGET');
          const colors=await metric(section,'Remaining Budget').locator('strong').evaluate(el=>{
            const probe=document.createElement('span');probe.style.color='var(--ng-err)';el.appendChild(probe);
            const result={actual:getComputedStyle(el).color,expected:getComputedStyle(probe).color};probe.remove();return result;
          });
          assert.equal(colors.actual,colors.expected,'Negative division remaining is red');
        }
        if(['zero','decimals'].includes(scenario))assert.equal(await section.locator('.job-budget-health-cell.is-negative').count(),scenario==='zero'?0:1);
        if(scenario==='labels') {
          assert.equal(await page.locator('.job-budget-division').count(),1,'Imported and prefix-derived Division 07 reconcile: '+JSON.stringify(await page.locator('.job-budget-division__title').allTextContents()));
          assert.match(await section.locator('.job-budget-division__title').innerText(),/Division 07 - Thermal & Moisture Protection/);
          assert.equal(await section.getByText('Thermal & Moisture Protection Change Orders',{exact:true}).count(),1);
          assert.equal(await section.getByText('Thermal & Moisture Protection',{exact:true}).count(),1);
        }
        if(['toro','labels'].includes(scenario))await page.screenshot({path:`${output}/${device}-${scenario}.png`,fullPage:true});
        await section.locator('.job-budget-division__toggle').click();
        assert.equal(await section.locator('.job-budget-division__metrics').innerText(),collapsed);
      }
      const reads=await page.evaluate(()=>window.financialFixture.reads);
      assert.ok(reads.some(r=>r.table==='job_budget_lines'&&r.filters.some(([k,v])=>k==='archived_at'&&v===null)&&r.filters.some(([k,v])=>k==='job_id'&&v==='86725057-845a-41f3-bb6f-4381ebad3095')));
      assert.deepEqual(await page.evaluate(()=>window.financialFixture.calls.filter(c=>!/^(get_|list_|read_)|^job_contract_closeout_counts$/.test(c.name))),[],'Read-only display verification never saves');
      assert.equal(await page.getByText(/Infinity|NaN/).count(),0);
      evidence.push({device,scenario,budget,actual,remaining,forecast,passed:true});
    }
    await open('multi');
    await card('Remaining Budget').getByText('-$925.00',{exact:true}).waitFor();
    assert.equal(await page.locator('.job-budget-division').count(),2);
    for(const [index,remaining] of [[0,-1000],[1,75]]) {
      const section=page.locator('.job-budget-division').nth(index);
      assert.equal(await metric(section,'Remaining Budget').locator('strong').innerText(),money(remaining));
      await section.locator('.job-budget-division__toggle').click();
      assert.equal(await metric(section,'Remaining Budget').locator('strong').innerText(),money(remaining));
    }
    evidence.push({device,scenario:'multiple divisions reconcile to selected job',passed:true});
    await open('toro');await page.locator('.job-budget-division__toggle').click();
    await page.getByRole('button',{name:'Edit completion forecast for Materials',exact:true}).click();
    await page.getByLabel('Completion forecast for Materials',{exact:true}).fill('8000');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await card('Forecasted Remaining Budget').getByText('-$2,500.00',{exact:true}).waitFor();
    assert.equal(await card('Remaining Budget').locator('strong').innerText(),'-$1,229.59');
    assert.equal(await page.locator('.job-budget-health-cell.is-negative strong').innerText(),'-$6,729.59');
    const saved=await page.evaluate(()=>window.financialFixture.calls.filter(c=>c.name==='save_job_financial_batch'));
    assert.equal(saved.length,1);assert.equal(saved[0].args.p_lines[0].actual_cost_amount,6729.59);assert.equal(saved[0].args.p_lines[0].forecast_final_amount,8000);
    evidence.push({device,scenario:'forecast edit independent of actual remaining',passed:true});
  }
  await open('labels');
  const originalRows=await page.evaluate(()=>JSON.stringify(window.financialFixture.rows()));
  await page.getByRole('button',{name:'Add Financial Line',exact:true}).click();
  await page.getByRole('region',{name:'Choose financial line division'}).getByRole('button',{name:'Division 07 - Thermal & Moisture Protection',exact:true}).waitFor();
  await page.getByRole('button',{name:'Cancel adding financial line'}).click();
  await page.locator('.job-budget-division__add-line').click();
  assert.equal(await page.locator('.job-budget-division').count(),1,'Add retains linked metadata when first row is unlinked');
  await page.getByLabel('Financial line description',{exact:true}).fill('Owner  Custom &Materials');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('status').getByText('Owner  Custom &Materials added in Financials.',{exact:true}).waitFor();
  const manual=await page.evaluate(()=>window.financialFixture.calls.find(c=>c.name==='save_job_financial_batch'));
  assert.equal(manual.args.p_lines[0].project_division_id,'d7');
  assert.equal(manual.args.p_lines[0].description,'Owner  Custom &Materials');
  assert.equal(await page.locator('.job-budget-division').count(),1);
  const afterManual=await page.evaluate(()=>window.financialFixture.rows());
  assert.equal(JSON.stringify(afterManual.filter(row=>row.id!=='new-line')),originalRows,'Stored existing names/amounts are preserved');
  await page.getByRole('button',{name:'Import Cost Report',exact:true}).click();
  const importDialog=page.getByRole('dialog',{name:'Import cost report'});
  await importDialog.locator('input[type="file"]').setInputFiles({name:'synthetic-cost-report.csv',mimeType:'text/csv',buffer:Buffer.from('Cost Code,Actual\n07,25.50')});
  await importDialog.getByText(/Thermal & Moisture Protection/).waitFor();
  await importDialog.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Build from Template',exact:true}).click();
  await page.getByText('Division 07 - Thermal & Moisture Protection',{exact:true}).last().waitFor();
  assert.equal(await page.getByText('Thermal& MoistureProtection',{exact:false}).count(),0);
  assert.equal(await page.evaluate(()=>window.financialFixture.calls.filter(c=>!/^(get_|list_|read_)|^job_contract_closeout_counts$/.test(c.name)).length),1,'Only the intentional synthetic manual create saves');
  evidence.push({scenario:'manual create, template picker, import preview and generated labels canonical; stored/custom names preserved',passed:true});
  assert.deepEqual(errors,[]);
  await writeFile(`${output}/evidence.json`,JSON.stringify({evidence,errors},null,2));
  console.log(`PASS: ${evidence.length} remaining-budget/label scenario groups, desktop/tablet/phone, no live backend requests or browser exceptions.`);
} finally {await browser?.close();await server.close();}
