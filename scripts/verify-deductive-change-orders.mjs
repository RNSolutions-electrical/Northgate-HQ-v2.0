import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const mocks=path.resolve('tests/fixtures/deductive-change-orders-mocks.js');
const server=await createServer({cacheDir:path.join(tmpdir(),`credit-fixture-${process.pid}`),
  plugins:[{name:'credit-fixture',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||id.endsWith('/services/supabaseClient.js'))return mocks;}}],
  server:{host:'127.0.0.1',port:5191,strictPort:true}});
await server.listen();let browser;
try {
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
  const page=await browser.newPage();page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:5191/northgate/tests/fixtures/deductive-change-orders.html';
  await mkdir('.temp/deductive-change-orders',{recursive:true});
  for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['phone',390,844]]) {
    await page.setViewportSize({width,height});await page.goto(url);
    await page.getByLabel('Change Order number',{exact:true}).fill('CREDIT-1');
    await page.getByLabel('Title',{exact:true}).fill('Deleted light fixtures');
    await page.getByLabel('material',{exact:true}).fill('-120');
    await page.getByLabel('labor',{exact:true}).fill('20');
    await page.getByLabel('markup',{exact:true}).fill('-10');
    await page.locator('.change-order-line__heading').getByText('-$110.00',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('material',{exact:true}).evaluate(el=>el.validity.valid),true);
    await page.getByRole('button',{name:'Save Draft',exact:true}).click();
    await page.waitForFunction(()=>window.creditFixture.calls.some(c=>c.name==='save_job_change_order_draft'));
    await page.goto(url+'?reopen');
    await page.waitForFunction(()=>document.querySelector('input[type=number]')?.value==='-120');
    await page.getByLabel('material',{exact:true}).fill('-140');
    await page.evaluate(()=>window.creditFixture.failNext=true);
    await page.getByRole('button',{name:'Submit Change Order',exact:true}).click();
    await page.getByText('Fixture save rejected',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.creditFixture.calls.some(c=>c.name==='submit_job_change_order')),false);
    assert.equal(await page.getByLabel('material',{exact:true}).inputValue(),'-140');
    await page.getByRole('button',{name:'Submit Change Order',exact:true}).click();
    await page.getByRole('button',{name:'Export PDF for signature',exact:true}).waitFor();
    const calls=await page.evaluate(()=>window.creditFixture.calls);
    assert.equal(calls.at(-2).name,'save_job_change_order_draft');
    assert.equal(calls.at(-2).args.p_lines[0].material_amount,'-140');
    assert.equal(calls.at(-1).name,'submit_job_change_order');
    assert.equal(await page.getByLabel('material',{exact:true}).isDisabled(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`.temp/deductive-change-orders/${name}.png`,fullPage:true});
    const popupPromise=page.waitForEvent('popup');
    await page.getByRole('button',{name:'Export PDF for signature',exact:true}).click();
    const popup=await popupPromise;
    await popup.locator('.total').getByText('-$130.00',{exact:true}).waitFor();
    assert.equal(await popup.locator('tbody').innerText(),'1\tLighting changes\t-$130.00');
    await popup.close();
  }
  await page.goto(url+'?readonly');
  assert.equal(await page.getByRole('button',{name:'Save Draft',exact:true}).count(),0);
  assert.equal(await page.getByLabel('material',{exact:true}).isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: signed totals/input, save/reopen, submit saves latest draft, failed save blocks submission, PDF credit, readonly and desktop/tablet/phone.');
} finally {await browser?.close();await server.close();}
