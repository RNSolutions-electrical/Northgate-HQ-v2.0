import test from 'node:test';import assert from 'node:assert/strict';
import {handoffFinancialBuckets,handoffPreview,handoffDestinationState} from '../src/modules/estimates/workbench/handoff.mjs';
import {sumPricing} from '../src/modules/estimates/workbench/pricing.mjs';
test('handoff distributes fee across customer lines exactly and retains internal cost',()=>{
 const doc={rate:75,materialMarkup:13.5,feePercent:17.3,entries:[{id:'e',number:1,items:Array.from({length:31},(_,n)=>({id:String(n),number:n+1,name:'Scope '+n,qty:3,lines:[{qty:0.17,price:n+0.11,hours:0.1234,fixed:n%2===0}]}))}]};
 const before=JSON.stringify(doc),p=handoffPreview(doc),total=sumPricing(doc.entries[0].items,doc);
 assert.equal(Math.round(p.lines.reduce((n,l)=>n+l.line_total,0)*100),Math.round(total.price*100));
 assert.equal(Math.round(p.lines.reduce((n,l)=>n+l.fee_amount,0)*100),Math.round(total.fee*100));
 assert.equal(JSON.stringify(doc),before);assert.equal(new Set(p.lines.map(l=>l.key)).size,31);
});
test('handoff handles zero amounts and keeps job, CO and call navigation distinct',()=>{
 const p=handoffPreview({rate:0,materialMarkup:0,feePercent:30,entries:[{id:'e',number:1,items:[{id:'i',number:1,name:'Free work',qty:1,lines:[{qty:1,price:0,hours:0}]}]}]});assert.equal(p.total,0);assert.equal(p.lines[0].line_total,0);
 assert.equal(handoffDestinationState({destination:'job',job_id:'j'}).openTab,'details');assert.equal(handoffDestinationState({destination:'change_order',job_id:'j',change_order_id:'c'}).openChangeOrderId,'c');
});
test('job financial handoff exposes every non-zero internal cost exactly once',()=>{
 const document={rate:80,materialMarkup:20,feePercent:10,entries:[{id:'entry',number:1,section:'Lighting',items:[{id:'item',number:1,name:'Fixtures',qty:1,lines:[{qty:2,price:50,hours:1}]}]}]};
 const preview=handoffPreview(document),buckets=handoffFinancialBuckets(document);
 assert.deepEqual(buckets.map(bucket=>bucket.label),['Material','Labor','Markup / OH&P']);
 assert.equal(Math.round(buckets.reduce((sum,bucket)=>sum+bucket.amount,0)*100),Math.round(preview.total*100));
 assert.equal(new Set(buckets.map(bucket=>bucket.key)).size,buckets.length);
});
