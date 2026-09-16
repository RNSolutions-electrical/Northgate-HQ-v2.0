import {componentGroups} from './componentStructure.mjs';
import {itemPricing,sumPricing} from './pricing.mjs';
export const invalid=value=>value==null||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<0;
export const issues=item=>item.quoteId?[]:[
 ...(!item.name?.trim()?['Work item name is required']:[]),
 ...(invalid(item.qty)?['Quantity is required']:[]),
 ...(!componentGroups(item).length?['Add a component']:[]),
 ...componentGroups(item).flatMap(c=>[...(!c.name?.trim()?['Component '+c.number+': name missing']:[]),...(!c.lines.length?['Component '+c.number+': add material or labor']:[])]),
 ...(item.lines||[]).flatMap((l,index)=>[...(!l.name?.trim()?['Row '+(index+1)+': description missing']:[]),...['qty','price','hours'].filter(k=>invalid(l[k])).map(k=>'Row '+(index+1)+': '+k+' missing or invalid')]),
 ...(item.laborRateOverride!=null&&invalid(item.laborRateOverride)?['Labor rate override is invalid']:[])
];
export const itemValue=itemPricing;
export function summary(d){const t=sumPricing(d.entries.flatMap(e=>e.items),d);return {...t,gross:t.markup};}
// Stable identities: catalogue ID, or the earliest source resource ID for custom rows.
// Names are deliberately not persistent keys; renaming a resource must not lose tracking.
export function takeoff(d){
 const map=new Map();
 for(const e of d.entries)for(const i of e.items)for(const l of i.lines||[]){
  if(l.unit==='HR'||l.kind==='labor')continue;
  const key=(l.catalogueId?'catalogue:'+l.catalogueId:'resource:'+l.id)+'|'+l.unit;
  const row=map.get(key)||{key,name:l.name,unit:l.unit,qty:0,cost:0,sections:new Set()};
  const qty=Number(l.qty)*(l.fixed?1:Number(i.qty));row.qty+=qty;row.cost+=qty*Number(l.price);row.sections.add(e.section);map.set(key,row);
 }
 return [...map.values()];
}
export function catalogueMissing(m){
 return [...(!m.name?.trim()?['Description']:[]),...(!m.material_code?.trim()||m.catalogue_draft?['Catalogue number']:[]),...(!m.unit?.trim()?['Unit']:[]),...(invalid(m.price)?['Unit cost']:[]),...(invalid(m.hours)?['Labor hours']:[])];
}
