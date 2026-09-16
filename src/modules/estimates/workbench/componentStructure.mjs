// Backward-compatible grouping metadata; flat lines remain the single pricing/takeoff source.
// Existing ungrouped lines become one component each without changing any values.
export function componentGroups(item){
  if(item.components)return item.components.map((c,index)=>({...c,number:index+1,lines:item.lines.filter(l=>l.componentId===c.id)}));
  return (item.lines||[]).map((line,index)=>({id:'component-'+line.id,name:line.name,number:index+1,lines:[line]}));
}
export function ensureComponents(item){
  if(item.components)return;
  item.components=componentGroups(item).map(({id,name})=>({id,name}));
  item.lines.forEach(l=>{l.componentId='component-'+l.id;});
}
export function addComponentGroup(item){
  ensureComponents(item);const id=crypto.randomUUID();
  item.components.push({id,name:'New component'});return id;
}
export function addComponentLine(item,componentId,material=null,labor=false){
  ensureComponents(item);
  if(!item.components.some(c=>c.id===componentId))throw new Error('Component is no longer available');
  const line={id:crypto.randomUUID(),componentId,catalogueId:material?.id||'',
    name:material?.name||(labor?'Additional labor':''),qty:1,unit:labor?'HR':material?.unit||'EA',
    // Labor-only rows deliberately have zero material cost. Hours must still be entered.
    price:labor?0:material?.price??null,hours:material?.hours??null,stage:'Rough-in',fixed:false,notes:'',kind:labor?'labor':'material'};
  item.lines.push(line);return line;
}
export function copyWorkItem(item){
  const copy=structuredClone(item);copy.id=crypto.randomUUID();delete copy.libraryId;delete copy.updatedAt;
  const ids=new Map((copy.components||[]).map(c=>[c.id,crypto.randomUUID()]));
  if(copy.components)copy.components=copy.components.map(c=>({...c,id:ids.get(c.id)}));
  copy.lines=copy.lines.map(l=>({...l,id:crypto.randomUUID(),libraryLineId:null,...(l.componentId?{componentId:ids.get(l.componentId)}:{})}));
  return copy;
}
export const LIBRARY_VIEW_KEY='northgate:estimates:assembly-library-view';
export function readLibraryView(storage){try{return storage?.getItem(LIBRARY_VIEW_KEY)==='detailed'?'detailed':'simple';}catch{return 'simple';}}
