import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/modules/estimates/workbench/app.jsx',import.meta.url),'utf8');
const review=readFileSync(new URL('../src/modules/estimates/workbench/WorkItemReview.jsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/modules/estimates/workbench/style.css',import.meta.url),'utf8');
const components=readFileSync(new URL('../src/modules/estimates/workbench/ComponentEditor.jsx',import.meta.url),'utf8');
const picker=readFileSync(new URL('../src/modules/estimates/workbench/MaterialPicker.jsx',import.meta.url),'utf8');

test('estimate entries and work items use compact annotation controls',()=>{
 assert.match(app,/EstimateNote label="Internal entry notes"/);
 assert.match(app,/EstimateNote label="Internal work item notes"/);
 assert.match(app,/entry\.internalNotes/);
 assert.match(components,/Internal component note/);
 assert.match(components,/Assembly resource note/);
});

test('work item review separates verification facts from components',()=>{
 assert.match(review,/className="work-item-verification"/);
 assert.match(review,/Entry internal notes/);
 assert.match(review,/className="review-components-heading"/);
 assert.match(review,/<strong className="component-reference">/);
 assert.match(styles,/\.work-item-verification\{[^}]*border:2px solid/);
 assert.match(styles,/\.review-components-heading\{[^}]*font-size:18px[^}]*font-weight:800/);
 assert.match(styles,/\.review-component\{[^}]*border:1px solid[^}]*border-left:4px solid/);
});

test('estimate rows reserve dedicated space for values and actions',()=>{
 assert.match(styles,/\.toc-head,\.entry-row\{grid-template-columns:[^}]*148px/);
 assert.match(styles,/\.item-row\{grid-template-columns:[^}]*90px[^}]*124px/);
 assert.match(styles,/\.item-actions\{min-width:124px\}/);

});

test('component inputs buffer keystrokes outside the Workbench render path',()=>{
 assert.match(components,/const BufferedInput=memo/);
 assert.match(components,/defaultValue=\{value\?\?''\}/);
 assert.match(components,/onInput=\{event=>onDraft\(event\.currentTarget\.value\)\}/);
 assert.match(components,/onBlur=\{event=>\{focused\.current=false;onCommit\(event\.currentTarget\.value\);\}\}/);
 assert.match(app,/pendingComponentEdits=useRef\(new Map\(\)\)/);
 assert.match(app,/for\(const apply of pendingComponentEdits\.current\.values\(\)\)apply\(bufferedItem\)/);
 assert.match(picker,/useDeferredValue\(query\)/);
 assert.match(picker,/onDraft\(event\.target\.value\)/);
});
