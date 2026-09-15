export {searchMaterials} from '../../../lib/materialResolver.js';
export const sections = {
  Residential: ['General requirements','Power','Lighting','Panels / distribution','Homeruns','Mechanical equipment','Grounding & bonding','Exterior'],
  Commercial: ['General requirements','Power','Lighting','Panels / distribution','Homeruns','Mechanical equipment','Underground','Generators','Grounding & bonding','Vendor quotes','Subcontractors'],
  Service: ['Troubleshooting','Repairs & replacements','New installations','Equipment & materials','Service charges'],
  Generators: ['Generator equipment','Transfer equipment','Feeders & connections','Site preparation','Controls & accessories','Startup & testing','Permits & coordination'],
  Blank: [],
};
export const statuses=['Not started','In progress','Needs review','Complete','Not applicable'];
export let catalogue=[];
export function setCatalogue(rows){catalogue=rows;}
export const id=()=>crypto.randomUUID();
export const clone=(v)=>structuredClone(v);
export const money=(v)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v);
export function materialLine(key,qty=1,stage='Rough-in'){
 const m=catalogue.find(x=>x.id===key);
 return {id:id(),catalogueId:key,name:m.name,unit:m.unit,qty,price:m.price,hours:m.hours,stage,fixed:false,notes:''};
}
export function totals(item,rate=75){
 return (item.lines||[]).reduce((t,l)=>{
  const quantity=Number(l.qty)*(l.fixed?1:Number(item.qty));
  t.material+=quantity*Number(l.price);t.hours+=quantity*Number(l.hours);
  t.total=t.material+t.hours*rate;return t;
 },{material:0,hours:0,total:0});
}
export function entryTotal(entry,rate){return entry.items.reduce((sum,item)=>sum+totals(item,rate).total,0);}
export function freshItem(template){return {...clone(template),id:id(),status:'Not started',notes:'',lines:template.lines.map(l=>({...clone(l),id:id()}))};}
export function seed(name='New estimate',customer='',template='Commercial'){
 return {name,customer,template,rate:75,materialMarkup:30,feePercent:30,quotes:[],packages:[],priceAlerts:false,sections:clone(sections[template]||[]),library:[],templates:[],entries:[]};
}
export function refreshed(item){
 const next=freshItem(item);
 next.lines=next.lines.map(l=>{const m=catalogue.find(x=>x.id===l.catalogueId);return m?{...l,price:m.price,hours:m.hours,priceOverride:false,laborOverride:false,notes:''}:{...l,needsReview:true,notes:''};});
 return next;
}
export function makeTemplate(state,name,includeItems){
 return {id:id(),name,rate:state.rate,materialMarkup:state.materialMarkup??30,feePercent:state.feePercent??state.overallMarkup??30,sections:clone(state.sections),entries:includeItems?state.entries.filter(e=>!e.packageId).map((e,index)=>({id:id(),number:index+1,location:`Area ${index+1}`,section:e.section,drawing:'',name:'',status:'Not started',items:e.items.filter(i=>!i.quoteId).map(i=>({...clone(i),notes:'',status:'Not started',lines:i.lines.map(l=>({...clone(l),notes:''}))}))})):[]};
}
