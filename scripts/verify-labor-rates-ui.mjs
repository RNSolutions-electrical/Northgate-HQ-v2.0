import {createServer} from 'vite';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server=await createServer({server:{host:'127.0.0.1',port:5332,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'}),errors=[];
try{
 await mkdir('.temp/labor-rates',{recursive:true});
 const page=await browser.newPage({viewport:{width:1440,height:1050}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const url='http://127.0.0.1:5332/northgate/tests/browser/labor-rates.html';
 await page.goto(url+'?library');await page.getByRole('button',{name:'Library settings',exact:true}).click();
 await page.getByLabel('Shared default labor rate / hour').fill('80');await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.rateFixture.settings.default_rate),75);
 await page.getByRole('button',{name:'Library settings',exact:true}).click();await page.getByLabel('Shared default labor rate / hour').fill('80');await page.getByRole('button',{name:'Save library settings',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.rateFixture.settings.default_rate),80);
 await page.getByRole('button',{name:'Refresh library',exact:true}).click();await page.getByText(/Assembly Library default: \$80.00/).waitFor();
 for(const rate of ['90','80']){await page.getByRole('button',{name:'Library settings',exact:true}).click();await page.getByLabel('Shared default labor rate / hour').fill(rate);await page.getByRole('button',{name:'Save library settings',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByText(new RegExp('Assembly Library default: \\$'+rate+'\\.00')).waitFor();}
 await page.getByRole('button',{name:'Edit assembly',exact:true}).click();await page.getByLabel('Library assembly rate override / hour',{exact:false}).fill('0');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.reload();await page.getByText(/Library assembly override: \$0.00/).waitFor();
 await page.getByRole('button',{name:'Edit assembly',exact:true}).click();await page.getByRole('button',{name:'Reset rate to inherited',exact:true}).click();
 assert.equal(await page.getByLabel('Library assembly rate override / hour',{exact:false}).inputValue(),'');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.reload();await page.getByText(/Assembly Library default: \$80.00/).waitFor();
 await page.screenshot({path:'.temp/labor-rates/library.png',fullPage:true});
 await page.goto(url);await page.getByRole('heading',{name:'Project overview'}).waitFor();
 await page.getByLabel('Labor rate / hour',{exact:false}).fill('0');await page.getByRole('button',{name:'Save Draft',exact:true}).click();await page.reload();
 assert.equal(await page.getByLabel('Labor rate / hour',{exact:false}).inputValue(),'0');
 await page.getByRole('button',{name:'Reset estimate rate to inherited'}).click();await page.getByRole('button',{name:'Save Draft',exact:true}).click();
 await page.evaluate(()=>{sessionStorage.setItem('rates-settings',JSON.stringify({default_rate:100,updated_at:'new',division:'Electrical'}));});await page.reload();
 assert.equal(await page.evaluate(()=>window.rateFixture.document.libraryDefaultRateSnapshot),80);
 await page.getByRole('button',{name:'Refresh inherited labor rates'}).click();await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.evaluate(()=>window.rateFixture.saves),0);
 await page.getByRole('button',{name:'Refresh inherited labor rates'}).click();await page.getByRole('button',{name:'Apply rate refresh'}).click();await page.getByRole('button',{name:'Save Draft',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.rateFixture.document.libraryDefaultRateSnapshot),100);
 await page.getByRole('button',{name:'Refresh inherited labor rates'}).click();await page.getByRole('button',{name:'Apply rate refresh'}).click();await page.getByRole('button',{name:'Save Draft',exact:true}).click();assert.equal(await page.evaluate(()=>window.rateFixture.document.libraryDefaultRateSnapshot),100);
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:1050});await page.screenshot({path:'.temp/labor-rates/estimate-'+width+'.png',fullPage:true});}
 assert.deepEqual(errors,[]);console.log('PASS: isolated headless Edge library settings cancel/save, assembly override zero/reload/reset, estimate zero/reload/reset, no silent repricing, cancelled and repeated refresh, three viewport screenshots, no page errors or external requests.');
}finally{await browser.close();await server.close();}
