import React,{useState} from 'react';
import {readLibraryView,LIBRARY_VIEW_KEY,componentGroups} from './componentStructure.mjs';
import {issues} from './workspaceModel.mjs';
import {money,totals} from './model.mjs';
export function LibraryViewToggle({value,onChange}){return <div className="actions library-view-toggle" role="group" aria-label="Assembly library detail level">{['simple','detailed'].map(v=><button type="button" key={v} aria-pressed={value===v} onClick={()=>onChange(v)}>{v==='simple'?'Simple':'Detailed'}</button>)}</div>;}
export function useLibraryView(frameWindow){
 const [view,setView]=useState(()=>{try{return readLibraryView(frameWindow?.localStorage);}catch{return 'simple';}});
 return [view,v=>{setView(v);try{frameWindow?.localStorage?.setItem(LIBRARY_VIEW_KEY,v);}catch{/* Storage may be disabled. */}}];
}
export function LibraryDetails({item}){
 return <div className="library-detail">{componentGroups(item).map(g=><section key={g.id}><h3>{g.number} · {g.name}</h3>{g.lines.map(l=><div key={l.id} className={'library-resource '+(issues({...item,components:undefined,lines:[l]}).length?'resource-missing':'')}><strong>{l.name||'Missing description'}</strong><span>{l.qty} {l.unit}</span><span>{l.price==null||l.price===''?'Cost missing':money(l.price)}</span><span>{l.hours==null||l.hours===''?'Labor missing':l.hours+' hr / unit'}</span></div>)}</section>)}</div>;
}
