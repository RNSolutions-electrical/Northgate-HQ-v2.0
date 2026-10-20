import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from '../.temp/qa/node_modules/playwright/index.mjs';
import {HISTORY_COLUMNS} from '../src/modules/eos/scorecardImport.js';
const server=await createServer({server:{host:'127.0.0.1',port:5197,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
 await mkdir('.temp/import-qa',{recursive:true});
 for(const width of [1440,390]) {
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',route=>route.abort());
  await page.goto('http://127.0.0.1:5197/northgate/tests/browser/scorecard-historical-import.html');
  const csv=HISTORY_COLUMNS.join(',')+'\n'+[0,1].map(i=>HISTORY_COLUMNS.map(k=>k==='actual_value'?(i?'':'0'):k==='comments'?'Synthetic comment':k==='source_cell'?`A${i}`:'synthetic').join(',')).join('\n');
  await page.getByLabel('Preview historical CSV').setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  const apply=page.getByRole('button',{name:'Apply 1 reviewed historical observations',exact:true});await apply.waitFor();
  await page.getByText('Review every row, mapping and source comment').click();
  assert.equal(await page.getByText('Blank source; no observation created',{exact:false}).count(),1);
  await page.screenshot({path:`.temp/import-qa/preview-${width}.png`,fullPage:true});
  await apply.click();await page.getByRole('alert').getByText('Synthetic lost response after commit').waitFor();
  assert.equal(await page.getByLabel('Preview historical CSV').isDisabled(),true);
  await page.getByRole('button',{name:'Recover preview / receipt'}).click();
  await page.getByText(/applied: 1 saved, 0 ready, 1 held, 0 errors/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Apply 0 reviewed historical observations'}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`.temp/import-qa/receipt-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS desktop/mobile component: explicit preview, row review, blank/zero, lost response, receipt recovery, apply disabled after success; no horizontal overflow.');
}finally{await browser.close();await server.close();}
