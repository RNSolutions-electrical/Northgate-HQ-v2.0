import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';import {createServer} from 'vite';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const mocks=path.resolve('tests/fixtures/data-correction-mocks.js');
const server=await createServer({cacheDir:path.join(tmpdir(),'ng-data-correction'),plugins:[{name:'fixture',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||id.endsWith('/services/supabaseClient.js'))return mocks;}}],server:{host:'127.0.0.1',port:5194,strictPort:true}});await server.listen();let browser;
try{
 browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir('.temp/data-correction',{recursive:true});
 const url='http://127.0.0.1:5194/northgate/tests/fixtures/data-correction.html';
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(url);
  await page.getByRole('button',{name:'View retired assignments'}).click();await page.getByText('EMT-050 — EMT Set Screw Connectors').waitFor();
  const buttons=page.getByRole('button',{name:'Restore assignment',exact:true});assert.equal(await buttons.nth(1).isDisabled(),true);await buttons.first().click();
  assert.equal(await page.getByRole('button',{name:'Confirm restoration'}).isDisabled(),true);
  await page.getByLabel('Reason for restoring assignment').fill('Correct initial setup');await page.evaluate(()=>window.correctionFixture.fail=true);await page.getByRole('button',{name:'Confirm restoration'}).click();await page.getByRole('alert').waitFor();
  await page.screenshot({path:`.temp/data-correction/${width}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'Confirm restoration'}).click();await page.getByText(/Assignment restored. Stock was not changed/).waitFor();
  const calls=await page.evaluate(()=>window.correctionFixture.calls);assert.equal(calls.filter(c=>c.name==='restore_retired_bin_assignment').at(-1).args.p_reason,'Correct initial setup');
  await page.getByLabel('Correction access reason').fill('Cleanup finished');await page.getByRole('button',{name:'Revoke correction access'}).click();await page.getByRole('button',{name:'Grant correction access'}).waitFor();assert.equal(await page.getByRole('button',{name:'View retired assignments'}).count(),0);assert.equal(await page.getByText('Developer Data Correction enabled',{exact:true}).count(),0);
  await page.getByLabel('Correction access reason').fill('Resume setup');await page.getByRole('button',{name:'Grant correction access'}).click();await page.getByRole('button',{name:'Revoke correction access'}).waitFor();assert.equal(await page.getByText('Developer Data Correction enabled',{exact:true}).count(),1);assert.deepEqual(errors,[]);await page.close();
 }
 for(const suffix of ['?role=Manager','?role=Director','?role=User','?denied']){const page=await browser.newPage();await page.goto(url+suffix);assert.equal(await page.getByRole('button',{name:'View retired assignments'}).count(),0);await page.close();}
 console.log('PASS: desktop/mobile retired list, reason/quantity guards, failure/retry, unchanged-quantity message, audited arguments, grant/revoke warning and permission gating; no overflow or browser errors.');
}finally{await browser?.close();await server.close();}
