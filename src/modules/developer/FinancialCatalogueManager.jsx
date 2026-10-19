import {useEffect,useRef,useState} from 'react';
import {useAuth} from '@clerk/clerk-react';
import * as XLSX from 'xlsx';
import {getSupabaseAccessToken} from '../../services/clerkToken.js';
import {createSupabaseClient} from '../../services/supabaseClient.js';
import {planFinancialCatalogueImport} from './financialCatalogueImport.js';

const empty={code:'',name:'',cost_code:'',description:'',division_id:'',category:'other',is_protected_financial:false,sort_order:0,notes:'',subdivision_name:''};
export function FinancialCatalogueManager(){
 const {getToken}=useAuth(),lock=useRef(false);
 const [data,setData]=useState({divisions:[],lines:[]}),[entity,setEntity]=useState('division'),[search,setSearch]=useState(''),[state,setState]=useState('active');
 const [editor,setEditor]=useState(null),[draft,setDraft]=useState(empty),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[preview,setPreview]=useState(null);
 const db=async()=>createSupabaseClient(await getSupabaseAccessToken(getToken));
 async function load(){try{const result=await(await db()).rpc('read_financial_catalogue',{p_include_retired:true});if(result.error)throw result.error;setData(result.data);}catch(e){setError(e.message);}}
 useEffect(()=>{load();},[]);
 const rows=(entity==='division'?data.divisions:data.lines).filter(row=>(state==='all'||row.is_active===(state==='active'))&&[row.code,row.name,row.cost_code,row.description,row.division_name].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 function edit(row=null,operation='save'){setEditor({row,operation});setDraft({...empty,...row,division_id:row?.division_id||data.divisions.find(d=>d.is_active)?.id||''});setReason('');setError('');setMessage('');}
 async function save(event){event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   const values=editor.operation==='save'?(entity==='division'?{code:draft.code,name:draft.name,sort_order:Number(draft.sort_order)}:
    {division_id:draft.division_id,cost_code:draft.cost_code,description:draft.description,category:draft.category,is_protected_financial:draft.is_protected_financial,
     sort_order:Number(draft.sort_order),notes:draft.notes||null,subdivision_name:draft.subdivision_name||null}):{};
   const result=await(await db()).rpc('save_financial_catalogue_entry',{p_entity:entity,p_operation:editor.operation,p_id:editor.row?.id||null,p_expected_version:editor.row?.version??null,p_values:values,p_reason:reason.trim()||null});
   if(result.error)throw result.error;
   setEditor(null);setMessage(`${entity==='division'?'Division':'Cost code'} ${editor.operation==='save'?'saved':editor.operation==='retire'?'retired':'reactivated'}. Existing project overrides and financial values were retained.`);
   await load();window.dispatchEvent(new Event('northgate:financial-catalogue-updated'));
  }catch(e){setError(e.message||'Catalogue entry was not saved.');}finally{lock.current=false;setBusy(false);}
 }
 async function importFile(event){const file=event.target.files?.[0];if(!file)return;setError('');setMessage('');
  try{
   const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'}),raw=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{defval:''});
   const planned=planFinancialCatalogueImport(raw,data);
   if(!planned.length)throw Error('No valid catalogue rows were found.');
   setPreview({filename:file.name,rows:planned});
  }catch(e){setError(e.message);}finally{event.target.value='';}
 }
 async function applyImport(){if(lock.current||!preview)return;lock.current=true;setBusy(true);setError('');try{
  const result=await(await db()).rpc('replace_financial_line_catalogue',{p_rows:preview.rows,p_reason:reason.trim()||`Catalogue import: ${preview.filename}`});if(result.error)throw result.error;
  setPreview(null);setMessage(`${result.data} catalogue entries saved. No project financial rows were inserted.`);await load();window.dispatchEvent(new Event('northgate:financial-catalogue-updated'));
 }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}
 function exportFile(){const sheet=XLSX.utils.json_to_sheet(data.lines.map(row=>({Division:`${row.division_code} ${row.division_name}`,'Cost Code':row.cost_code,Name:row.description,
  'Sub-Division':row.subdivision_name,Notes:row.notes,category:row.category,is_protected_financial:row.is_protected_financial,'Sort Order':row.sort_order})));const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,'Cost Codes');XLSX.writeFile(workbook,'Northgate Financial Catalogue.xlsx');}
 return <section className="financial-catalogue-manager" aria-label="Financial catalogue manager">
  <header><h3>Financial catalogue</h3><p>Manage shared financial divisions and cost-code names. Jobs inherit these names unless they have a project name override.</p></header>
  <div className="job-financials-quick-actions"><button type="button" className="secondary-button" aria-pressed={entity==='division'} onClick={()=>{setEntity('division');setEditor(null);}}>Divisions</button><button type="button" className="secondary-button" aria-pressed={entity==='code'} onClick={()=>{setEntity('code');setEditor(null);}}>Cost Codes</button><button type="button" className="primary-button" disabled={busy} onClick={()=>edit()}>Add {entity==='division'?'division':'cost code'}</button><button type="button" className="secondary-button" onClick={load}>Refresh catalogue</button><button type="button" className="secondary-button" onClick={exportFile}>Export catalogue</button></div>
  <div className="financial-catalogue-filters"><label>Search catalogue<input aria-label="Search financial catalogue" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Code or name"/></label><label>Status<select aria-label="Catalogue status" value={state} onChange={e=>setState(e.target.value)}><option value="active">Active</option><option value="retired">Retired</option><option value="all">All</option></select></label><label>Import catalogue workbook<input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={importFile}/></label></div>
  {message?<p role="status">{message}</p>:null}{error?<p role="alert" className="form-error">{error}</p>:null}
  {preview?<section aria-label="Catalogue import preview"><h4>Review {preview.rows.length} imported entries</h4><p>Names and defaults are shown below. Existing entry versions are checked when saved. Job amounts, project names and assignments are not changed.</p><ul>{preview.rows.map(row=><li key={row.cost_code}>{row.cost_code} — {row.description} ({row.expected_version?'Update':'New'})</li>)}</ul><label>Import note<input value={reason} onChange={e=>setReason(e.target.value)}/></label><button type="button" className="primary-button" disabled={busy} onClick={applyImport}>Save reviewed import</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>setPreview(null)}>Cancel import</button></section>:null}
  {editor?<form className="financial-catalogue-editor" aria-label="Catalogue entry editor" onSubmit={save}>
   <h4>{editor.operation==='save'?(editor.row?'Edit':'Add'):`${editor.operation==='retire'?'Retire':'Reactivate'}`} {entity==='division'?'division':'cost code'}</h4>
   {editor.operation==='save'?<>
    {entity==='code'?<label>Division<select aria-label="Catalogue division" value={draft.division_id} disabled={busy||editor.row?.usage_count>0} onChange={e=>setDraft({...draft,division_id:e.target.value})}>{data.divisions.filter(d=>d.is_active||d.id===draft.division_id).map(d=><option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}</select></label>:null}
    <label>Code<input aria-label="Catalogue code" required value={entity==='division'?draft.code:draft.cost_code} disabled={busy||editor.row?.usage_count>0} onChange={e=>setDraft({...draft,[entity==='division'?'code':'cost_code']:e.target.value})}/></label>
    <label>Name<input aria-label="Catalogue name" required maxLength={250} value={entity==='division'?draft.name:draft.description} disabled={busy} onChange={e=>setDraft({...draft,[entity==='division'?'name':'description']:e.target.value})}/></label>
    <label>Sort order<input aria-label="Catalogue sort order" type="number" value={draft.sort_order} disabled={busy} onChange={e=>setDraft({...draft,sort_order:e.target.value})}/></label>
    {entity==='code'?<><label>Default category<select aria-label="Default cost category" value={draft.category} disabled={busy||editor.row?.usage_count>0} onChange={e=>setDraft({...draft,category:e.target.value})}>{['other','material','labor','subcontractor','equipment','permit','ohp_fee'].map(c=><option key={c}>{c}</option>)}</select></label><label><input type="checkbox" checked={draft.is_protected_financial} disabled={busy||editor.row?.usage_count>0} onChange={e=>setDraft({...draft,is_protected_financial:e.target.checked})}/>Protected by default</label><label>Default notes<textarea value={draft.notes||''} disabled={busy} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label></>:null}
   </>:<p>{editor.operation==='retire'?'Stops new selection. Existing jobs and their financial/history records remain linked.':'Makes this catalogue entry available for new selection again.'}</p>}
   {editor.row?.usage_count>0?<p>Used by {editor.row.usage_count} existing records. Code, division and classification changes require a separate impact review.</p>:null}
   <label>{editor.operation==='save'?'Save note (optional)':'Reason'}<input aria-label="Catalogue change note" value={reason} required={editor.operation!=='save'} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
   <div className="job-financials-quick-actions"><button className="primary-button" disabled={busy}>{busy?'Saving...':editor.operation==='save'?'Save catalogue entry':editor.operation==='retire'?'Retire catalogue entry':'Reactivate catalogue entry'}</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button></div>
  </form>:null}
  <div className="table-wrap"><table className="data-table"><thead><tr><th>Code</th><th>Name</th>{entity==='code'?<th>Division</th>:null}<th>Status</th><th>Existing uses</th><th>Actions</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}>
   <td data-label="Code">{row.code||row.cost_code}</td><td data-label="Name">{row.name||row.description}</td>
   {entity==='code'?<td data-label="Division">{row.division_name}</td>:null}
   <td data-label="Status">{row.is_active?'Active':'Retired'}</td><td data-label="Existing uses">{row.usage_count||0}</td>
   <td data-label="Actions"><button type="button" className="text-button" disabled={busy} onClick={()=>edit(row)}>Edit</button><button type="button" className="text-button" disabled={busy} onClick={()=>edit(row,row.is_active?'retire':'reactivate')}>{row.is_active?'Retire':'Reactivate'}</button></td>
  </tr>)}</tbody></table>{!rows.length?<p>No matching catalogue entries.</p>:null}</div>
 </section>;
}
