import {itemPricing,sumPricing} from './pricing.mjs';
/** Client-facing fields only. Internal notes, component costs and vendors are deliberately excluded. */
export function suggestedScope(document){
 return (document.entries||[]).filter(e=>(e.items||[]).length).map(e=>[
  [...new Set([e.section,e.location,e.name].filter(Boolean))].join(' — '),
  ...e.items.map(i=>`- ${i.quoteId ? e.name : i.name}${!i.quoteId&&i.qty!=null?` (${i.qty} ${Number(i.qty)===1?'unit':'units'})`:''}`),
 ].join('\n')).join('\n\n');
}
export function proposalFields(document){
 return {contact:'',serviceCall:'',proposalDate:'',scopeMode:'letter',scopeGroups:[],showLinePrices:false,siteAddress:document.job?.address||'',introduction:'',scope:suggestedScope(document),inclusions:'',exclusions:'',schedule:'',terms:document.proposalTerms||'',...document.proposal};
}
/** Stable source membership, independent of displayed references or renamed work. */
export function proposalLines(document){
 return (document.entries||[]).flatMap(entry=>(entry.items||[]).map(item=>{
  // Entry headings can contain locations and required safety work. Keep the same
  // customer-facing context as written scope, without exposing quote/vendor names.
  const context=[...new Set([entry.section,entry.location,entry.name].filter(Boolean))];
  const description=item.quoteId?'':`${item.name}${item.qty!=null?` (${item.qty} ${Number(item.qty)===1?'unit':'units'})`:''}`;
  const text=[...context.filter(value=>item.quoteId||value!==item.name),description].filter(Boolean).join(' — ');
  return {key:JSON.stringify([entry.id,item.id]),entry,item,reference:`${String(entry.number).padStart(3,'0')}.${item.number}`,text};
 }));
}
/** Groups never remove uncovered work. Included source descriptions remain customer-visible. */
export function proposalScopeItems(document){
 const fields=proposalFields(document),lines=proposalLines(document),used=new Set(),result=[];
 for(const group of fields.scopeGroups||[]){
  const members=lines.filter(line=>(group.lineKeys||[]).includes(line.key)&&!used.has(line.key));
  if(!members.length)continue;
  members.forEach(line=>used.add(line.key));
  result.push({text:group.text?.trim()||members.map(line=>line.text).join('; '),members,grouped:true});
 }
 for(const line of lines)if(!used.has(line.key))result.push({text:line.text,members:[line],grouped:false});
 return result;
}
/** Allocate the existing selling subtotal in cents; no change to pricing calculations. */
export function proposalScopePrices(document,preTaxTotal){
 const lines=proposalLines(document),pricing=sumPricing(lines.map(line=>line.item),document);
 if(pricing.chargeError)throw new Error(pricing.chargeError);
 if(!Number.isFinite(preTaxTotal)||Math.abs(pricing.preTaxTotal-preTaxTotal)>.005)throw new Error('Scope item prices do not reconcile with the saved proposal subtotal. Use total-only presentation.');
 const result=new Map();let cumulative=0,allocated=0;
 for(const [index,line] of lines.entries()){
  cumulative+=itemPricing(line.item,document).price;
  const next=index===lines.length-1?Math.round(preTaxTotal*100):pricing.subtotal?Math.round(cumulative/pricing.subtotal*preTaxTotal*100):0;
  result.set(line.key,(next-allocated)/100);allocated=next;
 }
 return result;
}
/** Resolve job defaults only for editable drafts; an intentional blank is preserved. */
export function proposalWithJob(document,job){
 if(document.approvedAt||!job?.address||Object.hasOwn(document.proposal||{},'siteAddress'))return document;
 return {...document,proposal:{...proposalFields(document),siteAddress:job.address}};
}
