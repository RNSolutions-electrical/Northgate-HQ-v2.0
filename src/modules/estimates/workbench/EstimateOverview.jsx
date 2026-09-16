import React from 'react';
import {money} from './model.mjs';
import {sumPricing,entryPricing} from './pricing.mjs';
import {proposalFields} from './proposal.mjs';
export default function EstimateOverview({data,locked,onChange,onPricing,onChecklist,missingChecklist,onOpenJob,job}){
 const p=sumPricing(data.entries.flatMap(e=>e.items),data),proposal=proposalFields(data);
 const awarded=data.entries.flatMap(e=>e.items).filter(i=>i.quoteId).map(i=>data.quotes.find(q=>q.id===i.quoteId)).filter(Boolean).reduce((n,q)=>n+Number(q.materialAmount||0)+Number(q.otherAmount||0),0);
 const set=(key,value)=>onChange(d=>({...d,[key]:value}));
 return <>
 <button className={'checklist-banner '+(missingChecklist.length?'needs-review':'ready')} onClick={onChecklist}><span>Finalization checklist<small>{missingChecklist.length?missingChecklist.length+' considerations need attention':'Complete'}</small></span><span>Review checklist →</span></button>
 <div className="overview-grid">
  <section><h3>Project overview</h3><fieldset disabled={locked} className="overview-fields">
   <label>Estimate name<input value={data.name} onChange={e=>set('name',e.target.value)}/></label>
   <label>Customer<input value={data.customer||''} onChange={e=>set('customer',e.target.value)}/></label>
   <label>Labor rate / hour<input type="number" min="0" step="any" value={data.rate} onChange={e=>set('rate',e.target.value)}/></label>
   <div className="resource-fields"><label>Material markup %<input type="number" min="0" step="any" value={data.materialMarkup??30} onChange={e=>set('materialMarkup',e.target.value)}/></label><label>Fee %<input type="number" min="0" step="any" value={data.feePercent??data.overallMarkup??30} onChange={e=>set('feePercent',e.target.value)}/></label></div>
   <label>Scope<textarea rows={5} value={proposal.scope} onChange={e=>set('proposal',{...proposal,scope:e.target.value})}/></label>
  </fieldset>{job&&<button onClick={onOpenJob}>Open associated job: {job.name||job.number||'Job'}</button>}</section>
  <section className="cost-summary"><h3>Base cost summary</h3><dl>
   <div><dt>Material</dt><dd>{money(p.material)}</dd></div><div><dt>Labor · {p.hours.toFixed(2)} hours</dt><dd>{money(p.labor)}</dd></div>
   <div><dt>Other costs</dt><dd>{money(p.other)}</dd></div><div><dt>Quotes received</dt><dd>{data.quotes.filter(q=>!q.archivedAt).length}</dd></div><div><dt>Awarded quote value · included above</dt><dd>{money(awarded)}</dd></div>
   <div><dt>Total base cost</dt><dd>{money(p.cost)}</dd></div><div><dt>Estimated gross profit</dt><dd>{money(p.markup)} · {p.margin.toFixed(2)}%</dd></div>
   <div className="total"><dt>Proposal total</dt><dd>{money(p.price)}</dd></div></dl><p className="muted">Based on entered direct costs. Not net profit; no unentered overhead or taxes assumed.</p><button className="primary" onClick={()=>onPricing()}>Open pricing</button>
  </section>
 </div>
 <details className="workspace-sections"><summary>Sections · {data.sections.length}</summary><div className="sections-list">{data.sections.map(s=>{const amount=data.entries.filter(e=>e.section===s).reduce((n,e)=>n+entryPricing(e,data).price,0);return <button className={amount?'has-value':''} key={s} onClick={()=>onPricing(s)}><span>{s}</span><strong>{money(amount)}</strong></button>;})}</div></details>
 </>;
}
