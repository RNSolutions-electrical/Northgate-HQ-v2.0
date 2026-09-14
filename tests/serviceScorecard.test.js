import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyServiceProfit,serviceAttention,serviceScorecardCsv } from '../src/modules/service-calls/serviceScorecard.js';
import { MODULES,permittedNavigationGroups,RETIRED_ADDON_KEYS } from '../src/modules/registry.js';
const call=(revenue,cost,date='2026-03-31')=>({name:'Client',service_call_number:'26-001',profile:{work_stage:'complete'},financials:{invoices:[{status:'posted',invoice_date:date,revenue_excluding_tax:revenue,sales_tax:0,payments:[]}],costs:cost===null?[]:[{is_active:true,total_hard_cost:cost,reconciliation_status:'final'}]}});
test('monthly report reconciles with scorecard and preserves missing-cost boundaries',()=>{
 const archived={...call(900,630,'2026-04-01'),archived_at:'2026-04-02'};
 const voided={...call(500,0),profile:{work_stage:'void'}};
 const rows=monthlyServiceProfit([call(100,20),archived,call(100,null),voided,{financials:null}],{year:2026,quarter:'all',basis:'invoice',through:'2026-09-14'});
 assert.equal(rows.reduce((s,r)=>s+(r.profit||0),0),350);
 assert.equal(rows[2].missingCost,1);assert.equal(rows[3].profit,270);assert.equal(rows[2].margin,80);
 assert.equal(monthlyServiceProfit([archived],{year:2026,quarter:'1'}).length,3);
 assert.equal(monthlyServiceProfit([archived],{year:2026,quarter:'all',through:'2026-03-31'})[3].included,0);
});
test('attention is derived from authorized balances and excludes archive/void',()=>{
 const c=call(100,90);c.financials.invoices[0].due_date='2026-01-01';
 assert.deepEqual(serviceAttention(c,'2026-09-14'),['Payment overdue','Margin below 30%']);
 assert.deepEqual(serviceAttention({...c,archived_at:'2026-05-01'}),[]);
 assert.deepEqual(serviceAttention({...c,profile:{work_stage:'void'}}),[]);
 assert.deepEqual(serviceAttention({financials:null}),[]);
 assert.ok(serviceAttention(call(100,null)).includes('Costs missing'));
});
test('CSV excludes restricted values, escapes text formulas, and preserves unknown costs',()=>{
 const c={...call(100,null),name:'=HYPERLINK("bad")'};
 const csv=serviceScorecardCsv([c,{name:'restricted',financials:null}],{basis:'invoice'});
 assert.ok(csv.includes("'=HYPERLINK"));assert.ok(!csv.includes('restricted'));
 assert.ok(csv.includes('"100","","","","0","100"'));
 assert.ok(csv.includes('Costs missing'));
});
test('retired scorecard is absent even with developer add-on access; Panel Directory survives',()=>{
 assert.ok(RETIRED_ADDON_KEYS.includes('service_performance'));
 assert.ok(!MODULES.some(m=>m.key==='service-performance'));
 const groups=permittedNavigationGroups({canAccessAddon:()=>true,department:'Electrical'});
 assert.deepEqual(groups.find(g=>g.key==='add-on-tools').items.map(i=>i.key),['panel-directory']);
 assert.ok(groups.find(g=>g.key==='jobs').items.some(i=>i.navigationState.directoryType==='service_calls'));
});
