import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/modules/estimates/workbench/model.mjs';
import {ensureComponents,addComponentLine,copyWorkItem} from '../src/modules/estimates/workbench/componentStructure.mjs';
import {issues,takeoff} from '../src/modules/estimates/workbench/workspaceModel.mjs';
import {itemPricing,sumPricing} from '../src/modules/estimates/workbench/pricing.mjs';
import {makeReport,reportCSV,reportHTML} from '../src/modules/estimates/workbench/reports.mjs';
import {archivePricingRecord,normalizePackages,awardQuote} from '../src/modules/estimates/workbench/packages.mjs';
import {proposalWithJob} from '../src/modules/estimates/workbench/proposal.mjs';
const item=()=>({id:'work',number:1,name:'Conduit run',qty:2,notes:'PRIVATE',lines:[{id:'source',name:'Wire',qty:5,price:1,hours:0,unit:'FT',notes:'PRIVATE'}]});
const doc=()=>({...seed('Test','Customer'),proposal:{scope:'Install conduit'},entries:[{id:'entry',number:1,name:'Task',description:'Description',section:'Power',items:[item()]}]});
test('job address defaults are saved/exported consistently without changing blanks or approved snapshots',()=>{
 const d=doc(),job={address:'123 Test Street'};
 assert.equal(proposalWithJob(d,job).proposal.siteAddress,job.address);
 assert.equal(d.proposal.siteAddress,undefined);
 d.proposal.siteAddress='';assert.equal(proposalWithJob(d,job).proposal.siteAddress,'');
 delete d.proposal.siteAddress;d.approvedAt='locked';assert.equal(proposalWithJob(d,job),d);
});
test('grouping and independent copies preserve prices, blank is incomplete and explicit zero valid',()=>{
 const i=item(),before=itemPricing(i,{rate:75});ensureComponents(i);assert.deepEqual(itemPricing(i,{rate:75}),before);
 assert.equal(issues(i).length,0);i.lines[0].hours='';assert.ok(issues(i).length);i.lines[0].hours='0';assert.equal(issues(i).length,0);
 const copy=copyWorkItem(i);assert.notEqual(copy.id,i.id);assert.notEqual(copy.components[0].id,i.components[0].id);
 assert.equal(copy.lines[0].componentId,copy.components[0].id);copy.lines[0].price=7.8;assert.equal(i.lines[0].price,1);
 addComponentLine(i,i.components[0].id,null,true);assert.equal(i.lines[1].price,0);assert.equal(i.lines[1].hours,null);
});
test('labor overrides, stable takeoff identities and non-pricing annotations',()=>{
 const d=doc(),i=d.entries[0].items[0];i.lines[0].hours=0.5;i.laborRateOverride=95;
 assert.equal(itemPricing(i,d).labor,475);d.rate=110;assert.equal(itemPricing(i,d).labor,475);
 const original=sumPricing([i],d),key=takeoff(d)[0].key;i.lines[0].name='Renamed wire';assert.equal(takeoff(d)[0].key,key);
 d.takeoffAnnotations={[key]:{hidden:true,ordered:true}};assert.deepEqual(sumPricing([i],d),original);
 assert.equal(makeReport(d,'rfq',{annotations:d.takeoffAnnotations}).rows.length,0);
});
test('field and RFQ projections exclude financials/internal notes; HTML and CSV escape content',()=>{
 const d=doc();d.entries[0].name='<script>alert(1)</script>';d.entries[0].items[0].lines[0].name='=FORMULA()';
 const field=makeReport(d,'field'),rfq=makeReport(d,'rfq');
 for(const output of [JSON.stringify(field),JSON.stringify(rfq)]){assert.ok(!output.includes('PRIVATE'));assert.ok(!output.includes('unitCost'));assert.ok(!output.includes('laborRate'));}
 assert.ok(reportCSV(rfq).includes("'=FORMULA()"));assert.ok(!reportHTML(field).includes('<script>'));
 assert.ok(!reportHTML(rfq).includes('$'));assert.ok(!reportHTML(field).includes('$'));
 const summary=makeReport(d,'summary');assert.equal(summary.totals.price,summary.totals.subtotal+summary.totals.fee);
});
test('archive/unaward retain quote records and cannot change approved data',()=>{
 let d=doc();d.packages=[{id:'package',name:'Gear',section:'Power',awardedQuoteId:'q'}];d.quotes=[{id:'q',packageId:'package',name:'Gear',vendor:'Vendor',materialAmount:100,otherAmount:0}];d=normalizePackages(d);
 awardQuote(d,'package',null);assert.equal(d.quotes.length,1);awardQuote(d,'package','q');
 archivePricingRecord(d,'quote','q','Replaced');assert.equal(d.packages[0].awardedQuoteId,null);assert.ok(d.quotes[0].archivedAt);assert.equal(d.entries.find(e=>e.packageId==='package').items.length,0);
 assert.throws(()=>awardQuote(d,'package','q'),/active/);d.approvedAt='locked';assert.throws(()=>archivePricingRecord(d,'package','package','Remove'),/locked/);
});
