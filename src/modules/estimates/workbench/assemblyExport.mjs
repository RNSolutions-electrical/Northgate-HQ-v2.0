import {csvCell} from './exports.mjs';
export function assemblyLibraryCsv(library){
 const rows=[['Assembly ID','Assembly name','Division','Assembly notes','Updated at','Component ID','Catalogue ID','Description','Quantity','Unit','Material price per unit','Labor hours per unit','Stage','Fixed quantity','Component notes']];
 for(const a of library){
  for(const l of a.lines.length?a.lines:[{}]){
   rows.push([a.libraryId||a.id,a.name,a.division,a.notes,a.updatedAt,l.libraryLineId||l.id,l.catalogueId,l.name,l.qty,l.unit,l.price,l.hours,l.stage,l.fixed,l.notes]);
  }
 }
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
export function downloadAssemblyLibrary(library,document){
 const blob=new Blob([assemblyLibraryCsv(library)],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='northgate-assembly-library-'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
