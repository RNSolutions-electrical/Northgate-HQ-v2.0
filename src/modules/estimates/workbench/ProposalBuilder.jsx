import React from 'react';
import {Eye,Save} from 'lucide-react';
import {proposalFields} from './proposal.mjs';
import {sumPricing} from './pricing.mjs';
import {money} from './model.mjs';
import ProposalScopeEditor from './ProposalScopeEditor.jsx';

export function ProposalBuilder({data,locked,approved,busy,onChange,onPreview,onSave,onRefreshScope,associatedJob,approvedPricingTotal}){
 const fields=proposalFields(data);
 const computed=sumPricing((data.entries||[]).flatMap(e=>e.items||[]),data);
 const pricing=approved&&data.proposalChargeSnapshot?data.proposalChargeSnapshot:computed;
 const displayedTotal=approved&&approvedPricingTotal!=null?approvedPricingTotal:pricing.price;
 if(!approved&&!Object.hasOwn(data.proposal||{},'siteAddress')&&associatedJob?.address)fields.siteAddress=associatedJob.address;
 return <section className="proposal-builder">
  <div className="section-heading"><div><h2>Proposal builder</h2><p className="muted">Customer-facing scope and terms only. Internal costs, markup, vendor pricing and work-item notes are not exported.</p></div></div>
  {locked&&<p className="dialog-note">{approved?'This is the approved snapshot. Create a revision to change the proposal.':'Estimate editing permission is required to change this draft.'}</p>}
  <div className="actions">{!locked&&<button className="primary" disabled={busy} onClick={onSave}><Save size={16}/> Save proposal</button>}<button disabled={busy} onClick={()=>onPreview()}><Eye size={16}/>Export Proposal</button>{approved&&fields.showLinePrices&&<button disabled={busy} onClick={()=>onPreview({totalOnly:true})}>Export Proposal (total only)</button>}</div>
  {approved&&fields.showLinePrices&&<p className="muted">Total-only preview keeps the approved scope and total unchanged. Use it if item prices cannot reconcile with the saved subtotal.</p>}
  <p className="muted">Save proposal saves the whole current estimate draft. It does not submit or approve it. Blank sections are omitted from the PDF.</p>
  <fieldset disabled={locked||busy} className="proposal-fields">
   <label>Sales tax %<input aria-label="Sales tax %" type="number" min="0" max="100" step="0.0001" value={fields.salesTaxPercent??0} onChange={e=>onChange({...fields,salesTaxPercent:e.target.value})}/></label>
   <label>Credit card fee %<input aria-label="Credit card fee %" type="number" min="0" max="100" step="0.0001" value={fields.creditCardPercent??0} onChange={e=>onChange({...fields,creditCardPercent:e.target.value})}/></label>
   <p className="wide muted">Zero adds no charge. Sales tax applies to the full selling subtotal including markup and fee. The credit card fee applies to that subtotal plus tax. Both charges round to cents separately.</p>
   {pricing.chargeError&&<p className="wide" role="alert">{pricing.chargeError}</p>}
   <dl className="wide"><div><dt>Subtotal before tax</dt><dd>{money(pricing.preTaxTotal)}</dd></div><div><dt>Sales tax</dt><dd>{money(pricing.salesTax)}</dd></div><div><dt>Credit card fee</dt><dd>{money(pricing.creditCardFee)}</dd></div><div><dt>Proposal total</dt><dd>{pricing.chargeError?'Enter valid percentages':money(displayedTotal)}</dd></div></dl>
   <label>Contact / attention<input value={fields.contact} onChange={e=>onChange({...fields,contact:e.target.value})}/></label>
   <label>Project address<input value={fields.siteAddress} onChange={e=>onChange({...fields,siteAddress:e.target.value})}/></label>
   <label>Proposal date<input type="date" value={fields.proposalDate} onChange={e=>onChange({...fields,proposalDate:e.target.value})}/></label>
   <label>Service-call number (optional)<input value={fields.serviceCall} onChange={e=>onChange({...fields,serviceCall:e.target.value})}/></label>
   <label className="wide">Introduction<textarea aria-label="Introduction" rows={3} value={fields.introduction} onChange={e=>onChange({...fields,introduction:e.target.value})}/></label>
   <div className="wide section-heading"><h3>Scope of work</h3><button type="button" onClick={onRefreshScope}>Use work items as starting scope</button></div>
   <ProposalScopeEditor data={data} fields={fields} onChange={onChange}/>
   {[['inclusions','Included'],['exclusions','Exclusions'],['schedule','Schedule'],['terms','Terms and conditions']].map(([key,label])=><label key={key}>{label}<textarea aria-label={label} rows={5} value={fields[key]} onChange={e=>onChange({...fields,[key]:e.target.value})}/></label>)}
  </fieldset>
  <div className="actions">{!locked&&<button className="primary" disabled={busy} onClick={onSave}><Save size={16}/> Save proposal</button>}<button disabled={busy} onClick={()=>onPreview()}><Eye size={16}/>Export Proposal</button>{approved&&fields.showLinePrices&&<button disabled={busy} onClick={()=>onPreview({totalOnly:true})}>Export Proposal (total only)</button>}</div>
 </section>;
}
