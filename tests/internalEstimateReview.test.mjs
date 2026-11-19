import test from 'node:test';
import assert from 'node:assert/strict';
import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {exportDraftProposalPdf,exportInternalEstimateReviewPdf} from '../src/modules/estimates/workbench/proposalPdf.mjs';
import {blankDocument} from '../src/modules/estimates/workbench/blankSlate.mjs';
import {sumPricing} from '../src/modules/estimates/workbench/pricing.mjs';

const fixture=()=>({
 ...blankDocument('Synthetic review job','Sample customer'),
 blankSlateHardRate:7,rate:25,materialMarkup:20,feePercent:10,
 proposal:{scopeMode:'letter',proposalDate:'2026-11-19',scope:'Client scope prose',terms:'Client terms and conditions',salesTaxPercent:5},
 entries:[
  {id:'one',number:1,location:'Office',items:[{id:'work',number:1,name:'Office homerun',qty:3,status:'In progress',notes:'PRIVATE WORK NOTE',lines:[
   {id:'material',name:'THHN conductor',unit:'FT',qty:2,price:19.23,hours:.5,fixed:true,notes:'PRIVATE RESOURCE NOTE',stage:'Rough-in'},
   {id:'labor',name:'Test setup',unit:'HR',qty:2,price:0,hours:.25,blankResourceKind:'labor',fixed:false},
  ],blankQuotes:[{id:'quote',name:'Vendor mobilization',cost:123.45,markup:20,mode:'reference'}]}]},
  {id:'two',number:2,location:'Breakroom',items:[{id:'work2',number:1,name:'Breakroom light',qty:1,lines:[{id:'fixture',name:'Pendant fixture',unit:'EA',qty:1,price:110,hours:2}]}]},
 ],
 blankWorkDrafts:[{item:{name:'NOT INCLUDED DRAFT'}}],
});
async function inspect(bytes){
 const doc=await getDocument({data:bytes,useSystemFonts:true}).promise;
 try{
  const result=[];
  for(let i=1;i<=doc.numPages;i++){
   const page=await doc.getPage(i),items=(await page.getTextContent()).items;
   result.push({view:page.view,items,text:items.map(x=>x.str).join(' ').replace(/\s+/g,' '),logo:(await page.getOperatorList()).fnArray.includes(OPS.paintImageXObject)});
  }
  return result;
 }finally{await doc.destroy();}
}
const join=pages=>pages.map(p=>p.text).join(' ');

test('internal review is printable, includes exact selected scope only, and independently omits hard costs and notes',async()=>{
 const doc=fixture(),before=JSON.stringify(doc);
 const bytes=await exportInternalEstimateReviewPdf(doc,{depth:'lines',entryKeys:['one']});
 const pages=await inspect(bytes),text=join(pages);
 assert.match(text,/INTERNAL REVIEW/);
 assert.match(text,/Not a client proposal/);
 assert.match(text,/Selected work only/);
 assert.match(text,/Selected selling subtotal before estimate-level charges: \$108\.65/);
 assert.match(text,/THHN conductor.*Quantity: 2 FT total \(locked\).*Extended: 2/);
 assert.match(text,/Test setup.*Quantity: 2 HR per work unit.*Extended: 6/);
 assert.match(text,/Vendor mobilization.*Reference only; not included/);
 assert.doesNotMatch(text,/Hard cost|Source unit cost|19\.23|123\.45|PRIVATE |Breakroom|Client scope prose|Client terms|NOT INCLUDED DRAFT|Estimate total:/);
 assert.equal(JSON.stringify(doc),before);
});

test('approved full review retains immutable authoritative total, and opts into hard costs and private notes',async()=>{
 const doc=fixture();doc.proposalChargeSnapshot=sumPricing(doc.entries.flatMap(entry=>entry.items),doc);
 const snapshot={workbench_document:doc,title:'Immutable name',customer_name:'Immutable customer',approved_at:'2026-11-19T16:00:00Z',pricing_total:999.99};
 const before=JSON.stringify(snapshot),pages=await inspect(await exportInternalEstimateReviewPdf(snapshot,{approved:true,depth:'lines',sections:['pricing','materials','labor','quotes','costs','notes']}));
 const text=join(pages);
 assert.match(text,/Frozen estimate snapshot/);assert.match(text,/Immutable name/);
 assert.match(text,/Saved estimate total: \$999.99/);
 for(const value of ['Hard cost:','Source unit cost: $19.23','Hard cost per work unit: $123.45','PRIVATE WORK NOTE','PRIVATE RESOURCE NOTE'])assert.ok(text.includes(value),value);
 assert.doesNotMatch(text,/Approved:|Client scope prose|Client terms/);
 assert.equal(JSON.stringify(snapshot),before);
});

test('summary skips resource details, marks continuation pages and leaves client proposal private',async()=>{
 const doc=fixture();
 const summary=join(await inspect(await exportInternalEstimateReviewPdf(doc,{depth:'summary',sections:['materials']})));
 assert.match(summary,/Material lines: 2/);assert.doesNotMatch(summary,/THHN conductor|Hard cost:|Estimate total:/);
 doc.entries[0].items[0].notes='Long note with layout checks. '.repeat(180);
 const pages=await inspect(await exportInternalEstimateReviewPdf(doc,{depth:'work',sections:['notes']}));
 assert.ok(pages.length>1);
 for(const p of pages){
  assert.deepEqual(p.view,[0,0,612,792]);assert.ok(p.logo);assert.match(p.text,/INTERNAL REVIEW/);assert.match(p.text,/thenorthgategroup.com/);
  for(const x of p.items.filter(x=>x.str))assert.ok(x.transform[4]>=35.9&&x.transform[4]+x.width<=576.1,x.str);
 }
 const client=join(await inspect(await exportDraftProposalPdf(doc)));
 assert.match(client,/DRAFT PROPOSAL.*Client scope prose.*Client terms and conditions/);
 assert.doesNotMatch(client,/INTERNAL REVIEW|Long note with layout checks|THHN conductor|PRIVATE RESOURCE NOTE/);
});

test('rejects missing frozen snapshot and invalid selection rather than enlarging export',async()=>{
 await assert.rejects(()=>exportInternalEstimateReviewPdf(fixture(),{approved:true}),/snapshot is unavailable/);
 for(const keys of [[],['unknown'],['one','unknown']])await assert.rejects(()=>exportInternalEstimateReviewPdf(fixture(),{entryKeys:keys}),/current work group/);
});

test('client-style grouped or manual scope is optional, no line prices/terms leak into an internal scope-only export',async()=>{
 const doc=fixture();doc.proposal.inclusions='Include commissioning';doc.proposal.exclusions='Exclude wall patching';
 const manual=join(await inspect(await exportInternalEstimateReviewPdf(doc,{depth:'summary',sections:['scope']})));
 assert.match(manual,/Client scope prose.*Include commissioning.*Exclude wall patching/);
 assert.doesNotMatch(manual,/Client terms|Selling subtotal|Estimate total|\$/);
 doc.proposal.scopeMode='grouped';doc.proposal.showLinePrices=true;doc.proposal.scopeGroups=[{text:'Electrical rough-in package',lineKeys:['["one","work"]']}];
 const grouped=join(await inspect(await exportInternalEstimateReviewPdf(doc,{depth:'summary',sections:['scope']})));
 assert.match(grouped,/Electrical rough-in package.*Included work:.*Office homerun/);
 assert.doesNotMatch(grouped,/Client scope prose|Client terms|\$/);
 const empty=blankDocument();
 await assert.rejects(()=>exportInternalEstimateReviewPdf(empty),/Add included work/);
});

test('extended costs and included selling are authoritative for locked lines and active quotes, not replaced materials',async()=>{
 const doc=fixture(),item=doc.entries[0].items[0];
 item.blankQuotes.push({id:'added',name:'Added delivery',cost:10,markup:10,mode:'add'});
 const options={depth:'lines',sections:['materials','labor','pricing','costs','quotes'],entryKeys:['one']};
 const text=join(await inspect(await exportInternalEstimateReviewPdf(doc,options)));
 assert.match(text,/Extended material hard cost: \$38\.46/);
 assert.match(text,/Included line selling value before estimate-level charges: \$71\.15/);
 assert.match(text,/Included line selling value before estimate-level charges: \$37\.50/);
 assert.match(text,/Extended quote hard cost: \$30\.00/);
 assert.match(text,/Included quote selling value before estimate-level charges: \$33\.00/);
 assert.match(text,/Selected selling subtotal before estimate-level charges: \$141\.65/);
 item.blankQuotes.push({id:'replace',name:'Replace all materials and labor',cost:100,markup:10,mode:'replace'});
 const replaced=join(await inspect(await exportInternalEstimateReviewPdf(doc,options)));
 assert.match(replaced,/Replaces materials and labor/);
 assert.match(replaced,/Not included in pricing; replaced by a quote/);
 assert.doesNotMatch(replaced,/Extended material hard cost|Included line selling value/);
 assert.match(replaced,/Included quote selling value before estimate-level charges: \$330\.00/);
 assert.match(replaced,/Selected selling subtotal before estimate-level charges: \$363\.00/);
});
