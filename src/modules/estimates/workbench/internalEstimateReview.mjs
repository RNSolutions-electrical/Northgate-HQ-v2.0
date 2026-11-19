import {money} from './model.mjs';
import {sumPricing} from './pricing.mjs';
import {blankItemPricing} from './blankSlate.mjs';
import {proposalFields,proposalScopeItems} from './proposal.mjs';

const defaults=['scope','pricing','materials','labor','quotes'];
const quoteModes={add:'Included as an addition',replace:'Replaces materials and labor',reference:'Reference only; not included'};
const numeric=new Intl.NumberFormat('en-US',{maximumFractionDigits:6});
const number=value=>Number.isFinite(Number(value))&&value!==null&&value!==undefined&&value!==''?numeric.format(Number(value)):'Not recorded';
const dollars=value=>number(value)==='Not recorded'?'Not recorded':money(Number(value));
const unique=values=>[...new Set(values.filter(Boolean))];

function resourceCounts(items){
 const materials=items.flatMap(item=>item.lines||[]).filter(line=>line.blankResourceKind!=='labor').length;
 const labor=items.flatMap(item=>item.lines||[]).filter(line=>line.blankResourceKind==='labor').length;
 const quotes=items.reduce((n,item)=>n+(item.quoteId?1:(item.blankQuotes||[]).length),0);
 return {materials,labor,quotes};
}
function detailRows(items,doc,include,rollup=false){
 const rows=[];
 const calc=include.has('pricing')||include.has('labor')||include.has('costs')?sumPricing(items,doc,false):null;
 const counts=resourceCounts(items);
 if(include.has('pricing')&&!rollup)rows.push('Selling subtotal before estimate-level charges: '+money(calc.subtotal));
 if(include.has('materials'))rows.push('Material lines: '+number(counts.materials));
 if(include.has('labor'))rows.push('Included labor hours: '+number(calc.hours)+'; additional labor lines: '+number(counts.labor));
 if(include.has('quotes'))rows.push('Quote / allowance entries (including references): '+number(counts.quotes));
 if(include.has('costs'))rows.push('Hard cost: '+money(calc.cost)+' | Materials: '+money(calc.material)+' | Labor: '+money(calc.labor)+' | Quote / other: '+money(calc.other));
 return rows;
}
function adjustment(selection){
 if(!selection||!['percent','amount'].includes(selection.type)||number(selection.value)==='Not recorded')return '';
 return (selection.direction==='addition'?'addition':'discount')+' '+(selection.type==='percent'?number(selection.value)+'%':dollars(selection.value));
}
function itemDetail(item,doc,include){
 const lines=[], quotes=item.blankQuotes||[], replaced=quotes.some(q=>q.mode==='replace')||!!item.quoteId;
 for(const line of item.lines||[]){
  const isLabor=line.blankResourceKind==='labor', showLine=include.has(isLabor?'labor':'materials');
  const note=include.has('notes')&&line.notes;
  if(!showLine&&!note)continue;
  const name=line.name||'Unnamed resource';
  const rows=[];
  if(showLine){
   const qty=Number(line.qty)*(line.fixed?1:Number(item.qty)), recorded=number(line.qty)!=='Not recorded'&&(line.fixed||number(item.qty)!=='Not recorded');
   rows.push('Quantity: '+number(line.qty)+' '+(line.unit||'unit')+(line.fixed?' total (locked)':' per work unit')+' | Extended: '+(recorded?number(qty):'Not recorded')+(line.stage?' | Stage: '+line.stage:''));
   if(replaced)rows.push('Not included in pricing; replaced by a quote.');
   if(include.has('labor'))rows.push('Labor hours per unit: '+number(line.hours)+' | Included hours: '+(replaced?'0':recorded&&number(line.hours)!=='Not recorded'?number(qty*Number(line.hours)):'Not recorded'));
   const amount=doc.blankSlateVersion===1&&!replaced&&(include.has('pricing')||include.has('costs'))?blankItemPricing({...item,lines:[line],blankQuotes:[]},doc):null;
   if(include.has('costs')&&!isLabor)rows.push('Source unit cost: '+dollars(line.price)+(amount?' | Extended material hard cost: '+money(amount.material):''));
   if(include.has('pricing')){
    if(amount)rows.push('Included line selling value before estimate-level charges: '+money(amount.price));
    const ma=adjustment(line.materialAdjustment??line.materialDiscount),la=adjustment(line.laborAdjustment??line.laborDiscount);
    if(ma||la)rows.push('Price adjustments: '+[ma&&'material '+ma,la&&'labor '+la].filter(Boolean).join(' | '));
   }
  }
  if(note)rows.push('Internal note: '+note);
  lines.push({name:(isLabor?'Labor: ':'Material: ')+name,rows});
 }
 if(include.has('quotes')){
  for(const quote of quotes){
   const rows=[quoteModes[quote.mode]||'Treatment not recorded'];
   const amount=doc.blankSlateVersion===1&&['add','replace'].includes(quote.mode)&&(include.has('pricing')||include.has('costs'))?blankItemPricing({...item,lines:[],blankQuotes:[quote]},doc):null;
   if(include.has('costs')){
    const markup=quote.markup??item.materialMarkupOverride??doc.materialMarkup??0;
    rows.push('Hard cost per work unit: '+dollars(quote.cost)+' | Markup: '+number(markup)+'%'+(amount?' | Extended quote hard cost: '+money(amount.other):''));
   }
   if(include.has('pricing')&&amount)rows.push('Included quote selling value before estimate-level charges: '+money(amount.price));
   lines.push({name:'Quote: '+(quote.name||'Unnamed quote / allowance'),rows});
  }
  if(item.quoteId){
   const quote=(doc.quotes||[]).find(q=>q.id===item.quoteId);
   const name=quote?.name||quote?.title||'Linked quote / allowance';
   const rows=[quote?'Included as linked work item.':'Linked quote details not recorded.'];
   if(quote&&include.has('costs'))rows.push('Quoted material: '+dollars(quote.materialAmount)+' | Quoted other: '+dollars(quote.otherAmount));
   lines.push({name:'Quote: '+name,rows});
  }
 }
 return lines;
}

export function internalEstimateReview(document,snapshot,{depth='work',sections=defaults,entryKeys}={}){
 if(!['summary','work','lines'].includes(depth)||!Array.isArray(sections)||sections.some(s=>![...defaults,'costs','notes'].includes(s)))throw new Error('Choose supported internal review options.');
 const include=new Set(sections),all=document.entries||[];
 if(entryKeys!==undefined&&!Array.isArray(entryKeys))throw new Error('Choose valid work groups for internal review.');
 const keys=entryKeys===undefined?null:new Set(entryKeys);
 const entries=keys?all.filter(entry=>keys.has(String(entry.id))):all;
 if(keys&&(!entries.length||entries.length!==keys.size))throw new Error('Choose at least one current work group for internal review.');
 const limited=entries.length!==all.length,items=entries.flatMap(entry=>entry.items||[]);
 const fields=include.has('scope')&&!limited?proposalFields(document):null;
 const scope=fields&&{
  lines:fields.scopeMode==='grouped'?proposalScopeItems(document).map(i=>({text:i.text,members:i.grouped?i.members.map(m=>m.text):[]})):(fields.scope||'').trim().split(/\n\s*\n/).filter(Boolean).map(value=>({text:value.replace(/^\s*\d+[.)]\s*/,''),members:[]})),
  inclusions:fields.inclusions,exclusions:fields.exclusions,
 };
 if(!items.length&&!scope?.lines.some(l=>l.text.trim())&&!scope?.inclusions?.trim()&&!scope?.exclusions?.trim())throw new Error('Add included work or proposal scope before exporting an internal review.');
 const summaryRows=[number(entries.length)+' work '+(entries.length===1?'group':'groups')+' | '+number(items.length)+' work '+(items.length===1?'item':'items'),...detailRows(items,document,include,true)];
 if(include.has('pricing')){
  if(limited)summaryRows.push('Selected selling subtotal before estimate-level charges: '+money(sumPricing(items,document,false).subtotal));
  else{
   const calc=snapshot?document.proposalChargeSnapshot:sumPricing(items,document);
   if(calc?.chargeError)throw new Error(calc.chargeError);
   const total=snapshot?Number(snapshot.pricing_total):calc.price;
   if((snapshot&&(snapshot.pricing_total==null||snapshot.pricing_total===''))||!Number.isFinite(total))throw new Error('The estimate total is unavailable.');
   if(calc){
    const parts=[['Estimate-level fee',calc.fee],['Estimate discount',calc.estimateDiscount],['Subtotal before tax',calc.preTaxTotal],['Sales tax',calc.salesTax],['Credit card fee',calc.creditCardFee]];
    for(const [label,value] of parts)if(value!=null&&(value!==0||label==='Subtotal before tax'))summaryRows.push(label+': '+money(value));
   }
   summaryRows.push((snapshot?'Saved estimate total: ':'Estimate total: ')+money(total));
  }
 }
 const groups=entries.map((entry,index)=>{
  const groupItems=entry.items||[];
  return {
   name:unique([entry.section,entry.location,entry.name]).join(' / ')||(depth==='summary'&&groupItems.length===1&&groupItems[0].name)||'Work group '+(entry.number??index+1),
   rows:[...(entry.drawing?['Drawing: '+entry.drawing]:[]),...(depth==='summary'||groupItems.length!==1?detailRows(groupItems,document,include):[])],
   items:depth==='summary'?[]:groupItems.map((item,i)=>({
    name:`${item.number??i+1}. ${item.name||'Unnamed work item'}`,
    rows:['Work quantity: '+number(item.qty)+(item.status?' | Status: '+item.status:''),...detailRows([item],document,include),...(include.has('notes')&&item.notes?['Internal note: '+item.notes]:[])],
    lines:depth==='lines'?itemDetail(item,document,include):[],
   })),
  };
 });
 return {limited,depth,scope,summaryRows,groups};
}
