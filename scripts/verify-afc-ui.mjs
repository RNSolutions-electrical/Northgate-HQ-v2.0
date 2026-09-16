import {createRequire} from 'node:module';
import {createServer} from 'vite';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const mocks=path.resolve('tests/fixtures/afc-mocks.js');
const server=await createServer({cacheDir:path.join(tmpdir(),'afc-ui-check'),plugins:[{name:'afc-fixture',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||id.endsWith('/afcApi.js')||id==='./afcApi.js'||id.endsWith('/services/supabaseClient.js'))return mocks;}}],server:{host:'127.0.0.1',port:5199,strictPort:true}});
await server.listen();const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 await mkdir('.temp/afc-checks',{recursive:true});
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5199/northgate/tests/fixtures/afc.html');
  await page.getByRole('button',{name:/Synthetic AFC study/}).click();
  await page.getByRole('button',{name:'Meterbase / service disconnect',exact:false}).click();
  await page.getByLabel('One-way length (ft)',{exact:true}).fill('0');
  await page.evaluate(()=>window.afcFixture.failSave=true);
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Synthetic stale save'}).waitFor();
  assert.equal(await page.getByLabel('One-way length (ft)',{exact:true}).inputValue(),'0');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Study saved'}).waitFor();
  await page.getByRole('button',{name:'Results & map',exact:true}).click();
  await page.getByRole('heading',{name:'Results & system map'}).waitFor();
  assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
  await page.screenshot({path:'.temp/afc-checks/results-'+width+'.png',fullPage:true});
  await page.getByRole('button',{name:'Review & archive',exact:true}).click();
  await page.getByLabel('Reviewed scope and assumptions').fill('Synthetic branch and source review.');
  await page.getByRole('button',{name:'Review and release report & labels',exact:true}).click();
  await page.getByText('Reviewed revision and original files archived.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.afcFixture.releases),1);
  await page.getByRole('button',{name:'Equipment & feeders',exact:true}).click();
  await page.getByLabel('One-way length (ft)',{exact:true}).fill('');
  await page.getByRole('button',{name:'Review & archive',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Download draft report',exact:true}).isDisabled(),true);
  assert.equal(await page.getByText('Revision 1 · Reviewed · Fixture reviewer',{exact:true}).isVisible(),true);
  assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: AFC desktop/mobile editing, zero length, failed-save retention, shared save, review/immutable archive display, invalid output blocking and no overflow/browser errors. Mocked transport.');
}finally{await browser.close();await server.close();}
