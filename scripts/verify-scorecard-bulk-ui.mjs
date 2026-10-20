import assert from 'node:assert/strict';import {mkdir} from 'node:fs/promises';import {createServer} from 'vite';
import {chromium} from '../.temp/qa/node_modules/playwright/index.mjs';import {bulkCsv} from '../src/modules/eos/scorecardBulkCsv.js';
const server=await createServer({server:{host:'127.0.0.1',port:5196,strictPort:true}});await server.listen();const browser=await chromium.launch({headless:true,channel:'msedge'});
try{await mkdir('.temp/bulk-qa',{recursive:true});for(const width of [1440,390]){const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
await page.goto('http://127.0.0.1:5196/northgate/tests/browser/scorecard-bulk-edit.html');
await page.getByLabel('Upload edited CSV').setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from(bulkCsv([{Metric:'Synthetic',Date:'2026-01-06',Value:'0',Notes:'Synthetic only',Format:'percent',Review:'Needs review',Source:'{}','System reference':''}]))});
await page.getByRole('button',{name:'Confirm save 2 entries'}).waitFor();assert.equal(await page.getByText('Value: 3 → 4',{exact:true}).count(),1);assert.equal(await page.getByText('Notes after: Edited note',{exact:true}).count(),1);
assert.equal(await page.getByText('Original source comment',{exact:false}).count(),1);await page.screenshot({path:`.temp/bulk-qa/review-${width}.png`,fullPage:true});
await page.getByRole('button',{name:'Confirm save 2 entries'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('Upload edited CSV').isDisabled(),true);
await page.getByRole('button',{name:'Recover last review / save'}).click();await page.getByText(/2 saved/).waitFor();assert.equal(await page.getByRole('button',{name:'Confirm save 2 entries'}).count(),0);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.screenshot({path:`.temp/bulk-qa/saved-${width}.png`,fullPage:true});await page.close();}
console.log('PASS readable desktop/mobile groups and before/after; source review does not block; stable lost-response recovery; no overflow.');}finally{await browser.close();await server.close();}
