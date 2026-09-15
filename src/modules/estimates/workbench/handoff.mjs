import {itemPricing,sumPricing,round} from './pricing.mjs';

// UI preview only. The transaction recalculates from the persisted document.
export function handoffPreview(document){
 const entries=document.entries||[],items=entries.flatMap(e=>e.items||[]);
 const total=sumPricing(items,document),subtotalCents=Math.round(total.subtotal*100),feeCents=Math.round(total.fee*100);
 let cumulative=0,allocated=0;
 const lines=entries.flatMap(entry=>(entry.items||[]).map(item=>{
  const price=itemPricing(item,document);cumulative+=Math.round(price.subtotal*100);
  const next=subtotalCents?Math.round(feeCents*cumulative/subtotalCents):0,fee=(next-allocated)/100;allocated=next;
  return {key:entry.id+':'+item.id,reference:`${String(entry.number).padStart(3,'0')}.${item.number}`,
   description:item.name,section:entry.section,location:entry.location,material_amount:price.material,
   labor_amount:price.labor,other_amount:price.other,markup_amount:round(price.materialMarkup+fee),
   fee_amount:fee,line_total:round(price.subtotal+fee)};
 }));
 return {lines,total:total.price,fee:total.fee};
}
export function handoffDestinationState(handoff){
 return {openJobId:handoff.job_id,openTab:handoff.destination==='change_order'?'change_orders':handoff.destination==='job'?'details':'overview',
  ...(handoff.destination==='service_call'?{serviceCallTab:'billing'}:{}),
  ...(handoff.change_order_id?{openChangeOrderId:handoff.change_order_id}:{})};
}
