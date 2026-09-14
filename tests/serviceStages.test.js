import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SERVICE_STAGES,stageRowStyle,stageTextColor} from '../src/modules/service-calls/serviceStages.js';
import {directoryStatus,callFinancials} from '../src/modules/service-calls/serviceCallModel.js';
test('Stage highlights use catalogue colors and readable contrast, including void and retirement',()=>{
 for(const stage of DEFAULT_SERVICE_STAGES)assert.equal(stageRowStyle(stage)['--svc-stage-bg'],stage.background_color);
 assert.equal(stageTextColor('#000000'),'#FFFFFF');
 assert.equal(stageTextColor('#FFEB3B'),'#000000');
 assert.equal(stageRowStyle(DEFAULT_SERVICE_STAGES.find(s=>s.key==='void'))['--svc-stage-decoration'],'line-through');
 assert.equal(stageRowStyle(DEFAULT_SERVICE_STAGES.find(s=>s.key==='not_proceeding'))['--svc-stage-decoration'],'line-through');
 assert.equal(stageRowStyle({background_color:'url(x)'})['--svc-stage-bg'],'#FFFFFF');
});
test('Custom stage labels and archive priority are shared by both directories',()=>{
 const stages=[...DEFAULT_SERVICE_STAGES,{key:'custom_test',label:'Awaiting parts',kind:'work',background_color:'#FF0000'}];
 const call={profile:{work_stage:'custom_test'},financials:null};
 assert.equal(directoryStatus(call,undefined,stages).label,'Awaiting parts');
 assert.equal(directoryStatus({...call,archived_at:'2026-09-14'},undefined,stages).stage,'archived');
});
test('Zero-charge closure is not a received payment and preserves the blue work stage',()=>{
 for(const stage of ['warranty','pro_bono']){
  const call={profile:{work_stage:stage,financially_closed_at:'2026-09-14'},financials:{invoices:[{status:'posted',is_no_charge_closeout:true,revenue_excluding_tax:0,sales_tax:0,payments:[]}]}};
  assert.equal(callFinancials(call).billingStatus,'Closed — no charge');
  assert.equal(callFinancials(call).outstanding,0);
  assert.equal(directoryStatus(call).stage,stage);
  assert.match(directoryStatus(call).label,/Closed — no charge/);
 }
});
