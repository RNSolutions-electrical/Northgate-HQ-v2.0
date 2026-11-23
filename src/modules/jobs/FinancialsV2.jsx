import { JobSovWorkspace } from './JobSovWorkspace.jsx';
import { useAuth } from '@clerk/clerk-react';
import { useEffect, useRef, useState } from 'react';
import { withSupabaseTokenRetry } from '../../services/supabaseClient.js';
import { approvedContractChanges, financialContractSummary } from './financialsLanding.js';
import { REPORTS, buildForecastCsv, difference, executionBudget, executionLine, indexRecords, optional, salesPlan, sum } from './financialsV2.js';
import { buildForecastPatches } from './jobForecast.js';
import { emptyPreview, previewForecast } from './financialsPreview.js';
import './financialsV2.css';

const usd = new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'});
const dateToday = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const money = n => n == null || !Number.isFinite(Number(n)) ? '—' : usd.format(n);
const shown = n => n == null ? '—' : String(n);
const amounts = (value, label, {signed=false, max=9999999999.99}={}) => {
  const raw = String(value ?? '').trim();
  if (!/^-?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw) || Math.abs(Number(raw)) > max || (!signed && Number(raw)<0)) throw new Error(`Enter a valid ${label} (up to two decimal places).`);
  return Number(raw);
};
const blankNum = (v,label,options) => optional(v) == null ? null : amounts(v,label,options);
const labelOf = r => [r.cost_code,r.description].filter(Boolean).join(' · ');
const SECTIONS = [['overview','Overview'],['detail','Detailed budget'],['sales','Sales budget'],['execution','Execution budget'],['sov','SOV & billing'],['changes','Change orders'],['forecast','Forecasts'],['history','History']];
const Button = ({ children, primary, ...props }) => <button type="button" className={primary?'primary-button':'secondary-button'} {...props}>{children}</button>;
function Field({label,mode='decimal',...props}) { return <label className="fin2-field"><span>{label}</span><input inputMode={mode} {...props}/></label>; }
function Panel({title,sub,children}) { return <section className="fin2-panel"><h3>{title}</h3>{sub&&<p className="muted-copy">{sub}</p>}{children}</section>; }
function Grid({label,columns,rows}) {
  return rows.length ? <div className="fin2-table" role="region" tabIndex={0} aria-label={label}><table><thead><tr>{columns.map(col=><th key={col} scope="col">{col}</th>)}</tr></thead><tbody>{rows.map(([key,heading,...cells])=><tr key={key}><th scope="row">{heading}</th>{cells.map((cell,i)=><td key={i}>{cell}</td>)}</tr>)}</tbody></table></div> : <p className="muted-copy">No records to show.</p>;
}
const Metric = ({title,value,detail}) => <div className="fin2-metric"><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>;

export function FinancialsV2({job,lines,divisions,sov,orders,postings,waiting,issues,canManage,canSeeProtected,onSaveBudget,onSovReload,onLegacy,onBilling,onQuick,onOpenChange,onViewEstimate,onDirty}) {
  const {getToken}=useAuth();
  const [view,setView]=useState('overview');
  const [recordState,setRecordState]=useState({loading:canSeeProtected,records:[],error:''});
  const [payState,setPayState]=useState({loading:false,apps:[],error:''});
  const [draft,setDraft]=useState(null);
  const [forecast,setForecast]=useState({});
  const [asOf,setAsOf]=useState(dateToday);
  const [cutoff,setCutoff]=useState('');
  const [source,setSource]=useState('');
  const [scope,setScope]=useState('');
  const [coDivision,setCoDivision]=useState('');
  const [reports,setReports]=useState(REPORTS.map(([key])=>key));
  const [busy,setBusy]=useState(false);
  const locked=useRef(false);
  const [notice,setNotice]=useState(null);
  const [sovDirty,setSovDirty]=useState(false);
  const records=indexRecords(recordState.records);
  const snapshots=recordState.records.filter(r=>r.kind==='forecast').sort((a,b)=>b.record_key.localeCompare(a.record_key));
  const dirty=sovDirty||Boolean(draft)||Object.keys(forecast).length>0;
  const canWrite=canManage&&canSeeProtected&&!recordState.loading&&!recordState.error&&!busy;
  useEffect(()=>{onDirty(dirty||busy);return ()=>onDirty(false);},[dirty,busy,onDirty]);
  useEffect(()=>{
    if (!dirty) return;
    const warning=ev=>{ev.preventDefault();ev.returnValue='';};
    window.addEventListener('beforeunload',warning);
    return ()=>window.removeEventListener('beforeunload',warning);
  },[dirty]);
  const call=(name,args)=>withSupabaseTokenRetry(getToken,async client=>{
    const {data,error}=await client.rpc(name,args);
    if(error) throw error;
    return data;
  });
  const [reload,setReload]=useState(0);
  const [history,setHistory]=useState(null);
  useEffect(()=>{
    if (!canSeeProtected) return;
    let live=true;
    setRecordState(s=>({...s,loading:true,error:''}));
    withSupabaseTokenRetry(getToken,async client=>{
      const {data,error}=await client.rpc('read_job_financial_v2',{p_job_id:job.id});
      if(error) throw error;
      return data;
    }).then(records=>{if(live)setRecordState({loading:false,records:records||[],error:''});})
      .catch(error=>{if(live)setRecordState({loading:false,records:[],error:error.message});});
    return ()=>{live=false;};
  },[job.id,getToken,canSeeProtected,reload]);
  useEffect(()=>{
    if(view!=='sov')return;
    let live=true;
    setPayState(s=>({...s,loading:true,error:''}));
    withSupabaseTokenRetry(getToken,async client=>{
      const {data,error}=await client.rpc('get_job_pay_applications',{p_job_id:job.id});
      if(error)throw error;
      return data;
    }).then(data=>{if(live)setPayState({loading:false,apps:data||[],error:''});})
      .catch(error=>{if(live)setPayState({loading:false,apps:[],error:error.message});});
    return ()=>{live=false;};
  },[job.id,getToken,view]);
  useEffect(()=>{
    if(view!=='history'||!canSeeProtected)return;
    let live=true;
    setHistory(null);
    withSupabaseTokenRetry(getToken,async client=>{
      const {data,error}=await client.from('job_financial_v2_records').select('kind,record_key,revision,payload,created_at,created_by').eq('job_id',job.id).order('created_at',{ascending:false}).limit(50);
      if(error)throw error;
      return data;
    }).then(rows=>{if(live)setHistory({rows});}).catch(err=>{if(live)setHistory({error:err.message});});
    return ()=>{live=false;};
  },[job.id,getToken,view,canSeeProtected,reload]);

  function leave(action) {
    if (locked.current || (dirty && !window.confirm('Leave this view and discard unsaved Financials V2 edits?'))) return;
    setDraft(null); setForecast({}); setNotice(null);
    action();
  }
  function navigate(target) {
    if (target!==view) leave(()=>{setView(target);setScope('');setSource('');});
  }
  async function run(action,message) {
    if(locked.current)return;
    locked.current=true;setBusy(true);setNotice(null);
    try { await action();setNotice({text:message}); }
    catch(error) {setNotice({error:true,text:error.message || 'Save could not be confirmed. Review the latest records before retrying.'});}
    finally {locked.current=false;setBusy(false);}
  }
  async function record(kind,key,payload,revision=records[`${kind}:${key}`]?.revision ?? 0) {
    if(!canWrite) throw new Error('Financials V2 is not ready to save for this job.');
    const data=await call('record_job_financial_v2',{p_job_id:job.id,p_kind:kind,p_key:key,p_expected_revision:revision,p_payload:payload});
    const saved=Array.isArray(data)?data[0]:data;
    if(!saved?.id)throw new Error('Save response was incomplete. Refresh before retrying.');
    setRecordState(s=>({...s,records:[...s.records.filter(r=>r.kind!==kind||r.record_key!==key),saved]}));
  }
  const original=records['contract:job']?.payload;
  const baseline=records['baseline:job']?.payload;
  const baselineLines=new Map(baseline?.lines?.map(r=>[r.id,r]) ?? []);
  const sales=records['sales:job']?.payload;
  const salesLines=new Map(sales?.lines?.map(r=>[r.id,r]) ?? []);
  const revPlan=recordState.records.filter(r=>r.kind==='billing_plan').sort((a,b)=>a.record_key.localeCompare(b.record_key));
  const contract=financialContractSummary({original:original?.amount,changeOrders:orders,sovLines:sov});
  const approved=orders==null?null:approvedContractChanges(orders);
  const costs=(lines??[]).filter(executionLine);
  const currentFee=sum((lines??[]).filter(r=>r.category==='ohp_fee'),r=>r.currentBudget);
  const budget=costs.length?sum(costs,executionBudget):null;
  const actual=costs.length?sum(costs,r=>r.actual_cost_amount):null;
  const billed=sov?.length?sum(sov,r=>r.billed_to_date_amount):null;
  const costMonthly=r=>Number(r.forecast_to_complete_amount)===0?null:optional(r.forecast_to_complete_amount);
  const costFinal=r=>Number(r.forecast_final_amount)===0?null:optional(r.forecast_final_amount);
  const approvedRows=(orders??[]).filter(r=>approved?.ids.has(r.id));
  const changedDivisions=[...new Set(approvedRows.map(r=>r.division).filter(Boolean))].sort();
  const shownChanges = coDivision ? approvedRows.filter(r=>r.division===coDivision) : approvedRows;
  const postingGroups=(postings??[]).reduce((m,r)=>{m.set(r.change_order_id,[...(m.get(r.change_order_id)??[]),r]);return m;},new Map());
  const month=asOf.slice(0,7);
  const selectedSnapshot=snapshots.find(r=>r.record_key===scope);
  const computed={};
  const invalid={};
  for(const r of costs)if(forecast[r.id]){
    try{computed[r.id]=previewForecast(r,forecast[r.id].input);}catch(error){invalid[r.id]=error.message;}
  }
  const forecastRows=costs.map(r=>{
    const v=computed[r.id], f=forecast[r.id]?.input;
    return {id:r.id,updatedAt:r.updated_at,code:r.cost_code,label:r.description,budget:executionBudget(r),
      actual:optional(r.actual_cost_amount),original:baselineLines.get(r.id)?.original??null,
      monthly:v?.monthly??costMonthly(r),final:v?.final??costFinal(r),unposted:v?.final!=null?Number(f.unposted||0):null,
      future:v?.future??null,hours:v?.hours??null,rate:v?.hours!=null?Number(f.rate):null,basis:v?.final!=null?f.mode:null,input:v?f:null};
  });
  const covered=forecastRows.filter(r=>r.final!=null).length;
  const jobTitle=[job.job_number,job.name||job.job_name].filter(Boolean).join(' · ');
  const preview={title:jobTitle,asOf,cutoff,contract,billed,baselineSource:baseline?.source,
    lines:forecastRows,baselineOnly:[...baselineLines.values()].filter(r=>r.category!=='ohp_fee'&&!costs.some(c=>c.id===r.id)),
    revenue:revPlan.map(r=>({month:r.record_key,...r.payload})),
    totals:{budget,actual,covered,final:covered?sum(forecastRows,r=>r.final):null}};
  const reportData=selectedSnapshot?.payload??preview;
  function download() {
    if(!selectedSnapshot&&(waiting||issues||Object.keys(invalid).length))return;
    const url=URL.createObjectURL(new Blob(['\ufeff',buildForecastCsv(reportData,reports)],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`HQ-Financials-${String(job.job_number||'Job').replace(/[^a-z0-9_-]/gi,'-')}-${reportData.asOf}.csv`;
    a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const selectedCost=costs.find(r=>r.id===source);
  const forecastEntry=selectedCost?(forecast[selectedCost.id]?.input??emptyPreview(selectedCost)):null;
  const draftCost=lines?.find(r=>r.id===draft?.id);
  const editForecast=(key,value)=>setForecast(s=>({...s,[selectedCost.id]:
    {version:s[selectedCost.id]?.version??selectedCost.updated_at,input:{...forecastEntry,[key]:value}}}));
  const saveForecast=()=>run(async()=>{
    if(Object.keys(invalid).length)throw new Error('Resolve flagged forecast inputs before saving.');
    const patches=buildForecastPatches(costs,Object.fromEntries(Object.entries(forecast).map(([id,r])=>[id,{version:r.version,input:computed[id]?.input}])));
    if(!patches.length)throw new Error('No saved forecast amounts would change.');
    await onSaveBudget(patches);
    setForecast({});setSource('');
  },'Shared monthly and completion dollar totals saved. Input details were not retained.');
  const openLegacy=()=>leave(onLegacy);
  const overviewButton=(target,label)=> <Button onClick={()=>navigate(target)}>{label}</Button>;
  const field=(key,label,props={})=><Field label={label} value={draft?.[key]??''} onChange={e=>setDraft({...draft,[key]:e.target.value})} {...props}/>;
  const confirmSave=(question,action,message)=>{if(window.confirm(question))run(action,message);};

  let salePreview=null,saleError='';
  if(draft?.kind==='sales'){
    try{
      const withOverrides=Object.fromEntries(Object.entries(draft.overrides).filter(([,v])=>v!=='').map(([id,v])=>[id,amounts(v,'fee percentage',{max:100})]));
      salePreview=salesPlan(draft.rows,amounts(draft.fee,'total fee',{signed:true}),withOverrides,draft.pinned);
    }catch(error){saleError=error.message;}
  }
  const saleDefault=()=> {
    const pinned=new Map(sales?.lines?.map(r=>[r.id,r.fee])??[]);
    setDraft({kind:'sales',fee:String(sales?.fee??currentFee),
      overrides:Object.fromEntries(Object.entries(sales?.overrides??{}).map(([k,v])=>[k,String(v)])),pinned:sales?pinned:null,
      rows:costs.map(r=>{
        const labor=records[`labor:${r.id}`]?.payload;
        const old=salesLines.get(r.id);
        const unlocked=labor && !labor.salesLock && labor.planned!=null && labor.salesRate!=null;
        return {id:r.id,code:r.cost_code,label:r.description,cost:unlocked?labor.planned*labor.salesRate:old?.cost??executionBudget(r)};
      })});
  };
  const saleRows=salePreview?.lines??(draft?.kind==='sales'?draft.rows:sales?.lines??[]);
  const updateSales=(change)=>setDraft(s=>({...s,...change,pinned:s.pinned??new Map(salePreview?.lines?.map(r=>[r.id,r.fee])??[])}));
  const saveLabor=()=>run(async()=>{
    const payload=Object.fromEntries(['planned','used','salesRate','executionRate'].map(key=>[key,blankNum(draft[key],key,{max:9999999.99})]));
    payload.salesLock=!!draft.salesLock;payload.executionLock=!!draft.executionLock;
    await record('labor',draftCost.id,payload);
    setDraft(null);
  },'Labor planning saved. Open Sales Budget or review the execution target to apply rate-driven updates.');
  const saveBudgetDraft=()=>run(async()=>{
    if(!draftCost || draft.version!==draftCost.updated_at)throw new Error('This line changed. Reopen the editor and review the latest values.');
    const amount=blankNum(draft.amount,'working budget amount',{signed:true});
    await onSaveBudget([{id:draft.id,expected_updated_at:draft.version,current_budget_override_amount:amount}]);
    setDraft(null);
  },'Working budget saved. Original budget and billing were not changed.');

  return <section className="fin2" aria-label="Financials V2">
    <header className="fin2-heading"><div><span className="eyebrow">Jobs / Financials · Staging</span><h2>Financials V2</h2><p>{jobTitle}</p></div>
      <Button disabled={busy} onClick={openLegacy}>Open Legacy Financials</Button>
    </header>
    <nav aria-label="Financials V2 sections" className="fin2-nav">{SECTIONS.map(([key,title])=><Button key={key} disabled={busy} aria-current={view===key?'page':undefined} onClick={()=>navigate(key)}>{title}</Button>)}</nav>
    {waiting&&<p role="status">Loading job records…</p>}
    {issues&&<p role="alert">Some job records could not be loaded. Unavailable amounts are shown as blank.</p>}
    {recordState.loading&&<p role="status">Loading saved V2 plans…</p>}
    {recordState.error&&<p role="alert">V2 plans could not load. <Button onClick={()=>setReload(k=>k+1)}>Retry</Button></p>}
    {notice&&<p className="fin2-notice" role={notice.error?'alert':'status'}>{notice.text}</p>}
    {!canSeeProtected&&<p className="muted-copy">Protected budgets and reports aren’t available to your role. Existing job and billing permissions still apply.</p>}
    {view==='overview'&&<>
      <Panel title="One job, one financial record" sub="Use the totals here to orient yourself. Open the individual workspaces when you need to change something. Switching to Legacy never changes the job data.">
        <div className="fin2-metrics">
          <Metric title="Original contract" value={money(contract.original)} detail={original?.source??'Record the amount from the signed agreement'}/>
          <Metric title="Approved changes" value={money(contract.approved)} detail={`${contract.count} current approved orders and credits`}/>
          <Metric title="Current contract" value={money(contract.current)} detail="Original contract + approved changes"/>
          <Metric title="Execution budget" value={money(budget)} detail="Excludes fee and separate CO price postings"/>
          <Metric title="Posted costs" value={money(actual)} detail="Costs already reported in HQ"/>
          <Metric title="Budget remaining" value={money(difference(budget,actual))} detail="Execution budget − posted costs"/>
          <Metric title="Sales budget" value={money(sales?sum(sales.lines,r=>r.sales):null)} detail="Saved internal distribution"/>
          <Metric title="Allocated SOV" value={money(contract.allocated)} detail={contract.unallocated==null?'Billing allocation, not original contract':`${money(Math.abs(contract.unallocated))} ${contract.unallocated<0?'over contract':'not allocated'}`}/>
          <Metric title="Billed to date" value={money(billed)} detail="Issued billing, not cash collected"/>
          <Metric title="Saved completion forecast" value={money(preview.totals.final)} detail={`${covered} of ${costs.length} cost lines recorded`}/>
        </div><div className="fin2-actions">{overviewButton('detail','Build or review budget')}{overviewButton('sov','Review billing')}{overviewButton('forecast','Open forecasts')}</div>
      </Panel>
      {canSeeProtected&&<Panel title="Signed contract" sub="Use the signed agreement, not the estimate, SOV or cost report. Corrections create a new audited revision.">
        {original&&<p><strong>{money(original.amount)}</strong> · {original.source}</p>}
        {draft?.kind!=='contract'?<Button disabled={!canWrite} onClick={()=>setDraft({kind:'contract',amount:original?.amount??'',source:original?.source??'',reason:''})}>{original?'Correct contract record':'Record original contract'}</Button>:<form className="fin2-form" onSubmit={e=>{e.preventDefault();confirmSave('Record this as the amount on the original signed agreement?',async()=>{await record('contract','job',{amount:amounts(draft.amount,'contract amount'),source:draft.source.trim(),reason:draft.reason.trim()});setDraft(null);},'Signed contract recorded.');}}>
          {field('amount','Original signed amount',{required:true})}{field('source','Signed document reference',{mode:'text',required:true,minLength:3,maxLength:300})}{original&&field('reason','Reason for correction',{mode:'text',required:true,minLength:3,maxLength:500})}
          <div className="fin2-actions"><button className="primary-button" disabled={!canWrite}>Confirm signed contract</button><Button onClick={()=>setDraft(null)}>Cancel</Button></div>
        </form>}
      </Panel>}
    </>}

    {view==='detail'&&<Panel title="Detailed budget & original baseline" sub="Keep a locked reference to the opening budget without freezing the working plan. Material and quote lines can carry through as-is or be edited in the working plan. No workflow or markup rate is mandatory.">
      <div className="fin2-actions"><Button onClick={onViewEstimate}>View attached estimates</Button><Button onClick={openLegacy}>Budget tools & cost-report import (Legacy)</Button></div>
      {canSeeProtected&&(baseline?<p>Original budget locked · {baseline.source} · {money(sum(baseline.lines,r=>r.original))}</p>:
        <form className="fin2-form" onSubmit={e=>{e.preventDefault();confirmSave('Lock the existing original budget values as a comparison baseline? Working values will stay editable.',()=>record('baseline','job',{source:source.trim()}),'Original budget baseline locked.');}}>
          <Field label="Baseline reference (estimate number or document)" mode="text" value={source} onChange={e=>setSource(e.target.value)} required minLength={3} maxLength={300}/><button className="primary-button" disabled={!canWrite||!lines?.length}>Lock original budget baseline</button>
        </form>)}
      {draft?.kind==='budget'&&draftCost&&<form className="fin2-form" onSubmit={e=>{e.preventDefault();saveBudgetDraft();}}>
        <strong>{labelOf(draftCost)}</strong>{field('amount','Working budget override ($) · blank clears override')}
        <div className="fin2-actions"><button className="primary-button" disabled={!canManage||busy}>Save working budget</button><Button onClick={()=>setDraft(null)}>Cancel</Button></div>
      </form>}
      <Grid label="Detailed budget" columns={['Cost code / line','Original budget','Locked baseline','Working budget','Posted costs','Remaining','Action']} rows={(lines??[]).map(r=>[r.id,labelOf(r),money(r.budget_amount),money(baselineLines.get(r.id)?.original),money(r.currentBudget),money(r.actual_cost_amount),money(difference(r.currentBudget,r.actual_cost_amount)),
        <Button disabled={!canManage||busy||Boolean(draft)||!r.updated_at} onClick={()=>setDraft({kind:'budget',id:r.id,version:r.updated_at,amount:r.current_budget_override_amount??''})}>Edit</Button>])}/>
    </Panel>}

    {view==='sales'&&<Panel title="Sales budget" sub="Internal sales allocation, not customer billing. Spread OH&P across the work, or override individual percentages. Changes do not alter the signed price or the SOV.">
      {canSeeProtected&&<>
        {!draft&&<Button primary disabled={!canWrite||!costs.length} onClick={saleDefault}>{sales?'Edit sales allocation':'Start sales allocation'}</Button>}
        {draft?.kind==='sales'&&<>
          <div className="fin2-form">
            <Field label="Total OH&P to distribute ($)" value={draft.fee} onChange={e=>updateSales({fee:e.target.value})}/>
            <Field label="Optional markup on working cost (%)" value={draft.markup??''} onChange={e=>setDraft({...draft,markup:e.target.value})}/>
            <Button disabled={busy||!draft.markup} onClick={()=>{try{updateSales({fee:String(Math.round(sum(draft.rows,r=>r.cost)*amounts(draft.markup,'markup percent',{max:1000}))/100)});}catch(e){setNotice({error:true,text:e.message});}}}>Use markup to set fee</Button>
          </div>
          <div className="fin2-actions"><Button onClick={()=>setDraft({...draft,pinned:null})}>Recalculate unedited fee shares</Button>
            <Button primary disabled={!canWrite||!salePreview||(salePreview.fee>=0?salePreview.unallocated<0:salePreview.unallocated>0)} onClick={()=>run(async()=>{await record('sales','job',salePreview);setDraft(null);},'Sales allocation saved without changing billing or the contract.')}>Save sales allocation</Button>
            <Button onClick={()=>setDraft(null)}>Cancel</Button>
          </div>
          <p className="muted-copy">Other shares stay unchanged when you edit a percentage. Recalculate distributes only the remainder across lines without an override.</p>
        </>}
        {saleError&&<p role="alert">{saleError}</p>}
        {(salePreview??sales)&&<div className="fin2-metrics">
          <Metric title="Fee not allocated" value={money((salePreview??sales).unallocated)} detail="A negative balance must be corrected before saving"/>
          <Metric title="Distributed sales total" value={money(sum(saleRows,r=>r.sales))} detail="Check against the original contract; COs are separate"/>
          <Metric title="Difference from original contract" value={money(difference(contract.original,sum(saleRows,r=>r.sales)))} detail="Positive means below the original signed price"/>
        </div>}
        <Grid label="Sales budget allocation" columns={['Work line','Sales basis before fee','Fee override %','Allocated fee','Sales value']} rows={saleRows.map(r=>[r.id,[r.code,r.label].filter(Boolean).join(' · '),
          draft?.kind==='sales'?<Field label={`Sales basis · ${r.code||r.label}`} defaultValue={r.cost} onBlur={e=>{try{updateSales({rows:draft.rows.map(row=>row.id===r.id?{...row,cost:amounts(e.target.value,'sales basis',{signed:true})}:row)});setNotice(null);}catch(err){e.target.value=r.cost;setNotice({error:true,text:err.message});}}}/>:money(r.cost),
          draft?.kind==='sales'?<Field label={`Fee override · ${r.code||r.label}`} value={draft.overrides[r.id]??''} placeholder="Proportional" onChange={e=>updateSales({overrides:{...draft.overrides,[r.id]:e.target.value}})}/>:shown(sales?.overrides?.[r.id]),money(r.fee),money(r.sales)])}/>
      </>}
    </Panel>}

    {view==='execution'&&<Panel title="Execution budget" sub="Track cost targets, posted actuals and remaining labor. Sales values are reference only. Planned and used hours are explicit inputs, never inferred from actual dollars.">
      {draftCost&&draft?.kind==='labor'&&<form className="fin2-form" onSubmit={e=>{e.preventDefault();saveLabor();}}>
        <strong>{labelOf(draftCost)}</strong>
        {field('planned','Planned labor hours')}{field('used','Hours used (posted or verified)')}{field('salesRate','Sales labor rate ($/hr)')}{field('executionRate','Execution cost rate ($/hr)')}
        <label><input type="checkbox" checked={Boolean(draft.salesLock)} onChange={e=>setDraft({...draft,salesLock:e.target.checked})}/> Keep saved Sales basis when hours change</label>
        <label><input type="checkbox" checked={Boolean(draft.executionLock)} onChange={e=>setDraft({...draft,executionLock:e.target.checked})}/> Keep current execution budget instead of applying hours × rate</label>
        <div className="fin2-actions"><button disabled={!canWrite} className="primary-button">Save labor inputs</button><Button onClick={()=>setDraft(null)}>Cancel</Button></div>
      </form>}
      <Grid label="Execution cost and hours by line" columns={['Cost line','Budgeted cost','Posted cost','Cost remaining','Sales value','Planned / used / left hrs','Sales / execution rate','Labor action']} rows={costs.map(r=>{
        const labor=records[`labor:${r.id}`]?.payload;
        const target=labor?.planned!=null&&labor.executionRate!=null?Math.round(labor.planned*labor.executionRate*100)/100:null;
        return [r.id,labelOf(r),money(executionBudget(r)),money(r.actual_cost_amount),money(difference(executionBudget(r),r.actual_cost_amount)),money(salesLines.get(r.id)?.sales),
          labor?`${shown(labor.planned)} / ${shown(labor.used)} / ${shown(difference(labor.planned,labor.used))}`:'—',
          labor?`${money(labor.salesRate)} / ${money(labor.executionRate)}`:'—',
          r.category==='labor'&&canSeeProtected?<div className="fin2-actions"><Button disabled={!canWrite||Boolean(draft)} onClick={()=>setDraft({kind:'labor',id:r.id,...labor})}>Edit hours & rates</Button>
            {target!=null&&!labor.executionLock&&difference(target,executionBudget(r))!==0&&<Button disabled={!canWrite||Boolean(draft)} onClick={()=>confirmSave(`Apply ${money(target)} (planned hours × execution rate) to ${labelOf(r)}? Original and billing values will not change.`,()=>onSaveBudget([{id:r.id,expected_updated_at:r.updated_at,current_budget_override_amount:target}]),'Execution target updated.')}>Apply {money(target)}</Button>}</div>:'—'];
      })}/>
    </Panel>}

    {view==='sov'&&<>
      <JobSovWorkspace record={records['sov_workspace:job']} divisions={divisions} budget={lines} sov={sov} hasPayHistory={payState.apps.length>0}
        original={contract.original} canWrite={canWrite} busy={busy} waiting={waiting||Boolean(issues)||payState.loading||Boolean(payState.error)} onDirty={setSovDirty}
        onLegacy={()=>onBilling(contract.original)}
        onSave={async (payload)=>{
          let ok=false;
          await run(async()=>{
            const data=await call('save_job_sov_workspace_v2',{p_job_id:job.id,p_expected_revision:records['sov_workspace:job']?.revision??0,p_payload:payload,p_publish:false});
            const row=Array.isArray(data)?data[0]:data;if(!row?.id)throw new Error('SOV save response was incomplete. Refresh before retrying.');
            setRecordState(x=>({...x,records:[...x.records.filter(r=>r.kind!=='sov_workspace'),row]}));ok=true;
          },'Saved the rebuilt SOV. Billing history was not changed.');return ok;
        }}
        onPublish={()=>run(async()=>{
          const old=records['sov_workspace:job'];
          const data=await call('save_job_sov_workspace_v2',{p_job_id:job.id,p_expected_revision:old.revision,p_payload:old.payload,p_publish:true});
          const row=Array.isArray(data)?data[0]:data;if(!row?.id)throw new Error('SOV response was incomplete. Refresh before retrying.');
          setRecordState(x=>({...x,records:[...x.records.filter(r=>r.kind!=='sov_workspace'),row]}));onSovReload();
        },'Schedule is active for billing. No invoice was issued.')}/>
      <Panel title="Optional collections" sub="An issued bill can be marked paid without changing issued billing, cost, or the revenue forecast. An unmarked bill has no collection status recorded.">
        {payState.loading&&<p role="status">Loading issued bills…</p>}{payState.error&&<p role="alert">Could not load issued bills.</p>}
        {draft?.kind==='receipt'&&<form className="fin2-form" onSubmit={e=>{e.preventDefault();run(async()=>{await record('receipt',draft.id,{paid:draft.paid,date:draft.paid?(draft.date||null):null});setDraft(null);},'Collection status recorded. Issued billing was not changed.');}}>
          <label><input type="checkbox" checked={draft.paid} onChange={e=>setDraft({...draft,paid:e.target.checked})}/> Paid</label>
          {draft.paid&&field('date','Paid date (optional)',{type:'date',max:dateToday()})}
          <div className="fin2-actions"><button className="primary-button" disabled={!canWrite}>Save collection status</button><Button onClick={()=>setDraft(null)}>Cancel</Button></div>
        </form>}
        <Grid label="Issued pay applications" columns={['Issued bill','Gross current billing','Retainage','Collection status','Action']} rows={payState.apps.filter(r=>r.status==='billed').map(r=>{
          const rec=records[`receipt:${r.id}`]?.payload;
          return [r.id,`Pay App #${r.pay_app_number} · ${r.billing_period_end??'No period'}`,money(r.total_current_billed),money(r.retainage_amount),
            !canSeeProtected?'Restricted':rec?.paid?`Paid${rec.date?' · '+rec.date:''}`:'Not recorded',
            canSeeProtected?<Button disabled={!canWrite||Boolean(draft)} onClick={()=>setDraft({kind:'receipt',id:r.id,paid:rec?.paid??true,date:rec?.date??''})}>{rec?.paid?'Edit paid status':'Mark paid'}</Button>:'—'];
        })}/>
      </Panel>
    </>}

    {view==='changes'&&<Panel title="Change orders & credits" sub="The Change Orders tool owns approvals and postings. Approved dollars change the contract once, regardless of budget or SOV allocation. Select an order for its posting detail.">
      <div className="fin2-metrics">
        <Metric title="Approved changes, net" value={money(contract.approved)}/>
        <Metric title="Current contract" value={money(contract.current)}/>
        <Metric title="Contract less allocated SOV" value={money(contract.unallocated)}/>
      </div>
      <div className="fin2-actions"><Button primary onClick={()=>leave(()=>onOpenChange())}>Open Change Orders</Button>
        {changedDivisions.length>0&&<label className="fin2-field"><span>Discipline</span><select value={coDivision} onChange={e=>setCoDivision(e.target.value)}><option value="">All disciplines</option>{changedDivisions.map(d=><option key={d}>{d}</option>)}</select></label>}
      </div>
      <Grid label="Approved change orders" columns={['Order','Discipline','Approved price','Cost-code postings (not added to price)','Review']} rows={shownChanges.map(r=>{
        const posted=postingGroups.get(r.id)??[];
        return [r.id,[r.co_number,r.title].filter(Boolean).join(' · '),r.division||'—',money(r.price_amount),postings==null?'Unavailable':posted.length?<ul>{posted.map(p=><li key={p.id}>{p.cost_code||'Unassigned'} {money(p.amount_delta)}</li>)}</ul>:'No accessible posting',<Button onClick={()=>leave(()=>onOpenChange(r))}>Open</Button>];
      })}/>
    </Panel>}

    {view==='forecast'&&<>
      <Panel title="Monthly and completion forecasts" sub="Monthly is a separate period forecast. Completion is posted actuals plus incurred but unposted cost plus remaining work. Enter only new unposted costs, and don’t double count them when the next job cost report lands.">
        <div className="fin2-form">
          <Field label="Forecast as-of date" type="date" value={asOf} onChange={e=>setAsOf(e.target.value)}/>
          <Field label="Posted cost cutoff / last paycheck (optional)" type="date" max={asOf} value={cutoff} onChange={e=>setCutoff(e.target.value)}/>
          <Button onClick={()=>leave(onQuick)} disabled={!canManage}>Open optional quick worksheet</Button>
        </div>
        <div className="fin2-metrics">
          <Metric title="Monthly forecast" value={money(forecastRows.some(r=>r.monthly!=null)?sum(forecastRows,r=>r.monthly):null)}/>
          <Metric title="At completion" value={money(preview.totals.final)} detail={`${covered} of ${costs.length} cost lines recorded`}/>
          <Metric title="Projected margin" value={covered===costs.length&&covered&&contract.current>0?`${((contract.current-preview.totals.final)/contract.current*100).toFixed(1)}%`:'—'} detail="Requires original signed price and all completion lines"/>
        </div>
        {selectedCost&&forecastEntry&&<fieldset className="fin2-panel fin2-editor" disabled={busy||waiting||Boolean(issues)}>
          <legend>{labelOf(selectedCost)}</legend>
          <div className="fin2-form">
            <Field label="Monthly amount ($)" value={forecastEntry.monthly} onChange={e=>editForecast('monthly',e.target.value)}/>
            <label className="fin2-field"><span>Remaining-work basis</span><select value={forecastEntry.mode} onChange={e=>editForecast('mode',e.target.value)}><option value="crew">Crew days or hours × rate</option><option value="materials">Quotes + allowance</option><option value="dollars">Remaining dollars</option></select></label>
            {forecastEntry.mode==='crew'&&<>
              <Field label="Workers" value={forecastEntry.workers} onChange={e=>editForecast('workers',e.target.value)}/>
              <label className="fin2-field"><span>Duration unit</span><select value={forecastEntry.unit} onChange={e=>editForecast('unit',e.target.value)}><option value="days">Days per worker</option><option value="hours">Hours per worker</option></select></label>
              <Field label={forecastEntry.unit==='days'?'Days per worker':'Hours per worker'} value={forecastEntry.duration} onChange={e=>editForecast('duration',e.target.value)}/>
              {forecastEntry.unit==='days'&&<Field label="Hours per day" value={forecastEntry.dayHours} onChange={e=>editForecast('dayHours',e.target.value)}/>}
              <Field label="Cost per hour ($)" value={forecastEntry.rate} onChange={e=>editForecast('rate',e.target.value)}/>
            </>}
            {forecastEntry.mode==='materials'&&<><Field label="Quoted material remaining ($)" value={forecastEntry.quoted} onChange={e=>editForecast('quoted',e.target.value)}/><Field label="Unquoted allowance ($)" value={forecastEntry.allowance} onChange={e=>editForecast('allowance',e.target.value)}/></>}
            {forecastEntry.mode==='dollars'&&<Field label="Remaining work ($)" value={forecastEntry.remaining} onChange={e=>editForecast('remaining',e.target.value)}/>}
            <Field label="Incurred but unposted ($)" value={forecastEntry.unposted} onChange={e=>editForecast('unposted',e.target.value)}/>
          </div>
          {invalid[selectedCost.id]&&<p role="alert">{invalid[selectedCost.id]}</p>}
          {computed[selectedCost.id]?.final!=null&&<p>{money(selectedCost.actual_cost_amount)} posted + {money(Number(forecastEntry.unposted||0))} unposted + {money(computed[selectedCost.id].future)} remaining = <strong>{money(computed[selectedCost.id].final)}</strong></p>}
          <p className="muted-copy">Blank leaves the saved amount unchanged. Enter 0 when there’s no remaining work.</p>
          <div className="fin2-actions"><Button onClick={()=>setSource('')}>Done editing this line</Button><Button onClick={()=>{setForecast(s=>Object.fromEntries(Object.entries(s).filter(([id])=>id!==selectedCost.id)));setSource('');}}>Discard this line’s edits</Button></div>
        </fieldset>}
        <Grid label="Cost forecasts" columns={['Cost code / line','Execution budget','Posted costs','Incurred unposted','Future work','Monthly','At completion','Action']} rows={forecastRows.map(r=>[r.id,[r.code,r.label].filter(Boolean).join(' · '),money(r.budget),money(r.actual),money(r.unposted),money(r.future),money(r.monthly),money(r.final),
          <Button disabled={!canManage||busy||waiting||Boolean(issues)} onClick={()=>{setSource(r.id);document.querySelector('.fin2-editor')?.scrollIntoView({block:'nearest'});}}>{invalid[r.id]?'Review input':forecast[r.id]?'Review edit':'Edit forecast'}</Button>])}/>
        <div className="fin2-actions">
          <Button disabled={!canManage||busy||waiting||Boolean(issues)||!Object.keys(forecast).length||Boolean(Object.keys(invalid).length)} onClick={saveForecast}>Save shared totals only</Button>
          <Button primary disabled={!canWrite||waiting||Boolean(issues)||!asOf||!costs.length||!covered||Boolean(Object.keys(invalid).length)||cutoff>asOf||snapshots.some(r=>r.record_key===month)} onClick={()=>confirmSave(`Finalize the ${month} forecast and save any edited shared totals? The dated snapshot cannot be overwritten.`,async()=>{
            const patches=buildForecastPatches(costs,Object.fromEntries(Object.entries(forecast).map(([id,r])=>[id,{version:r.version,input:computed[id]?.input}])));
            const data=await call('finalize_job_financial_v2',{p_job_id:job.id,p_month:month,p_snapshot:{...preview,frozen:true},p_patches:patches});
            const saved=Array.isArray(data)?data[0]:data;
            if(!saved?.id)throw new Error('Finalization response was incomplete. Refresh before retrying.');
            setRecordState(s=>({...s,records:[...s.records,saved]}));
            setForecast({});setSource('');setScope(month);if(patches.length)onSaveBudget(null);
          },`Finalized ${month}; the dated forecast is available to export.`)}>Finalize monthly snapshot</Button>
        </div>
        <p className="muted-copy">Saving totals only does not retain the input details. Finalize monthly snapshot to keep dates, assumptions, and the report figures together. Missing completion figures remain blank.</p>
      </Panel>
      <Panel title="Revenue forecast inputs" sub="Expected billing and optional retainage are planned by month. Paid status does not affect the forecast.">
        {canSeeProtected&&<Button disabled={!canWrite||Boolean(draft)} onClick={()=>setDraft({kind:'billing_plan',month,expected:'',retainage:''})}>Add or review planned billing</Button>}
        {draft?.kind==='billing_plan'&&<form className="fin2-form" onSubmit={e=>{e.preventDefault();run(async()=>{
          if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.month))throw new Error('Enter a valid billing month.');
          await record('billing_plan',draft.month,{expected:amounts(draft.expected,'expected billing',{signed:true}),retainage:blankNum(draft.retainage,'planned retainage')});
          setDraft(null);
        },'Planned billing saved. No invoice was issued.');}}>
          {field('month','Billing month',{type:'month',required:true,onChange:e=>{const key=e.target.value,r=records[`billing_plan:${key}`]?.payload;setDraft({...draft,month:key,expected:r?.expected??'',retainage:r?.retainage??''});}})}
          {field('expected','Expected billing ($)',{required:true})}{field('retainage','Retainage ($, optional)')}
          <div className="fin2-actions"><button className="primary-button" disabled={!canWrite}>Save planned billing</button><Button onClick={()=>setDraft(null)}>Cancel</Button></div>
        </form>}
        <Grid label="Expected monthly billing" columns={['Month','Planned billing','Retainage','Planned net','Action']} rows={revPlan.map(r=>[r.id,r.record_key,money(r.payload.expected),money(r.payload.retainage),money(difference(r.payload.expected,r.payload.retainage)),<Button disabled={!canWrite||Boolean(draft)} onClick={()=>setDraft({kind:'billing_plan',month:r.record_key,expected:r.payload.expected,retainage:r.payload.retainage??''})}>Edit</Button>])}/>
      </Panel>
      {canSeeProtected&&<Panel title="Export forecast reports" sub="Choose one or more reports. An export uses the same live preview or finalized snapshot for every selected report.">
        <div className="fin2-form">
          <label className="fin2-field"><span>Report source</span><select value={scope} onChange={e=>setScope(e.target.value)}><option value="">Live / draft preview</option>{snapshots.map(r=><option key={r.id} value={r.record_key}>{r.record_key} finalized</option>)}</select></label>
          {REPORTS.map(([key,label])=><label key={key}><input type="checkbox" checked={reports.includes(key)} onChange={e=>setReports(s=>e.target.checked?[...s,key]:s.filter(r=>r!==key))}/> {label}</label>)}
          <Button primary disabled={!reports.length||(!selectedSnapshot&&(recordState.loading||recordState.error||waiting||Boolean(issues)||!asOf||cutoff>asOf||Boolean(Object.keys(invalid).length)))} onClick={download}>Download selected reports (CSV)</Button>
        </div>
      </Panel>}
    </>}

    {view==='history'&&<Panel title="Financials V2 history" sub="The most recent 50 V2 records. Existing cost, invoice, and change-order history stays in its source tool.">
      {canSeeProtected&&!history&&<p role="status">Loading history…</p>}
      {history?.error&&<p role="alert">Could not load V2 history.</p>}
      <Grid label="V2 history" columns={['Record','Revision','Recorded','Actor','Context']} rows={(history?.rows??[]).map(r=>[`${r.kind}:${r.record_key}:${r.revision}`,r.kind.replaceAll('_',' '),r.revision,new Date(r.created_at).toLocaleString(),r.created_by,r.payload?.reason || r.payload?.source || (r.record_key==='job'?'Job record':r.record_key)])}/>
    </Panel>}
  </section>;
}
