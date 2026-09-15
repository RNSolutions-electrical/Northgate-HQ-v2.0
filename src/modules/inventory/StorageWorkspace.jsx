import {useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {DataTable} from '../../components/ui/DataTable.jsx';
import {Toolbar} from '../../components/ui/Toolbar.jsx';
import {StorageLocationLifecycle} from './StorageLocationLifecycle.jsx';
import {canManageInventoryDepartment} from './inventoryAccess.js';
import {activeStorage,labelSelection,locationTrail,storageLevels,storageNames} from './storageHierarchy.js';
import {buildLocationQrSvg} from '../../lib/locationQr.js';
import './storageWorkspace.css';

export function StorageWorkspace({records,sheet,permissions,onReload,onAdd,onCount,countColumns,onScan}){
 const [params,setParams]=useSearchParams(),id=params.get('locationId')||'';
 const current=records.find(row=>row.id===id),trail=locationTrail(records,id);
 const [search,setSearch]=useState(''),[archived,setArchived]=useState(false),[labels,setLabels]=useState(false);
 const [level,setLevel]=useState('all'),[selected,setSelected]=useState(null),[size,setSize]=useState('1.75'),[slot,setSlot]=useState('1'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const visible=archived?records:activeStorage(records);
 const children=visible.filter(row=>row.parentId===(current?.id||null)).filter(row=>(row.code+' '+row.label+' '+(row.physical_location||'')+' '+(row.materials_summary||'')).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.position-b.position||a.code.localeCompare(b.code,undefined,{numeric:true}));
 const nextType=current?storageLevels[storageLevels.indexOf(current.type)+1]:'unit';
 const canManage=current?canManageInventoryDepartment(permissions,current.division):permissions.canManageInventory===true;
 const choose=next=>{setParams(p=>{const n=new URLSearchParams(p);n.set('view','storage');next?n.set('locationId',next):n.delete('locationId');return n;});setSearch('');setLabels(false);setSelected(null);setError('');};
 const options=labelSelection(records,current?.id,level),chosen=options.filter(row=>selected===null||selected.includes(row.id));
 async function exportLabels(){
  setBusy(true);setError('');
  try{const {createStorageLabels,downloadStorageFile}=await import('./storageLabels.js');const bytes=await createStorageLabels(chosen,{qrInches:Number(size),startSlot:Number(slot)});downloadStorageFile('northgate-storage-avery-5164.pdf',bytes,'application/pdf');}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function exportSvg(){
  setError('');try{if(!Number.isFinite(Number(size))||Number(size)<.75||Number(size)>2.1)throw new Error('Choose a QR size between 0.75 and 2.1 inches.');
   const {downloadStorageFile}=await import('./storageLabels.js');downloadStorageFile('northgate-location-'+current.code.replace(/[^a-z0-9_-]/gi,'-')+'.svg',buildLocationQrSvg(current.id).replace('<svg ',`<svg width="${Number(size)}in" height="${Number(size)}in" `),'image/svg+xml');
  }catch(e){setError(e.message);}
 }
 return <section className="storage-workspace" data-ng-ui-type="MODULE" data-ng-ui-name="Storage Explorer">
  <nav className="storage-breadcrumbs" aria-label="Storage path"><button className="secondary-button" onClick={()=>choose('')}>Storage</button>{trail.map(row=><button key={row.id} className="secondary-button" aria-current={row.id===id?'page':undefined} onClick={()=>choose(row.id)}>{row.code}</button>)}</nav>
  {id&&!current&&!sheet.isLoading&&<p role="alert">This location is unavailable. Return to Storage or refresh.</p>}
  <article className="card workspace-card">
   <Toolbar eyebrow={current?.typeLabel||'Storage'} title={current?`${current.code} — ${current.label}`:'Storage Units'} description={current?.materials_summary||'Open a location to see what it contains.'}
    actions={<><button className="secondary-button" onClick={onReload}>Refresh Storage</button><button className="secondary-button" onClick={()=>{setLabels(!labels);setSelected(null);}}>QR labels</button>{canManage&&!current?.archived_at&&nextType&&<button className="primary-button" onClick={()=>onAdd(current||null)}>Add {storageNames[nextType].toLowerCase()}</button>}{canManage&&current?.type==='bin'&&!current.archived_at&&<button className="primary-button" onClick={()=>onCount(current)}>Add materials / Count</button>}</>} dense/>
   {current&&<><p>{current.physical_location||'Physical location not specified'} · {current.division}{current.archived_at?' · Archived':''}</p><details key={current.id} className="storage-details"><summary>Location details &amp; administration</summary><StorageLocationLifecycle key={current.id+':'+current.revision} location={current} locations={activeStorage(records)} permissions={permissions} onSaved={onReload} onDeleted={deleted=>{choose(deleted.parentId||'');onReload();}}/></details></>}
   {labels&&<div className="storage-labels" data-ng-ui-type="FUNCTION" data-ng-ui-name="Export Storage QR Labels">
    <h3>QR labels</h3><p>Avery 5164: six 4″ × 3⅓″ labels on US Letter. Print at Actual size / 100%, not Fit. Test alignment on plain paper first. QR size includes its quiet zone; test the smallest size with your scanner.</p>
    <div className="inventory-setup-grid">
     <label>Locations to print<select value={level} onChange={e=>{setLevel(e.target.value);setSelected(null);}}><option value="all">This branch — all levels</option>{storageLevels.map(t=><option key={t} value={t}>{storageNames[t]} labels</option>)}</select></label>
     <label>QR size (inches)<input type="number" min=".75" max="2.1" step=".05" value={size} onChange={e=>setSize(e.target.value)}/></label>
     <label>Start at label<select value={slot} onChange={e=>setSlot(e.target.value)}>{[1,2,3,4,5,6].map(n=><option key={n}>{n}</option>)}</select></label>
    </div>
    <div className="storage-actions"><button className="secondary-button" onClick={()=>setSelected(null)}>Select all</button><button className="secondary-button" onClick={()=>setSelected([])}>Clear selection</button><button className="primary-button" disabled={busy||!chosen.length} onClick={exportLabels}>{busy?'Exporting…':`Export Avery 5164 PDF (${chosen.length})`}</button>{current&&<><button className="secondary-button" onClick={exportSvg}>Download this QR as SVG</button><button className="secondary-button" disabled={!!current.archived_at} onClick={()=>onScan(current.id)}>Open Scan Result</button></>}</div>
    {error&&<p role="alert">{error}</p>}
    <div className="storage-label-list">{options.map(row=><label key={row.id}><input type="checkbox" checked={selected===null||selected.includes(row.id)} onChange={e=>setSelected(e.target.checked?[...(selected||[]),row.id]:(selected||options.map(r=>r.id)).filter(key=>key!==row.id))}/>{row.path} — {row.label}</label>)}</div>
    {current&&<div className="storage-qr" style={{width:`${Math.min(2.1,Math.max(.75,Number(size)||1.75))*96}px`}} dangerouslySetInnerHTML={{__html:buildLocationQrSvg(current.id)}}/>}
   </div>}
   {current?.type==='bin'?<DataTable columns={canManage&&!current.archived_at?countColumns.filter(c=>!['storage_path','min_quantity'].includes(c.key)):[{key:'material_code',header:'Code'},{key:'item_name',header:'Material'},{key:'unit_of_measure',header:'Unit'},{key:'quantity_on_hand',header:'Quantity',render:r=>r.quantity_recorded===false?'Not counted':r.quantity_on_hand}]} rows={sheet.rows.filter(row=>row.bin_id===id)} permissions={permissions} getRowKey={r=>r.bin_item_id} minWidth="900px" isLoading={sheet.isLoading} error={sheet.error} dense emptyTitle="No visible materials in this bin" emptyDescription="Add material mappings without quantities, then record a physical count when ready."/>:
    <><div className="storage-actions"><label>Search this level<input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label><label><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/> Include archived locations</label></div>
     <DataTable columns={[{key:'code',header:'Code'},{key:'label',header:'Name'},{key:'physical_location',header:'Physical location'},{key:'materials_summary',header:'Materials / purpose'},{key:'children',header:'Contents',render:r=>r.type==='bin'?`${sheet.rows.filter(s=>s.bin_id===r.id).length} material lines`:`${visible.filter(c=>c.parentId===r.id).length} ${storageNames[storageLevels[storageLevels.indexOf(r.type)+1]].toLowerCase()} locations`},{key:'archived_at',header:'Status',render:r=>r.archived_at?'Archived':'Active'},{key:'open',header:'Open',render:r=><button className="secondary-button" onClick={e=>{e.stopPropagation();choose(r.id);}}>Open {r.code}</button>}]} rows={children} permissions={permissions} getRowKey={r=>r.id} onRowClick={r=>choose(r.id)} isLoading={sheet.isLoading} error={sheet.error} dense emptyTitle="No locations here" emptyDescription="Add a location or clear your search."/>
    </>}
  </article>
 </section>;
}
