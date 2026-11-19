import {mergeWorkspace,splitWorkspace} from './daybookModel.js';
export function daybookAccess(workspace){return {canManageNorthgate:workspace?.can_manage_northgate===true,canViewPay:workspace?.can_view_pay===true};}
export function stripWorkerPay(data){const value=structuredClone(data||{});for(const w of value.workers||[]){for(const key of Object.keys(w))if(!['id','name','role','hours','active','contactId','phone','email','company','ptoPlans','ptoWeekdays','ptoExcludeHolidays'].includes(key))delete w[key];}delete value.privacy;return value;}
export function plannerData(workspace,data){
 const access=daybookAccess(workspace);let value=data?structuredClone(data):mergeWorkspace(workspace);
 if(!access.canManageNorthgate){value=splitWorkspace(value).personal;value.workers=[];value.assignments=[];value.jobs=[];if(!value.calendars.length)value.calendars=[{id:'personal',name:'Personal',color:'#397f9b'}];if(value.tools?.calendar==='northgate')value.tools.calendar='all';}
 return access.canViewPay?value:stripWorkerPay(value);
}
export function savePayload(workspace,data){
 const parts=splitWorkspace(plannerData(workspace,data)), canManage=daybookAccess(workspace).canManageNorthgate;
 if(!canManage){
  // The participant editor never exposes these legacy personal planner records.
  // Preserve them on a calendar-only save or restore.
  const previous=workspace?.personal?.payload;
  for(const key of ['jobs','assignments'])if(Array.isArray(previous?.[key]))parts.personal[key]=structuredClone(previous[key]);
  const linked=new Set((parts.personal.jobs||[]).map(job=>job.calendar));
  for(const calendar of previous?.calendars||[])if(linked.has(calendar.id)&&!parts.personal.calendars.some(c=>c.id===calendar.id))parts.personal.calendars.push(structuredClone(calendar));
 }
 return {personal:parts.personal,northgate:canManage?parts.northgate:null};
}
export function rebaseAccessDraft(workspace,data){
 // When permissions change do not turn a private/filtered draft into a
 // replacement of freshly loaded shared records (or missing pay fields).
 if(!data)return null;
 const personal=splitWorkspace(data).personal;
 const northgate=daybookAccess(workspace).canManageNorthgate?workspace.northgate:null;
 return plannerData(workspace,mergeWorkspace({personal:{payload:personal},northgate}));
}
export function accessChanged(old,next){
 const a=daybookAccess(old),b=daybookAccess(next);
 return a.canManageNorthgate!==b.canManageNorthgate||a.canViewPay!==b.canViewPay;
}
export function historyScopes(workspace){return daybookAccess(workspace).canManageNorthgate?['personal','northgate']:['personal'];}
export function federalHoliday(date){
 const d=new Date(date+'T12:00:00'),year=d.getFullYear(),key=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`,out=new Set();
 for(let y=year-1;y<=year+1;y++){
  for(const [m,n] of [[0,1],[5,19],[6,4],[10,11],[11,25]]){if(m===5&&y<2021)continue;const x=new Date(y,m,n,12);out.add(key(x));if(x.getDay()===0)x.setDate(x.getDate()+1);else if(x.getDay()===6)x.setDate(x.getDate()-1);out.add(key(x));}
  for(const [m,w,n] of [[0,1,3],[1,1,3],[8,1,1],[9,1,2],[10,4,4]]){const x=new Date(y,m,1,12);x.setDate(1+(w-x.getDay()+7)%7+(n-1)*7);out.add(key(x));}
  const memorial=new Date(y,5,0,12);memorial.setDate(memorial.getDate()-(memorial.getDay()+6)%7);out.add(key(memorial));
 }return out.has(date);
}
export function sharedAssignmentsOn(n,date){return (n.assignments||[]).filter(a=>a.status!=='Cancelled'&&a.start<=date&&a.end>=date&&a.weekdays?.includes(new Date(date+'T12:00:00').getDay())&&(!a.excludeHolidays||!federalHoliday(date)));}
