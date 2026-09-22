import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/modules/estimates/workbench/app.jsx',import.meta.url),'utf8');
const review=readFileSync(new URL('../src/modules/estimates/workbench/WorkItemReview.jsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/modules/estimates/workbench/style.css',import.meta.url),'utf8');

test('estimate entries and work items provide internal note fields',()=>{
 assert.match(app,/Internal entry notes/);
 assert.match(app,/entry\.internalNotes/);
 assert.match(app,/Internal work item notes/);
 assert.match(app,/className="inline-work-item-note"/);
 assert.match(app,/What is this item, or what needs review\?/);
 assert.match(app,/excluded from customer proposals/);
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
 assert.match(styles,/\.item-row\{grid-template-columns:[^}]*minmax\(240px,.9fr\)[^}]*124px/);
 assert.match(styles,/\.item-actions\{min-width:124px\}/);
 assert.match(styles,/\.inline-work-item-note textarea\{[^}]*min-height:64px/);
});
