import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),adapter=path.resolve('tests/fixtures/standalone-estimate-adapters.js');
const server=await createServer({configFile:false,base:'/',define:{'import.meta.env.VITE_APP_ENV':'"staging"'},plugins:[{name:'local-standalone-adapters',enforce:'pre',resolveId(id){if(id==='@clerk/clerk-react'||/\/(services\/(supabaseClient|clerkToken)|hooks\/usePermissions)\.js$/.test(id))return adapter;}}],server:{host:'127.0.0.1',port:5340,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'}),checks=[],errors=[];
await mkdir('.temp/standalone-checks',{recursive:true});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const url='http://127.0.0.1:5340/tests/browser/standalone-estimate.html';await page.goto(url);
 const open=()=>page.getByRole('button',{name:/Standalone fixture/}).click();await open();const frame=page.frameLocator('iframe');await frame.getByRole('button',{name:'Link / create destination',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
 const trigger=page.getByRole('button',{name:'Submit for Review',exact:true}),dialog=page.locator('dialog.estimate-submission-dialog'),reason=dialog.getByRole('textbox',{name:'Submission reason'});
 await trigger.click();assert.equal(await dialog.getByLabel('Job',{exact:true}).count(),0);assert.equal(await dialog.getByLabel('Destination',{exact:true}).count(),0);await reason.fill('Unlinked fixture review');await reason.press('Escape');await trigger.click();assert.equal(await reason.inputValue(),'Unlinked fixture review');
 await page.evaluate(()=>window.standaloneFixture.mode='failure');await dialog.getByRole('button',{name:'Confirm submission'}).click();await dialog.getByRole('alert').waitFor();assert.equal(await reason.inputValue(),'Unlinked fixture review');
 await page.evaluate(()=>window.standaloneFixture.mode='success');await dialog.getByRole('button',{name:'Confirm submission'}).click();await page.getByRole('button',{name:'Submitted for review',exact:true}).waitFor();assert.equal(await frame.getByRole('button',{name:'Save Draft',exact:true}).isDisabled(),true);assert.equal(await frame.getByRole('button',{name:'Link / create destination',exact:true}).isDisabled(),true);assert.equal(await page.evaluate(()=>window.standaloneFixture.calls.filter(c=>c.name==='handoff_estimate_to_destination').length),0);
 await page.screenshot({path:`.temp/standalone-checks/submitted-${width}.png`});await page.getByRole('button',{name:'Review submission',exact:true}).click();await open();
 await page.getByRole('textbox',{name:'Review note',exact:true}).fill('Approve the estimate alone');await page.screenshot({path:`.temp/standalone-checks/review-${width}.png`});await page.evaluate(()=>window.standaloneFixture.mode='failure');await page.getByRole('button',{name:'Approve estimate',exact:true}).click();await page.getByRole('alert').filter({hasText:'Fixture review decision failed'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Review note',exact:true}).inputValue(),'Approve the estimate alone');await page.evaluate(()=>window.standaloneFixture.mode='success');await page.getByRole('button',{name:'Approve estimate',exact:true}).click();await page.getByText('Estimate approved. Its snapshot remains in Estimates; linking is optional.').waitFor();assert.equal(await page.evaluate(()=>window.standaloneFixture.handoff),null);
 await page.getByRole('button',{name:/^Official [Ee]stimates$/}).click();await page.locator('.estimate-directory-status--approved').waitFor();await open();await page.getByRole('button',{name:'Approved estimate',exact:true}).waitFor();assert.equal(await frame.getByRole('button',{name:'Save Draft',exact:true}).isDisabled(),true);assert.equal(await frame.getByRole('button',{name:'Link / create destination',exact:true}).isEnabled(),true);await page.screenshot({path:`.temp/standalone-checks/approved-${width}.png`});
 if(width<900)await frame.getByLabel('Workspace',{exact:true}).selectOption('Pricing');else await frame.getByRole('button',{name:'Pricing',exact:true}).click();await frame.getByRole('button',{name:'Expand entry 001',exact:true}).click();await frame.getByRole('button',{name:'Expand work item Light work',exact:true}).click();assert.match(await frame.locator('.work-item-review').innerText(),/PRIVATE entry/);
 const approvalCalls=await page.evaluate(()=>window.standaloneFixture.calls.filter(c=>c.name==='review_standalone_estimate').length);
 await frame.getByRole('button',{name:'Link / create destination',exact:true}).click();await frame.getByLabel('Destination',{exact:true}).selectOption('change_order');await frame.getByLabel('Job',{exact:true}).selectOption('job-fixture');await frame.getByLabel('Apply project division to all work items').selectOption('budget-fixture');await page.evaluate(()=>window.standaloneFixture.mode='failure');await frame.getByRole('button',{name:'Confirm handoff',exact:true}).click();await frame.getByRole('alert').waitFor();assert.equal(await frame.getByLabel('Job',{exact:true}).inputValue(),'job-fixture');await page.evaluate(()=>window.standaloneFixture.mode='success');await frame.getByRole('button',{name:'Confirm handoff',exact:true}).click();await frame.getByRole('heading',{name:'Destination ready',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.standaloneFixture.calls.filter(c=>c.name==='review_standalone_estimate').length),approvalCalls);await frame.getByRole('button',{name:'Back to estimate',exact:true}).click();await frame.getByRole('button',{name:'Open linked destination',exact:true}).waitFor();
 await frame.getByRole('button',{name:'All estimates',exact:true}).click();
 page.on('dialog',dialog=>dialog.accept());
 await page.evaluate(()=>window.standaloneFixture.mode='failure');
 await page.getByRole('button',{name:'Archive official estimate',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Fixture archive failed'}).waitFor();
 await page.evaluate(()=>window.standaloneFixture.mode='success');
 await page.getByRole('button',{name:'Archive official estimate',exact:true}).click();await page.getByText('No estimates yet.').waitFor();
 await page.getByRole('button',{name:'Show archived estimates',exact:true}).click();
 await page.getByRole('button',{name:'Restore',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/Standalone fixture/}).isDisabled(),true);
 await page.getByRole('button',{name:'Restore',exact:true}).click();await page.getByText('No estimates yet.').waitFor();
 await page.getByRole('button',{name:'Show active estimates',exact:true}).click();await open();await page.getByRole('button',{name:'Approved estimate',exact:true}).waitFor();
 await frame.getByRole('button',{name:'All estimates',exact:true}).click();await page.getByRole('button',{name:/^My [Ee]stimates$/}).click();await open();await page.getByRole('button',{name:'Promoted to official estimate',exact:true}).waitFor();assert.equal(await frame.getByRole('button',{name:'Save Draft',exact:true}).isDisabled(),true);
 await frame.getByRole('button',{name:'All estimates',exact:true}).click();await page.getByRole('button',{name:'Archive personal copy',exact:true}).click();await page.getByText('No estimates yet.').waitFor();
 await page.getByRole('button',{name:'Show archived estimates',exact:true}).click();await page.getByRole('button',{name:'Restore',exact:true}).click();await page.getByRole('button',{name:'Show active estimates',exact:true}).click();await page.getByRole('button',{name:/Standalone fixture/}).waitFor();
 assert.equal(await page.evaluate(()=>window.standaloneFixture.row.estimates.status),'approved');
 await page.screenshot({path:`.temp/standalone-checks/restored-${width}.png`});
 await page.close();checks.push(width+'px: estimate-only submission/review/approval, optional handoff, official archive failure/restore, promoted personal lock and independent personal archive/restore');
 }
 if(process.env.COMPONENTLESS_HOTFIX==='1')for(const width of [1440,390])for(const mode of ['manual','quote','unpriced']){
  const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:5340/tests/browser/standalone-estimate.html?componentless='+mode);await page.getByRole('button',{name:/Standalone fixture/}).click();const frame=page.frameLocator('iframe');
  await frame.getByRole('button',{name:'Approve estimate',exact:true}).click();
  if(mode==='unpriced'){
   await frame.getByRole('alert').filter({hasText:'Complete missing work-item names, quantities or pricing'}).waitFor();
   assert.equal(await page.evaluate(()=>window.standaloneFixture.calls.filter(c=>c.name==='approve_workbench_estimate').length),0);
  }else{
   const dialog=frame.getByRole('dialog');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Approve estimate',exact:true}).click();await page.getByRole('button',{name:'Approved estimate',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.standaloneFixture.calls.filter(c=>c.name==='approve_workbench_estimate').length),1);
  }
  await page.screenshot({path:`.temp/standalone-checks/componentless-${mode}-${width}.png`});await page.close();checks.push(width+'px componentless '+mode+': actual editor approval gate verified');
 }
 assert.deepEqual(errors,[]);await writeFile('.temp/standalone-checks/ui-results.json',JSON.stringify({passed:true,checks,errors,boundary:'actual shell/route/editor, mocked transport; SQL authority separately tested'},null,2));console.log(checks.join('\n'));
}finally{await browser.close();await server.close();}
