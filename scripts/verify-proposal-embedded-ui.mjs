import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {checkNativePrintPreview} from './nativePrintPreviewCheck.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const mocks=path.resolve('tests/fixtures/workbench-mocks.js');
const server=await createServer({plugins:[{name:'fixture',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||id.endsWith('/services/supabaseClient.js')||id.endsWith('/hooks/usePermissions.js'))return mocks;}}],server:{host:'127.0.0.1',port:5348,strictPort:true}});
const native=process.env.PROPOSAL_NATIVE_PRINT==='1';
await server.listen();const browser=await chromium.launch({headless:!native,channel:'msedge',...(native?{ignoreDefaultArgs:['--disable-print-preview']}:{})});
const directory='.temp/proposal-embedded';await mkdir(directory,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],downloads=[];page.setDefaultTimeout(Number(process.env.PROPOSAL_QA_TIMEOUT_MS)||20000);
 page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});page.on('download',download=>downloads.push(download));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('http://127.0.0.1:5348/northgate/tests/fixtures/workbench.html?editing');
 const long=process.env.PROPOSAL_EMBEDDED_LONG==='1';
 await page.locator('.estimate-directory-row').filter({hasText:'Revision test'}).waitFor();
 if(long)await page.evaluate(async()=>{const {sumPricing}=await import('/northgate/src/modules/estimates/workbench/pricing.mjs');const doc=window.workbenchFixture.rows[0].document,entry=doc.entries[0],original=entry.items[0];entry.items=Array.from({length:24},(_,index)=>({...structuredClone(original),id:'long-item-'+index,number:index+1,name:index===1?'Required grounding and gas bonding':'Synthetic scope '+(index+1)}));doc.proposal={...doc.proposal,scopeMode:'grouped',showLinePrices:true,salesTaxPercent:7.25,creditCardPercent:3,scopeGroups:[{text:('Long grouped scope for actual embedded export review. ').repeat(110)+'FINAL GROUP TEXT',lineKeys:entry.items.map(item=>JSON.stringify([entry.id,item.id]))}]};doc.proposalChargeSnapshot=sumPricing(doc.entries.flatMap(entry=>entry.items),doc);});
 await page.locator('.estimate-directory-row').filter({hasText:'Revision test'}).click();
 const frame=page.frameLocator('iframe[title="Estimate editor"]');
 const editor=await page.locator('iframe[title="Estimate editor"]').elementHandle();const realm=await editor.contentFrame();
 const nav=async name=>frame.getByRole('navigation',{name:'Estimate sections'}).getByRole('button',{name,exact:true}).click();
 console.log('STEP editor');await nav('Proposal');await frame.getByLabel('Introduction',{exact:true}).fill('Thank you for the opportunity to quote this electrical work.');
 if(!long)await frame.getByLabel('Customer-facing scope',{exact:true}).fill('Provide receptacles, required grounding, bonding, permitting and testing.');
 await frame.getByRole('button',{name:'Save proposal',exact:true}).first().click();
 console.log('STEP saved');await nav('Overview');await frame.getByRole('button',{name:'Approve estimate',exact:true}).click();
 await frame.getByRole('checkbox',{name:/I confirm this estimate/}).check();await frame.locator('dialog[open]').getByRole('button',{name:'Approve estimate',exact:true}).click();
 console.log('STEP approved');const header=frame.locator('.estimate-header .export-trigger');await header.waitFor();assert.equal(await header.innerText(),'Export Proposal');
 const snapshot=await page.evaluate(()=>JSON.stringify(window.workbenchFixture.snapshots[0]));
 console.log('STEP header');await header.click();console.log('STEP export clicked');const overlay=frame.getByRole('dialog',{name:'Approved proposal preview'});
 await realm.waitForFunction(()=>document.querySelector('.pdf-preview-actions button:nth-child(3)')?.disabled===false,undefined,{timeout:20000});
 const dimensions=await overlay.evaluate(element=>({width:element.getBoundingClientRect().width,viewport:element.ownerDocument.defaultView.innerWidth,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth,fontFamilies:[...element.ownerDocument.fonts].map(font=>font.family)}));
 const baseline=process.env.PROPOSAL_CAPTURE_BASELINE==='1',prefix=long?'long-':'';await page.screenshot({path:directory+(baseline?'/before-desktop.png':'/'+prefix+'desktop-approved.png')});
 console.log(JSON.stringify({dimensions,baseline}));
 if(baseline){await overlay.getByRole('button',{name:'Back to edit'}).click();}
 else{
  assert.ok(dimensions.width>=1000&&dimensions.width<=1081,'Embedded desktop overlay must use responsive wide layout');assert.ok(dimensions.scrollWidth<=dimensions.clientWidth,'No horizontal overflow');assert.ok(dimensions.fontFamilies.length>=3,'Embedded PDF fonts must register in the editor document');assert.equal(downloads.length,0);
  const saving=page.waitForEvent('download');await overlay.getByRole('button',{name:'Save / Download'}).click();const download=await saving;await download.saveAs(directory+'/'+prefix+'approved.pdf');const bytes=Array.from(await readFile(directory+'/'+prefix+'approved.pdf'));
  const actual=await realm.evaluate(()=>document.querySelector('.pdf-preview-pages canvas').toDataURL());
  const reference=await page.evaluate(async bytes=>{const pdfjs=await import('/northgate/node_modules/pdfjs-dist/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/northgate/node_modules/pdfjs-dist/build/pdf.worker.mjs';const pdf=await pdfjs.getDocument({data:new Uint8Array(bytes),ownerDocument:document}).promise;const page=await pdf.getPage(1),viewport=page.getViewport({scale:1.5}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const result=canvas.toDataURL();await pdf.destroy();return result;},bytes);
  assert.ok(actual===reference,'Iframe preview pixels must match independent rendering of downloaded PDF');
  await writeFile(directory+'/'+prefix+'reference-page.png',Buffer.from(reference.split(',')[1],'base64'));
  if(native)console.log('NATIVE',JSON.stringify(await checkNativePrintPreview(browser,()=>overlay.getByRole('button',{name:'Print',exact:true}).click(),{pageCount:await overlay.locator('canvas').count(),screenshot:directory+'/'+prefix+'native-approved-print.png'})));
  await overlay.getByRole('button',{name:'Back to edit'}).click();assert.equal(await page.evaluate(()=>JSON.stringify(window.workbenchFixture.snapshots[0])),snapshot);
  await header.click();await realm.waitForFunction(()=>document.querySelector('.pdf-preview-actions button:nth-child(3)')?.disabled===false,undefined,{timeout:20000});await realm.locator('body').press('Escape');await overlay.waitFor({state:'detached'});
  await page.setViewportSize({width:390,height:844});await header.click();await realm.waitForFunction(()=>document.querySelector('.pdf-preview-actions button:nth-child(3)')?.disabled===false,undefined,{timeout:20000});
  assert.ok(await overlay.evaluate(element=>element.getBoundingClientRect().width<=element.ownerDocument.defaultView.innerWidth));assert.equal(await overlay.evaluate(element=>element.scrollWidth<=element.clientWidth),true);
  await page.screenshot({path:directory+'/'+prefix+'mobile-approved.png'});await overlay.getByRole('button',{name:'Close PDF preview'}).click();assert.equal(await page.evaluate(()=>JSON.stringify(window.workbenchFixture.snapshots[0])),snapshot);assert.equal(downloads.length,1);
 }
 assert.deepEqual(errors,[]);
 console.log(baseline?'Captured actual iframe baseline.':'PASS: real workbench route/iframe, approved header Export Proposal, wide desktop/mobile layout, iframe font registration, downloaded-PDF pixel equality, immutable snapshot, explicit download, Escape/back/close/reopen.');
}finally{await browser.close();await server.close();}
