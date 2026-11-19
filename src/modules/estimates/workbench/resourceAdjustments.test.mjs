import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {blankDocument,blankSumPricing,hasResourceAdjustments,requireBlankAccounting,selectCatalogueResource} from './blankSlate.mjs';
const fixture=()=>({...blankDocument(),rate:100,blankSlateHardRate:40,materialMarkup:20,feePercent:10,estimateDiscount:{type:'percent',value:5},proposal:{salesTaxPercent:7.25,creditCardPercent:3},entries:[{id:'e',items:[{id:'i',qty:3,lines:[{id:'l',qty:2,price:10,hours:.5,materialAdjustment:{direction:'addition',type:'percent',value:10},laborAdjustment:{direction:'discount',type:'amount',value:25}}]}]}]});
test('additions and discounts report separately with exact cents, fees, tax and card',()=>{
 const d=fixture(),p=blankSumPricing(d.entries[0].items,d);for(const [k,v] of Object.entries({subtotal:354.20,cost:180,resourceAddition:7.2,resourceDiscount:25,fee:35.42,estimateDiscount:19.48,preTaxTotal:370.14,salesTax:26.84,creditCardFee:11.91,price:408.89}))assert.equal(p[k],v,k);
 d.entries[0].items[0].blankQuotes=[{id:'q',cost:100,markup:10,mode:'add'}];assert.equal(blankSumPricing(d.entries[0].items,d).subtotal,684.2);
 d.entries[0].items[0].blankQuotes[0].mode='replace';const replacement=blankSumPricing(d.entries[0].items,d);assert.equal(replacement.subtotal,330);assert.equal(replacement.resourceDiscount,0);assert.equal(replacement.resourceAddition,undefined);
});
test('legacy discounts remain unchanged and conflicting representations fail closed',()=>{
 const d=fixture(),l=d.entries[0].items[0].lines[0];delete l.materialAdjustment;delete l.laborAdjustment;l.materialDiscount={type:'percent',value:10};l.laborDiscount={type:'amount',value:25};const before=structuredClone(d);const p=blankSumPricing(d.entries[0].items,d);assert.equal(p.subtotal,339.8);assert.equal(p.resourceDiscount,32.2);assert.equal(p.resourceAddition,undefined);assert.deepEqual(d,before);
 l.materialAdjustment={direction:'addition',type:'percent',value:10};assert.throws(()=>blankSumPricing(d.entries[0].items,d),/Conflicting/);
});
test('validation rejects negative, malformed and over-discounts but allows explicit large additions',()=>{
 const d=fixture(),l=d.entries[0].items[0].lines[0];for(const adjustment of [{direction:'discount',type:'percent',value:101},{direction:'discount',type:'amount',value:999},{direction:'addition',type:'amount',value:-1},{type:'amount',value:1}]){l.materialAdjustment=adjustment;assert.throws(()=>blankSumPricing(d.entries[0].items,d));}l.materialAdjustment={direction:'addition',type:'percent',value:150};assert.equal(blankSumPricing(d.entries[0].items,d).resourceAddition,108);
});
test('v3 capability required for new structures, including unincluded drafts and zero',async()=>{
 const d=fixture(),client=version=>async()=>({rpc:async()=>({data:version})});assert.equal(hasResourceAdjustments(d),true);await assert.rejects(requireBlankAccounting(d,client(2)),/unavailable/);await requireBlankAccounting(d,client(3));d.blankWorkDrafts=[{item:d.entries[0].items[0]}];d.entries=[];assert.equal(hasResourceAdjustments(d),true);await assert.rejects(requireBlankAccounting(d,client(2)));d.blankWorkDrafts[0].item.lines[0].materialAdjustment.value=0;assert.equal(hasResourceAdjustments(d),true);
});
test('compact adjustments and top/bottom tools expose supported controls without changing source costs',()=>{
 const ui=readFileSync(new URL('./BlankSlateEditor.jsx',import.meta.url),'utf8'),control=readFileSync(new URL('./PriceAdjustment.jsx',import.meta.url),'utf8');assert.match(control,/useState\(false\)/);assert.match(control,/Price Adjustment/);assert.match(ui,/Work item sections bottom/);assert.match(ui,/addResource\(\{id:editing.entryId\},editing.item/);assert.match(ui,/addQuote\(\{id:editing.entryId\},editing.item/);assert.doesNotMatch(ui,/<Discount label="Material discount"/);assert.match(ui,/delete l\[key.replace\('Adjustment','Discount'\)\]/);
});

test('locked resource quantity remains 10 total instead of 10 per assembly',()=>{
 const d=fixture(),i=d.entries[0].items[0];i.lines=[{id:'l',qty:10,price:2,hours:1,fixed:true}];i.qty=3;
 const locked=blankSumPricing([i],d);assert.equal(locked.material,20);assert.equal(locked.hours,10);
 i.lines[0].fixed=false;const scaled=blankSumPricing([i],d);assert.equal(scaled.material,60);assert.equal(scaled.hours,30);
 const ui=readFileSync(new URL('./BlankSlateEditor.jsx',import.meta.url),'utf8');assert.match(ui,/Lock item quantity/);assert.match(ui,/checked=\{Boolean\(line.fixed\)\}/);
});

test('duplicate catalogue resources retain independent internal notes and locked quantities on reselection',()=>{
 const material={id:'thhn6',name:'#6 THHN',unit:'FT',price:2,hours:.1};
 const a={id:'phase-a',qty:10,fixed:true,notes:'Phase A',stage:'Rough-in',materialAdjustment:{direction:'discount',type:'percent',value:5}};
 const b={id:'phase-b',qty:20,fixed:false,notes:'Phase B',stage:'Trim'};
 const ar=selectCatalogueResource(a,material),br=selectCatalogueResource(b,material);
 assert.equal(ar.catalogueId,br.catalogueId);assert.notEqual(ar.id,br.id);assert.equal(ar.qty,10);assert.equal(ar.fixed,true);assert.equal(ar.notes,'Phase A');assert.equal(br.qty,20);assert.equal(br.fixed,false);assert.equal(br.notes,'Phase B');assert.equal(br.stage,'Trim');assert.deepEqual(ar.materialAdjustment,a.materialAdjustment);
 ar.notes='Phase A revised';assert.equal(br.notes,'Phase B');assert.equal(a.notes,'Phase A');
 const ui=readFileSync(new URL('./BlankSlateEditor.jsx',import.meta.url),'utf8');assert.match(ui,/Internal line notes/);assert.match(ui,/onDraft=\{value=>stageLine\(line.id,'notes',value\)\}/);assert.match(ui,/selectCatalogueResource\(l,material\)/);
});
