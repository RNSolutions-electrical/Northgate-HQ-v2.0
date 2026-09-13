import React,{useState} from 'react';
import {Download} from 'lucide-react';
import {selectEntries,takeoffRows,entrySummary,exportCsv,exportPdf,exportFilename,downloadFile} from './exports.mjs';
import {money} from './model.mjs';
import {sumPricing} from './pricing.mjs';

export function ExportDialog({data,initialKind,initialScope='all',initialValue='',onDone}){
 const [kind,setKind]=useState(initialKind);const [format,setFormat]=useState('pdf');
 const [scope,setScope]=useState(initialScope);const [value,setValue]=useState(initialValue);const [excluded,setExcluded]=useState([]);
 const [purpose,setPurpose]=useState('rfq');const [includeItems,setIncludeItems]=useState(true);
 const [vendor,setVendor]=useState('');const [reference,setReference]=useState('');const [date,setDate]=useState('');const [notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const values=[...new Set(data.entries.map(e=>scope==='room'?e.location:e.section))];
 const available=selectEntries(data.entries,scope,value);const entries=selectEntries(data.entries,scope,value,excluded);
 const materials=takeoffRows(entries);const label=scope==='all'?'Whole estimate':`${scope==='room'?'Room':'Section'}: ${value}`;
 async function save(e){e.preventDefault();setBusy(true);setError('');
  try{
   const options={kind,format,purpose,includeItems,vendor,reference,date,notes};
   const content=format==='pdf'?await exportPdf(data,entries,options,label):exportCsv(data,entries,options);
   downloadFile(content,format==='pdf'?'application/pdf':'text/csv;charset=utf-8',exportFilename(data,options,label));
   onDone();
  }catch(failure){setError(failure.message||'Export could not be created.');}finally{setBusy(false);}
 }
 return <form onSubmit={save} className="export-form">
  <div className="export-fields"><label>Document<select aria-label="Export document" value={kind} onChange={e=>setKind(e.target.value)}><option value="estimate">Estimate summary</option><option value="project">High-level project breakdown</option><option value="takeoff">Vendor takeoff</option></select></label><label>Format<select aria-label="Export format" value={format} onChange={e=>setFormat(e.target.value)}><option value="pdf">PDF</option><option value="csv">CSV</option></select></label>
  <label>Scope<select aria-label="Export scope" value={scope} onChange={e=>{const next=e.target.value;setScope(next);setValue(next==='room'?data.entries[0]?.location||'':next==='section'?data.entries[0]?.section||'':'');setExcluded([]);}}><option value="all">Whole estimate</option><option value="room">By room / location</option><option value="section">By section</option></select></label>
  {scope!=='all'&&<label>{scope==='room'?'Room / location':'Section'}<select aria-label="Export scope value" value={value} onChange={e=>{setValue(e.target.value);setExcluded([]);}}>{values.map(v=><option key={v}>{v}</option>)}</select></label>}</div>
  <fieldset className="export-entry-list"><legend>Entries to include</legend><div className="export-select-actions"><button type="button" onClick={()=>setExcluded([])}>Select all</button><button type="button" onClick={()=>setExcluded(available.map(e=>e.id))}>Clear selection</button></div>
   {available.map(e=><label className="check" key={e.id}><input type="checkbox" checked={!excluded.includes(e.id)} onChange={event=>setExcluded(ids=>event.target.checked?ids.filter(id=>id!==e.id):[...ids,e.id])}/><span>Entry {String(e.number).padStart(3,'0')} · {e.location} · {e.section}<small>{e.name}</small></span></label>)}
   {!available.length&&<p>No entries in this scope.</p>}
  </fieldset>
  {kind==='takeoff'?<><div className="export-fields"><label>Vendor document<select aria-label="Vendor document" value={purpose} onChange={e=>setPurpose(e.target.value)}><option value="rfq">Request for pricing</option><option value="order">Material order</option></select></label><label>Vendor<input value={vendor} onChange={e=>setVendor(e.target.value)}/></label><label>Reference<input value={reference} onChange={e=>setReference(e.target.value)}/></label><label>Requested date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div><label>Delivery / vendor notes<textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label><p className="dialog-note">Material descriptions, quantities and units only. Internal prices, labor and project notes are excluded.</p></>:format==='pdf'&&kind==='estimate'?<label className="check"><input type="checkbox" checked={includeItems} onChange={e=>setIncludeItems(e.target.checked)}/> Include work item breakdowns</label>:null}
  <p className="export-summary">{entries.length} entries selected · {kind==='takeoff'?`${materials.length} material lines`:money(sumPricing(entries.flatMap(e=>e.items),data).price)+' including fee'}</p>
  {kind==='takeoff'&&!materials.length&&<p>No materials in the selected entries.</p>}
  {error&&<p role="alert">{error}</p>}
  <div className="dialog-actions"><button type="submit" className="primary" disabled={busy||!entries.length||(kind==='takeoff'&&!materials.length)}><Download size={16}/>{busy?'Creating file...':`Download ${format.toUpperCase()}`}</button></div>
 </form>;
}
