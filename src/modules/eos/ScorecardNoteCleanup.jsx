import {useEffect,useState} from 'react';
const storage='northgate-scorecard-note-cleanup-v1';
export function ScorecardNoteCleanup({store,onApplied,onActivity,disabled=false}) {
 const [plan,setPlan]=useState(null),[id,setId]=useState(()=>localStorage.getItem(storage)||''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 useEffect(()=>{onActivity?.(busy);},[busy,onActivity]);
 useEffect(()=>{if(!uncertain&&plan?.status!=='preview')return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[uncertain,plan?.status]);
 async function run(fn){setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
 const ready=plan?.rows.filter(r=>r.status==='ready').length||0;
 return <details><summary>Imported note cleanup</summary>
  <p>Review removal of exact generated import footers proved by import audit history. Original comments and later notes stay intact. Changed or ambiguous entries are skipped. The separate [*] marker and source metadata remain; no value or date is changed.</p>
  <button disabled={disabled||busy||uncertain} onClick={()=>run(async()=>{const next=crypto.randomUUID();localStorage.setItem(storage,next);setId(next);setPlan(await store.previewNoteCleanup(next));})}>Review import note cleanup</button>
  {id&&<button disabled={disabled||busy} onClick={()=>run(async()=>{setPlan(await store.readNoteCleanup(id));setUncertain(false);})}>Recover note cleanup</button>}
  {error&&<p role="alert">{error}</p>}{uncertain&&<p role="status">Cleanup result is uncertain. Recover it before starting another review.</p>}
  {plan&&<><p role="status">{plan.status==='saved'?`${plan.cleaned} notes cleaned; ${plan.skipped} skipped.`:`${ready} verified notes ready; ${plan.rows.length-ready} skipped.`}</p>
   {plan.status==='preview'&&<button disabled={disabled||busy||uncertain||!ready} onClick={()=>run(async()=>{try{setPlan(await store.applyNoteCleanup(id));setUncertain(false);}catch(e){setUncertain(true);throw e;}await onApplied?.();})}>Confirm clean {ready} notes</button>}
   <ul>{plan.rows.map((r,i)=><li key={i}>{r.period_id} · {r.status}{r.reason?` · ${r.reason}`:''}{r.before&&<><p>Notes before: {r.before.notes||'Blank'}</p><p>Notes after: {r.after_notes||'Blank'}</p></>}</li>)}</ul>
  </>}
 </details>;
}
