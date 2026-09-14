export const defaultAssemblyCategories=['Commercial','Residential','Industrial','Generators','Home Runs','Power Distribution','HVAC','Equipment Connections','Rough-in','Trim-Out','Special Installations','Other'];
export function normalizeCategories(values=[]){
 const seen=new Set();
 return values.map(value=>String(value).trim()).filter(value=>{
  const key=value.toLowerCase();if(!value||seen.has(key))return false;seen.add(key);return true;
 });
}
export function availableCategories(library,selected=[]){
 return normalizeCategories([...defaultAssemblyCategories,...library.flatMap(item=>item.categories||[]),...selected]);
}
export function filterAssemblies(library,{query='',category='',sort='name'}={}){
 const tokens=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 const rows=library.filter(item=>{
  const haystack=[item.name,item.notes,...(item.categories||[]),...item.lines.map(line=>line.name)].join(' ').toLowerCase();
  return (!category||(item.categories||[]).some(c=>c.toLowerCase()===category.toLowerCase()))&&tokens.every(t=>haystack.includes(t));
 });
 return rows.sort((a,b)=>sort==='updated'?String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')):sort==='reverse'?b.name.localeCompare(a.name):a.name.localeCompare(b.name));
}
