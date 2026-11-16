import {proportionalCents} from './blankSlate.mjs';
import {itemPricing,sumPricing,round} from './pricing.mjs';

// UI preview only. The transaction recalculates from the persisted document.
export function handoffPreview(document){
 const entries=document.entries||[],items=entries.flatMap(e=>e.items||[]);
 const total=sumPricing(items,document),subtotalCents=Math.round(total.subtotal*100),feeCents=Math.round(total.fee*100);
 let cumulative=0,allocated=0,discountCumulative=0,discountAllocated=0;
 const lines=entries.flatMap(entry=>(entry.items||[]).map(item=>{
  const price=itemPricing(item,document);cumulative+=Math.round(price.subtotal*100);
  const next=subtotalCents?(document.blankSlateVersion===1?proportionalCents(feeCents,cumulative,subtotalCents):Math.round(feeCents*cumulative/subtotalCents)):0,fee=(next-allocated)/100;allocated=next;
  discountCumulative+=Math.round(price.subtotal*100)+Math.round(fee*100);
  const discountBase=subtotalCents+feeCents,discountNext=document.blankSlateVersion===1&&discountBase?proportionalCents(Math.round(total.estimateDiscount*100),discountCumulative,discountBase):0;
  const discount=(discountNext-discountAllocated)/100;discountAllocated=discountNext;
  return {key:entry.id+':'+item.id,reference:`${String(entry.number).padStart(3,'0')}.${item.number}`,
   description:item.name,section:entry.section,location:entry.location,material_amount:price.material,
   labor_amount:price.labor,other_amount:price.other,markup_amount:document.blankSlateVersion===1?(Math.round(price.materialMarkup*100)+Math.round(fee*100)-Math.round(discount*100))/100:round(price.materialMarkup+fee),
   fee_amount:fee,...(document.blankSlateVersion===1?{resource_discount:price.resourceDiscount,estimate_discount:discount}:{}),line_total:document.blankSlateVersion===1?(Math.round(price.subtotal*100)+Math.round(fee*100)-Math.round(discount*100))/100:round(price.subtotal+fee)};
 }));
 return {lines,total:total.price,fee:total.fee,chargeError:total.chargeError,hasProposalCharges:!!(Number(document.proposal?.salesTaxPercent)||Number(document.proposal?.creditCardPercent))};
}
export function handoffFinancialBuckets(document){
 const preview=handoffPreview(document),labels={material_amount:'Material',labor_amount:'Labor',other_amount:'Other / quoted cost',markup_amount:'Markup / OH&P'};
 return preview.lines.flatMap(line=>Object.entries(labels).flatMap(([field,label])=>{
  const amount=round(Number(line[field])||0);
  return (amount>0||(document.blankSlateVersion===1&&field==='markup_amount'&&amount<0))?[{key:`${line.key}:${field}`,lineKey:line.key,reference:line.reference,
   description:line.description,section:line.section||'',kind:field,label:document.blankSlateVersion===1&&field==='markup_amount'?'Selling margin / discount adjustment':label,amount}]:[];
 }));
}
export function handoffDestinationState(handoff){
 return {openJobId:handoff.job_id,openTab:handoff.destination==='change_order'?'change_orders':handoff.destination==='job'?'details':'overview',
  ...(handoff.destination==='service_call'?{serviceCallTab:'billing'}:{}),
  ...(handoff.change_order_id?{openChangeOrderId:handoff.change_order_id}:{})};
}
