import {useAuth} from '@clerk/clerk-react';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createSupabaseClient} from '../../services/supabaseClient.js';
import {WorkspaceHeader} from '../../components/ui/WorkspaceHeader.jsx';
import {canEditMaterialAliases} from '../../lib/materialResolver.js';
import CatalogueMaterialForm from '../estimates/workbench/CatalogueMaterialForm.jsx';
import './materialCatalogue.css';

export function MaterialCatalogueWorkspace({item,permissions,onClose,onSaved}) {
 const {getToken}=useAuth(),request=useRef(null),lock=useRef(false);
 const [material,setMaterial]=useState(null),[loading,setLoading]=useState(Boolean(item.id)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [department,setDepartment]=useState(item.division||permissions.division||'');
 const [candidateId]=useState(()=>item.id||crypto.randomUUID());
 const client=useCallback(async()=>createSupabaseClient(await getToken({template:'supabase'})),[getToken]);
 useEffect(()=>{let active=true;if(!item.id)return;client().then(db=>db.from('items').select('*,item_aliases(id,alias,archived_at)').eq('id',item.id).single()).then(result=>{if(!active)return;if(result.error)throw result.error;setMaterial(result.data);setLoading(false);}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};},[item.id,client]);
 async function save(values){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');
  const input={p_item_id:candidateId,p_division:department,p_values:values,p_expected_updated_at:material?.updated_at||null};
  const key=JSON.stringify(input);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
  try{const db=await client(),result=await db.rpc('save_full_material_catalogue',{...input,p_request_id:request.current.id});if(result.error)throw result.error;
   setMaterial(result.data.item);request.current=null;setMessage(result.data.stock_review_id?'Catalogue saved. Stock review is pending; on-hand inventory has not changed.':'Catalogue saved.');onSaved?.();
  }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 return <section className="workspace-stack"><WorkspaceHeader eyebrow="Full material catalogue" title={material?.name||item.name||'Add material'} description="Aliases, vendor pricing, labor inputs, notes and stock observations." actions={<button className="secondary-button" disabled={busy} onClick={onClose}>Back to Inventory</button>}/>
  <article className="card workspace-card">
   {loading?<p>Loading material…</p>:item.id&&!material?<p role="alert">{error}</p>:<>
    {!material&&permissions.canViewAllDivisions&&<label>Department<select value={department} onChange={e=>setDepartment(e.target.value)}>{['Electrical','Construction','Admin'].map(d=><option key={d}>{d}</option>)}</select></label>}
    {message&&<p role="status">{message}</p>}
    <CatalogueMaterialForm key={material?.updated_at||candidateId} material={material} line={{unit:'EA'}} busy={busy} error={error} readOnly={!canEditMaterialAliases(permissions,material?.division||department)} onSave={save}/>
   </>}
  </article></section>;
}
