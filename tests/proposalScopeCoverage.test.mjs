import test from 'node:test';
import assert from 'node:assert/strict';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {proposalLines,proposalScopeItems,proposalScopePrices} from '../src/modules/estimates/workbench/proposal.mjs';
import {sumPricing} from '../src/modules/estimates/workbench/pricing.mjs';
import {exportDraftProposalPdf} from '../src/modules/estimates/workbench/proposalPdf.mjs';

const fixture=()=>({name:'Scope coverage',rate:0,materialMarkup:0,feePercent:0,proposal:{scopeMode:'grouped'},entries:[
 {id:'kitchen',number:1,section:'Power',location:'Kitchen',name:'GFCI protection required by code',items:[{id:'outlet',number:1,name:'Receptacle',qty:2,notes:'PRIVATE WORK NOTE',lines:[{qty:1,price:10,hours:0,name:'PRIVATE COMPONENT'}]}]},
 {id:'dock',number:2,section:'Power',location:'Loading dock',name:'Exterior weather protection',items:[{id:'outlet',number:1,name:'Receptacle',qty:2,lines:[{qty:1,price:10,hours:0}]}]},
]});

test('grouped and unassigned scope preserve entry safety context and distinguish repeated work names',()=>{
 const doc=fixture(),before=JSON.stringify(doc),lines=proposalLines(doc);
 assert.deepEqual(lines.map(line=>line.text),[
  'Power — Kitchen — GFCI protection required by code — Receptacle (2 units)',
  'Power — Loading dock — Exterior weather protection — Receptacle (2 units)',
 ]);
 assert.equal(new Set(lines.map(line=>line.key)).size,2);
 assert.equal(JSON.stringify(doc),before);
 const unassigned=proposalScopeItems(doc);
 assert.deepEqual(unassigned.map(item=>item.text),lines.map(line=>line.text));
 doc.proposal.scopeGroups=[{text:'Provide electrical upgrades',lineKeys:[lines[0].key]}];
 const grouped=proposalScopeItems(doc);
 assert.equal(grouped[0].text,'Provide electrical upgrades');
 assert.equal(grouped[0].members[0].text,lines[0].text);
 assert.equal(grouped[1].text,lines[1].text);
 assert.deepEqual(grouped.flatMap(item=>item.members.map(line=>line.key)),lines.map(line=>line.key));
 const pricing=sumPricing(doc.entries.flatMap(entry=>entry.items),doc);
 assert.equal([...proposalScopePrices(doc,pricing.preTaxTotal).values()].reduce((a,b)=>a+b,0),40);
});

test('repeated entry headings are deduplicated and quoted work excludes vendor and internal quote names',()=>{
 const doc=fixture();
 doc.entries=[{id:'q-entry',number:3,section:'Generator equipment',location:'Exterior',name:'Generator equipment',items:[{
  id:'q-item',number:1,name:'PRIVATE VENDOR QUOTE NAME',quoteId:'q',qty:999,notes:'PRIVATE ITEM NOTE',lines:[],
 }]}];
 doc.quotes=[{id:'q',vendor:'PRIVATE VENDOR',name:'PRIVATE QUOTE',materialAmount:90,otherAmount:10,notes:'PRIVATE QUOTE NOTE'}];
 const before=JSON.stringify(doc),line=proposalLines(doc)[0];
 assert.equal(line.text,'Generator equipment — Exterior');
 assert.doesNotMatch(line.text,/PRIVATE|999|units/);
 doc.proposal.scopeGroups=[{text:'Supply generator equipment',lineKeys:[line.key]}];
 assert.equal(proposalScopeItems(doc)[0].members[0].text,line.text);
 delete doc.proposal.scopeGroups;
 assert.equal(JSON.stringify(doc),before);
});

test('grouped PDF includes entry context while keeping quoted vendor and internal details private',async()=>{
 const doc=fixture();
 doc.entries.push({id:'q-entry',number:3,section:'Equipment',location:'Generator pad',name:'Weatherproof generator',items:[{id:'q-item',number:1,name:'PRIVATE VENDOR QUOTE NAME',quoteId:'q',qty:999,lines:[]}]});
 doc.quotes=[{id:'q',vendor:'PRIVATE VENDOR',name:'PRIVATE QUOTE',materialAmount:90,otherAmount:10,notes:'PRIVATE QUOTE NOTE'}];
 doc.proposal.scopeGroups=[{text:'Provide electrical upgrades',lineKeys:proposalLines(doc).map(line=>line.key)}];
 const pdf=await getDocument({data:await exportDraftProposalPdf(doc),useSystemFonts:true}).promise;
 try{
  let text='';
  for(let page=1;page<=pdf.numPages;page++)text+=(await(await pdf.getPage(page)).getTextContent()).items.map(item=>item.str).join(' ')+' ';
  const compact=text.replace(/\s+/g,'');
  for(const phrase of ['Kitchen','GFCI protection required by code','Loading dock','Exterior weather protection','Generator pad','Weatherproof generator'])assert.ok(compact.includes(phrase.replace(/\s+/g,'')),phrase);
  assert.doesNotMatch(text,/PRIVATE|999|materialMarkup/);
 }finally{await pdf.destroy();}
});
