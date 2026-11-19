import {blankItemPricing} from './blankSlate.mjs';
// Allowlisted Default recipes; persistence lives in the permission-checked adapter.
// A recipe is a reviewed pricing snapshot, not a live link to project/catalogue IDs.
const text=(v='')=>{if(typeof v!=='string'||v.length>20000)throw Error('Invalid recipe text');return v;};
const number=(v,optional=false)=>{if(optional&&(v==null||v===''))return v??null;if(!/^([0-9]+([.][0-9]*)?|[.][0-9]+)$/.test(String(v))||String(v).length>100||Number(v)>1e9)throw Error('Invalid nonnegative recipe number');return v;};
function adjustment(v,legacy=false){
 if(v==null)return undefined;
 if(!['percent','amount'].includes(v.type)||(!legacy&&!['addition','discount'].includes(v.direction)))throw Error('Invalid recipe adjustment');
 const value=number(v.value);if(v.type==='percent'&&(legacy||v.direction==='discount')&&Number(value)>100)throw Error('Discount exceeds 100 percent');
 return {...(legacy?{}:{direction:v.direction}),type:v.type,value};
}
export function prepareRecipe(item,document,{name=item.name,acknowledgeSharedReview=false}={}){
 if(!acknowledgeSharedReview)throw Error('Review all resource notes and quote descriptions before sharing');
 if(!name?.trim()||name.trim().length>300)throw Error('Recipe name must contain 1–300 characters');
 if(!Array.isArray(item.lines)||item.lines.length>2000||!Array.isArray(item.blankQuotes??[])||(item.blankQuotes??[]).length>500)throw Error('Invalid recipe collections');
 const settings={laborRateOverride:number(item.laborRateOverride??document.rate),blankSlateHardRate:number(item.blankSlateHardRate??document.blankSlateHardRate??document.rate),materialMarkupOverride:number(item.materialMarkupOverride??document.materialMarkup??0)};
 const lines=item.lines.map(line=>{
  if(!line.name?.trim()||line.name.length>1000||(line.unit??'EA').length>100||(line.stage??'Rough-in').length>200)throw Error('Check resource description, unit and stage lengths');
  const out={name:text(line.name),unit:text(line.unit??'EA'),qty:number(line.qty),price:number(line.price),hours:number(line.hours),fixed:line.fixed===true,notes:text(line.notes),stage:text(line.stage??'Rough-in')};
  if(line.blankResourceKind!=null){if(!['material','labor'].includes(line.blankResourceKind))throw Error('Invalid resource kind');out.blankResourceKind=line.blankResourceKind;}
  for(const component of ['material','labor']){
   if(line[component+'Adjustment']!=null&&line[component+'Discount']!=null)throw Error('Ambiguous adjustment fields');
   for(const suffix of ['Adjustment','Discount']){const key=component+suffix,value=adjustment(line[key],suffix==='Discount');if(value)out[key]=value;}
  }
  return out;
 });
 const quotes=(item.blankQuotes??[]).map(q=>{if(!q.name?.trim()||q.name.length>1000)throw Error('Quote descriptions must contain 1–1000 characters');if(!['add','replace','reference'].includes(q.mode))throw Error('Invalid quote mode');return {name:text(q.name),cost:number(q.cost,q.mode==='reference'),markup:number(q.markup??settings.materialMarkupOverride),mode:q.mode};});
 if(quotes.filter(q=>q.mode==='replace').length>1)throw Error('Only one replacement quote allowed');
 if(!lines.length&&!quotes.some(q=>q.mode!=='reference'))throw Error('Recipe needs components or an active quote');
 const recipe={schemaVersion:1,kind:'default_estimator_assembly',name:text(name.trim()),defaultWorkQuantity:number(item.qty),settings,lines,quotes};
 const priced={...settings,qty:recipe.defaultWorkQuantity,lines:lines.map((l,i)=>({...l,id:String(i)})),blankQuotes:quotes.map((q,i)=>({...q,id:String(i)}))};
 if(Number(recipe.defaultWorkQuantity)<=0)throw Error('Default work quantity must be positive');
 blankItemPricing(priced,{});
 if(lines.length)blankItemPricing({...priced,blankQuotes:[]},{});
 if(new TextEncoder().encode(JSON.stringify(recipe)).length>1000000)throw Error('Recipe exceeds 1 MB');
 return recipe;
}
export function reuseRecipe(recipe,idFactory=()=>crypto.randomUUID()){
 if(recipe?.schemaVersion!==1||recipe.kind!=='default_estimator_assembly')throw Error('Unsupported recipe version');
 // Validate and re-project the persisted payload so injected extra keys cannot spread.
 const clean=prepareRecipe({name:recipe.name,qty:recipe.defaultWorkQuantity,...recipe.settings,lines:recipe.lines,blankQuotes:recipe.quotes},{},{acknowledgeSharedReview:true});
 const used=new Set();const fresh=()=>{const id=idFactory();if(typeof id!=='string'||!id||used.has(id))throw Error('New unique identifiers required');used.add(id);return id;};
 return {id:fresh(),name:clean.name,qty:clean.defaultWorkQuantity,kind:'Assembly',status:'Not started',notes:'',...clean.settings,lines:clean.lines.map(line=>({...line,id:fresh(),priceSource:'assembly_recipe_snapshot'})),blankQuotes:clean.quotes.map(q=>({...q,id:fresh()}))};
}
