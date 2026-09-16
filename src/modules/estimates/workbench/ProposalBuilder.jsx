import React from 'react';
import {Download,Save} from 'lucide-react';
import {proposalFields} from './proposal.mjs';

export function ProposalBuilder({data,locked,approved,busy,onChange,onPreview,onSave,onRefreshScope,associatedJob}){
 const fields=proposalFields(data);
 if(!approved&&!Object.hasOwn(data.proposal||{},'siteAddress')&&associatedJob?.address)fields.siteAddress=associatedJob.address;
 return <section className="proposal-builder">
  <div className="section-heading"><div><h2>Proposal builder</h2><p className="muted">Customer-facing scope and terms only. Internal costs, markup, vendor pricing and work-item notes are not exported.</p></div></div>
  {locked&&<p className="dialog-note">{approved?'This is the approved snapshot. Create a revision to change the proposal.':'Estimate editing permission is required to change this draft.'}</p>}
  <div className="actions">{!locked&&<button className="primary" disabled={busy} onClick={onSave}><Save size={16}/> Save proposal</button>}<button disabled={busy} onClick={onPreview}><Download size={16}/>{approved?'Download approved proposal':'Preview draft PDF'}</button></div>
  <p className="muted">Save proposal saves the whole current estimate draft. It does not submit or approve it. Blank sections are omitted from the PDF.</p>
  <fieldset disabled={locked||busy} className="proposal-fields">
   <label>Contact / attention<input value={fields.contact} onChange={e=>onChange({...fields,contact:e.target.value})}/></label>
   <label>Project address<input value={fields.siteAddress} onChange={e=>onChange({...fields,siteAddress:e.target.value})}/></label>
   <label className="wide">Introduction<textarea aria-label="Introduction" rows={3} value={fields.introduction} onChange={e=>onChange({...fields,introduction:e.target.value})}/></label>
   <div className="wide section-heading"><h3>Scope of work</h3><button type="button" onClick={onRefreshScope}>Use work items as starting scope</button></div>
   <label className="wide">Customer-facing scope<textarea aria-label="Customer-facing scope" rows={10} value={fields.scope} onChange={e=>onChange({...fields,scope:e.target.value})}/></label>
   {[['inclusions','Included'],['exclusions','Exclusions'],['schedule','Schedule'],['terms','Terms and conditions']].map(([key,label])=><label key={key}>{label}<textarea aria-label={label} rows={5} value={fields[key]} onChange={e=>onChange({...fields,[key]:e.target.value})}/></label>)}
  </fieldset>
  <div className="actions">{!locked&&<button className="primary" disabled={busy} onClick={onSave}><Save size={16}/> Save proposal</button>}<button disabled={busy} onClick={onPreview}><Download size={16}/>{approved?'Download approved proposal':'Preview draft PDF'}</button></div>
 </section>;
}
