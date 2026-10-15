import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateRows, exportRows, makePeriod, measurementWindow, scopedPeriods, resolveCell} from '../src/modules/eos/scorecardLogic.js';
import {observationDraft, createLocalScorecardStore} from '../src/modules/eos/scorecardStore.js';

test('Wednesday default, weekly dates and saved measurement dates survive meeting override',()=>{
 const p=makePeriod('2026-10-15'); assert.equal(p.meeting_date,'2026-10-14');
 assert.deepEqual(measurementWindow({window:'period'},p),{measurement_start:'2026-10-07',as_of:'2026-10-14'});
 const d={id:'d',metric_id:'m',effective_from:p.anchor,window:'period'};
 const old={metric_id:'m',period_id:p.id,definition_id:'d',value:0,notes:'Actual zero',revision:1,measurement_start:'2026-10-01',as_of:'2026-10-07'};
 const draft=observationDraft({definitions:[d],observations:[old]},'m',{...p,meeting_date:'2026-10-16'});
 assert.equal(draft.value,0);assert.equal(draft.measurement_start,old.measurement_start);assert.equal(draft.as_of,old.as_of);
 assert.deepEqual(measurementWindow({window:'YTD'},p),{measurement_start:'2026-01-01',as_of:'2026-10-14'});
 assert.deepEqual(measurementWindow({window:'QTD'},p),{measurement_start:'2026-10-01',as_of:'2026-10-14'});
});
test('quarter and year follow selected stable week even when meeting moves across boundaries',()=>{
 const periods=['2025-12-29','2026-01-05','2026-09-28','2026-10-05'].map(makePeriod); periods[2].meeting_date='2026-10-02';const state={periods};
 assert.deepEqual(scopedPeriods(state,{scope:'year',periodId:periods[2].id}).map(p=>p.anchor),['2026-01-05','2026-09-28','2026-10-05']);
 assert.deepEqual(scopedPeriods(state,{scope:'quarter',periodId:periods[2].id}).map(p=>p.anchor),['2026-09-28']);
});
test('cumulative latest value and actual zero survive; carried display never becomes another total',()=>{
 const periods=['2026-10-05','2026-10-12','2026-10-19'].map(makePeriod); const d={id:'d',metric_id:'m',effective_from:'2026-01-01',revision:1,name:'Cumulative',window:'YTD',carry:'year',unit:'currency',context:'Receipts YTD',aggregation:'last'};
 const observations=[{metric_id:'m',period_id:periods[0].id,definition_id:'d',value:100,as_of:'2026-10-07'},{metric_id:'m',period_id:periods[1].id,definition_id:'d',value:0,as_of:'2026-10-14'}];const state={metrics:[{id:'m'}],periods,definitions:[d],observations};
 assert.equal(resolveCell(state,'m',periods[2]).value,0);assert.equal(resolveCell(state,'m',periods[2]).carried,true);
 const rows=exportRows(state,{scope:'full'});assert.equal(rows[2].actual_value,'');assert.equal(rows[2].displayed_value,0);assert.equal(aggregateRows(rows)[0].value,0);
 assert.equal(aggregateRows(rows.map(r=>({...r,aggregation:'sum'})))[0].value,100);
});
