import {blankItemPricing,blankResourceMeasure} from './blankSlate.mjs';
import {internalEstimateReview} from './internalEstimateReview.mjs';

const decimal=new Intl.NumberFormat('en-US',{maximumFractionDigits:12});
const numeric=value=>value==null||value===''||!Number.isFinite(Number(value))?'Not recorded':
 (Number(value)!==0&&Math.abs(Number(value))<1e-12)?Number(value).toExponential(5):decimal.format(Number(value));
const showHours=value=>numeric(value)+' hr';
const measure=(line,qty)=>{try{return blankResourceMeasure(line,qty);}catch{return null;}};

export function internalEstimateAudit(document,snapshot,{costs=false,notes=false}={}){
 if(document.blankSlateVersion!==1)throw new Error('Full estimate audit is available for the Default estimating workspace.');
 if(!(document.entries||[]).some(e=>e.items?.length))throw new Error('Add included work before exporting a full estimate audit.');
 const review=internalEstimateReview(document,snapshot,{
  depth:'lines',headingPrices:false,sections:['scope','pricing','materials','labor','quotes',...(costs?['costs']:[]),...(notes?['notes']:[])],
 });
 let zero=0, excluded=0, missing=0;
 const groups=review.groups.map((group,gi)=>({...group,items:group.items.map((item,ii)=>{
  const priced=document.entries[gi].items[ii],quantity=priced.qty;
  const replaced=(priced.blankQuotes||[]).some(q=>q.mode==='replace');
  const authored=priced.lines||[], totals={material:0,labor:0};
  const lines=item.lines.map((line,index)=>{
   if(index>=authored.length)return {...line,resourceGroup:'Quotes and allowances'};
   const resource=authored[index],unit=resource.unit||'unit';
   const isLabor=resource.blankResourceKind==='labor';
   const ext=measure(resource,quantity),baseQuantity=measure({...resource,hours:0},quantity)?.quantity;
   const perWork=measure(resource,1)?.hours;
   const basis=resource.fixed?'Locked total; work quantity does not multiply this line':'Per work unit × '+numeric(quantity)+' work units';
   const rows=[
    'Quantity entered: '+numeric(resource.qty)+' '+unit+' | '+basis,
    'Extended quantity'+(replaced?' (reference only)':'')+': '+(baseQuantity==null?'Not recorded':numeric(baseQuantity)+' '+unit)+(resource.stage?' | Stage: '+resource.stage:''),
    'Labor unit: '+(numeric(resource.hours)==='Not recorded'?'Not recorded':showHours(resource.hours)+' per '+unit)
      +(perWork!=null?(resource.fixed?' | Locked line hours: ':' | Hours per work unit: ')+showHours(perWork):''),
   ];
   if(replaced){
    excluded++;
    rows.push('Calculated line hours (reference only): '+(ext?showHours(ext.hours):'Not recorded')+' | Included: 0 hr; replaced by a quote.');
    if(!ext){missing++;rows.push('Review: quantity or labor basis missing or invalid on this excluded line.');}
   }else{
    totals[isLabor?'labor':'material']+=ext.hours;
    rows.push('Included extended hours: '+numeric(ext.quantity)+' '+unit+' × '+showHours(resource.hours)+' per '+unit+' = '+showHours(ext.hours));
    if(ext.quantity>0&&Number(resource.hours)===0){zero++;rows.push('Review: 0 hr per unit is recorded; confirm whether labor was intended.');}
   }
   if(resource.catalogueId)rows.push('Labor basis source: '+(resource.laborOverride?'Estimate override of catalogue value.':'Saved catalogue value on this estimate.'));
   else if(resource.priceSource==='prototype_snapshot'||resource.prototypeResource)rows.push('Labor basis source: Imported estimate value.');
   else rows.push('Labor basis source: Entered on the estimate; external source not recorded.');
   rows.push(...line.rows.filter(row=>!['Quantity: ','Labor hours per unit: ','Not included in pricing;'].some(prefix=>row.startsWith(prefix))));
   return {...line,rows,resourceGroup:isLabor?'Labor-only resources':'Material resources'};
  });
  const hours=blankItemPricing(priced,document).hours;
  return {...item,rows:[
   ...item.rows.filter(row=>!row.startsWith('Included labor hours: ')),
   'Work-item included labor: '+showHours(hours)+' | On material lines: '+showHours(totals.material)+' | On labor-only lines: '+showHours(totals.labor),
   ...(replaced?['Replacement quote: material quantities and calculated line hours are listed for reference and do not count toward this work item.']:[]),
  ],lines};
 })}));
 return {...review,summaryRows:[
  ...review.summaryRows,
  'Hours use values from this estimate, not live catalogue values. Quote allowances do not supply labor hours.',
  ...(zero?[zero+' included resource line(s) with quantity above zero have 0 hr per unit. Verify whether labor was intended.']:[]),
  ...(excluded?[excluded+' resource line(s) are excluded from the totals because a quote replaces the work-item resources.']:[]),
  ...(missing?[missing+' excluded resource line(s) have a missing or invalid quantity or labor basis.']:[]),
 ],groups};
}
