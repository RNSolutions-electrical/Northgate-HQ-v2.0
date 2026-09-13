import React from 'react';
import {RotateCcw} from 'lucide-react';
import {defaults,hasOverride,itemPricing} from './pricing.mjs';
import {money} from './model.mjs';
export function MarkupControls({item,data,onChange}){
 const rates=defaults(data),p=itemPricing(item,data);
 return <section className="markup-controls"><h3>Material markup</h3><div className="markup-fields">
 {['material'].map(key=>{const field=key+'MarkupOverride',overridden=item[field]!=null;return <div key={key}><label>{key==='material'?'Material markup %':'Overall markup %'}<input type="number" min="0" max="1000" step="any" required value={item[field]??rates[key]} onChange={e=>onChange(field,e.target.value)}/></label><div className="markup-source"><small>{overridden?'Manual override':`Estimate default: ${rates[key]}%`}</small>{overridden&&<button type="button" aria-label={`Reset ${key} markup`} title="Use estimate default" onClick={()=>onChange(field,null)}><RotateCcw size={15}/></button>}</div></div>;})}
 </div><div className="metrics"><span>Cost <strong>{money(p.cost)}</strong></span><span>Material markup <strong>{money(p.materialMarkup)}</strong></span><span>Subtotal before fee <strong>{money(p.price)}</strong></span></div></section>;
}
