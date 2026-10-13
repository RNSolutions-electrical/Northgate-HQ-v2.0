import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server=await createServer({configFile:false,base:'/',server:{host:'127.0.0.1',port:5330,strictPort:true}});await server.listen();const browser=await chromium.launch({headless:true,channel:'msedge'}),errors=[];
await mkdir('.temp/calculator',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const url='http://127.0.0.1:5330/tests/browser/calculator.html';await page.goto(url);
 const launcher=page.locator('.calculator-launcher'),panel=page.locator('.calculator-panel'),expression=page.getByLabel('Expression',{exact:true}),result=page.getByLabel('Calculator result',{exact:true});
 await launcher.click();await expression.fill('200+20%');assert.equal(await result.inputValue(),'240');assert.match(await panel.getByLabel('Percentage amount',{exact:true}).innerText(),/20% of 200 = 40/);
 await expression.press('Enter');await panel.getByRole('button',{name:'Copy result',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'240');
 await panel.getByRole('button',{name:'Copy percentage amount',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'40');
 await panel.getByRole('button',{name:'History (1)',exact:true}).click();await panel.getByRole('button',{name:'Copy 200+20%',exact:true}).click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/200\+20% = 240\r?\n20% of 200 = 40/);
 await panel.getByRole('button',{name:'History (1)',exact:true}).click();
 await expression.fill('200+20');assert.equal(await panel.getByLabel('Percentage amount',{exact:true}).count(),0);await expression.fill('2+');await expression.press('Enter');assert.ok(await panel.getByRole('alert').count());assert.equal(await result.inputValue(),'');
 await expression.fill('200+20%');
 const before=await panel.boundingBox(),header=panel.locator('header');await page.mouse.move(before.x+80,before.y+16);await page.mouse.down();await page.mouse.move(10,10);await page.mouse.up();const after=await panel.boundingBox();assert.ok(after.x>=12&&after.y>=12);assert.ok(after.x<before.x);
 await panel.locator('summary').click();await panel.getByRole('button',{name:'Move calculator right',exact:true}).click();const moved=await panel.boundingBox();assert.ok(moved.x>after.x);await panel.getByRole('button',{name:'Reset position',exact:true}).click();await panel.locator('summary').click();
 await page.getByLabel('Background input',{exact:true}).fill('12+3');await page.getByLabel('Background input',{exact:true}).press('Enter');assert.equal(await expression.inputValue(),'200+20%');
 await page.getByRole('button',{name:'Developer',exact:true}).click();assert.equal(await expression.inputValue(),'200+20%');assert.ok(await page.getByRole('heading',{name:'Background developer'}).count());
 await page.reload();await expression.waitFor();assert.equal(await expression.inputValue(),'200+20%');
 await page.getByRole('button',{name:'Open parent modal',exact:true}).click();await panel.waitFor({state:'hidden'});await page.getByLabel('Modal input',{exact:true}).fill('99');await page.getByLabel('Modal input',{exact:true}).press('Enter');await page.getByRole('button',{name:'Close parent modal',exact:true}).click();await panel.waitFor();assert.equal(await expression.evaluate(el=>el===document.activeElement),false);
 const frame=page.frameLocator('iframe[title="Notes fixture"]');await frame.getByRole('button',{name:'Pricing',exact:true}).click();await frame.getByRole('button',{name:'Entry 001 Install receptacle',exact:true}).click();await frame.getByRole('button',{name:'Add Internal entry notes',exact:true}).click();await panel.waitFor({state:'hidden'});await frame.locator('dialog[open]').getByRole('textbox').fill('Calculator must not capture this');await frame.locator('dialog[open]').getByRole('textbox').press('Escape');await panel.waitFor();assert.equal(await expression.inputValue(),'200+20%');
 await expression.focus();await expression.press('Escape');await panel.waitFor({state:'hidden'});await page.getByRole('button',{name:'Calculator',exact:true}).last().click();await panel.waitFor();
 await page.screenshot({path:'.temp/calculator/desktop.png'});
 await panel.getByRole('button',{name:'Close calculator',exact:true}).click();await panel.waitFor({state:'hidden'});await launcher.click();assert.equal(await expression.inputValue(),'200+20%');
 // Tab leaves the nonmodal panel; it is not trapped.
 await panel.locator('summary').focus();await page.keyboard.press('Tab');assert.equal(await panel.evaluate(el=>el.contains(document.activeElement)),false);
 await page.getByRole('button',{name:'Switch fixture user',exact:true}).click();await panel.waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'Developer',exact:true}).count(),0);await launcher.click();assert.equal(await expression.inputValue(),'');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('northgate:calculator:v1:staging:fixture-a')),null);
 await expression.fill('50-10%');await expression.press('Enter');await page.getByRole('button',{name:'Fixture sign out',exact:true}).click();await panel.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>sessionStorage.getItem('northgate:calculator:v1:staging:fixture-b')),null);
 await page.reload();await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();await page.locator('.calculator-mobile-launcher').click();await expression.fill('200+20%');const mobile=await panel.boundingBox();assert.ok(mobile.x>=0&&mobile.x+mobile.width<=390&&mobile.y>=0&&mobile.y+mobile.height<844-70);
 await page.screenshot({path:'.temp/calculator/mobile.png'});await expression.press('Escape');await page.locator('.calculator-minimized').click();assert.equal(await result.inputValue(),'240');
 await page.setViewportSize({width:900,height:700});const resized=await panel.boundingBox();assert.ok(resized.x>=0&&resized.x+resized.width<=900&&resized.y>=0&&resized.y+resized.height<=700);
 assert.deepEqual(errors,[]);await writeFile('.temp/calculator/ui-results.json',JSON.stringify({passed:true,errors,checks:['percentage screens','history/copy','drag/reset/resize','background input/route/reload','parent/iframe modal precedence','escape/tab','user switch/logout','mobile app menu']},null,2));console.log('Calculator actual-shell UI checks passed');
}finally{await browser.close();await server.close();}
