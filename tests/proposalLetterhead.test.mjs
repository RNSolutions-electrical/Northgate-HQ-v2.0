import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {exportDraftProposalPdf,exportApprovedProposalPdf} from '../src/modules/estimates/workbench/proposalPdf.mjs';
import {sumPricing} from '../src/modules/estimates/workbench/pricing.mjs';

const fixture=()=>({name:'Synthetic electrical proposal',customer:'Example customer',rate:0,materialMarkup:0,feePercent:0,proposal:{scopeMode:'grouped',proposalDate:'2026-10-16',showLinePrices:true},entries:[{id:'e',number:1,name:'Safety work',location:'Office',items:[{id:'i',number:1,name:'Testing and permitting',qty:1,lines:[{qty:1,price:10.075,hours:0}]}]}]});
async function inspect(bytes){
 const pdf=await getDocument({data:bytes,useSystemFonts:true}).promise;
 const pages=[];
 for(let i=1;i<=pdf.numPages;i++){
  const page=await pdf.getPage(i),content=await page.getTextContent(),operators=await page.getOperatorList();
  pages.push({view:page.view,items:content.items.filter(item=>item.str),text:content.items.map(item=>item.str).join(' ').replace(/\s+/g,' '),styles:content.styles,operators});
 }
 await pdf.destroy();return pages;
}

test('letterhead uses verified source logo, Letter size, embedded body fonts and measured footer on every page',async()=>{
 const asset=await readFile(new URL('../src/assets/proposal/northgate-header.png',import.meta.url));
 assert.equal(createHash('sha256').update(asset).digest('hex'),'b33dfd38a3066fe61507096bfe090bf69229180068ebd39eda42d3cb88cbc8d5');
 const doc=fixture();doc.proposal.showLinePrices=false;doc.proposal.scopeGroups=[{text:'Synthetic long scope '.repeat(300),lineKeys:['["e","i"]']}];
 const pages=await inspect(await exportDraftProposalPdf(doc));assert.ok(pages.length>1);
 for(const page of pages){
  assert.deepEqual(page.view,[0,0,612,792]);
  assert.ok(page.operators.fnArray.includes(OPS.paintImageXObject),'source logo is embedded on every page');
  for(const value of ['1403 Capital Blvd, Raleigh, NC 27603','919-835-2769','thenorthgategroup.com']){
   const footer=page.items.find(item=>item.str===value);assert.ok(footer,value);assert.equal(footer.transform[5],36);
  }
  for(const item of page.items){
   assert.ok(item.transform[4]>=35.9&&item.transform[4]+item.width<=576.1,'text stays within half-inch side margins: '+item.str);
   if(!item.str.includes('DRAFT PROPOSAL')&&item.transform[5]>50)assert.ok(item.transform[5]>=68&&item.transform[5]<=691,'body stays clear of header/footer');
  }
 }
 const last=pages.at(-1);assert.match(last.text,/Total: \$10\.07/);assert.equal(last.items.find(item=>item.str.startsWith('Total:')).height,16);
 assert.doesNotMatch(pages.map(p=>p.text).join(' '),/25,388/);
});

test('approved subtotal rounding mismatch has explicit immutable total-only export recovery',async()=>{
 const doc=fixture(),charges=sumPricing(doc.entries[0].items,doc);assert.equal(charges.preTaxTotal,10.07);
 const snapshot={pricing_total:10.08,approved_at:'2026-10-16T12:00:00Z',workbench_document:{...doc,proposalChargeSnapshot:{...charges,preTaxTotal:10.08,price:10.08}}};
 const before=JSON.stringify(snapshot);
 await assert.rejects(()=>exportApprovedProposalPdf(snapshot),/reconcile/);
 const pages=await inspect(await exportApprovedProposalPdf(snapshot,{totalOnly:true}));
 assert.match(pages[0].text,/Total: \$10\.08/);assert.match(pages[0].text,/Testing and permitting/);assert.doesNotMatch(pages[0].text,/\$10\.07/);assert.equal(JSON.stringify(snapshot),before);
 const source=await readFile(new URL('../src/modules/estimates/workbench/ProposalBuilder.jsx',import.meta.url),'utf8');
 assert.ok(source.includes('onPreview({totalOnly:true})'));assert.ok(source.indexOf('Preview total-only PDF')<source.indexOf('<fieldset disabled='),'read-only recovery is outside the locked editing fieldset');
});

test('fonts support accented customer names but reject unsupported characters instead of losing them',async()=>{
 const doc=fixture();doc.customer='Zoë García';
 assert.match((await inspect(await exportDraftProposalPdf(doc)))[0].text,/Zoë García/);
 doc.customer='Unsupported 😀';await assert.rejects(()=>exportDraftProposalPdf(doc),/cannot display/);
});
