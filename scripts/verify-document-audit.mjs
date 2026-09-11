import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const mocks=path.resolve('tests/fixtures/document-audit-mocks.js');
const server=await createServer({cacheDir:path.join(tmpdir(),`document-fixture-${process.pid}`),
 plugins:[{name:'doc-fixture',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||id.endsWith('/services/supabaseClient.js'))return mocks;}}],
 server:{host:'127.0.0.1',port:5192,strictPort:true}});
await server.listen();let browser;
try{
 browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage();page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mkdir('.temp/document-audit',{recursive:true});
 for(const owner of ['job','estimate'])for(const [width,height] of [[1440,1000],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});
  await page.goto('http://127.0.0.1:5192/northgate/tests/fixtures/document-audit.html?'+owner);
  await page.getByText(owner==='job'?'101 - Document Fixture':'EST-1',{exact:true}).first().click();
  if(await page.locator('.workspace-tabs__mobile-trigger').isVisible())await page.locator('.workspace-tabs__mobile-trigger').click();
  await page.getByRole('button',{name:/^Documents/}).click();
  const row=page.getByRole('row').filter({hasText:'fixture.pdf'});
  await row.getByRole('button',{name:'Archive',exact:true}).click();
  const dialog=page.getByRole('alertdialog');
  await dialog.getByRole('textbox').fill('Superseded document');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.documentFixture.calls.some(c=>c.name?.startsWith('archive_'))),false);
  await row.getByRole('button',{name:'Archive',exact:true}).click();
  await dialog.getByRole('textbox').fill('Superseded document');
  await page.evaluate(()=>window.documentFixture.failNext=true);
  await dialog.getByRole('button',{name:/^Archive/}).click();
  await dialog.getByText('Fixture archive failed',{exact:true}).waitFor();
  assert.equal(await dialog.getByRole('textbox').inputValue(),'Superseded document');
  await page.screenshot({path:`.temp/document-audit/${owner}-${width}.png`,fullPage:true});
  await dialog.getByRole('button',{name:/^Archive/}).click();
  await dialog.waitFor({state:'detached'});
  await page.waitForFunction(()=>window.documentFixture.calls.filter(c=>c.name?.startsWith('archive_')).length===2);
  await page.getByLabel('File',{exact:true}).setInputFiles({name:'test.txt',mimeType:'text/plain',buffer:Buffer.from('Fixture')});
  await page.evaluate(()=>window.documentFixture.failUpload=true);
  await page.getByRole('button',{name:'Upload Document',exact:true}).click();
  await page.waitForFunction(()=>window.documentFixture.calls.some(c=>c.name==='archive_failed_document_upload'));
  assert.equal(await page.getByRole('alertdialog').count(),0);
  assert.equal(await page.evaluate(()=>window.documentFixture.calls.some(c=>c.name==='record_client_audit_event')),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: Jobs/Estimates archive reason cancel/retry preservation, metadata upload and controlled cleanup, no duplicate client audits, desktop/tablet/phone.');
}finally{await browser?.close();await server.close();}
