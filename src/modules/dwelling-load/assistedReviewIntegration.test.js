import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {worksheetFrame} from './worksheetFrame.js';
const source=fs.readFileSync(new URL('./worksheet-source.html',import.meta.url),'utf8');
test('guided review integrates without changing engine or manual fields',()=>{
 const html=worksheetFrame(source,'assisted-test');
 assert.equal((html.match(/id="assisted-review"/g)||[]).length,1);
 assert(html.indexOf('id="assisted-review"')<html.indexOf('05 / Review record'));
 assert(html.indexOf('02 / Equipment inventory')<html.indexOf('id="assisted-review"'));
 assert(html.indexOf('id="assisted-review"')<html.indexOf('id="advanced-manual-demand"'));
 assert.match(html,/<details id="advanced-manual-demand"><summary>/);
 assert.equal((html.match(/data-k="hvacStandard"/g)||[]).length,1);
 assert.match(html,/Save to HQ/);assert.match(html,/assistedTools.validateAssistedReview\(d\)/);assert.match(html,/inspectSource:nameplateTools.inspectCalculationSource/);
 const original=source.match(/function calculate\(d\)\{[\s\S]*?\n\}/)[0];assert(html.includes(original));
 for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
});
test('programmatic changes invalidate previews and study switches reset only UI',()=>{
 const html=worksheetFrame(source,'assisted-reset');
 assert.match(html,/function save\(\)\{guidedReview\?\.invalidate\(\)/);
 assert.match(html,/generation=e.data.data.generation;guidedReview.invalidate\(\{reset:true\}\)/);
 assert.match(html,/guidedReview.invalidate\(\{reset:true\}\);methodEditor\?\.invalidate\(\);data.feederStudies/);
 assert.match(html,/guidedReview.invalidate\(\{reset:true\}\);methodEditor\?\.invalidate\(\);const row=data.rows.find/);
});

test('worksheet import validates and preserves guided facts but invalidates their context',async()=>{
 const {defaults,validate,imported}=await import('./worksheetModel.js');
 const {assistedReviewContext}=await import('./assistedReviewModel.js');
 const payload=defaults();
 payload.assistedReview={version:1,sourceContext:assistedReviewContext(payload),answers:[{questionId:'scope',text:'Draft user fact',sourceReferences:['field observation']}],systems:[],scenarios:[],proposal:null};
 validate(payload);
 const next=imported(payload,'synthetic.json');
 assert.equal(next.assistedReview.sourceContext,null);
 assert.deepEqual(next.assistedReview.answers,payload.assistedReview.answers);
 assert.notEqual(payload.assistedReview.sourceContext,null);
 assert.throws(()=>validate({...payload,assistedReview:{...payload.assistedReview,proposal:{value:8000}}}));
});
test('optional cooking classification is wired through frame, UI and saved-study host',()=>{
 const html=worksheetFrame(source,'classification-test');
 assert.match(html,/evaluateCookingClassification:cookingTools\.evaluateCookingClassification/);
 assert.match(html,/evaluateCookingClassification:callbacks\.evaluateCookingClassification/);
 const host=fs.readFileSync(new URL('./wholeMethodProposals.js',import.meta.url),'utf8');
 assert.match(host,/evaluateSupportedProposals,evaluateCookingPlan,evaluateCookingClassification/);
});
