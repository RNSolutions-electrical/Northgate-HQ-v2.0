import {useEffect,useState} from 'react';
import {validateCycles} from './scorecardQuarters.js';
import {shiftCalendarDate} from './eosLogic.js';

export function ScorecardQuarterSetup({schedule,store,onSaved,onDraftChange=()=>{},onActivity,disabled=false}) {
  const [draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{onActivity?.(busy);},[busy,onActivity]);
  const current=schedule || {revision:0,cycles:[]};
  const cycles=validateCycles(current.cycles);
  function edit(c={id:crypto.randomUUID(),name:'',starts_on:''}) {
    setError('');setDraft({...c,requestId:crypto.randomUUID(),baseline:current});onDraftChange(true);
  }
  async function save(e) {
    e.preventDefault();setBusy(true);setError('');
    try {
      const input={expected_revision:draft.baseline.revision,cycles:validateCycles([...draft.baseline.cycles.filter(c=>c.id!==draft.id),{id:draft.id,name:draft.name,starts_on:draft.starts_on}])};
      await store.saveQuarterSchedule(input,draft.requestId);await onSaved();setDraft(null);onDraftChange(false);
    } catch(e) {setError(`${e.message} Your cycle draft is retained.`);} finally {setBusy(false);}
  }
  return <section aria-label="Set up management cycles">
    <p>Enter confirmed names and effective start dates. Usually the Wednesday following the quarterly meeting; no date is filled in automatically. Each cycle ends the day before the next saved start, so ranges cannot overlap. The latest stays open until the next cycle is defined. This only changes browsing groups; saved entries and measurement dates stay intact.</p>
    {current.unavailable ? <p role="status">Management cycle setup is not deployed yet. Calendar Quarter remains available.</p> : <>
      {cycles.length===0&&<p>No management cycles defined.</p>}
      <ul>{cycles.map((c,i)=><li key={c.id}>{c.name}: {c.starts_on} through {cycles[i+1]?shiftCalendarDate(cycles[i+1].starts_on,-1):'next defined cycle (open)'} <button disabled={disabled||busy||Boolean(draft)} onClick={()=>edit(c)}>Edit cycle {c.name}</button></li>)}</ul>
      <button disabled={disabled||busy||Boolean(draft)} onClick={()=>edit()}>Add management cycle</button>
      {draft&&<form className="scorecard-editor" onSubmit={save}>
        <label>Cycle name<input disabled={busy} required maxLength="100" value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value,requestId:crypto.randomUUID()})}/></label>
        <label>Effective cycle start<input disabled={busy} required type="date" min="1900-01-01" max="2199-12-31" value={draft.starts_on} onChange={e=>setDraft({...draft,starts_on:e.target.value,requestId:crypto.randomUUID()})}/></label>
        <p>Saving may change which reporting weeks appear in this or the preceding cycle. It does not move or edit any entry.</p>
        <button disabled={disabled||busy}>Save management cycle</button><button type="button" disabled={busy} onClick={()=>{setDraft(null);onDraftChange(false);}}>Cancel cycle</button>
      </form>}
    </>}{error&&<p role="alert">{error}</p>}
  </section>;
}
