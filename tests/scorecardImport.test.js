import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORY_COLUMNS, historicalRows, historicalTemplate } from '../src/modules/eos/scorecardImport.js';
import { createRemoteScorecardStore } from '../src/modules/eos/scorecardStore.js';
test('historical CSV preserves blanks, zero, comments and original dates', () => {
 const values=HISTORY_COLUMNS.map(k=> k==='actual_value'?'0':k==='comments'?'a,b\n"comment"':k==='source_meeting_date'?'2026-01-06':'');
 const csv=historicalTemplate()+values.map(v=>'"'+v.replaceAll('"','""')+'"').join(',');
 const [row]=historicalRows(csv);assert.equal(row.actual_value,'0');assert.equal(row.metric_id,'');assert.equal(row.comments,'a,b\n"comment"');assert.equal(row.source_meeting_date,'2026-01-06');
 assert.throws(()=>historicalRows(historicalTemplate()),/1–2000/);
 assert.throws(()=>historicalRows('wrong\n0'),/columns/);
});
test('remote historical operations use only guarded versioned RPCs and stable identity',async()=>{
 const requests=[];const store=createRemoteScorecardStore(async fn=>fn({rpc:(name,args)=>{requests.push({name,args});return {abortSignal:async()=>({data:{},error:null})};}},new AbortController().signal));
 await store.previewHistorical([{actual_value:'0'}],'same-id');await store.applyHistorical('same-id');await store.applyHistorical('same-id');await store.readHistorical('same-id');
 assert.deepEqual(requests.map(r=>r.name),['eos_scorecard_import_preview_v1','eos_scorecard_import_apply_v1','eos_scorecard_import_apply_v1','eos_scorecard_import_receipt_v1']);
 assert.ok(requests.every(r=>r.args.p_import_id==='same-id'));
});
