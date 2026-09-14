import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {suggestedScope} from '../src/modules/estimates/workbench/proposal.mjs';
import {deleteDraftContent} from '../src/modules/estimates/workbench/draftDeletion.mjs';
import {normalizePackages} from '../src/modules/estimates/workbench/packages.mjs';
import {exportApprovedProposalPdf} from '../src/modules/estimates/workbench/proposalPdf.mjs';
const document={name:'Office — Renovation',customer:'José O’Neil',entries:[{id:'e',number:1,section:'Power',location:'Lobby',name:'Branch wiring',items:[{id:'i',name:'Install receptacles',qty:4,notes:'SECRET INTERNAL NOTE',lines:[{price:99,hours:2}]}]}],library:[{id:'a'}]};
test('suggested scope contains real work and quantities, never private component/notes',()=>{
 const scope=suggestedScope(document);assert.match(scope,/Install receptacles \(4 units\)/);assert.doesNotMatch(scope,/SECRET|99|hours/);
});
test('deleting draft items and entries preserves source/shared library and captures reason',()=>{
 const next=deleteDraftContent(document,'e','i','Duplicate item');assert.equal(next.entries[0].items.length,0);assert.equal(document.entries[0].items.length,1);
 assert.equal(next.lastEditReason.reason,'Duplicate item');assert.deepEqual(next.library,document.library);
 assert.equal(deleteDraftContent(document,'e',null,'Not in scope').entries.length,0);
 assert.throws(()=>deleteDraftContent({...document,approvedAt:'2026-09-14'},'e',null,'Reason'),/locked/);
 assert.throws(()=>deleteDraftContent(document,'e',null,''),/reason/);
 assert.throws(()=>deleteDraftContent(document,'missing',null,'Reason'),/not found/);
});
test('package deletion cannot resurrect a removed entry; clearing a quote retains vendor records',()=>{
 const doc=normalizePackages({...document,packages:[{id:'p',name:'Lighting',section:'Power',awardedQuoteId:'q'}],quotes:[{id:'q',packageId:'p',vendor:'Private Vendor',name:'Fixtures'}]});
 const entry=doc.entries.find(e=>e.packageId==='p');
 const cleared=deleteDraftContent(doc,entry.id,entry.items[0].id,'Clear award');assert.equal(cleared.quotes.length,1);assert.equal(normalizePackages(cleared).entries.find(e=>e.packageId==='p').items.length,0);
 const removed=normalizePackages(deleteDraftContent(doc,entry.id,null,'Package removed'));assert.equal(removed.packages.length,0);assert.equal(removed.quotes.length,0);assert.equal(removed.entries.length,1);
});
test('proposal preserves scope/accents/punctuation across pages and excludes private data',async()=>{
 const doc={...document,proposal:{scope:suggestedScope(document)+'\n'+Array.from({length:110},(_,i)=>'Detailed scope item '+i).join('\n'),terms:'Final terms: payment after completion.'}};
 const bytes=await exportApprovedProposalPdf({title:doc.name,customer_name:doc.customer,workbench_document:doc,pricing_total:1250,approved_at:'2026-09-14T10:00:00Z'});
 const parsed=await PDFDocument.load(bytes);assert.ok(parsed.getPageCount()>2);
 if(process.env.ESTIMATE_PDF_QA_PATH)await writeFile(process.env.ESTIMATE_PDF_QA_PATH,bytes);
 const reader=await getDocument({data:bytes,useSystemFonts:true}).promise;let text='';
 for(let i=1;i<=reader.numPages;i++)text+=(await (await reader.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ');
 assert.match(text,/Install receptacles/);assert.match(text,/Detailed scope item 109/);assert.match(text,/Final terms/);assert.match(text,/José O'Neil/);assert.match(text,/1,250.00/);assert.doesNotMatch(text,/SECRET|\?/);await reader.destroy();
});
test('unsupported PDF characters report an actionable error rather than corrupting names',async()=>{
 await assert.rejects(()=>exportApprovedProposalPdf({title:'Building 🏗',pricing_total:1,workbench_document:document}),/characters this PDF font cannot display/);
});
