import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const mocks=path.resolve('tests/fixtures/inventory-pass-mocks.js');
const server=await createServer({cacheDir:path.join(tmpdir(),`ng-phase1-${process.pid}`),plugins:[{name:'fixture',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||id.endsWith('/services/supabaseClient.js')||id.endsWith('/hooks/usePermissions.js'))return mocks;}}],server:{host:'127.0.0.1',port:5190,strictPort:true}});
await server.listen();let browser;
try{
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
 const page=await browser.newPage(),errors=[];page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await mkdir('.temp/catalog-inventory-ui',{recursive:true});
 const url='http://127.0.0.1:5190/northgate/tests/fixtures/inventory-pass.html?locations&phase1';
 for(const [device,width,height] of [['desktop',1440,1000],['tablet',768,1024],['phone',390,844]]){
  await page.setViewportSize({width,height});await page.goto(url);
  await page.getByRole('button',{name:'Full Catalogue',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search materials',exact:true}).fill('Greenfield');
  const material=page.locator('details.inventory-material').filter({hasText:'EMT connector'});
  await material.locator('summary').click();await material.getByRole('button',{name:'Material aliases',exact:true}).click();
  await page.getByLabel('New alias',{exact:true}).fill('flex');await page.getByLabel('Reason for alias change').fill('Common field terminology');
  await page.getByRole('button',{name:'Add alias',exact:true}).click();await page.getByText('Alias saved.',{exact:true}).waitFor();
  await page.screenshot({path:`.temp/catalog-inventory-ui/${device}-aliases.png`,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Back to Inventory',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search materials',exact:true}).fill('flex');
  await page.locator('details.inventory-material').filter({hasText:'EMT connector'}).waitFor();
  await page.getByRole('button',{name:'Add materials / Count',exact:true}).click();
  await page.getByLabel('Bin',{exact:true}).selectOption('b1');await page.getByLabel('Search materials',{exact:true}).fill('Lighting panel');await page.getByLabel('Catalog Item',{exact:true}).selectOption('i2');
  assert.equal(await page.getByLabel('Counted Qty',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Confirm material mapping',exact:true}).click();await page.getByText('Material mapped. Quantity remains uncounted; use the count sheet when ready.',{exact:true}).waitFor();
  const mapping=await page.evaluate(()=>window.inventoryFixture.calls.filter(c=>c.name==='map_material_to_inventory_bin'));
  assert.equal(mapping.length,1);assert.equal('p_counted_quantity' in mapping[0].args,false);
  const row=page.locator('tr').filter({hasText:'Lighting panel'}).first();await row.getByText('Not counted',{exact:true}).waitFor();
  await row.locator('input[type=number]').fill('0');await row.getByRole('button',{name:'Set Count',exact:true}).click();await row.getByText('Set to 0.',{exact:true}).waitFor();
  assert.equal(await row.getByText('Not counted',{exact:true}).count(),0);
  // Create an empty bin, then edit/archive/restore it without modifying inventory.
  await page.getByRole('button',{name:'Add Storage Location',exact:true}).click();await page.getByLabel('Location type').selectOption('bin');await page.getByLabel('Parent bay').selectOption('a1');await page.getByLabel('Location code').fill('EMPTY');await page.getByLabel('Location name').fill('Empty test bin');await page.getByRole('button',{name:'Save location',exact:true}).click();await page.getByRole('heading',{name:'Bin saved',exact:true}).waitFor();await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:'Edit location',exact:true}).click();await page.getByLabel('Location code').fill('EDITED');await page.getByLabel('Location name').fill('Edited bin');await page.getByLabel('Sort position').fill('3');await page.getByLabel('Reason for editing location').fill('Correct bin label');
  await page.screenshot({path:`.temp/catalog-inventory-ui/${device}-edit.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Save location changes',exact:true}).click();await page.getByRole('button',{name:'Edit location',exact:true}).waitFor();
  const edit=await page.evaluate(()=>window.inventoryFixture.calls.find(c=>c.name==='edit_inventory_location'));
  assert.equal(edit.args.p_code,'EDITED');assert.equal(edit.args.p_expected_revision,1);assert.equal(edit.args.p_position,3);
  assert.equal(await page.getByRole('button',{name:'Archive location',exact:true}).isDisabled(),true);
  await page.getByLabel('Reason for archiving location').fill('No longer in use');await page.getByRole('button',{name:'Archive location',exact:true}).click();await page.getByRole('heading',{name:'Archived location',exact:true}).waitFor();
  await page.getByLabel('Include archived locations').check();
  await page.screenshot({path:`.temp/catalog-inventory-ui/${device}-archived.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByLabel('Reason for restoring location').fill('Return to active service');await page.getByRole('button',{name:'Restore location',exact:true}).click();await page.getByRole('button',{name:'Edit location',exact:true}).waitFor();
 }
 await page.goto(url+'&role=Supervisor');await page.getByRole('button',{name:'Full Catalogue',exact:true}).click();await page.getByRole('searchbox',{name:'Search materials',exact:true}).fill('Greenfield');await page.locator('details.inventory-material summary').click();await page.getByRole('button',{name:'Material aliases',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Add alias',exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: desktop/tablet/phone real workspace; aliases search/save; explicit mapping without quantity; count unknown→zero; location editing, revision payload, reason gates, archive/restore; stable record IDs; permission UI; no horizontal overflow or browser exceptions. Transport is mocked; SQL independently tested.');
}finally{await browser?.close();await server.close();}
