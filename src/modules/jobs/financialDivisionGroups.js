import {financialDivisionLabel,financialDivisionName,PROJECT_DIVISION_NAMES} from './financialDivisionLabels.js';

export const normalizeDivisionCode=value=>String(value??'').trim().toUpperCase();
export const inferredDivisionCode=value=>normalizeDivisionCode(value).match(/^\d{2}/)?.[0]||'';
const metadata=division=>division?._financialName||(division&&Object.hasOwn(division,'effective_name')?division:null);
function projectDivision(division){const names=metadata(division);return {...division,code:names?.code||division.code,
 name:names?.effective_name??division.name,_financialName:names};}
const unique=(items,key)=>[...new Map(items.map(item=>[key(item),item])).values()];

// This is display/action context only. Never assign its master reference to a
// custom line, mutate project links, or infer a financial category from a code.
export function createFinancialDivisionResolver({rows=[],projectDivisions=[],catalogueDivisions=[]}={}){
 const masters=new Map(catalogueDivisions.map(d=>[d.id,{...d,code:normalizeDivisionCode(d.code)}]));
 const projects=new Map(projectDivisions.map(d=>[d.id,projectDivision(d)]));
 const addMaster=(id,code,name,active)=>{if(id&&!masters.has(id))masters.set(id,{id,code:normalizeDivisionCode(code),name,is_active:active});};
 for(const d of projectDivisions){const m=metadata(d);addMaster(m?.catalogue_division_id,m?.code||d.code,m?.catalogue_name,m?.catalogue_active);}
 for(const row of rows){
  const d=row.project_division,m=metadata(d),n=row._financialName;
  if(d?.id&&!projects.has(d.id)&&(Object.hasOwn(d,'archived_at')||m))projects.set(d.id,projectDivision(d));
  addMaster(m?.catalogue_division_id,m?.code||d?.code,m?.catalogue_name,m?.catalogue_active);
  addMaster(n?.catalogue_division_id,n?.catalogue_division_code,n?.catalogue_division_name,n?.catalogue_active);
 }
 const mastersForCode=code=>[...masters.values()].filter(m=>m.code===code);
 const activeProjects=[...projects.values()].filter(d=>!d.archived_at);
 const projectMaster=d=>metadata(d)?.catalogue_division_id||d.catalogue_division_id;
 function resolve(row){
  if(row._divisionContext)return row._divisionContext;
  const id=row.project_division_id||row.project_division?.id;
  const explicit=id?(projects.get(id)||row.project_division):null;
  const names=row._financialName;
  const code=normalizeDivisionCode(explicit?.code||names?.catalogue_division_code||inferredDivisionCode(row.cost_code));
  if(id&&!projects.has(id)){const name=financialDivisionName(code,explicit?.name||names?.effective_division_name||'Unnamed');return {key:`project:${id}`,code,name,label:code?financialDivisionLabel(code,name):'Unavailable project division',sortOrder:Number(explicit?.sort_order??(Number(code)||999)),projectDivision:null,projectDivisionId:null,masterId:null,action:'blocked',disabledReason:'This project division is unavailable. Reload before adding.'};}
  const byCode=mastersForCode(code),masterId=projectMaster(explicit||{})||(!id?names?.catalogue_division_id:null);
  const master=masters.get(masterId)||(byCode.length===1?byCode[0]:null);
  const candidates=activeProjects.filter(d=>master?projectMaster(d)===master.id||normalizeDivisionCode(d.code)===master.code:normalizeDivisionCode(d.code)===code);
  const ambiguous=byCode.length>1&&!masterId||candidates.length>1;
  // Explicit records stay distinguishable when their code is ambiguous. Inferred
  // rows never pick an arbitrary record or inherit its name based on row order.
  const target=ambiguous?candidates.find(d=>d.id===id):candidates[0];
  const effectiveMaster=master;
  const key=ambiguous?(id?`project:${id}`:`ambiguous:${code}`):master?`master:${master.id}`:target?`project:${target.id}`:id?`project:${id}`:code?`code:${code}`:'unassigned';
  const labelName=target?.name??master?.name??explicit?.name??PROJECT_DIVISION_NAMES[code]??'Unnamed';
  const retired=master?.is_active===false;
  const blocked=retired?'This division is retired for new use.':ambiguous&&!target?'Multiple project divisions use this code. Choose a division from Add Financial Line.':'';
  return {key,code:master?.code||code,name:financialDivisionName(master?.code||code,labelName),label:code?financialDivisionLabel(master?.code||code,labelName):'Unassigned project division',
   sortOrder:Number(master?.sort_order??target?.sort_order??explicit?.sort_order??(Number(code)||999)),
   projectDivision:target||null,projectDivisionId:target?.id||null,masterId:effectiveMaster?.id||null,
   action:blocked?'blocked':code||target?'add':'choose',disabledReason:blocked};
 }
 const choices=()=>{
  const seeds=[...masters.values()].filter(m=>m.is_active!==false).map(m=>({_financialName:{catalogue_division_id:m.id,catalogue_division_code:m.code}}));
  seeds.push(...activeProjects.map(d=>({project_division_id:d.id,project_division:d})));
  return unique(seeds.map(resolve).filter(c=>c.action==='add'),c=>c.key).sort((a,b)=>a.sortOrder-b.sortOrder||a.key.localeCompare(b.key));
 };
 return {resolve,choices};
}

export function groupFinancialDivisions(rows,options={}){
 const {resolve}=createFinancialDivisionResolver({...options,rows});
 const groups=new Map();
 for(const row of rows){const context=resolve(row);if(!groups.has(context.key))groups.set(context.key,{...context,rows:[]});groups.get(context.key).rows.push(row);}
 return [...groups.entries()].sort(([,a],[,b])=>a.sortOrder-b.sortOrder||a.key.localeCompare(b.key));
}

export function validateFinancialDivisionEntry(context,line){
 if(context.action!=='add')return context.disabledReason||'Choose a division before adding a financial line.';
 if(context.projectDivisionId&&(!inferredDivisionCode(line.cost_code)||!/^\d{2}$/.test(context.code)))return '';
 if(!context.code||inferredDivisionCode(line.cost_code)!==context.code)return `Use a cost code beginning with ${context.code} for this division, or choose another division.`;
 return '';
}
