export const arrays = ['calendars','events','contacts','notes','pto','jobs','workers','assignments'];
export function splitWorkspace(db) {
  const personal = structuredClone(db), northgate = {version:1,instance:'northgate'};
  for (const key of arrays) { personal[key] = []; northgate[key] = []; }
  const workers = new Set((db.workers || []).map(w => w.contactId).filter(Boolean));
  const jobs = new Set((db.jobs || []).filter(j => j.calendar === 'northgate').map(j => j.id));
  for (const key of arrays) for (const row of db[key] || []) {
    const company = key === 'calendars' ? row.id === 'northgate' : key === 'workers' ? true : key === 'contacts' ? workers.has(row.id) : key === 'notes' ? false : key === 'assignments' ? jobs.has(row.job) : row.calendar === 'northgate';
    (company ? northgate : personal)[key].push(structuredClone(row));
  }
  northgate.forecastDate = db.forecastDate;
  return {personal,northgate};
}
export function mergeWorkspace(workspace) {
  const p = structuredClone(workspace.personal?.payload), n = workspace.northgate?.payload;
  // Keep both records when another user's shared import reuses a private ID.
  const occupied=new Set(arrays.flatMap(k=>(n?.[k]||[]).map(x=>x.id)));
  const remap=new Map();
  for(const k of arrays)for(const row of p?.[k]||[]){if(occupied.has(row.id)){let id='personal_'+row.id;while(occupied.has(id))id='personal_'+id;remap.set(row.id,id);row.id=id;}occupied.add(row.id);}
  for(const k of arrays)for(const row of p?.[k]||[]){for(const key of ['calendar','job'])if(remap.has(row[key]))row[key]=remap.get(row[key]);}

  const db = {version:1,instance:'hq',...p};
  for (const key of arrays) db[key] = [...(p?.[key] || []), ...(n?.[key] || [])];
  db.forecastDate = n?.forecastDate || p?.forecastDate;
  if (!db.calendars.some(c=>c.id==='personal')) db.calendars.push({id:'personal',name:'Personal',color:'#397f9b'});
  if (!db.calendars.some(c=>c.id==='northgate')) db.calendars.push({id:'northgate',name:'Northgate',color:'#28745f'});
  return db;
}

