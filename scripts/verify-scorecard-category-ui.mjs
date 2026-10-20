import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from '../.temp/qa/node_modules/playwright/index.mjs';
const server=await createServer({server:{host:'127.0.0.1',port:5198,strictPort:true}});
await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
 await mkdir('.temp/category-ui',{recursive:true});
 for(const width of [1440,390]) {
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',route=>route.abort());
  await page.goto('http://127.0.0.1:5198/northgate/tests/browser/eos-scorecard-usability.html');
  await page.getByRole('button',{name:'Manage metrics',exact:true}).click();
  await page.getByRole('button',{name:'Add metric',exact:true}).click();
  await page.getByLabel('Metric name',{exact:true}).fill('Category regression QA');
  await page.getByLabel('What this value measures',{exact:true}).fill('Synthetic weekly measurement');
  const category=page.locator('form').getByRole('combobox',{name:'Category',exact:true});
  assert.equal(await category.getAttribute('required'),'');assert.equal(await category.inputValue(),'');
  assert.equal(await category.locator('option:checked').textContent(),'Choose a category (required)');
  await page.getByRole('button',{name:'Save metric settings',exact:true}).click();
  assert.equal(await page.getByLabel('Metric name',{exact:true}).inputValue(),'Category regression QA');
  assert.equal(await category.evaluate(e=>e.validity.valueMissing),true);
  await page.screenshot({path:`.temp/category-ui/required-${width}.png`,fullPage:true});
  await category.selectOption('c');
  assert.equal(await page.locator('form').getByRole('combobox',{name:'Owner',exact:true}).inputValue(),'');
  assert.equal(await page.getByLabel('Target (optional)',{exact:true}).inputValue(),'');
  await page.getByRole('button',{name:'Save metric settings',exact:true}).click();
  await page.getByRole('button',{name:'Edit / retire Category regression QA',exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit / retire Category regression QA',exact:true}).click();
  assert.equal(await category.inputValue(),'c');
  assert.equal(await page.getByLabel('Target (optional)',{exact:true}).inputValue(),'');
  assert.deepEqual(errors,[]); await page.close();
 }
 console.log('PASS desktop/mobile: required placeholder, blank save blocked, draft retained, valid category saved, optional Owner/Target blank, edit preserved.');
} finally {await browser.close();await server.close();}
