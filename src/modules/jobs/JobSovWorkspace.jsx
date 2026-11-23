import {useEffect,useState} from 'react';
import {cents,dollars,sovMetrics,divisionSources,validatePlan,packPlan} from './sovWorkspaceMath.js';

const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const money=n=>n==null?'—':usd.format(n/100);
const pct=n=>n==null?'—':n.toFixed(2)+'%';
const id=()=>crypto.randomUUID();
const btn='secondary-button';
const editable=(value,onChange,name,maxLength=160,inputMode='text')=><input aria-label={name} value={value??''} onChange={e=>onChange(e.target.value)} maxLength={maxLength} inputMode={inputMode}/>;

export function JobSovWorkspace({record,divisions,budget,sov,hasPayHistory,original,canWrite,busy,waiting,onSave,onPublish,onLegacy,onDirty}) {
  const [draft,setDraft]=useState(null);
  const [source,setSource]=useState('');
  const [picker,setPicker]=useState(false);
  const saved=record?.payload??{groups:[]};
  const active=draft??saved;
  const published=Boolean(saved.published);
  const sources=divisionSources(divisions,budget);
  const byId=new Map((sov??[]).map(s=>[s.id,s]));
  const linked=new Set(active.groups.flatMap(g=>g.lines.map(l=>l.link).filter(Boolean)));
  const unmatched=(sov??[]).filter(r=>!linked.has(r.id));
  const issues=draft?validatePlan(draft):[];
  const total=active.groups.reduce((n,g)=>n+(cents(g.target)??0),0);
  const targetBase=original==null?null:Math.round(Number(original)*100);
  const cleanLedger=sov!=null&&sov.length===0&&!hasPayHistory;
  const balanced=active.groups.every(g=>g.lines.length>0&&g.lines.reduce((s,l)=>s+(sovMetrics(cents(g.target),l).amount??0),0)===cents(g.target));
  useEffect(()=>{onDirty(Boolean(draft));return()=>onDirty(false);},[Boolean(draft),onDirty]);
  function addGroup(d=null) {
    const g={id:id(),code:d?.code??'',name:d?.name??'',target:d?dollars(d.total):'',divisionId:d?.id??null,lines:[]};
    setDraft({...active,groups:[...active.groups,g]});setPicker(false);setSource('');
  }
  function editGroup(groupId,fn) {setDraft({...active,groups:active.groups.map(g=>g.id===groupId?fn(g):g)});}
  function editLine(g,l,k,v) {editGroup(g.id,gg=>({...gg,lines:gg.lines.map(ll=>ll.id===l.id?{...ll,[k]:v}:ll)}));}
  function addLine(g){
    let n=g.lines.length+1;while(g.lines.some(l=>l.code===g.code+'-'+n))n++;
    editGroup(g.id,gg=>({...gg,lines:[...gg.lines,{id:id(),code:g.code?g.code+'-'+n:'',description:'',basis:'amount',value:'',complete:'0',link:null}]}));
  }
  const openLegacy=()=>{if(!draft||window.confirm('Discard unsaved SOV edits and open Legacy?'))onLegacy();};
  return <section className="fin2-panel sov2" aria-label="Rebuilt SOV workspace">
    <header className="sov2-header"><div><h3>Schedule of values &amp; billing</h3><p>Break your contract into billable line items. Field progress and recorded billing stay separate. Approved change orders stay in their existing workflow.</p></div>
    <button type="button" className={btn} disabled={busy} onClick={openLegacy}>Open Legacy SOV &amp; Billing</button></header>
    {!published&&canWrite&&<div className="fin2-actions">
      <button type="button" className={btn} onClick={()=>addGroup()}>Start from scratch{active.groups.length?' (add division)':''}</button>
      <button type="button" className={btn} onClick={()=>setPicker(!picker)} disabled={!sources.length||waiting}>Import a division</button>
      {picker&&<><label className="fin2-field"><span>Division’s original budget total</span><select value={source} onChange={e=>setSource(e.target.value)}><option value="">Select division</option>{sources.filter(d=>!active.groups.some(g=>g.divisionId===d.id||g.code===d.code)).map(d=><option key={d.id} value={d.id}>Division {d.code} · {d.name} · {money(d.total)}</option>)}</select></label>
      <button type="button" className={btn} disabled={!source} onClick={()=>addGroup(sources.find(d=>d.id===source))}>Use division total</button></>}
    </div>}
    <p className="muted-copy">{published?'Active billing schedule. Update work progress here; the original schedule and billing history remain protected.':'Imported totals use the original division budget as a starting point, not as proof of a signed amount. A draft never changes recorded bills.'}</p>
    {!active.groups.length&&<p>No rebuilt schedule yet. Start blank or import a division. Existing schedules and bills are available in Legacy.</p>}
    {active.groups.length>0&&<p><strong>Division targets: {money(total)}</strong>{targetBase!=null&&<> · Verified original contract: {money(targetBase)}</>}</p>}
    {canWrite&&record&&!draft&&<div className="fin2-actions"><button type="button" className={btn} onClick={()=>setDraft(saved)}>{published?'Edit progress':'Edit schedule & progress'}</button></div>}
    {active.groups.map(g=>{
      const target=cents(g.target);
      const scheduled=g.lines.reduce((n,l)=>n+(sovMetrics(target,l).amount??0),0);
      const editableShape=!!draft&&!published;
      return <div className="sov2-group" key={g.id}><h4>Division {g.code||'—'}{g.name?' · '+g.name:''} · {money(target)}</h4>
        {editableShape&&<div className="fin2-form">
          <label>Division code {editable(g.code,v=>editGroup(g.id,x=>({...x,code:v})),'Division code',24)}</label>
          <label>Division name {editable(g.name,v=>editGroup(g.id,x=>({...x,name:v})),'Division name')}</label>
          <label>Division total ($) {editable(g.target,v=>editGroup(g.id,x=>({...x,target:v})),'Division total',16,'decimal')}</label>
          <button type="button" className={btn} onClick={()=>setDraft({...active,groups:active.groups.filter(a=>a.id!==g.id)})}>Remove division</button></div>}
        <p>Scheduled: {money(scheduled)} · {target==null?'Enter the division total':scheduled===target?'Fully allocated':scheduled>target?money(scheduled-target)+' over target':money(target-scheduled)+' unallocated'}</p>
        {g.lines.length>0&&<div className="fin2-table" role="region" aria-label={'SOV lines for '+g.code} tabIndex={0}><table><thead><tr>{['Line item','Share of division','Scheduled value','Work complete','Value complete','Work remaining','Value remaining','Billed to date','Left to bill','% left to bill',...(editableShape?['Billing line link','']:[])].map((h,i)=><th scope="col" key={i}>{h}</th>)}</tr></thead><tbody>
          {g.lines.map(l=>{
            const posted=byId.get(l.link), m=sovMetrics(target,l,posted);
            const change=(k,v)=>editLine(g,l,k,v);
            return <tr key={l.id}><th scope="row">{editableShape?<>{editable(l.code,v=>change('code',v),'Line code',40)}{editable(l.description,v=>change('description',v),'Description for '+l.code)}</>:<>{l.code} · {l.description}</>}</th>
              <td>{editableShape&&l.basis==='percent'?editable(l.value,v=>change('value',v),'Division share for '+l.code,16,'decimal'):pct(m.share)}{editableShape&&<select aria-label={'Allocation method for '+l.code} value={l.basis} onChange={e=>editGroup(g.id,gg=>({...gg,lines:gg.lines.map(ll=>ll.id===l.id?{...ll,basis:e.target.value,value:''}:ll)}))}><option value="amount">Dollars</option><option value="percent">Percent</option></select>}</td>
              <td>{editableShape&&l.basis==='amount'?editable(l.value,v=>change('value',v),'Scheduled value for '+l.code,16,'decimal'):money(m.amount)}</td>
              <td>{draft?editable(l.complete,v=>change('complete',v),'Percent complete for '+l.code,6,'decimal'):pct(m.progress)}</td>
              <td>{money(m.earned)}</td><td>{pct(m.progress==null?null:100-m.progress)}</td><td>{money(m.workLeft)}</td>
              <td>{money(m.billed)}{posted&&m.amount!==m.billingBase&&<small className="sov2-line-note">Billing base: {money(m.billingBase)}</small>}</td><td>{money(m.unbilled)}</td><td>{pct(m.unbilledPercent)}</td>
              {editableShape&&<><td><select aria-label={'Legacy billing link for '+l.code} value={l.link??''} onChange={e=>change('link',e.target.value||null)}><option value="">Unlinked</option>{(sov??[]).filter(s=>s.id===l.link||!linked.has(s.id)).map(s=><option key={s.id} value={s.id}>{s.sov_line} · {s.description} ({usd.format(s.scheduled_value_amount)})</option>)}</select></td><td><button type="button" className={btn} onClick={()=>editGroup(g.id,gg=>({...gg,lines:gg.lines.filter(ll=>ll.id!==l.id)}))}>Remove</button></td></>}
            </tr>;
          })}
        </tbody></table></div>}
        {editableShape&&<button type="button" className={btn} onClick={()=>addLine(g)}>Add SOV line</button>}
      </div>;
    })}
    {unmatched.length>0&&<p><strong>{unmatched.length} Legacy billing line{unmatched.length===1?' is':'s are'} not linked.</strong> Unlinked billing is not counted in rebuilt rows. Link matching lines when the scopes are actually the same; the existing records stay intact.</p>}
    {draft&&<div className="fin2-actions">
      <button type="button" className="primary-button" disabled={issues.length>0||busy||!canWrite} onClick={async()=>{if(await onSave(packPlan(draft)))setDraft(null);}}>{published?'Save work progress':'Save SOV draft'}</button>
      <button type="button" className={btn} disabled={busy} onClick={()=>setDraft(null)}>Discard edits</button>
      {issues.map(s=><p role="status" key={s}>{s}</p>)}
    </div>}
    {!draft&&saved.groups.length>0&&!published&&canWrite&&cleanLedger&&<div><button type="button" className="primary-button" disabled={!balanced||targetBase!==total||waiting||busy} onClick={()=>{if(window.confirm('Use this schedule for billing on this job? This creates the first active billing lines. It does not issue an invoice.'))onPublish();}}>Use schedule for billing</button>
      <p className="muted-copy">Available only when the whole job’s signed original amount is recorded, division lines fully reconcile, and no billing history exists.</p></div>}
  </section>;
}
