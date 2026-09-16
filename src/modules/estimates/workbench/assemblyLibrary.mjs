import {normalizeCategories} from './assemblyCategories.mjs';
export function assemblyLibrarySave(item, {editingLibrary=false, name=item.name}={}) {
 if (!name.trim()) throw new Error('Enter a library assembly name.');
 if (!item.lines.length) throw new Error('Add at least one material or labor line.');
 return {
  id:editingLibrary?item.libraryId||null:null,
  updatedAt:editingLibrary?item.updatedAt||null:null,
  name:name.trim(),notes:editingLibrary?item.notes||'':'',
  categories:normalizeCategories(item.categories||[]),
  components:item.components||null,
  lines:item.lines.map(line=>{
   if (!line.name.trim()) throw new Error('Enter a description for each component.');
   return {...line,libraryLineId:editingLibrary?line.libraryLineId||null:null,
    notes:editingLibrary?line.notes||'':'',
    qty:Number(line.qty),price:line.price==null||line.price===''?null:Number(line.price),
    hours:line.hours==null||line.hours===''?null:Number(line.hours)};
  })
 };
}
