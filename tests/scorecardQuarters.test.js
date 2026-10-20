import test from 'node:test';
import assert from 'node:assert/strict';
import {quarterRange,validateCycles,entryReportingDate,entryInScope} from '../src/modules/eos/scorecardQuarters.js';
import {exportRows,makePeriod,scopedPeriods,aggregateRows} from '../src/modules/eos/scorecardLogic.js';
import {createLocalScorecardStore,createRemoteScorecardStore} from '../src/modules/eos/scorecardStore.js';
import {toCsv,previewCsv} from '../src/modules/eos/scorecardCsv.js';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const cycles=[{id:a,name:'Autumn',starts_on:'2026-09-30'},{id:b,name:'Winter',starts_on:'2027-01-06'}];
const periods=['2026-09-28','2026-10-05','2026-12-28','2027-01-04','2027-01-11'].map(makePeriod);
function fixture(){return {quarterSchedule:{revision:1,cycles},reportingDates:periods.map(p=>({metric_id:'m',period_id:p.id,date:p.meeting_date,basis:'source-reporting-date',ambiguous:false})),periods:structuredClone(periods),metrics:[{id:'m',revision:1}],categories:[],members:[{user_id:'qa',is_active:true,is_member:true}],requests:{},audit:[],definitions:[{id:'d',metric_id:'m',revision:1,effective_from:'2026-01-01',name:'Reported QTD',unit:'currency',window:'QTD',carry:'none',aggregation:'last',owner_id:'',goal:null,context:'Original reported basis'}],observations:periods.map((p,i)=>({metric_id:'m',period_id:p.id,definition_id:'d',revision:1,value:i?200:0,notes:'Original note',measurement_start:'2026-07-01',as_of:p.meeting_date,recorded_at:'original',updated_at:'original'}))};}
test('calendar and management views use original reporting dates across Wednesday starts and years',()=>{
 const state=fixture();state.periods[0].meeting_date='2026-10-02';
 assert.deepEqual(quarterRange(state,{periodId:'2026-09-28'}),{name:'2026 Q3',from:'2026-07-01',to:'2026-09-30'});
 assert.equal(quarterRange(state,{periodId:'2026-09-28',quarterView:'management'}).name,'Autumn');
 assert.deepEqual(scopedPeriods(state,{scope:'quarter',periodId:'2026-10-05',quarterView:'management'}).map(p=>p.id),['2026-09-28','2026-10-05','2026-12-28']);
 assert.deepEqual(scopedPeriods(state,{scope:'quarter',periodId:'2027-01-04',quarterView:'calendar'}).map(p=>p.id),['2027-01-04','2027-01-11']);
 assert.equal(quarterRange(state,{periodId:'2027-01-11',quarterView:'management'}).to,null);
});
test('undefined cycles stay empty; names and starts cannot overlap or be guessed',()=>{
 const state=fixture();state.quarterSchedule.cycles=[];
 assert.deepEqual(scopedPeriods(state,{scope:'quarter',periodId:'2026-10-05',quarterView:'management'}),[]);
 assert.throws(()=>validateCycles([...cycles,{...cycles[0],id:'33333333-3333-4333-8333-333333333333'}]),/unique/);
 assert.throws(()=>validateCycles([{...cycles[0],starts_on:'2026-02-30'}]),/valid/);
 assert.throws(()=>scopedPeriods(fixture(),{scope:'quarter',periodId:'2026-10-05',quarterView:'management',quarterScheduleRevision:0}),/schedule changed/);
});
test('view toggles and CSV round trips preserve all original entries and cumulative measurement basis',()=>{
 const state=fixture(),before=structuredClone(state);
 for(const quarterView of ['calendar','management']){
  const rows=exportRows(state,{scope:'quarter',periodId:'2026-10-05',quarterView});
  assert.equal(previewCsv(toCsv(rows),state).changes.length,0);
  assert.ok(rows.every(r=>r.measurement_start==='2026-07-01'&&r.notes==='Original note'));
  assert.equal(aggregateRows(rows)[0].value,200);
  assert.equal(aggregateRows(rows.map(r=>({...r,aggregation:'sum'})))[0].value,null);
 }
 assert.deepEqual(state,before);
});
test('cycle saves preserve actuals, reject stale schedules, retry exactly and retain audit',async()=>{
 const initial=fixture(),store=createLocalScorecardStore(initial,{id:'qa',active:true});
 const input={expected_revision:1,cycles:[...cycles,{id:'33333333-3333-4333-8333-333333333333',name:'Spring',starts_on:'2027-04-07'}]};
 const saved=await store.saveQuarterSchedule(input,'same');assert.deepEqual(await store.saveQuarterSchedule(input,'same'),saved);
 await assert.rejects(store.saveQuarterSchedule(input,'another'),/Conflict/);
 const after=await store.read();assert.deepEqual(after.observations,initial.observations);assert.equal(after.audit.length,1);
 await assert.rejects(store.saveQuarterSchedule({expected_revision:2,cycles:[]},'remove'),/retained/);
 const denied=createLocalScorecardStore(initial,{id:'outsider',active:true});await assert.rejects(denied.saveQuarterSchedule(input,'denied'),/membership/);
});
test('remote schedule reads bind to the same scorecard snapshot and never bypass missing contract or auth',async()=>{
 const calls=[];let code=null;
 const store=createRemoteScorecardStore(async fn=>fn({rpc:async(name,args)=>{
  calls.push({name,args});return name==='eos_scorecard_read_v1'?{data:{...fixture(),snapshot:7}}:code?{error:{code,message:'not available'}}:{data:{revision:1,cycles,reporting_dates:fixture().reportingDates}};
 }}));
 const loaded=await store.read();assert.deepEqual(loaded.quarterSchedule,{revision:1,cycles});assert.deepEqual(loaded.reportingDates,fixture().reportingDates);
 assert.deepEqual(calls[1],{name:'eos_scorecard_quarters_read_v1',args:{p_snapshot:7}});
 code='PGRST202';assert.equal((await store.read()).quarterSchedule.unavailable,true);
 code='42501';await assert.rejects(store.read(),/not available/);
 assert.ok(calls.every(c=>c.name.endsWith('read_v1')));
});
test('October14 scorecard enters the October14 management cycle while October5-11 measurement is unchanged',()=>{
 const state=fixture(),p=makePeriod('2026-10-14');state.periods=[{...p,meeting_date:'2026-11-04'}];
 state.quarterSchedule.cycles=[{id:a,name:'Old',starts_on:'2026-07-15'},{id:b,name:'New',starts_on:'2026-10-14'}];
 state.observations=[{...state.observations[0],period_id:p.id,measurement_start:'2026-10-05',as_of:'2026-10-11'}];
 state.reportingDates=[{metric_id:'m',period_id:p.id,date:'2026-10-14',basis:'source-reporting-date',ambiguous:false}];
 const before=structuredClone(state),filters={scope:'quarter',periodId:p.id,quarterView:'management'};
 assert.equal(quarterRange(state,filters).name,'New');assert.equal(exportRows(state,filters).length,1);
 assert.equal(exportRows(state,filters)[0].reporting_date,'2026-10-14');assert.equal(exportRows(state,filters)[0].measurement_start,'2026-10-05');assert.equal(exportRows(state,filters)[0].as_of,'2026-10-11');
 assert.equal(previewCsv(toCsv(exportRows(state,filters)),state).changes.length,0);assert.deepEqual(state,before);
});
test('mixed original dates in the same reporting week are filtered per entry at calendar/year boundaries',()=>{
 const state=fixture(),p=makePeriod('2026-12-30');state.periods=[p];state.metrics.push({id:'n',revision:1});state.definitions.push({...state.definitions[0],id:'n:v1',metric_id:'n'});
 state.observations=[{...state.observations[0],period_id:p.id},{...state.observations[0],period_id:p.id,metric_id:'n',definition_id:'n:v1'}];
 state.reportingDates=[{metric_id:'m',period_id:p.id,date:'2026-12-31',basis:'source-reporting-date',ambiguous:false},{metric_id:'n',period_id:p.id,date:'2027-01-01',basis:'source-reporting-date',ambiguous:false}];
 for(const scope of ['quarter','year']){
  const filters={scope,periodId:p.id,quarterView:'calendar',referenceDate:'2027-01-01'};
  assert.deepEqual(scopedPeriods(state,filters).map(p=>p.id),[p.id]);assert.deepEqual(exportRows(state,filters).map(r=>r.metric_id),['n']);
  assert.equal(entryInScope(state,'m',p,filters),false);assert.equal(entryInScope(state,'n',p,filters),true);
 }
});
test('legacy dates use explicit unverified stable fallbacks rather than a rescheduled or fabricated Wednesday',()=>{
 const state=fixture(),p={...state.periods[0],meeting_date:'2026-10-14'};state.reportingDates=[{metric_id:null,period_id:p.id,date:'2026-09-29',basis:'first-audited-period-meeting-date',ambiguous:true}];
 assert.equal(entryReportingDate(state,'m',p).date,'2026-09-29');assert.equal(entryReportingDate(state,'m',p).ambiguous,true);
 state.reportingDates=[];assert.deepEqual(entryReportingDate(state,'m',p),{date:'2026-09-28',basis:'reporting-anchor-fallback',ambiguous:true});
});
