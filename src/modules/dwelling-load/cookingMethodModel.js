/** Read-only, bounded 2017 NEC 220.55 service/feeder cooking candidates.
 * Source: government-hosted 2017 NEC PDF, printed pp.73–74, visually checked.
 * Factory is deliberately self-contained for the isolated worksheet frame.
 */
export function createCookingMethodTools(){
 const newCookingPlan=()=>({version:1,inventoryReviewed:false,classificationReviewed:false,overlapReviewed:false,sourceReferences:[],method:'unknown',appliances:[]});
 const kinds=['household-range','household-wall-oven','household-counter-unit','other-household-cooking','commercial','warming','unknown'];
 function validateCookingPlan(plan){
  if(plan===null)return plan;
  const obj=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
  const refs=v=>Array.isArray(v)&&v.length<=10&&v.every(x=>typeof x==='string'&&x.length<=1000);
  const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  const fail=()=>{throw Error('Invalid structured cooking plan.');};
  if(!obj(plan,['version','inventoryReviewed','classificationReviewed','overlapReviewed','sourceReferences','method','appliances'])||plan.version!==1||!['inventoryReviewed','classificationReviewed','overlapReviewed'].every(k=>typeof plan[k]==='boolean')||!refs(plan.sourceReferences)||!['column-c','note-3','unknown'].includes(plan.method)||!Array.isArray(plan.appliances)||plan.appliances.length>500)fail();
  for(const a of plan.appliances)if(!obj(a,['rowId','kind','eligibilityReviewed','sourceReferences'])||!uuid(a.rowId)||!kinds.includes(a.kind)||typeof a.eligibilityReviewed!=='boolean'||!refs(a.sourceReferences))fail();
  return plan;
 }
 const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
 const evidence=refs=>Array.isArray(refs)&&refs.some(x=>typeof x==='string'&&x.trim());
 const dec=v=>{if(typeof v!=='string'||v.length>100||!/^\d+(?:\.\d+)?$/.test(v.trim()))return null;const [w,f='']=v.trim().split('.');return {n:BigInt(w+f),d:10n**BigInt(f.length)};};
 const zero=()=>({n:0n,d:1n}),add=(a,b)=>({n:a.n*b.d+b.n*a.d,d:a.d*b.d}),mul=(a,n,d=1n)=>({n:a.n*n,d:a.d*d}),cmp=(a,n)=>a.n-BigInt(n)*a.d;
 const fmt=a=>{let n=a.n,d=a.d,s=(n/d).toString(),r=n%d;if(r){s+='.';while(r){r*=10n;s+=(r/d).toString();r%=d;}}return s;};
 const factorsA=[80,75,70,66,62,59,56,53,51,49,47,45,43,41,40,39,38,37,36,35,34,33,32,31,30];
 const factorsB=[80,65,55,50,45,43,40,36,35,34,32,32,32,32,32,28,28,28,28,28,26,26,26,26,26];
 const factor=(col,n)=>n<=25n?(col==='A'?factorsA:factorsB)[Number(n)-1]:col==='A'?30:n<=30n?24:n<=40n?22:n<=50n?20:n<=60n?18:16;
 const columnC=n=>n<=5n?[0n,8000n,11000n,14000n,17000n,20000n][Number(n)]:n<=40n?15000n+1000n*n:25000n+750n*n;
 function evaluateCookingPlan(p,{inspectSource,classificationOnly=false}={}){
  const plan=p.assistedReview?.cookingPlan??null;validateCookingPlan(plan);
  const blockers=[],steps=[],ruleBasis=['2017 NEC 220.55; Table 220.55 (printed pp.73–74)'];
  const rows=(p.rows||[]).filter(x=>x.cat==='cooking'),allRows=p.rows||[],byId=new Map(allRows.map(x=>[String(x.id).toLowerCase(),x]));
  const result=value=>({status:blockers.length?'blocked':'candidate-needs-final-review',value:blockers.length?null:value,proposed:blockers.length?null:value,changes:blockers.length||value===null?{}:{cookingDemand:value,cookingNote:ruleBasis.join('; ')+'. '+steps.join(' ')},steps,blockers:[...new Set(blockers)],ruleBasis,finalReviewRequired:true});
  if(!plan){if(rows.length)blockers.push('Complete the structured cooking plan.');return result(null);}
  const source=structuredClone(p);for(const k of ['assistedReview','updatedAt','lastBackup','lastImport'])delete source[k];for(const row of source.rows||[])if(row.calculationSource)delete row.calculationSource.snapshot;
  if(!p.assistedReview.sourceContext||canonical(source)!==canonical(p.assistedReview.sourceContext))blockers.push('Guided source context is absent or stale.');
  const answers=new Map((p.assistedReview.answers||[]).map(a=>[a.questionId,a]));
  for(const [id,value]of [['supported.guided.code-rule-set','nec2017-nc-confirmed'],['supported.guided.scope','entire-one-family-dwelling-reviewed'],['supported.guided.inventory','complete-inventory-reviewed']]){const a=answers.get(id);if(a?.text!==value||!evidence(a.sourceReferences))blockers.push('Review required: '+id);}
  for(const [id,value]of [['decision.occupancy','one-family'],['decision.scope','entire-dwelling'],['decision.inventory','complete']])if(answers.has(id)&&answers.get(id).text!==value)blockers.push('Conflicting or unresolved choice: '+id);
  if(p.voltage!=='240')blockers.push('Only the existing 120/240 V whole-dwelling scope is supported.');
  if(!plan.inventoryReviewed||!plan.classificationReviewed||!evidence(plan.sourceReferences))blockers.push('Complete cooking inventory/classification review with sources.');
  if(!plan.overlapReviewed)blockers.push('Review physical individual appliances and resolve overlapping/combined nameplate ratings.');
  if(!classificationOnly&&plan.method==='unknown')blockers.push('Select Column C or the Note 3 A/B alternative.');
  if(!rows.length||!plan.appliances.length)blockers.push('Structured cooking plan requires cooking equipment.');
  if(new Set(allRows.map(x=>String(x.id).toLowerCase())).size!==allRows.length)blockers.push('Duplicate equipment row identifiers.');
  const seen=new Set(),groups={A:{count:0n,va:zero()},B:{count:0n,va:zero()}};let count=0n;
  for(const a of plan.appliances){const id=a.rowId.toLowerCase(),row=byId.get(id);if(seen.has(id))blockers.push('Cooking equipment assigned more than once: '+id);seen.add(id);
   if(!row||row.cat!=='cooking'){blockers.push('Cooking assignment must reference a cooking row: '+id);continue;}
   if(!kinds.slice(0,4).includes(a.kind)||!a.eligibilityReviewed||!evidence(a.sourceReferences))blockers.push('Household cooking eligibility and applicable individual nameplate evidence required: '+id);
   const va=dec(row.va),q=typeof row.qty==='string'&&row.qty.length<=100&&/^\d+$/.test(row.qty.trim())?BigInt(row.qty.trim()):0n;
   if(!va||cmp(va,0)<=0||cmp(va,Number.MAX_SAFE_INTEGER)>0||q<=0n||q>9007199254740991n){blockers.push('Invalid individual VA or appliance quantity: '+id);continue;}
   if(row.calculationSource!==undefined&&row.calculationSource!==null){let checked;try{checked=inspectSource?.(row);}catch{}if(checked?.status!=='current'||checked.blocksConfidence!==false)blockers.push('Stale or unchecked selected nameplate source: '+id);}
   if(!classificationOnly&&cmp(va,1750)<=0)blockers.push('220.55 requires each appliance to exceed 1.75 kVA: '+id);
   if(!classificationOnly&&cmp(va,12000)>0)blockers.push('Ratings over 12 kVA require unsupported Table 220.55 Note 1/2 review: '+id);
   if(!classificationOnly&&plan.method==='note-3'&&cmp(va,8750)>0)blockers.push('Note 3 requires every appliance to be no greater than 8.75 kVA: '+id);
   count+=q;const g=groups[cmp(va,3500)<0?'A':'B'];g.count+=q;g.va=add(g.va,mul(va,q));
   steps.push('Physical row '+id+': '+q+' appliance(s) × '+fmt(va)+' VA each.');
  }
  for(const r of rows)if(!seen.has(r.id.toLowerCase()))blockers.push('Cooking inventory row is not classified: '+r.id);
  if(answers.has('decision.cooking')){
   const choice=answers.get('decision.cooking').text;
   if(choice==='single-household-range'){
    if(rows.length!==1||plan.appliances.length!==1||count!==1n||plan.appliances[0]?.kind!=='household-range')blockers.push('Cooking decision conflicts with the physical inventory: one household range requires exactly one range, quantity one.');
   }else if(choice==='multiple-household'){
    if(count<2n)blockers.push('Cooking decision conflicts with the physical inventory: multiple household appliances requires at least two individual appliances.');
   }else blockers.push('Conflicting or unresolved choice: decision.cooking');
  }
  if(classificationOnly){
   ruleBasis.splice(0,ruleBasis.length,'2017 NEC 220.82(B): reviewed household cooking nameplates, not Table 220.55 demand');
   if(count>9007199254740991n||cmp(add(groups.A.va,groups.B.va),Number.MAX_SAFE_INTEGER)>0)blockers.push('Supported numeric limit exceeded.');
   steps.push('Optional cooking inventory uses full verified household nameplates; no standard table factors or rating-band limits applied.');
   return result(null);
  }
  let demand=zero();if(count>0n&&plan.method==='column-c'){demand={n:columnC(count),d:1n};ruleBasis.push('Table 220.55 Column C; individual ratings >1.75 through 12 kVA');steps.push('Column C: '+count+' individual appliances = '+fmt(demand)+' VA.');}
  if(plan.method==='note-3'){ruleBasis.push('Table 220.55 Note 3; Column A <3.5 kVA; Column B 3.5 through 8.75 kVA');for(const [col,g]of Object.entries(groups))if(g.count){const f=factor(col,g.count),part=mul(g.va,BigInt(f),100n);demand=add(demand,part);steps.push('Column '+col+': '+g.count+' appliances; '+fmt(g.va)+' VA × '+f+'% = '+fmt(part)+' VA.');}steps.push('Sum separate A/B demands = '+fmt(demand)+' VA.');}
  if(count>9007199254740991n||cmp(demand,Number.MAX_SAFE_INTEGER)>0)blockers.push('Supported numeric limit exceeded.');
  steps.push('No Note 4 branch-circuit grouping; optional-method nameplate pool and existing values remain unchanged.');
  return result(fmt(demand));
 }
 const evaluateCookingClassification=(p,options={})=>evaluateCookingPlan(p,{...options,classificationOnly:true});
 return {newCookingPlan,validateCookingPlan,evaluateCookingPlan,evaluateCookingClassification};
}
export const {newCookingPlan,validateCookingPlan,evaluateCookingPlan,evaluateCookingClassification}=createCookingMethodTools();
