import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const mocks=path.resolve('tests/fixtures/workbench-mocks.js');
const server=await createServer({cacheDir:path.join(tmpdir(),'estimate-references-'+process.pid),plugins:[{name:'fixture',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||id.endsWith('/services/supabaseClient.js')||id.endsWith('/hooks/usePermissions.js'))return mocks;}}],server:{host:'127.0.0.1',port:5196,strictPort:true}});
await server.listen();const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 await mkdir('.temp/estimate-references',{recursive:true});
 for(const width of [1440,768,390]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5196/northgate/tests/fixtures/workbench.html?editing&references');
  await page.getByRole('button',{name:/^Revision test/}).click();
  const frame=page.frameLocator('iframe[title="Estimate editor"]');
  await frame.getByRole('button',{name:'Expand entry 001',exact:true}).click();
  assert.equal(await frame.locator('.work-item-group').count(),3);
  assert.equal(await frame.locator('.work-item-review').count(),0,'Collapsed by default');
  const original=await page.evaluate(()=>JSON.stringify(window.workbenchFixture.rows[0].document));
  for(let i=1;i<=3;i++){
   const group=frame.getByRole('region',{name:`Work item 001.${i} Assembly ${i}`,exact:true});
   await group.getByRole('button',{name:`Expand work item Assembly ${i}`,exact:true}).click();
   assert.deepEqual(await group.locator('.component-reference').allTextContents(),[1,2,3].map(j=>`001.${i}.${j}`));
   await group.getByRole('button',{name:`Collapse work item Assembly ${i}`,exact:true}).click();
  }
  assert.equal(await page.evaluate(()=>window.workbenchFixture.calls.length),0,'Expansion must not write');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.workbenchFixture.rows[0].document)),original);
  assert.equal(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.ownerDocument.defaultView.innerWidth),true);
  await page.screenshot({path:`.temp/estimate-references/groups-${width}.png`});
  await frame.getByRole('button',{name:'Open Assembly 1',exact:true}).click();
  // Stage grouping must not restart numbering: Rough-in appears before Trim-out.
  assert.deepEqual(await frame.locator('.component-reference').allTextContents(),['001.1.2','001.1.1','001.1.3']);
  const component=frame.locator('details.component').filter({hasText:'001.1.2'});
  await component.locator('summary').focus();await page.keyboard.press('Enter');
  await component.getByLabel('Quantity for Component 1-2',{exact:true}).fill('2');
  assert.equal(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.ownerDocument.defaultView.innerWidth),true);
  await page.screenshot({path:`.temp/estimate-references/editor-${width}.png`});
  await frame.getByRole('button',{name:'Save changes',exact:true}).click();
  await frame.getByRole('button',{name:'Open Assembly 1',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.workbenchFixture.rows[0].document.entries[0].items[0].lines[1].qty),'2');
  await frame.getByRole('button',{name:'Expand work item Assembly 1',exact:true}).click();
  assert.deepEqual(await frame.locator('.component-reference').allTextContents(),['001.1.1','001.1.2','001.1.3']);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: numeric hierarchy across stages, distinct collapsible groups, keyboard component editing/save, read-only expansion and responsive layout at 1440/768/390px.');
}finally{await browser.close();await server.close();}
