import React from 'react';
import {Download,Save} from 'lucide-react';
import {proposalFields} from './proposal.mjs';
import {sumPricing} from './pricing.mjs';
import {money} from './model.mjs';

export function ProposalBuilder({data,locked,approved,busy,onChange,onPreview,onSave,onRefreshScope,associatedJob}){
 const fields=proposalFields(data);
 const pricing=sumPricing((data.entries||[]).flatMap(e=>e.items||[]),data);
 if(!approved&&!Object.hasOwn(data.proposal||{},'siteAddress')&&associatedJob?.address)fields.siteAddress=associatedJob.address;
 return <section className="proposal-builder">
  <div className="section-heading"><div><h2>Proposal builder</h2><p className="muted">Customer-facing scope and terms only. Internal costs, markup, vendor pricing and work-item notes are not exported.</p></div></div>
  {locked&&<p className="dialog-note">{approved?'This is the approved snapshot. Create a revision to change the proposal.':'Estimate editing permission is required to change this draft.'}</p>}
  <div className="actions">{!locked&&<button className="primary" disabled={busy} onClick={onSave}><Save size={16}/> Save proposal</button>}<button disabled={busy} onClick={onPreview}><Download size={16}/>{approved?'Download approved proposal':'Preview draft PDF'}</button></div>
  <p className="muted">Save proposal saves the whole current estimate draft. It does not submit or approve it. Blank sections are omitted from the PDF.</p>
  <fieldset disabled={locked||busy} className="proposal-fields">
   <label>Sales tax %<input aria-label="Sales tax %" type="number" min="0" max="100" step="0.0001" value={fields.salesTaxPercent??0} onChange={e=>onChange({...fields,salesTaxPercent:e.target.value})}/></label>
   <label>Credit card fee %<input aria-label="Credit card fee %" type="number" min="0" max="100" step="0.0001" value={fields.creditCardPercent??0} onChange={e=>onChange({...fields,creditCardPercent:e.target.value})}/></label>
   <p className="wide muted">Zero adds no charge. Sales tax applies to the full selling subtotal including markup and fee. The credit card fee applies to that subtotal plus tax. Both charges round to cents separately.</p>
   {pricing.chargeError&&<p className="wide" role="alert">{pricing.chargeError}</p>}
   <dl className="wide"><div><dt>Subtotal before tax</dt><dd>{money(pricing.preTaxTotal)}</dd></div><div><dt>Sales tax</dt><dd>{money(pricing.salesTax)}</dd></div><div><dt>Credit card fee</dt><dd>{money(pricing.creditCardFee)}</dd></div><div><dt>Proposal total</dt><dd>{pricing.chargeError?'Enter valid percentages':money(pricing.price)}</dd></div></dl>
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
