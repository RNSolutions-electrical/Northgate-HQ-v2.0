import test from 'node:test';
import assert from 'node:assert/strict';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {proposalCharges} from '../src/modules/estimates/workbench/proposalCharges.mjs';
import {sumPricing} from '../src/modules/estimates/workbench/pricing.mjs';
import {exportDraftProposalPdf,exportApprovedProposalPdf} from '../src/modules/estimates/workbench/proposalPdf.mjs';
import {makeReport,reportHTML} from '../src/modules/estimates/workbench/reports.mjs';
const document={name:'Charge test',rate:50,materialMarkup:20,feePercent:10,quotes:[],proposal:{scope:'Install lights',salesTaxPercent:'7.25',creditCardPercent:'3'},entries:[{id:'e',number:1,items:[{id:'i',name:'Lights',qty:1,lines:[{qty:1,price:100,hours:1}]}]}]};
test('tax follows selling subtotal, card fee follows rounded tax, charges never compound on re-render',()=>{
 const p=sumPricing(document.entries[0].items,document);
 assert.equal(p.preTaxTotal,187);assert.equal(p.salesTax,13.56);assert.equal(p.creditCardFee,6.02);assert.equal(p.price,206.58);
 assert.equal(p.markup,37);assert.equal(p.margin,37/187*100);
 assert.deepEqual(sumPricing(document.entries[0].items,JSON.parse(JSON.stringify(document))),p);
 assert.equal(sumPricing(document.entries[0].items,document,false).price,170);
 assert.deepEqual(proposalCharges(.05,{salesTaxPercent:10,creditCardPercent:10}),{preTaxTotal:.05,salesTax:.01,creditCardFee:.01,price:.07});
});
test('legacy, zero, tax-only and card-only documents preserve correct totals',()=>{
 assert.equal(proposalCharges(100).price,100);
 assert.equal(proposalCharges(100,{salesTaxPercent:0,creditCardPercent:0}).price,100);
 assert.equal(proposalCharges(100,{salesTaxPercent:10}).price,110);
 assert.equal(proposalCharges(100,{creditCardPercent:3}).price,103);
 assert.equal(proposalCharges(0,document.proposal).price,0);
});
test('invalid percentages cannot export; editing shows an actionable validation error',async()=>{
 for(const key of ['salesTaxPercent','creditCardPercent'])for(const value of [-1,101,'','NaN','Infinity','1e2','0.00001',true]){
  const bad={...document,proposal:{...document.proposal,[key]:value}};
  assert.throws(()=>proposalCharges(100,bad.proposal),/between 0 and 100/);
  assert.match(sumPricing(bad.entries[0].items,bad).chargeError,/between 0 and 100/);
  await assert.rejects(()=>exportDraftProposalPdf(bad),/between 0 and 100/);
 }
});
async function pdfText(bytes){
 const pdf=await getDocument({data:bytes,useSystemFonts:true}).promise;let text='';
 for(let i=1;i<=pdf.numPages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ');
 await pdf.destroy();return text;
}
test('proposal preview and draft/approved PDFs reconcile charge breakdown without leaking costs',async()=>{
 const html=reportHTML(makeReport(document,'proposal'));
 for(const amount of ['187.00','13.56','6.02','206.58'])assert.ok(html.includes(amount));
 const draft=await pdfText(await exportDraftProposalPdf(document));
 for(const text of ['Sales tax (7.25%)','Credit card fee (3%)','187.00','13.56','6.02','206.58'])assert.ok(draft.includes(text),text);
 const frozen=proposalCharges(187,document.proposal);
 const approved=await pdfText(await exportApprovedProposalPdf({pricing_total:206.58,workbench_document:{...document,entries:[],proposalChargeSnapshot:frozen}}));
 for(const amount of ['187.00','13.56','6.02','206.58'])assert.ok(approved.includes(amount));
 const historical=await pdfText(await exportApprovedProposalPdf({pricing_total:99.99,workbench_document:document}));
 assert.ok(historical.includes('99.99'));assert.ok(!historical.includes('Sales tax ('));
 assert.doesNotMatch(draft,/Base cost|Material markup|labor rate/i);
});
