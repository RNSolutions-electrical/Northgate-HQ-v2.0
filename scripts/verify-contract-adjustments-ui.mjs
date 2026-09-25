import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const mocks=path.resolve('tests/fixtures/contract-adjustments-mocks.js');
const port=Number(process.env.CONTRACT_ADJUSTMENT_TEST_PORT||5194);
const server=await createServer({cacheDir:path.join(tmpdir(),'northgate-adjustment-fixture-cache'),plugins:[{name:'fixture',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||id.endsWith('/services/supabaseClient.js'))return mocks;}}],server:{host:'127.0.0.1',port,strictPort:true}});
await server.listen();let browser;
try{
 browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage();page.setDefaultTimeout(12000);const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 const url=`http://127.0.0.1:${port}/northgate/tests/fixtures/contract-adjustments.html`;
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto(url);
  await page.getByRole('button',{name:'Save Draft',exact:true}).click();
  await page.getByText('Adjustment saved. Incomplete information is preserved.').waitFor();
  const call=await page.evaluate(()=>window.adjustmentFixture.calls.find(c=>c.name==='save_contract_adjustment'));
  assert.equal(call.args.p_data.title,'');assert.equal(call.args.p_data.lines[0].material_amount,null);
  await page.getByLabel('Title',{exact:true}).fill('No cost scope');
  await page.getByLabel('material',{exact:true}).fill('0');
  await page.getByRole('button',{name:'Approve & post to Financials'}).click();
  await page.getByText('Approved and posted to Changes. Original Budget is unchanged.').waitFor();
  assert.equal(await page.getByLabel('material',{exact:true}).isDisabled(),true);
  await page.getByText('Documents & client PDF',{exact:true}).click();
  await page.getByLabel('Customer authorization (PDF or image)').setInputFiles({name:'authorization.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 fixture')});
  await page.getByRole('button',{name:'Attach authorization',exact:true}).click();
  await page.getByText('Signed document uploaded once, linked to Documents, and employee verification recorded.').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no page overflow');
  await mkdir(path.join(tmpdir(),'northgate-contract-adjustment-qa'),{recursive:true});
  await page.screenshot({path:path.join(tmpdir(),'northgate-contract-adjustment-qa',width+'.png'),fullPage:true});
 }
 for(const state of ['submitted','approved','denied','waived','potential']){
  await page.goto(url+'?state='+state);
  await page.getByLabel('material',{exact:true}).waitFor({state:'attached'});
  assert.equal(await page.getByLabel('material',{exact:true}).isDisabled(),['approved','denied','waived'].includes(state),state+' edit lock');
 }
 await page.goto(url+'?supervisor');
 assert.equal(await page.getByRole('button',{name:'Approve & post to Financials'}).count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: desktop/mobile incomplete saves, direct approval, input locks, approved authorization upload, five states and supervisor UI.');
}finally{await browser?.close();await server.close();}
