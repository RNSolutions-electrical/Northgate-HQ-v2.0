import React from 'react';
import {defaults,sumPricing,sectionPricing,hasOverride} from './pricing.mjs';
import {money} from './model.mjs';
export function PricingOverview({data,onDefaults,onReview,onSection}){
 const d=defaults(data),p=sumPricing(data.entries.flatMap(e=>e.items),data);
 const overrides=data.entries.flatMap(e=>e.items).filter(hasOverride);
 return <section className="pricing-overview"><div className="section-heading"><h2>OH&amp;P / selling price</h2>{overrides.length>0&&<button onClick={onReview}>Review overrides ({overrides.length})</button>}</div>
 <form className="baseline-form" onSubmit={e=>{e.preventDefault();const values=new FormData(e.target);onDefaults(Number(values.get('material')),Number(values.get('fee')));}}>
 <label>Material-only markup %<input name="material" type="number" required min="0" max="1000" step="any" defaultValue={d.material}/></label><label>Fee %<input name="fee" type="number" required min="0" max="1000" step="any" defaultValue={d.fee}/></label><button className="primary">Apply defaults</button></form>
 <div className="metrics"><span>Base cost<strong>{money(p.cost)}</strong></span><span>Material markup · baseline {d.material}%<strong>{money(p.materialMarkup)}</strong></span><span>Fee · {d.fee}%<strong>{money(p.fee)}</strong></span><span>Total estimate price<strong>{money(p.price)}</strong></span></div>
 <p className="dialog-note">Material markup applies to individual costs. The fee applies once to the combined subtotal. Totals include material overrides; OH&P is not net profit.</p>
 <div className="metrics"><span>Combined OH&amp;P<strong>{money(p.markup)}</strong></span><span>OH&amp;P / selling price<strong>{p.margin.toFixed(2)}%</strong></span></div>
 <div className="section-heading"><h3>Section pricing</h3></div>
 <div className="section-prices heading"><span>SECTION</span><span>COST</span><span>MATERIAL MARKUP</span><span>SUBTOTAL BEFORE FEE</span></div>
 {sectionPricing(data.entries,data).map(s=><div className="section-prices" key={s.section}><button className="text-link" onClick={()=>onSection(s.section)}>{s.section}</button><span data-label="Cost">{money(s.cost)}</span><span data-label="Material markup">{money(s.materialMarkup)}</span><strong data-label="Subtotal before fee">{money(s.price)}</strong></div>)}
 </section>;
}
