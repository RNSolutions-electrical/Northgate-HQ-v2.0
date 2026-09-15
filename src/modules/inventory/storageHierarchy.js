export const storageLevels=['unit','shelf','bay','bin'];
export const storageNames={unit:'Storage unit',shelf:'Shelf',bay:'Bay',bin:'Bin'};
export function findStorageCodeConflict(records,kind,parentId,code){
 const normalized=String(code||'').trim().toUpperCase();
 if(!normalized)return null;
 return records.find(row=>row.type===kind&&(kind==='unit'||row.parentId===parentId)&&String(row.code||'').trim().toUpperCase()===normalized)||null;
}
export function locationTrail(records,id){
 const result=[],seen=new Set();let row=records.find(r=>r.id===id);
 while(row&&!seen.has(row.id)){seen.add(row.id);result.unshift(row);row=records.find(r=>r.id===row.parentId);}
 return result;
}
export function storageBranch(records,id){
 return records.filter(row=>!id||locationTrail(records,row.id).some(p=>p.id===id));
}
export function activeStorage(records){
 return records.filter(row=>locationTrail(records,row.id).every(parent=>!parent.archived_at));
}
export function labelSelection(records,id,level='all'){
 return storageBranch(activeStorage(records),id).filter(row=>level==='all'||row.type===level)
  .sort((a,b)=>a.path.localeCompare(b.path,undefined,{numeric:true}));
}
