import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const mocks=path.resolve('tests/fixtures/inventory-pass-mocks.js');
const server=await createServer({cacheDir:path.join(tmpdir(),'ng-storage-delete'),plugins:[{name:'fixture',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||id.endsWith('/services/supabaseClient.js')||id.endsWith('/hooks/usePermissions.js'))return mocks;}}],server:{host:'127.0.0.1',port:5193,strictPort:true}});
await server.listen();let browser;
try{
 browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir('.temp/storage-delete',{recursive:true});
 const url='http://127.0.0.1:5193/northgate/tests/fixtures/inventory-pass.html?locations&storage&safeDelete';
 for(const width of [1440,768,390]){
  const page=await browser.newPage({viewport:{width,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(url+'&role=Developer');await page.getByRole('button',{name:'Open SHOP',exact:true}).click();
  await page.getByRole('button',{name:'Add shelf',exact:true}).click();await page.getByLabel('Location code',{exact:true}).fill(' old ');await page.getByLabel('Location name',{exact:true}).fill('Unneeded duplicate');
  await page.getByText(/Archived location or parent — its code remains reserved/).waitFor();
  assert.equal(await page.evaluate(()=>window.inventoryFixture.calls.filter(c=>c.name==='create_inventory_location').length),0);
  await page.getByRole('button',{name:'Open existing location'}).click();await page.getByText('Location details & administration',{exact:true}).click();
  await page.getByText('Developer only · Permanent deletion',{exact:true}).click();
  const remove=page.getByRole('button',{name:'Permanently Delete',exact:true}),download=page.getByRole('button',{name:'Download backup JSON'});
  assert.equal(await remove.isDisabled(),true);assert.equal(await download.isDisabled(),true);
  await page.getByLabel('Reason for permanent deletion').fill('Remove unused shelf');await page.getByLabel('Developer initials').fill('RN');
  await page.evaluate(()=>window.inventoryFixture.blockDeletion=true);await download.click();await page.getByRole('alert').filter({hasText:'referenced by public.bin_items'}).waitFor();assert.equal(await remove.isDisabled(),true);
  await page.evaluate(()=>window.inventoryFixture.blockDeletion=false);
  let pending=page.waitForEvent('download');await download.click();let file=await pending;await file.saveAs(`.temp/storage-delete/${width}-backup.json`);
  const backup=JSON.parse(await readFile(`.temp/storage-delete/${width}-backup.json`,'utf8'));assert.equal(backup.record.id,'archivedShelf');assert.equal(backup.initials,'RN');
  assert.equal(await remove.isDisabled(),true);await page.getByLabel('I confirm I saved the backup JSON.').check();await page.getByLabel('Type location code OLD to confirm').fill('WRONG');assert.equal(await remove.isDisabled(),true);
  await page.getByLabel('Type location code OLD to confirm').fill('OLD');assert.equal(await remove.isDisabled(),false);
  await page.getByLabel('Reason for permanent deletion').fill('Updated reason');assert.equal(await remove.isDisabled(),true);
  pending=page.waitForEvent('download');await download.click();await pending;await page.getByLabel('I confirm I saved the backup JSON.').check();
  await page.screenshot({path:`.temp/storage-delete/${width}-ready.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // A failed request retains the downloaded backup for safe idempotent retry.
  await page.evaluate(()=>window.inventoryFixture.failNext=true);await remove.click();await page.getByRole('alert').filter({hasText:'Fixture stock changed'}).waitFor();await remove.click();
  await page.getByRole('heading',{name:'SHOP — Electrical shop',exact:true}).waitFor();await page.getByLabel('Include archived locations').check();assert.equal(await page.getByRole('button',{name:'Open OLD',exact:true}).count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 for(const role of ['Manager','Director','Supervisor','Developer&denyDeveloper']){
  const page=await browser.newPage();await page.goto(url+'&role='+role);await page.getByRole('button',{name:'Open SHOP',exact:true}).click();await page.getByLabel('Include archived locations').check();await page.getByRole('button',{name:'Open OLD',exact:true}).click();await page.getByText('Location details & administration',{exact:true}).click();assert.equal(await page.getByText('Developer only · Permanent deletion',{exact:true}).count(),0);await page.close();
 }
 console.log('PASS: responsive archived duplicate discovery/open; Developer-only/override-denied visibility; reason/initial/download/code gates; reference blocker; JSON download contents; input-change invalidation; failed delete/retry; return to parent; no browser errors/overflow. Mock transport, not live deletion.');
}finally{await browser?.close();await server.close();}
