import React,{useState} from 'react';
import {takeoff} from './workspaceModel.mjs';
import {money} from './model.mjs';
import BulkCheckbox from './BulkCheckbox.jsx';
import {makeReport} from './reports.mjs';
import {downloadReportCSV} from './ReportPreview.jsx';

export default function TakeoffWorkspace({data,locked,onChange,onPreview}){
 const [scope,setScope]=useState(''),[showHidden,setShowHidden]=useState(false),[kind,setKind]=useState('takeoff'),[exportMode,setExportMode]=useState('Selected items');
 const annotations=data.takeoffAnnotations||{};
 const rows=takeoff({...data,entries:data.entries.filter(e=>!scope||e.section===scope)});
 const visible=rows.filter(r=>!annotations[r.key]?.hidden),display=showHidden?rows:visible;
 function mark(keys,patch){const next={...annotations};keys.forEach(key=>{next[key]={...next[key],...patch};});onChange(next);}
 const options={scope,annotations,exportMode};
 return <section><div className="section-heading"><div><h2>Material takeoff</h2><p className="muted">Ordered is a tracking flag, not a purchase order. Hidden items remain in estimate pricing.</p></div><button type="button" onClick={()=>setShowHidden(!showHidden)}>{showHidden?'Hide hidden items':'Unhide / view hidden items'}</button></div>
  <div className="takeoff-toolbar">
   <label>Section<select aria-label="Takeoff section" value={scope} onChange={e=>setScope(e.target.value)}><option value="">All sections</option>{data.sections.map(s=><option key={s}>{s}</option>)}</select></label>
   <label>Purpose<select aria-label="Export purpose" value={kind} onChange={e=>setKind(e.target.value)}><option value="takeoff">Internal material takeoff</option><option value="rfq">Request for Quote (no pricing)</option></select></label>
   <label>Include<select aria-label="Export selection" value={exportMode} onChange={e=>setExportMode(e.target.value)}>{['Selected items','All visible items','Unordered visible items'].map(x=><option key={x}>{x}</option>)}</select></label>
   <button type="button" onClick={()=>downloadReportCSV(makeReport(data,kind,options))}>Export CSV (Excel)</button><button type="button" onClick={()=>onPreview(kind,options)}>Preview / PDF</button>
  </div>
  <div className="table-scroll"><table className="workspace-table"><thead><tr><th>Material</th><th>Quantity</th><th>Material cost</th><th><BulkCheckbox label="Check all ordered" rows={visible} checked={r=>!!annotations[r.key]?.ordered} disabled={locked} onChange={v=>mark(visible.map(r=>r.key),{ordered:v})}/></th><th><BulkCheckbox label="Check all export" rows={visible} checked={r=>!!annotations[r.key]?.selected} disabled={locked} onChange={v=>mark(visible.map(r=>r.key),{selected:v})}/></th><th>Visibility</th></tr></thead><tbody>
   {display.map(r=><tr key={r.key}><td>{r.name}</td><td>{Number(r.qty.toFixed(4))} {r.unit}</td><td>{money(r.cost)}</td><td><input type="checkbox" aria-label={'Ordered '+r.name} disabled={locked} checked={!!annotations[r.key]?.ordered} onChange={e=>mark([r.key],{ordered:e.target.checked})}/></td><td><input type="checkbox" aria-label={'Export '+r.name} disabled={locked} checked={!!annotations[r.key]?.selected} onChange={e=>mark([r.key],{selected:e.target.checked})}/></td><td><button type="button" disabled={locked} onClick={()=>mark([r.key],{hidden:!annotations[r.key]?.hidden})}>{annotations[r.key]?.hidden?'Unhide':'Hide'}</button></td></tr>)}
  </tbody></table></div>{!display.length&&<p>No materials in this view.</p>}
 </section>;
}
