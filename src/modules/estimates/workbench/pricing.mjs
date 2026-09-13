import {totals} from './model.mjs';
export const round=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;
export const defaults=data=>({material:Number(data.materialMarkup??30),fee:Number(data.feePercent??data.overallMarkup??30)});
export const hasOverride=item=>item.materialMarkupOverride!=null;
export function itemPricing(item,data){
 const base=totals(item,data.rate);const quote=item.quoteId?(data.quotes||[]).find(q=>q.id===item.quoteId):null;
 const material=round(quote?quote.materialAmount:base.material),labor=round(quote?0:base.hours*data.rate),other=round(quote?quote.otherAmount:0);
 const materialRate=Number(item.materialMarkupOverride??defaults(data).material);
 const cost=round(material+labor+other),materialMarkup=round(material*materialRate/100);
 const price=round(cost+materialMarkup);
 return {material,labor,other,hours:quote?0:base.hours,cost,materialRate,materialMarkup,fee:0,markup:materialMarkup,price,subtotal:price};
}
export function sumPricing(items,data,includeFee=true){
 const result={material:0,labor:0,other:0,hours:0,cost:0,materialMarkup:0,fee:0,markup:0,price:0,subtotal:0};
 for(const item of items){const p=itemPricing(item,data);for(const key of Object.keys(result))result[key]+=p[key];}
 for(const key of Object.keys(result))if(key!=='hours')result[key]=round(result[key]);
 result.fee=includeFee?round(result.subtotal*defaults(data).fee/100):0;
 result.price=round(result.subtotal+result.fee);result.markup=round(result.materialMarkup+result.fee);
 return {...result,margin:result.price?result.markup/result.price*100:0};
}
export const entryPricing=(entry,data)=>sumPricing(entry.items,data,false);
export function sectionPricing(entries,data){return [...new Set(entries.map(e=>e.section))].map(section=>({section,...sumPricing(entries.filter(e=>e.section===section).flatMap(e=>e.items),data,false)}));}
