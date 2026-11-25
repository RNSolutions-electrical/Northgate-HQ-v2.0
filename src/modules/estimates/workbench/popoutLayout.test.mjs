import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const ui=read('BlankSlateEditor.jsx'),css=read('workspace.css');
test('work pop-out puts all applicable actions in a direct sticky header above scrolling content',()=>{
 const header=ui.match(/aria-label="Work item editor"[\s\S]*?<header className="estimate-popout-header work-popout-header">([\s\S]*?)<\/header><div className="blank-work-top">/)?.[1];
 assert.ok(header);
 for(const name of ['Cancel','Save work draft','Include in estimate','Save to estimate','Add material','Save as assembly'])assert.match(header,new RegExp('>'+name+'<'));
 assert.match(header,/recipeClient&&/);
 assert.match(header,/setWorkTab\('Materials'\)/);
 assert.match(css,/\.blank-work-dialog \.estimate-popout-header\{position:sticky;inset-block-start:0/);
});
test('work and resource review controls live in narrow row margins, with named native inputs',()=>{
 assert.equal((ui.match(/className="estimate-review-margin"/g)||[]).length,2);
 assert.match(ui,/has-review-margin" key=\{line.id\}><div className="estimate-review-margin"/);
 assert.match(ui,/has-review-margin" key=\{item.id\}><div className="estimate-review-margin"/);
 assert.match(ui,/aria-label=\{'Flag resource for internal review: '/);
 assert.match(ui,/aria-label=\{'Flag for internal review: '/);
 assert.match(css,/label:has\(>input\[type=checkbox\]\)\{pointer-events:none\}/);
 assert.match(css,/pointer-events:auto;inline-size:22px;block-size:22px/);
});
test('related surfaces pin existing actions without exposing estimate writes in exports',()=>{
 for(const [file,button] of [
  ['CatalogueLineCreate.jsx','Save catalog item'],['CatalogueLineEditor.jsx','Save catalogue material'],
  ['CataloguePriceReview.jsx','Apply selected values to draft'],['DefaultRecipeLibrary.jsx','Save shared assembly copy'],
  ['EstimateExportDialog.jsx','Preview PDF'],['EstimateNote.jsx','Save note'],
 ]) assert.ok(read(file).split('className="estimate-popout-header"').slice(1).some(part=>part.split('</header>')[0].includes(button)),file);
 assert.doesNotMatch(read('EstimateExportDialog.jsx'),/Save to estimate|Save as assembly/);
});

test('button and Escape share the same discard check and clean clicks skip confirm',()=>{
 assert.match(ui,/function cancelWork\(\)\{[^\n]+!workBuffer.current.hasChanges\(\)\|\|window.confirm/);
 assert.match(ui,/onCancel=\{event=>\{event.preventDefault\(\);cancelWork\(\);\}\}/);
 assert.match(ui,/openWork\(draft\?structuredClone\(draft\):beginWorkEdit/);
});
