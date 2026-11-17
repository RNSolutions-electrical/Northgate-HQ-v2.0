import {useState} from 'react';
import {newFeederStudy,clearFeederReviews,feederInputSnapshot,assessFeederWorkspace,inspectFeederTopology,FEEDER_REVIEW_KEYS,FEEDER_LIMITATION} from './feederModel.js';

const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,250px),1fr))',gap:'1rem'};
const box={padding:'1rem',margin:'1rem 0',border:'1px solid var(--border-color, #bbb)',borderRadius:8,minWidth:0};
const control={display:'block',width:'100%',boxSizing:'border-box',marginTop:4};
const words=value=>value.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
function TextField({label,value,onChange,multiline=false}){return <label>{label}{multiline?<textarea style={control} maxLength={4000} value={value} onChange={e=>onChange(e.target.value)}/>:<input style={control} maxLength={4000} value={value} onChange={e=>onChange(e.target.value)}/>}</label>;}
function NumberField({label,value,onChange,positive=false}){return <label>{label}<input type="number" min={positive?'0.001':'0'} step="any" style={control} value={value??''} onChange={e=>{const v=e.target.value===''?null:Number(e.target.value);if(v===null||Number.isFinite(v)&&v>=(positive?0.001:0))onChange(v);}}/></label>;}

/** Full-payload in/out; owner component remains responsible for dirty/save and frame synchronization. */
export function FeederWorkspace({payload,onChange,disabled=false}){
 const [error,setError]=useState('');
 if(!payload)return null;
 const f=payload.feederStudies;
 const update=(fn,reviewOnly=false)=>{try{let next=reviewOnly?structuredClone(payload):clearFeederReviews(payload);next.feederStudies??={version:1,panels:[],studies:[]};fn(next.feederStudies,next);onChange(next);setError('');}catch(e){setError(e.message);}};
 const edit=(id,key,value)=>update(next=>{next.studies.find(s=>s.panelId===id)[key]=value;});
 const addPanel=()=>update(next=>{const id=crypto.randomUUID();next.panels.push({id,label:'New panel',parentId:null,loadIds:[]});next.studies.push(newFeederStudy(id));});
 const topology=inspectFeederTopology(f?.panels||[],payload.rows.map(r=>r.id));
 const confirm=id=>update((next,full)=>{
   const study=next.studies.find(s=>s.panelId===id);
   if(!topology.valid)throw Error('Resolve topology and load assignments before confirming review.');
   study.reviewedAt=new Date().toISOString();study.reviewedLoadIds=[...topology.upstreamLoadIds[id]];
   study.reviewSnapshot=feederInputSnapshot(full);
   const assessment=assessFeederWorkspace(full,id);
   if(assessment.status==='incomplete')throw Error('Review is incomplete: '+assessment.missing.join('; '));
 },true);
 return <section style={box} aria-label="Panel and feeder assessments">
  <h2>Panels and feeders</h2><p>Optional reviewed-input assessment. This does <strong>not</strong> automatically calculate NEC feeder demand. Enter independently reviewed design currents, including applicable sizing rules, for each ungrounded conductor. Do not reuse whole-dwelling optional demand factors for a partial feeder.</p>
  <p>{FEEDER_LIMITATION}</p>
  <fieldset disabled={disabled} style={{border:0,padding:0,minWidth:0}}><legend>Feeder workspace</legend>
   <button type="button" onClick={addPanel} disabled={(f?.panels.length||0)>=50}>Add panel or service root</button>
   {error&&<p role="alert">{error}</p>}
   {f?.panels.length>0&&<>
    <h3>Equipment assignments</h3><p>Assign each physical equipment row once to its directly supplied panel. Upstream panels inherit its identity. General lighting and other loads outside the equipment list must be included in the independently reviewed design calculation.</p>
    <div style={grid}>{payload.rows.map(row=><label key={row.id}>{row.label||'Unnamed equipment'}<select style={control} value={f.panels.find(p=>p.loadIds.includes(row.id))?.id||''} onChange={e=>update(next=>{for(const p of next.panels)p.loadIds=p.loadIds.filter(id=>id!==row.id);if(e.target.value)next.panels.find(p=>p.id===e.target.value).loadIds.push(row.id);})}><option value="">Unassigned</option>{f.panels.map(p=><option key={p.id} value={p.id}>{p.label||'Unnamed panel'}</option>)}</select></label>)}</div>
    {!topology.valid&&<div role="status"><p>Topology is incomplete:</p><ul>{topology.errors.map(e=><li key={e}>{e}</li>)}</ul></div>}
   </>}
   {f?.panels.map(panel=>{
    const s=f.studies.find(x=>x.panelId===panel.id);const result=assessFeederWorkspace(payload,panel.id);
    return <fieldset key={panel.id} style={box}><legend>{panel.label||'Unnamed panel'}</legend>
     <div style={grid}>
      <label>Panel label<input style={control} maxLength={200} value={panel.label} onChange={e=>update(next=>{next.panels.find(p=>p.id===panel.id).label=e.target.value;})}/></label>
      <label>Supplied from<select style={control} value={panel.parentId||''} onChange={e=>update(next=>{next.panels.find(p=>p.id===panel.id).parentId=e.target.value||null;})}><option value="">Independent service root</option>{f.panels.filter(p=>p.id!==panel.id).map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <TextField label="Applicable code / AHJ basis" value={s.codeBasis} onChange={v=>edit(panel.id,'codeBasis',v)}/>
      <TextField label="Independent calculation method / source" value={s.methodBasis} onChange={v=>edit(panel.id,'methodBasis',v)} multiline/>
      <TextField label="Reviewer (user-entered attribution)" value={s.reviewer} onChange={v=>edit(panel.id,'reviewer',v)}/>
      <label>System<select style={control} value={s.system} onChange={e=>update(next=>{const item=next.studies.find(x=>x.panelId===panel.id);item.system=e.target.value;item.designCurrentA=Array(e.target.value==='three-phase-4-wire'?3:2).fill(null);})}><option value="single-phase-3-wire">Single phase, 3 wire</option><option value="three-phase-4-wire">Three phase, 4 wire</option><option value="unknown">Unknown / other (unsupported)</option></select></label>
      <NumberField label="Line-to-line voltage" value={s.lineToLineVoltage} onChange={v=>edit(panel.id,'lineToLineVoltage',v)} positive/>
      <label><input type="checkbox" checked={s.systemVerified} onChange={e=>edit(panel.id,'systemVerified',e.target.checked)}/> Voltage and system field verified</label>
      <NumberField label="Independently reviewed demand (VA)" value={s.reviewedDemandVA} onChange={v=>edit(panel.id,'reviewedDemandVA',v)}/>
      {s.designCurrentA.map((v,i)=><NumberField key={i} label={`Reviewed design current, leg ${i+1} (A)`} value={v} onChange={value=>edit(panel.id,'designCurrentA',s.designCurrentA.map((a,n)=>n===i?value:a))}/>)}
     </div>
     <h4>Separate equipment and conductor limits</h4><p>Do not substitute breaker size for conductor ampacity. Enter a professionally established limiting ampacity, accounting for installation and termination conditions.</p>
     <div style={grid}>{Object.entries(s.ratings).map(([key,r])=><fieldset key={key} style={box}><legend>{words(key)}</legend><NumberField label="Rating / limiting ampacity (A)" value={r.amps} positive onChange={v=>edit(panel.id,'ratings',{...s.ratings,[key]:{...r,amps:v}})}/><TextField label="Source / evidence reference" value={r.source} onChange={v=>edit(panel.id,'ratings',{...s.ratings,[key]:{...r,source:v}})}/><label><input type="checkbox" checked={r.verified} onChange={e=>edit(panel.id,'ratings',{...s.ratings,[key]:{...r,verified:e.target.checked}})}/> Independently verified</label></fieldset>)}</div>
     <div style={grid}>{['conductorBasis','terminalBasis','neutralBasis','conditionNote','conditionRecommendation'].map(key=><TextField key={key} label={words(key)} value={s[key]} onChange={v=>edit(panel.id,key,v)} multiline/>)}</div>
     <h4>Professional review checklist</h4><p>Confirm only after reviewing the current inputs. These are user attestations, not verified credentials. Any source-input change invalidates all panel reviews.</p>
     <div style={grid}>{FEEDER_REVIEW_KEYS.map(key=><label key={key}><input type="checkbox" checked={s.reviews[key]} onChange={e=>update(next=>{next.studies.find(x=>x.panelId===panel.id).reviews[key]=e.target.checked;},true)}/> {words(key)}</label>)}</div>
     <button type="button" onClick={()=>confirm(panel.id)}>Confirm review of these exact inputs</button>
     <p role="status">{result.status.replaceAll('-',' ')}{!result.snapshotMatches?' • Input revision is not confirmed.':''}</p>
     {result.missing.length>0&&<details><summary>Missing review prerequisites ({result.missing.length})</summary><ul>{result.missing.map(m=><li key={m}>{m}</li>)}</ul></details>}
     {result.comparisons.length>0&&<ul>{result.comparisons.map(r=><li key={r.rating}>{words(r.rating)}: {r.demandA} A reviewed maximum vs {r.amps} A rating. {r.exceeds?'Calculated exceedance.':'No calculated exceedance; adequacy not established.'}</li>)}</ul>}
     <p>{result.nextAction}</p><p>Last input review: {result.snapshotMatches&&s.reviewedAt?s.reviewedAt:'Not current'}</p>
     <button type="button" onClick={()=>{if(window.confirm('Remove this panel assessment? Loads will become unassigned and child panels become independent roots. Save history retains the earlier state.'))update(next=>{next.panels=next.panels.filter(p=>p.id!==panel.id);next.studies=next.studies.filter(x=>x.panelId!==panel.id);for(const p of next.panels)if(p.parentId===panel.id)p.parentId=null;});}}>Remove panel assessment</button>
    </fieldset>;
   })}
  </fieldset>
 </section>;
}
