import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {worksheetFrame} from './worksheetFrame.js';
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
test('core calculator precedes ancillary worksheet, whose disclosure does not gate calculator inputs',()=>{
 const page=read('./DwellingLoadWorkspace.jsx');
 assert(page.indexOf('title="Dwelling load calculator"')<page.indexOf('id="dwelling-panel-worksheet"'));
 assert.match(page,/aria-expanded=\{worksheetOpen\}/);assert.match(page,/aria-controls="dwelling-panel-worksheet"/);
 assert.match(page,/id="dwelling-panel-worksheet" hidden=\{!worksheetOpen\}/);
 assert.match(page,/onClick=\{\(\)=>setWorksheetOpen\(open=>!open\)\}/);
 assert.match(page,/\[worksheetOpen,setWorksheetOpen\]=useState\(false\)/);
 const frame=worksheetFrame(read('./worksheet-source.html'),'layout-test');
 assert.match(frame,/<main><div><section>/);assert.doesNotMatch(frame,/id="worksheet-inputs" hidden/);
 assert.match(frame,/data-k="area"/);assert.match(frame,/id="standardResult"/);assert.match(frame,/equipment photographs section below/);
});
