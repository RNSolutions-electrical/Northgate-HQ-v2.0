import {descendants,cValue,segment} from './engine.mjs';
import {evaluate,engineVersion} from './layers.mjs';
export {engineVersion};
export const DATA_VERSION='eaton-2014-table4-600v-single-conductors';
export const SOURCE_URL='https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/solution-center/bus-ele-tech-lib-electrical-formulas.pdf';
export const KINDS=['source','disconnect','panel','transformer','equipment'];
export const FAULTS=['L–G','L–L','L–N','3Ø','Parallel sources','Inverter / UPS'];
export const id=()=>crypto.randomUUID();
export const present=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
export const numeric=(v,min=0,max=1e9)=>['number','string'].includes(typeof v)&&present(v)&&/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(v).trim())&&Number.isFinite(+v)&&+v>=min&&+v<=max;
const positive=v=>numeric(v)&&+v>0;
const text=v=>typeof v==='string'&&v.trim().length>0;
const safeId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function blankStudy(){return {schemaVersion:2,engineVersion,dataVersion:DATA_VERSION,title:'',reference:'',date:new Date().toISOString().slice(0,10),preparedBy:'',nodes:[{id:id(),parent:null,kind:'source',name:'Utility source',fault:'Source fault',method:'known',known:'',voltage:'',phase:3,kva:'',z:'',tolerance:0,sourceReference:'',ln:{mode:'none',current:'',voltage:'',reference:''}}],layers:{generators:[],motors:[]}};}
export function incomingSegment(){return {...segment(),id:id(),length:'',neutral:{mode:'none',c:'',sets:1}};}
export function addNode(study,parent,kind='panel'){
 if(!study.nodes.some(n=>n.id===parent)||!KINDS.includes(kind)||kind==='source')throw Error('Select valid upstream equipment and kind.');
 const next=structuredClone(study);next.nodes.push({id:id(),parent,kind,name:'New '+kind,fault:'',rating:'',segments:[incomingSegment()],...(kind==='transformer'?{kva:'',voltage:'',z:'',tolerance:0,sourceReference:''}:{})});return next;
}
export function reparent(study,nodeId,parent){
 const node=study.nodes.find(n=>n.id===nodeId);
 if(!node||node.kind==='source'||!study.nodes.some(n=>n.id===parent)||descendants(study.nodes,nodeId).has(parent))throw Error('Choose upstream equipment outside this branch.');
 const next=structuredClone(study);next.nodes.find(n=>n.id===nodeId).parent=parent;return next;
}
export function studyStructureIssues(study){
 const errors=[];if(!study||typeof study!=='object'||Array.isArray(study))return ['Study must be an object.'];
 try{if(JSON.stringify(study).length>1500000)return ['Study exceeds the supported size.'];}catch{return ['Study must contain serializable inputs.'];}
 if(study.layers!==undefined&&!object(study.layers))return ['Optional layers must be an object.'];
 if(study.layers&&Object.keys(study.layers).some(k=>!['generators','motors'].includes(k)))return ['Unsupported optional layer.'];
 for(const key of ['title','reference','preparedBy','date'])if(study[key]!==undefined&&(typeof study[key]!=='string'||study[key].length>500))errors.push('Study metadata must be text up to 500 characters.');
 if(study.labelSize!==undefined&&!['4x3','6x4'].includes(study.labelSize))errors.push('Choose 4x3 or 6x4 label dimensions.');
 if(study.schemaVersion!==2)return ['Unsupported study format. Import the source through the versioned importer.'];
 if(!Array.isArray(study.nodes)||study.nodes.length<1||study.nodes.length>250)return ['Use 1–250 equipment nodes.'];
 for(const n of study.nodes)for(const key of ['name','fault'])if(n?.[key]!==undefined&&typeof n[key]!=='string')errors.push('Equipment names must be text.');
 const ids=new Set();for(const n of study.nodes){if(!object(n))return ['Invalid equipment node.'];if(!safeId(n.id)||ids.has(n.id))errors.push('Equipment IDs must be unique and valid.');ids.add(n.id);if(!KINDS.includes(n.kind))errors.push('Unsupported equipment kind.');if(n.ln!==undefined&&!object(n.ln))errors.push('Invalid L–N configuration.');if(n.kind!=='source'&&(!Array.isArray(n.segments)||n.segments.length>30))errors.push('Use at most 30 segments for an incoming run.');for(const arr of [n.segments??[],n.external??[]]){if(!Array.isArray(arr)||arr.length>30){errors.push('Invalid or oversized equipment inputs.');continue;}const seen=new Set();for(const value of arr){if(!object(value)||!safeId(value.id)||seen.has(value.id))errors.push('Run and external-result IDs must be unique and valid.');if(value?.neutral!==undefined&&!object(value.neutral))errors.push('Invalid neutral configuration.');seen.add(value?.id);}}}
 if(study.nodes.filter(n=>n.kind==='source').length!==1)errors.push('Exactly one utility source is required.');
 for(const n of study.nodes){if(n.kind==='source'&&n.parent)errors.push('The utility source cannot have a parent.');if(n.kind!=='source'&&!ids.has(n.parent))errors.push('Every downstream node needs an existing parent.');const seen=new Set([n.id]);let p=n.parent;while(p){if(seen.has(p)){errors.push('Equipment connections cannot form a cycle.');break;}seen.add(p);p=study.nodes.find(x=>x.id===p)?.parent;}}
 for(const key of ['generators','motors']){const arr=study.layers?.[key]??[];if(!Array.isArray(arr)||arr.length>50){errors.push('Use at most 50 '+key+'.');continue;}const seen=new Set();for(const value of arr){if(!object(value)||!safeId(value.id)||seen.has(value.id)||value.id==='utility')errors.push('Optional source/group IDs must be unique and valid.');if(value?.name!==undefined&&(typeof value.name!=='string'||value.name.length>2000))errors.push('Optional source/group names must be text up to 2000 characters.');if(value?.feeder!==undefined&&!object(value.feeder))errors.push('Invalid generator feeder.');seen.add(value?.id);}}
 return [...new Set(errors)];
}
export function releaseIssues(study){
 const errors=studyStructureIssues(study);if(errors.length)return errors;
 const push=(where,message)=>errors.push(where+': '+message);
 if(!text(study.title)||!text(study.reference)||!text(study.preparedBy))errors.push('Enter study title, location and preparer.');
 const date=new Date(study.date+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(study.date||'')||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==study.date)errors.push('Enter a valid calculation date.');
 for(const n of study.nodes){
  for(const key of ['name','fault','sourceReference'])if(n[key]!==undefined&&(typeof n[key]!=='string'||n[key].length>2000))push('Equipment','use text up to 2000 characters for '+key+'.');
  for(const key of ['rating','known','voltage','kva','z','tolerance'])if(present(n[key])&&!numeric(n[key]))push(n.name||'Equipment','invalid '+key+'.');
  if(n.ln)for(const key of ['current','voltage'])if(present(n.ln[key])&&!positive(n.ln[key]))push(n.name,'invalid L–N '+key+'.');
  if(!text(n.name)||!text(n.fault))push(n.name||'Equipment','enter equipment and fault names.');
  if(n.kind==='source'&&!['known','transformer'].includes(n.method))push(n.name,'choose a supported source method.');
  if(n.kind==='source'||n.kind==='transformer'){
   if(!text(n.sourceReference))push(n.name,'enter the utility/nameplate reference.');
   if((n.kind==='transformer'||n.method==='transformer')&&(!numeric(n.tolerance,0,99.999)||!positive(n.kva)||!positive(n.z)))push(n.name,'complete transformer kVA, impedance and reduction.');
  }
  for(const s of n.segments||[]){
   if(!numeric(s.length)||!positive(cValue(s))||!numeric(s.sets,1,100)||!Number.isInteger(+s.sets))push(n.name,'enter valid run length, conductor data and identical parallel sets.');
   if(!['table','custom'].includes(s.mode))push(n.name,'choose a supported conductor mode.');
   if(s.mode==='custom'&&(!positive(s.c)||!text(s.reference)))push(n.name,'retain the custom conductor impedance reference.');
   if(s.neutral?.mode==='custom'&&(!positive(s.neutral.c)||!numeric(s.neutral.sets,1,100)||!Number.isInteger(+s.neutral.sets)||!text(s.neutral.reference)))push(n.name,'complete custom neutral impedance, sets and reference.');
   if(s.neutral?.mode&&!['none','same','custom'].includes(s.neutral.mode))push(n.name,'unsupported neutral configuration.');
  }
  if(n.ln?.mode&&!['none','known','center'].includes(n.ln.mode))push(n.name,'unsupported L–N source mode.');
  for(const e of n.external||[])if(present(e.amps)&&(!positive(e.amps)||!text(e.reference)||!text(e.caseName)||!FAULTS.includes(e.fault)))push(n.name,'complete the external RMS result and reference.');
 }
 for(const g of study.layers?.generators||[]){
  const active=[g.known,g.kva,g.xd,g.lnCurrent,g.lnVoltage].some(present);if(!active)continue;
  if(!['known','reactance'].includes(g.method))push(g.name||'Generator','choose a supported generator source method.');
  for(const key of ['known','kva','xd','lnCurrent','lnVoltage'])if(present(g[key])&&!positive(g[key]))push(g.name||'Generator','invalid '+key+'.');
  if(+g.feeder?.length>0&&(!positive(g.feeder.c)||!numeric(g.feeder.sets,1,100)||!Number.isInteger(+g.feeder.sets)))push(g.name||'Generator','invalid feeder C or parallel sets.');
  if(!numeric(g.feeder?.length)||(+g.feeder.length>0&&!text(g.feeder?.reference)))push(g.name||'Generator','enter the independent generator feeder length and impedance/configuration reference.');
  if(present(g.lnVoltage)&&!present(g.lnCurrent))push(g.name||'Generator','complete the optional L–N current.');
 }
 for(const m of study.layers?.motors||[])if(present(m.fla)&&(!positive(m.fla)||!positive(m.multiplier)))push(m.name||'Motor group','enter positive FLA and screening multiplier.');
 try{const result=evaluate(study);for(const [key,r]of Object.entries(result.base))if(r.error)push(study.nodes.find(n=>n.id===key)?.name||key,r.error);errors.push(...result.errors);}catch(e){errors.push(e.message);}
 return [...new Set(errors)];
}
export function studyResults(study){
 const structural=studyStructureIssues(study);if(structural.length)return {errors:structural,base:{},byNode:{},cases:[],notes:[],engineVersion,dataVersion:DATA_VERSION};
 try{const result=evaluate(study);return {...result,cases:result.cases.map(c=>({...c,ids:[...c.ids]})),errors:releaseIssues(study),engineVersion,dataVersion:DATA_VERSION};}catch(e){return {errors:[e.message],base:{},byNode:{},cases:[],notes:[],engineVersion,dataVersion:DATA_VERSION};}
}
export function importStudy(input){
 const original=structuredClone(input),study=structuredClone(input.document||input);
 if(![1,2].includes(study.schemaVersion))throw Error('Unsupported study backup format.');
 study.schemaVersion=2;study.engineVersion=engineVersion;study.dataVersion=DATA_VERSION;study.layers??={generators:[],motors:[]};
 for(const n of study.nodes||[]){for(const s of n.segments||[])s.id??=id();for(const e of n.external||[])e.id??=id();}
 for(const key of ['generators','motors'])for(const row of study.layers[key]||[])row.id??=id();
 const errors=studyStructureIssues(study);if(errors.length)throw Error(errors.join('\n'));
 return {document:study,original};
}
export function comparison(node,result){if(!present(node.rating))return {state:'unknown',label:'Nameplate rating not entered'};if(!positive(node.rating)||!result?.maximum)return {state:'unknown',label:'Complete inputs before comparison'};return result.maximum.amps>Number(node.rating)*1000?{state:'exceeds',label:'Entered/modeled current exceeds nameplate rating'}:{state:'within',label:'Within entered nameplate rating; equipment suitability requires review'};}
