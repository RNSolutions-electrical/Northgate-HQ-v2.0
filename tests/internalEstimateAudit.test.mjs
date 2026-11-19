import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDocument,blankWorkItem,blankItemPricing} from '../src/modules/estimates/workbench/blankSlate.mjs';
import {internalEstimateAudit} from '../src/modules/estimates/workbench/internalEstimateAudit.mjs';

const resource=(id,overrides={})=>({id,name:id,qty:1,unit:'EA',price:0,hours:0, ...overrides});
const work=(id,lines,overrides={})=>({...blankWorkItem(id),name:id,qty:3,lines,...overrides});
const document=items=>({...blankDocument('Electrical estimate'),rate:65,blankSlateHardRate:40,entries:[{id:'group',name:'First floor',items}],blankWorkDrafts:[{item:work('Do not export',[])}]});

test('audit follows estimate math and splits scaled, locked and labor-only quantities',()=>{
 const item=work('Lighting',[
  resource('Fixtures',{qty:4,price:20,hours:.25,catalogueId:'f1'}),
  resource('Cable',{fixed:true,qty:2.5,unit:'FT',price:1.10,hours:.4,notes:'route A'}),
  resource('Testing',{blankResourceKind:'labor',qty:2,unit:'test',hours:.5,catalogueId:'t1',laborOverride:true}),
 ]);
 const doc=document([item]),audit=internalEstimateAudit(doc,null),workAudit=audit.groups[0].items[0];
 assert.equal(blankItemPricing(item,doc).hours,7);
 assert.match(workAudit.rows.join(' '),/Work-item included labor: 7 hr \| On material lines: 4 hr \| On labor-only lines: 3 hr/);
 assert.match(workAudit.lines[0].rows.join(' '),/4 EA \| Per work unit × 3 work units.*3 hr/);
 assert.match(workAudit.lines[1].rows.join(' '),/2.5 FT \| Locked total.*2.5 FT × 0.4 hr per FT = 1 hr/);
 assert.match(workAudit.lines[2].rows.join(' '),/Estimate override of catalogue value/);
 assert.doesNotMatch(JSON.stringify(audit),/Do not export|route A|Source unit cost/);
 assert.match(JSON.stringify(internalEstimateAudit(doc,null,{notes:true,costs:true})),/route A|Source unit cost/);
});

test('audit flags zero-hour lines and distinguishes references replaced by quotes',()=>{
 const item=work('Replaced',[
  resource('Original',{qty:2,hours:.25}),
  resource('Incomplete',{hours:''}),
 ],{blankQuotes:[{id:'q',name:'Vendor quote',mode:'replace',cost:150}]});
 const doc=document([item,work('Zero',[resource('Hardware',{qty:2})])]),audit=internalEstimateAudit(doc);
 assert.match(audit.summaryRows.join(' '),/1 included resource line\(s\).*0 hr per unit.*2 resource line\(s\) are excluded.*1 excluded resource line\(s\).*missing/);
 const {lines,rows}=audit.groups[0].items[0];
 assert.match(rows.join(' '),/Work-item included labor: 0 hr/);
 assert.match(lines[0].rows.join(' '),/1.5 hr \| Included: 0 hr/);
 assert.match(lines[1].rows.join(' '),/Not recorded/);
 assert.match(lines[2].rows.join(' '),/Replaces materials and labor/);
});

test('audit retains approved total and refuses absent included work',()=>{
 const doc=document([work('Recorded',[resource('Mount',{hours:.125})])]);
 const report=internalEstimateAudit(doc,{pricing_total:'123.45'});
 assert.match(report.summaryRows.join(' '),/Saved estimate total: \$123\.45/);
 assert.throws(()=>internalEstimateAudit(document([])),/Add included work/);
});

test('audit does not invent a missing labor basis for included work',()=>{
 assert.throws(()=>internalEstimateAudit(document([work('Unknown',[resource('Material',{hours:null})])])),/Labor hours is required/);
});
