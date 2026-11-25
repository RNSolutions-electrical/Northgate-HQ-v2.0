import test from 'node:test';
import assert from 'node:assert/strict';
import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {exportDraftProposalPdf,exportInternalEstimateAuditPdf,exportInternalEstimateReviewPdf} from '../src/modules/estimates/workbench/proposalPdf.mjs';
import {blankDocument} from '../src/modules/estimates/workbench/blankSlate.mjs';
import {sumPricing} from '../src/modules/estimates/workbench/pricing.mjs';

function fixture(){
 const doc=blankDocument('Synthetic feeder estimate','Example customer');
 return {...doc,rate:90,blankSlateHardRate:58,materialMarkup:20,proposal:{
  proposalDate:'2026-11-19',scope:'Replace electrical feeders.',terms:'Example client acceptance terms',salesTaxPercent:0,
 },entries:[
  {id:'equipment',number:1,location:'Electrical room',items:[{id:'feeder',number:1,name:'Feeder replacement',internalReview:true,qty:3,notes:'PRIVATE WORK NOTE',lines:[
   {id:'conductor',name:'Copper conductor',internalReview:true,qty:4,unit:'FT',fixed:false,price:19.23,hours:.125,notes:'PRIVATE CONDUCTOR NOTE'},
   {id:'fasteners',name:'Fixed support hardware',qty:2,unit:'EA',fixed:true,price:8.34,hours:.25},
   {id:'technician',name:'Test and verify',blankResourceKind:'labor',qty:2,unit:'HR',fixed:true,price:0,hours:1},
  ]}]},
  {id:'breakroom',number:2,location:'Breakroom',items:[{id:'lighting',number:1,name:'Pendant allowance',qty:2,lines:[
   {id:'lamp',name:'Excluded fixture',qty:1,unit:'EA',price:24,hours:.5},
  ],blankQuotes:[{id:'vendor',name:'Replacement vendor quote',mode:'replace',cost:100,markup:15},{id:'ref',name:'Reference quote',mode:'reference',cost:200,markup:0}]}]},
 ],blankWorkDrafts:[{item:{name:'UNINCLUDED PRIVATE WORK DRAFT'}}]};
}

async function inspect(bytes){
 const pdf=await getDocument({data:bytes,useSystemFonts:true}).promise;
 try{
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i),content=await page.getTextContent();
   pages.push({view:page.view,items:content.items.filter(item=>item.str),text:content.items.map(item=>item.str).join(' ').replace(/\s+/g,' '),logo:(await page.getOperatorList()).fnArray.includes(OPS.paintImageXObject)});
  }
  return pages;
 }finally{await pdf.destroy();}
}
const join=pages=>pages.map(p=>p.text).join(' ');

test('separate full audit PDF prints the underlying material quantities, locks, hours and excluded quote context',async()=>{
 const doc=fixture(),before=JSON.stringify(doc);
 const text=join(await inspect(await exportInternalEstimateAuditPdf(doc)));
 assert.match(text,/INTERNAL ESTIMATE AUDIT/);
 assert.match(text,/Draft estimate.*Full estimate/);
 assert.match(text,/Not a client proposal/);
 assert.match(text,/Replace electrical feeders/);
 assert.match(text,/Feeder replacement.*Copper conductor.*0\.125/);
 assert.match(text,/Feeder replacement - \$656\.93/);
 assert.match(text,/Material: Copper conductor - \$411\.91/);
 assert.match(text,/Labor: Test and verify - \$180\.00/);
 assert.match(text,/Pendant allowance - \$230\.00/);
 assert.match(text,/Amounts in item headings exclude estimate-level charges/);
 assert.doesNotMatch(text,/Excluded fixture - \$|Included line selling value before estimate-level charges|(?:^| )Selling subtotal before estimate-level charges:/);
 assert.match(text,/Copper conductor.*12.*1\.5.*Fixed support hardware/);
 assert.match(text,/Fixed support hardware.*lock/i);
 assert.match(text,/FLAGGED FOR INTERNAL REVIEW/);
 assert.match(text,/Copper conductor.*RESOURCE FLAGGED FOR INTERNAL REVIEW/);
 assert.match(text,/Material resources.*Copper conductor.*Labor-only resources.*Test and verify.*Quotes and allowances.*Replacement vendor quote/);
 assert.match(text,/Pendant allowance.*Excluded fixture.*Replacement vendor quote.*Reference quote/);
 assert.doesNotMatch(text,/PRIVATE |client acceptance terms|Source unit cost/);
 assert.equal(JSON.stringify(doc),before);
});

test('audit can print explicit notes and costs without changing the client or internal review routes',async()=>{
 const doc=fixture();
 const audit=join(await inspect(await exportInternalEstimateAuditPdf(doc,{costs:true,notes:true})));
 assert.match(audit,/PRIVATE WORK NOTE/);assert.match(audit,/PRIVATE CONDUCTOR NOTE/);
 assert.match(audit,/\$19\.23/);assert.doesNotMatch(audit,/UNINCLUDED PRIVATE WORK DRAFT/);
 const review=join(await inspect(await exportInternalEstimateReviewPdf(doc)));
 assert.match(review,/INTERNAL REVIEW/);assert.match(review,/FLAGGED FOR INTERNAL REVIEW/);assert.doesNotMatch(review,/ESTIMATE AUDIT|PRIVATE WORK NOTE/);
 const client=join(await inspect(await exportDraftProposalPdf(doc)));
 assert.match(client,/DRAFT PROPOSAL.*Example client acceptance terms/);
 assert.doesNotMatch(client,/ESTIMATE AUDIT|PRIVATE WORK NOTE|FLAGGED FOR INTERNAL REVIEW/i);
});

test('audit uses only the approved frozen source and marks every page on a multi-page printout',async()=>{
 const doc=fixture(),items=doc.entries.flatMap(entry=>entry.items);
 items[0].lines.push(...Array.from({length:27},(_,i)=>({id:'r'+i,name:'Continuation audit material '+(i+1),qty:7,unit:'EA',price:11,hours:.125})));
 doc.proposalChargeSnapshot=sumPricing(items,doc);
 const snapshot={title:'Frozen estimate name',customer_name:'Frozen customer',pricing_total:999.1,workbench_document:doc,approved_at:'2026-11-19T20:00:00Z'};
 const pages=await inspect(await exportInternalEstimateAuditPdf(snapshot,{approved:true}));
 assert.ok(pages.length>1);
 assert.match(join(pages),/Frozen estimate snapshot.*Full estimate/);
 assert.match(join(pages),/Frozen estimate name/);assert.match(join(pages),/\$999\.10/);
 for(let i=1;i<=27;i++){
  const label='Continuation audit material '+i+' - $513.45 Quantity entered:';
  const matching=pages.filter(page=>page.text.includes(label));
  assert.equal(matching.length,1,'exactly one full resource heading for '+i);
  assert.match(matching[0].text,/Included extended hours: 21 EA .*0\.125.*2\.625 hr/);
 }
 assert.match(join(pages.slice(1)),/Continued: Electrical room \/ 1\. Feeder replacement/);
 assert.doesNotMatch(join(pages),/Approved:|Synthetic feeder estimate/);
 for(const page of pages){
  assert.deepEqual(page.view,[0,0,612,792]);assert.ok(page.logo);
  assert.match(page.text,/INTERNAL ESTIMATE AUDIT/);assert.match(page.text,/thenorthgategroup\.com/);
  for(const x of page.items)assert.ok(x.transform[4]>=35.9&&x.transform[4]+x.width<=576.1,x.str);
 }
 await assert.rejects(()=>exportInternalEstimateAuditPdf(doc,{approved:true}),/snapshot is unavailable/);
});
