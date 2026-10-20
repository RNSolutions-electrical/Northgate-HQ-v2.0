import {useEffect,useState} from 'react';
import {parseBulkCsv,bulkCsv} from './scorecardBulkCsv.js';
import {exportRows} from './scorecardLogic.js';
const storage='northgate-scorecard-bulk-review-v1';
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function ScorecardBulkEditor({store,filters,onApplied,onActivity}){
 const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[stale,setStale]=useState(false);
 const [pending,setPending]=useState(()=>localStorage.getItem(storage)||'');
 const [exportNotice,setExportNotice]=useState('');
 useEffect(()=>{onActivity?.(busy);},[busy,onActivity]);
 const unfinished=uncertain||(preview?.status==='preview'&&((preview.new||0)+(preview.changed||0)>0));
 useEffect(()=>{if(!unfinished)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[unfinished]);
 async function run(fn){setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function exportFile(){await run(async()=>{const all=await store.all();const selected=exportRows(all,filters);const cells=selected.map(({metric_id,period_id})=>({metric_id,period_id}));if(!cells.length)throw new Error('No rows in this reporting period.');const result=await store.exportBulk(cells,crypto.randomUUID());download(bulkCsv(result.rows),'scorecard-bulk-edit.csv');const legacy=selected.filter(r=>r.reporting_date_ambiguous).length;setExportNotice(legacy?`${legacy} exported entries use an unverified original-date fallback for grouping. The CSV retains its existing protected meeting-date fields; review these legacy dates before saving.`:'');});}
 async function upload(file){if(!file)return;await run(async()=>{if(file.size>4000000)throw new Error('Use a CSV within 4 MB.');const rows=parseBulkCsv(await file.text());const id=crypto.randomUUID();localStorage.setItem(storage,id);setPending(id);setPreview(null);setStale(false);setUncertain(false);setPreview(await store.previewBulk(rows,id));});}
 async function recover(){await run(async()=>{setPreview(await store.readBulk(pending));setUncertain(false);});}
 async function apply(){await run(async()=>{try{setPreview(await store.applyBulk(preview.import_id));setUncertain(false);}catch(e){if(e.code==='PT409')setStale(true);else setUncertain(true);throw e;}await onApplied?.();});}
 const changed=(preview?.new||0)+(preview?.changed||0);
 const labels={new:'New entries',changed:'Changed entries',unchanged:'Unchanged', 'needs-review':'Needs review'};
 return <section className="scorecard-import scorecard-bulk" aria-label="Bulk edit scorecard">
  <h3>Bulk edit scorecard</h3><p>Export a copy, edit Value and Notes in your spreadsheet, then upload it here to review and save. Leave the other columns as supplied. Blanks keep existing contents; missing rows do nothing. Percentages use 0–100, such as 12.5%.</p>
  <button disabled={busy} onClick={exportFile}>Export for bulk editing</button>
  <label>Upload edited CSV<input type="file" accept=".csv,text/csv" disabled={busy||uncertain} onChange={e=>{upload(e.target.files?.[0]);e.target.value='';}}/></label>
  {pending&&<button disabled={busy} onClick={recover}>Recover last review / save</button>}
  {exportNotice&&<p role="status">{exportNotice}</p>}
  {busy&&<p role="status">Working…</p>}{error&&<p role="alert">{error}</p>}
  {uncertain&&<p role="status">Save could not be confirmed. Recover the last save or retry Confirm save; the same review is saved at most once.</p>}
  {stale&&<p role="alert">The scorecard changed. Export a fresh copy and review your edits again.</p>}
  {preview&&<><p role="status">{preview.status==='saved'?`${preview.saved} saved. `:''}{preview.new} new, {preview.changed} changed, {preview.unchanged} unchanged, {preview.needs_review} need review.</p>
   {preview.needs_review>0&&<p>Nothing will be saved until every Needs review row is resolved.</p>}
   {preview.status==='preview'&&<button disabled={busy||stale||preview.needs_review>0||changed===0} onClick={apply}>Confirm save {changed} {changed===1?'entry':'entries'}</button>}
   {Object.entries(labels).map(([kind,label])=>{const rows=preview.rows.filter(r=>r.kind===kind);return rows.length?<details key={kind} open={kind!=='unchanged'}><summary>{label} ({rows.length})</summary><ul>{rows.map(r=><li key={r.row}><strong>{r.metric} · {r.date}{r.format==='percent'?' · %':''}</strong>{kind==='needs-review'?<p>{r.message}</p>:kind==='unchanged'?<p>No change</p>:<><p>Value: {r.before_value??'Blank'} → {r.after_value??'Blank'}</p>{r.before_notes!==r.after_notes&&<><p>Notes before: {r.before_notes||'Blank'}</p><p>Notes after: {r.after_notes||'Blank'}</p></>}<p>Measurement: {r.measurement_start} through {r.as_of}{kind==='new'?` · Source status: ${r.source_review}`:''}</p></>}</li>)}</ul></details>:null;})}
  </>}
 </section>;
}
