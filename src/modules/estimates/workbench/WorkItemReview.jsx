import React from 'react';
import {money} from './model.mjs';
import {itemPricing} from './pricing.mjs';
import {componentReference} from './references.mjs';

const value = input => input === null || input === undefined || input === '' ? 'Not entered' : String(input);
const currency = input => value(input) === 'Not entered' ? 'Not entered' : money(input);

// Read the current document/snapshot only. Expanding never changes it or marks it dirty.
export function WorkItemReview({item, parent, data}) {
 const pricing = itemPricing(item, data);
 const quote = item.quoteId ? (data.quotes || []).find(row => row.id === item.quoteId) : null;
 return <section className="work-item-review" aria-label={`Verification details for ${item.name}`}>
  <h3>Work item verification</h3>
  <dl className="review-facts">{[
   ['Entry',parent.name],['Location',parent.location],['Section',parent.section],['Drawing / sheet',parent.drawing],
   ['Work item',item.name],['Kind',item.kind],['Quantity',item.qty],['Status',item.status],['Notes',item.notes],
   ['Material cost',money(pricing.material)],['Labor hours',pricing.hours.toFixed(2)],['Labor rate',currency(item.laborRateOverride??data.rate)],
   ['Labor cost',money(pricing.labor)],['Other cost',money(pricing.other)],['Base cost',money(pricing.cost)],
   ['Material markup',`${pricing.materialRate}%${item.materialMarkupOverride != null ? ' (override)' : ' (estimate default)'}`],
   ['Markup amount',money(pricing.materialMarkup)],['Price before estimate fee',money(pricing.price)],
  ].map(([label,content]) => <div key={label}><dt>{label}</dt><dd>{value(content)}</dd></div>)}</dl>
  {quote && <><h3>Vendor quote</h3><dl className="review-facts">{[
   ['Name',quote.name],['Vendor',quote.vendor],['Reference',quote.reference],['Classification',quote.type],
   ['Quoted material',currency(quote.materialAmount)],['Quoted other',currency(quote.otherAmount)],
  ].map(([label,content]) => <div key={label}><dt>{label}</dt><dd>{value(content)}</dd></div>)}</dl></>}
  {item.quoteId && !quote && <p className="missing-warning">The linked quote is not present in this version. Verify the source before editing.</p>}
  <h3>Components ({(item.lines || []).length})</h3>
  {(item.lines || []).map((line,index) => {
   const quantity = Number(line.qty) * (line.fixed ? 1 : Number(item.qty));
   const known = input => input !== null && input !== undefined && input !== '' && Number.isFinite(Number(input));
   const hours = known(line.hours) && known(line.qty) && (line.fixed || known(item.qty)) ? quantity * Number(line.hours) : null;
   return <div className="review-component" key={line.id || index}><small className="component-reference">{componentReference(parent,item,index)}</small><h4>{line.name || 'Unnamed component'}</h4><dl className="review-facts">{[
    ['Stage',line.stage],['Quantity',line.qty],['Unit',line.unit],['Scaling',line.fixed ? 'Fixed total' : 'Per work-item unit'],
    ['Extended quantity',known(line.qty) && (line.fixed || known(item.qty)) ? quantity : null],
    ['Material / unit',currency(line.price)],['Labor hours / unit',line.hours],['Total labor hours',hours === null ? null : hours.toFixed(2)],
    ['Price source',line.priceOverride ? 'Manual override' : 'Saved value'],['Labor source',line.laborOverride ? 'Manual override' : 'Saved value'],
    ['Catalogue reference',line.catalogueId],['Needs review',line.needsReview ? 'Yes' : 'No'],['Notes',line.notes],
   ].map(([label,content]) => <div key={label}><dt>{label}</dt><dd>{value(content)}</dd></div>)}</dl></div>;
  })}
  {!item.lines?.length && <p className="muted">No component lines in this work item.</p>}
 </section>;
}
