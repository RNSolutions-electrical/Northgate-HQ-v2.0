import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// Only auth/database adapters are replaced; route, handler, modal and iframe editor are real.
const adapters={
 clerk:`const getToken=async()=>null;export const useAuth=()=>({getToken});`,
 permissions:`export const usePermissions=()=>({isLoading:false,canSavePersonalWork:!new URLSearchParams(location.search).has('denied'),canEstimate:false,canApproveEstimates:false,division:'Electrical'});`,
 token:`export const getSupabaseAccessToken=async()=>null;`,
 database:`export function createSupabaseClient(){return {from(table){const response={data:table==='assembly_library_settings'?{default_rate:95,division:'Electrical'}:[],error:null};const chain=new Proxy({}, {get:(_,key)=>key==='then'?(resolve)=>Promise.resolve(response).then(resolve):()=>chain});return chain;},async rpc(name,args){const f=window.submissionFixture;if(name==='read_my_v5_working_copies')return {data:f.rows};if(name==='save_v5_working_copy'){const row={...f.rows[0],version:2,payload:args.p_payload};f.rows[0]=row;return {data:row};}if(name==='submit_v5_estimate_for_review'){f.calls.push(args);return new Promise(resolve=>{f.pending=()=>resolve(f.mode==='failure'?{error:{message:'Fixture submission failed'}}:{data:{}});});}throw Error('Unexpected fixture RPC '+name);}}}`
};
const server=await createServer({configFile:false,base:'/',define:{'import.meta.env.VITE_APP_ENV':JSON.stringify(process.env.SUBMISSION_FIXTURE_ENV||'production')},plugins:[{name:'submission-fixtures',enforce:'pre',resolveId(source){if(source==='@clerk/clerk-react')return '\0fixture:clerk';if(source.endsWith('/hooks/usePermissions.js'))return '\0fixture:permissions';if(source.endsWith('/services/clerkToken.js'))return '\0fixture:token';if(source.endsWith('/services/supabaseClient.js'))return '\0fixture:database';},load(id){if(id.startsWith('\0fixture:'))return adapters[id.slice(9)];}}],server:{host:'127.0.0.1',port:5321,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'}),errors=[],checks=[];
await mkdir('.temp/estimate-submission',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const url='http://127.0.0.1:5321/tests/browser/estimate-submission.html';
 const enter=async()=>{await page.getByRole('button',{name:/Submission fixture/}).click();await page.frameLocator('iframe').getByRole('button',{name:'Save Draft',exact:true}).waitFor();};
 await page.goto(url);await enter();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
 await page.screenshot({path:'.temp/estimate-submission/desktop-editor.png'});
 await page.locator('.calculator-launcher').click();await page.getByLabel('Expression',{exact:true}).fill('200+20%');
 const trigger=page.getByRole('button',{name:'Submit for Review',exact:true}),dialog=page.locator('dialog.estimate-submission-dialog'),reason=page.getByRole('textbox',{name:'Submission reason'});
 assert.equal(await reason.count(),0);await trigger.click();await reason.waitFor();assert.equal(await reason.evaluate(e=>e===e.ownerDocument.activeElement),true);
 await page.locator('.calculator-panel').waitFor({state:'hidden'});
 await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(e=>e.textContent==='Submit for Review');button.click();button.click();});assert.equal(await dialog.count(),1);
 assert.equal(await page.evaluate(()=>window.submissionFixture.calls.length),0);assert.equal(await dialog.getByRole('button',{name:'Confirm submission'}).isDisabled(),true);
 await reason.fill('   ');assert.equal(await dialog.getByRole('button',{name:'Confirm submission'}).isDisabled(),true);
 await reason.fill('Review fixture reason');await reason.press('Escape');assert.equal(await dialog.count(),0);assert.equal(await trigger.evaluate(e=>e===e.ownerDocument.activeElement),true);
 await page.locator('.calculator-panel').waitFor();assert.equal(await page.getByLabel('Expression',{exact:true}).inputValue(),'200+20%');await page.getByRole('button',{name:'Close calculator',exact:true}).click();
 await trigger.click();assert.equal(await reason.inputValue(),'Review fixture reason');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await trigger.click();
 await page.screenshot({path:'.temp/estimate-submission/desktop-modal.png'});
 await reason.press('Tab');await page.keyboard.press('Tab');await page.keyboard.press('Tab');assert.equal(await dialog.evaluate(e=>e.contains(e.ownerDocument.activeElement)),true);
 await dialog.getByRole('button',{name:'Confirm submission'}).click();await reason.press('Escape');assert.equal(await dialog.count(),1);assert.equal(await reason.isDisabled(),true);
 await dialog.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});assert.equal(await page.evaluate(()=>window.submissionFixture.calls.length),1);
 await page.evaluate(()=>window.submissionFixture.pending());await page.getByRole('alert').filter({hasText:'Fixture submission failed'}).waitFor();assert.equal(await reason.inputValue(),'Review fixture reason');checks.push('opening, whitespace validation, focus trap/return, Escape/Cancel retain text, failure retain text, pending dismiss/duplicate guard');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Change route'}).click();await trigger.click();assert.equal(await reason.inputValue(),'Review fixture reason');
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent==='Change route').click());await page.waitForFunction(()=>!document.querySelector('dialog'));assert.equal(await page.evaluate(()=>document.body.style.overflow),'');checks.push('route change closes dialog and restores body');
 await page.setViewportSize({width:390,height:600});await trigger.click();const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=391&&box.y+box.height<=601);await page.screenshot({path:'.temp/estimate-submission/mobile-modal.png'});
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));await page.screenshot({path:'.temp/estimate-submission/mobile-editor.png'});checks.push('mobile modal fits, editor outer page has no vertical scrollbar');
 await trigger.click();await page.evaluate(()=>window.submissionFixture.mode='success');await dialog.getByRole('button',{name:'Confirm submission'}).click();await page.evaluate(()=>window.submissionFixture.pending());await page.getByRole('button',{name:'Submitted for review',exact:true}).waitFor();assert.equal(await dialog.count(),0);assert.equal(await page.getByRole('button',{name:'Submitted for review',exact:true}).isDisabled(),true);checks.push('success closes dialog, locks payload, shows status');
 await page.goto(url+'?locked');await enter();assert.equal(await page.getByRole('button',{name:'Submitted for review',exact:true}).isDisabled(),true);
 await page.goto(url+'?denied');await page.getByText('Estimate access is required.').waitFor();assert.equal(await page.getByRole('button',{name:'Submit for Review',exact:true}).count(),0);checks.push('submitted status and permission denial');
 await page.goto(url);await enter();const frame=page.frameLocator('iframe');await frame.getByLabel('Estimate name',{exact:true}).fill('Unsaved fixture edit');await trigger.click();await reason.fill('Retained dirty reason');await dialog.getByRole('button',{name:'Confirm submission'}).click();await dialog.getByRole('alert').filter({hasText:'Save the current estimate'}).waitFor();assert.equal(await page.evaluate(()=>window.submissionFixture.calls.length),0);
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await frame.getByRole('button',{name:'Save Draft',exact:true}).click();await frame.getByText('Saved to Supabase',{exact:true}).first().waitFor();await trigger.click();assert.equal(await reason.inputValue(),'Retained dirty reason');await dialog.getByRole('button',{name:'Confirm submission'}).click();await page.waitForFunction(()=>window.submissionFixture.calls.length===1);assert.equal(await page.evaluate(()=>window.submissionFixture.calls[0].p_expected_version),2);
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent==='Leave route').click());await page.getByText('Away',{exact:true}).waitFor();await page.evaluate(()=>window.submissionFixture.pending());assert.equal(await dialog.count(),0);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');checks.push('dirty validation, saved revision passed to RPC, pending route unmount cleanup, calculator precedence and retained state, repeated opening clicks');
 assert.deepEqual(errors,[]);await writeFile('.temp/estimate-submission/results-'+(process.env.SUBMISSION_FIXTURE_ENV||'production')+'.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(checks.join('\n'));
}finally{await browser.close();await server.close();}
