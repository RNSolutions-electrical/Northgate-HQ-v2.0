import {proposalCharges} from './proposalCharges.mjs';
import {cataloguePriceSnapshot} from './catalogueService.js';
export const BLANK_SLATE_BLOCKER='Blank-slate server accounting is unavailable. Drafts and proposal previews remain available; retry after the staging accounting migration is verified.';
export async function requireBlankAccounting(document,client){
 if(document?.blankSlateVersion!==1)return;
 if(!client)throw new Error(BLANK_SLATE_BLOCKER);
 const result=await (await client()).rpc('blank_slate_accounting_version');
 if(result.error||result.data!==1)throw new Error(BLANK_SLATE_BLOCKER);
}
export function amount(value,label='Amount'){
 if(value==null||value===''||String(value).length>100||!/^([0-9]+([.][0-9]*)?|[.][0-9]+)$/.test(String(value)))throw new Error(label+' is required and must be nonnegative.');
 const n=Number(value);if(!Number.isFinite(n)||n>1e9)throw new Error(label+' is outside the supported range.');return n;
}
// Exact decimal fractions and half-up integer cents match PostgreSQL numeric.
const gcd=(a,b)=>{while(b)[a,b]=[b,a%b];return a;};
const fraction=(n,d=1n)=>{const g=gcd(n,d);return {n:n/g,d:d/g};};
const decimal=(value,label)=>{amount(value,label);const [whole,tail='']=String(value).split('.');return fraction(BigInt((whole||'0')+tail),10n**BigInt(tail.length));};
const add=(a,b)=>fraction(a.n*b.d+b.n*a.d,a.d*b.d);
const multiply=(a,b)=>fraction(a.n*b.n,a.d*b.d);
const cents=a=>(a.n*200n+a.d)/(a.d*2n);
const moneyValue=n=>{if(n>99999999999999n||n< -99999999999999n)throw new Error('Estimate total is outside the supported range.');return Number(n)/100;};
const percentCents=(base,value)=>cents(multiply(fraction(base,100n),multiply(decimal(value,'Percentage'),fraction(1n,100n))));
function discountCents(base,d){
 if(d==null)return 0n;
 if(!['percent','amount'].includes(d.type))throw new Error('Choose a percentage or amount discount.');
 const value=amount(d.value,'Discount');if(d.type==='percent'&&value>100)throw new Error('Discount percentage cannot exceed 100.');
 const result=d.type==='percent'?percentCents(base,d.value):cents(decimal(d.value,'Discount'));
 if(result>base)throw new Error('Discount cannot exceed its selling amount.');return result;
}
export function discountAmount(base,d){return moneyValue(discountCents(cents(decimal(base,'Selling amount')),d));}
export function blankItemPricing(item,data){
 if(item.quoteId)throw new Error('Blank-slate quote pricing is not supported.');
 const rate=decimal(item.laborRateOverride??data.rate,'Sales labor rate'),hard=decimal(item.blankSlateHardRate??data.blankSlateHardRate??data.rate,'Hard labor rate');
 const markup=item.materialMarkupOverride??data.materialMarkup??0,factor=decimal(item.qty,'Work quantity');
 const markupFactor=add(fraction(1n),multiply(decimal(markup,'Material markup'),fraction(1n,100n)));
 let material=0n,hours=fraction(0n),selling=0n,resourceDiscount=0n;
 for(const line of item.lines||[]){
  const qty=multiply(decimal(line.qty,'Resource quantity'),line.fixed?fraction(1n):factor);
  const cost=cents(multiply(qty,decimal(line.price,'Material price'))),h=multiply(qty,decimal(line.hours,'Labor hours'));
  const mg=cents(multiply(fraction(cost,100n),markupFactor)),lg=cents(multiply(h,rate));
  const md=discountCents(mg,line.materialDiscount),ld=discountCents(lg,line.laborDiscount);
  material+=cost;hours=add(hours,h);selling+=mg+lg-md-ld;resourceDiscount+=md+ld;
 }
 const labor=cents(multiply(hours,hard)),cost=material+labor;
 return {material:moneyValue(material),labor:moneyValue(labor),other:0,hours:Number(hours.n)/Number(hours.d),cost:moneyValue(cost),materialRate:amount(markup),materialMarkup:moneyValue(selling-cost),fee:0,markup:moneyValue(selling-cost),price:moneyValue(selling),subtotal:moneyValue(selling),resourceDiscount:moneyValue(resourceDiscount)};
}
export function blankSumPricing(items,data,includeFee=true){
 const result={material:0,labor:0,other:0,hours:0,cost:0,materialMarkup:0,fee:0,markup:0,price:0,subtotal:0,resourceDiscount:0};
 const sums=Object.fromEntries(Object.keys(result).filter(k=>k!=='hours').map(k=>[k,0n]));
 for(const item of items){const p=blankItemPricing(item,data);for(const k of Object.keys(sums))sums[k]+=BigInt(Math.round(p[k]*100));result.hours+=p.hours;}
 for(const k of Object.keys(sums))result[k]=moneyValue(sums[k]);
 const fee=includeFee?percentCents(sums.subtotal,data.feePercent??0):0n,gross=sums.subtotal+fee;
 const estimateDiscount=includeFee?discountCents(gross,data.estimateDiscount):0n,net=gross-estimateDiscount;
 const charges=proposalCharges(moneyValue(net),includeFee?data.proposal:{});
 if(charges.price>999999999999.99)throw new Error('Estimate total is outside the supported range.');
 return {...result,...charges,fee:moneyValue(fee),grossPreDiscount:moneyValue(gross+sums.resourceDiscount),estimateDiscount:moneyValue(estimateDiscount),totalDiscount:moneyValue(sums.resourceDiscount+estimateDiscount),markup:moneyValue(net-sums.cost),margin:net?Number(net-sums.cost)/Number(net)*100:0,chargeError:''};
}
export function proportionalCents(value,cumulative,total){if(!total)return 0;const v=BigInt(value),c=BigInt(cumulative),t=BigInt(total);return Number((v*c*2n+t)/(t*2n));}
export function blankDocument(name='',customer=''){return {name,customer,template:'Default',blankSlateVersion:1,rate:0,blankSlateHardRate:0,materialMarkup:0,feePercent:0,quotes:[],packages:[],sections:[],library:[],entries:[],proposal:{scope:'',salesTaxPercent:0,creditCardPercent:0}};}
export function blankWorkItem(id){return {id,number:1,name:'',qty:1,kind:'Assembly',status:'Not started',notes:'',lines:[]};}
export function catalogueResource(material,id){return {id,catalogueId:material.id,name:material.name,unit:material.unit,qty:1,price:material.price,hours:material.hours,stage:'Rough-in',fixed:false,notes:'',...cataloguePriceSnapshot(material),catalogueUpdatedAt:material.updated_at??null};}
export async function readBlankInventory(client){
 const rows=[];for(let from=0;;from+=1000){const r=await client.from('inventory_cart_candidates_view').select('bin_item_id,item_id,bin_id,bin_code,bin_label,quantity_on_hand,quantity_recorded').order('bin_item_id').range(from,from+999);if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<1000)return rows;}
}
/** Import is additive to an empty HQ estimate; full original payload is retained. */
export function importPrototype(source){
 if(source?.app!=='NorthgateBlankSlateEstimator'||![1,2].includes(source.schemaVersion)||!Array.isArray(source.lines)||!source.defaults)throw new Error('Choose a supported blank-slate estimator JSON backup.');
 const d=source.defaults;if(d.taxBase!=='all'&&amount(d.tax??0,'Tax')>0)throw new Error('Material-only tax imports require accounting review; the source file is unchanged.');
 const doc=blankDocument(source.title,source.customer);Object.assign(doc,{rate:d.salesRate,estimateLaborRateOverride:d.salesRate,blankSlateHardRate:d.hardRate,materialMarkup:d.markup,prototypeSource:structuredClone(source),proposal:{scope:source.scope||'',salesTaxPercent:d.tax??0,creditCardPercent:d.card?d.cardRate:0}});
 const ids=new Set();doc.entries=source.lines.filter(r=>r.committed).map((row,index)=>{
  if(!row.id||ids.has(row.id))throw new Error('Imported line identifiers must be unique.');ids.add(row.id);const line=row.committed,p=line.pricing||d;
  if(Number(p.tax??d.tax??0)!==Number(d.tax??0))throw new Error('Mixed per-line tax imports require accounting review; the source file is unchanged.');
  if((line.quotes||[]).some(q=>q.mode!=='reference'))throw new Error('Active vendor quote imports require accounting review; the source file is unchanged.');
  const item={...blankWorkItem(row.id),name:line.title,qty:line.qty,materialMarkupOverride:p.markup,laborRateOverride:p.salesRate,blankSlateHardRate:p.hardRate,notes:(line.notes||[]).join('\n'),lines:[...(line.materials||[]).map((m,n)=>({id:row.id+'-m'+n,name:m.name,unit:m.unit,qty:m.qty,price:m.cost,hours:m.hours,priceSource:'prototype_snapshot',fixed:false,stage:'Rough-in',notes:'',prototypeResource:structuredClone(m)})),...(line.labor||[]).map((l,n)=>({id:row.id+'-l'+n,name:l.name,unit:'HR',qty:1,price:0,hours:l.hours,fixed:false,stage:'Rough-in',notes:'',prototypeResource:structuredClone(l)}))]};
  return {id:row.id,number:index+1,name:line.subtitle||'',section:'',location:'',status:'Not started',items:[item]};
 });blankSumPricing(doc.entries.flatMap(e=>e.items),doc);return doc;
}
