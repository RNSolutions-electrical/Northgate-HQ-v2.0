import test from 'node:test';
import assert from 'node:assert/strict';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {proposalFields,proposalLines,proposalScopeItems,proposalScopePrices} from '../src/modules/estimates/workbench/proposal.mjs';
import {sumPricing} from '../src/modules/estimates/workbench/pricing.mjs';
import {exportDraftProposalPdf,exportApprovedProposalPdf} from '../src/modules/estimates/workbench/proposalPdf.mjs';
const fixture=()=>({name:'Generator project',customer:'Synthetic customer',rate:75,materialMarkup:30,feePercent:30,proposal:{scopeMode:'grouped',contact:'Customer attention',serviceCall:'SC-123',proposalDate:'2026-10-16',introduction:'Thank you for the opportunity to quote this work.',inclusions:'Electrical permit included.',exclusions:'Utility charges excluded.'},entries:[{id:'e',number:1,name:'Electrical',items:['Generator','Ground rods and gas bonding required by code','Testing and permitting'].map((name,index)=>({id:String(index),number:index+1,name,qty:1,notes:'SECRET NOTE',lines:[{qty:1,price:11.11+index,hours:.13,notes:'SECRET COMPONENT',name:'PRIVATE COST'}]}))}]});
async function readPdf(bytes){const pdf=await getDocument({data:bytes,useSystemFonts:true}).promise;let text='';const pages=pdf.numPages;for(let i=1;i<=pages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ')+' ';await pdf.destroy();return {text:text.replace(/\s+/g,' '),pages};}
test('grouping is stable, exhaustive and non-mutating; duplicates and stale memberships cannot hide work',()=>{
 const doc=fixture(),lines=proposalLines(doc);doc.proposal.scopeGroups=[{text:'Install generator system',lineKeys:lines.slice(0,2).map(x=>x.key)},{text:'Overlapping group',lineKeys:[lines[0].key,'missing']}];const before=JSON.stringify(doc);
 const groups=proposalScopeItems(doc);assert.equal(groups.length,2);assert.deepEqual(groups.flatMap(g=>g.members.map(x=>x.key)),lines.map(x=>x.key));assert.equal(JSON.stringify(doc),before);
 doc.entries[0].items.push({...doc.entries[0].items[0],id:'new',number:4,name:'New safety work'});assert.match(proposalScopeItems(doc).at(-1).text,/New safety work \(1 unit\)$/);
 assert.equal(proposalFields({}).showLinePrices,false);
});
test('optional scope prices reconcile in cents to existing subtotal and reject inconsistent snapshots',()=>{
 const doc=fixture();doc.proposal.salesTaxPercent='7.25';doc.proposal.creditCardPercent='3';const before=sumPricing(doc.entries[0].items,doc);const prices=proposalScopePrices(doc,before.preTaxTotal);
 assert.equal(Math.round([...prices.values()].reduce((a,b)=>a+b,0)*100),Math.round(before.preTaxTotal*100));assert.deepEqual(sumPricing(doc.entries[0].items,doc),before);
 assert.throws(()=>proposalScopePrices(doc,99),/reconcile/);
});
test('PDF total-only/group prices retain source safety scope and exclusions, omit internal details and preserve authoritative totals',async()=>{
 const doc=fixture(),keys=proposalLines(doc).map(x=>x.key);doc.proposal.scopeGroups=[{text:'Provide complete generator installation',lineKeys:keys}];doc.proposal.salesTaxPercent=7.25;doc.proposal.creditCardPercent=3;
 const charges=sumPricing(doc.entries[0].items,doc);const totalOnly=await readPdf(await exportDraftProposalPdf(doc));
 for(const term of ['October 16, 2026','Customer attention','SC-123','1. Provide complete','Ground rods and gas bonding required by code','Utility charges excluded'])assert.ok(totalOnly.text.includes(term),term);
 assert.doesNotMatch(totalOnly.text,/SECRET|PRIVATE COST|materialMarkup/);
 assert.ok(!totalOnly.text.includes('$'+charges.preTaxTotal.toFixed(2)+' Included work'));
 doc.proposal.showLinePrices=true;const priced=await readPdf(await exportDraftProposalPdf(doc));assert.ok(priced.text.includes('$'+charges.preTaxTotal.toFixed(2)));
 const approved=await readPdf(await exportApprovedProposalPdf({pricing_total:charges.price,workbench_document:{...doc,proposalChargeSnapshot:charges}}));assert.ok(approved.text.includes('$'+charges.price.toFixed(2)));
 await assert.rejects(()=>exportApprovedProposalPdf({pricing_total:42,workbench_document:doc}),/reconcile/);
});
test('very long groups paginate without dropping final text, source coverage, exclusions or totals',async()=>{
 const doc=fixture();doc.proposal.scopeGroups=[{text:('Long grouped scope with a very long unbroken token '+'X'.repeat(200)+' ').repeat(100)+'FINAL GROUP TEXT',lineKeys:proposalLines(doc).map(x=>x.key)}];
 const result=await readPdf(await exportDraftProposalPdf(doc));assert.ok(result.pages>5);for(const term of ['FINAL GROUP TEXT','Ground rods','Testing and permitting','Utility charges excluded','Total:'])assert.ok(result.text.includes(term),term);
});
