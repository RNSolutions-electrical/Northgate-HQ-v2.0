export const storageLevels=['unit','shelf','bay','bin'];
export const storageNames={unit:'Storage unit',shelf:'Shelf',bay:'Bay',bin:'Bin'};
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
