import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),adapter=path.resolve('tests/fixtures/standalone-estimate-adapters.js');
const server=await createServer({configFile:false,base:'/',define:{'import.meta.env.VITE_APP_ENV':'"staging"'},plugins:[{name:'review-scroll-adapters',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||/\/(services\/(supabaseClient|clerkToken)|hooks\/usePermissions)\.js$/.test(id))return adapter;}}],server:{host:'127.0.0.1',port:5349,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'}),directory='.temp/estimate-review-scroll',results=[];await mkdir(directory,{recursive:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:5349/tests/browser/standalone-estimate.html?review&long-review');
  await page.locator('.estimate-directory-row').filter({hasText:'Standalone fixture'}).click();
  const iframe=page.locator('iframe[title="Estimate editor"]'),frame=page.frameLocator('iframe[title="Estimate editor"]');await frame.getByRole('heading',{name:'Standalone fixture',exact:true,level:1}).waitFor();
  const realm=await(await iframe.elementHandle()).contentFrame();
  const measure=()=>page.evaluate(()=>{const iframe=document.querySelector('iframe[title="Estimate editor"]'),inner=iframe.contentDocument.scrollingElement;return {outerHeight:document.scrollingElement.scrollHeight,outerViewport:innerHeight,outerTop:document.scrollingElement.scrollTop,frameHeight:iframe.clientHeight,innerHeight:inner.scrollHeight,innerViewport:inner.clientHeight,innerTop:inner.scrollTop};});
  const baseline=process.env.SCROLL_CAPTURE_BASELINE==='1';await page.screenshot({path:directory+`/${baseline?'before':'review'}-${width}.png`});const initial=await measure();console.log(JSON.stringify({width,baseline,initial}));
  if(!baseline){
   assert.ok(initial.outerHeight<=initial.outerViewport+1,'Review must not create an outer vertical scrollbar');
   assert.ok(initial.frameHeight>400,'Review keeps a usable viewport, including mobile');
   const before=await page.evaluate(()=>JSON.stringify({document:window.standaloneFixture.row.document,request:window.standaloneFixture.request,total:window.standaloneFixture.total,snapshot:window.standaloneFixture.row.snapshot}));
   const note=frame.getByRole('textbox',{name:'Review note',exact:true});await note.fill('Buffered review note — do not submit.');
   const nav=async name=>width<=650?frame.getByLabel('Workspace',{exact:true}).selectOption(name):frame.getByRole('navigation',{name:'Estimate sections'}).getByRole('button',{name,exact:true}).click();
   await nav('Pricing');const metrics=await measure();assert.ok(metrics.innerHeight>metrics.innerViewport+500);assert.ok(metrics.outerHeight<=metrics.outerViewport+1);
   await realm.evaluate(()=>{document.scrollingElement.scrollTop=document.scrollingElement.scrollHeight;});assert.ok((await measure()).innerTop>500);assert.equal((await measure()).outerTop,0);
   await nav('Takeoff');const table=frame.locator('.table-scroll');await table.waitFor();if(width<650){assert.ok(await table.evaluate(element=>element.scrollWidth>element.clientWidth));await table.evaluate(element=>element.scrollLeft=150);assert.ok(await table.evaluate(element=>element.scrollLeft>0));}
   await nav('Proposal');await frame.locator('.proposal-builder').getByRole('button',{name:'Export Proposal',exact:true}).first().click();
   const overlay=frame.getByRole('dialog',{name:'Draft proposal preview'});await realm.waitForFunction(()=>document.querySelector('.pdf-preview-actions button:nth-child(3)')?.disabled===false,undefined,{timeout:60000});
   assert.ok(await overlay.evaluate(element=>element.getBoundingClientRect().height<=element.ownerDocument.defaultView.innerHeight));assert.equal(await overlay.evaluate(element=>element.scrollWidth<=element.clientWidth),true);await page.screenshot({path:directory+`/proposal-${width}.png`});
   await overlay.getByRole('button',{name:'Back to edit'}).click();assert.equal(await note.inputValue(),'Buffered review note — do not submit.');assert.ok((await measure()).outerHeight<=900+1);
   await page.setViewportSize({width,height:760});await page.waitForTimeout(200);assert.ok((await measure()).outerHeight<=760+1);
   assert.equal(await frame.getByRole('button',{name:'Save Draft',exact:true}).isDisabled(),true);assert.equal(await page.evaluate(()=>window.standaloneFixture.calls.length),0);
   assert.equal(await page.evaluate(()=>JSON.stringify({document:window.standaloneFixture.row.document,request:window.standaloneFixture.request,total:window.standaloneFixture.total,snapshot:window.standaloneFixture.row.snapshot})),before);
   await frame.getByRole('button',{name:'Review queue',exact:true}).click();await page.locator('.estimate-directory-row').filter({hasText:'Standalone fixture'}).waitFor();
  }
  assert.deepEqual(errors,[]);results.push({width,baseline,initial,passed:true});await page.close();
 }
 await writeFile(directory+'/results.json',JSON.stringify(results,null,2));console.log(process.env.SCROLL_CAPTURE_BASELINE==='1'?'Captured actual review double-scroll baseline.':'PASS: full shell/review iframe, long content, desktop/mobile/resizing, one main vertical scroll owner, horizontal takeoff table, proposal modal/back, read-only and unchanged data.');
}finally{await browser.close();await server.close();}
