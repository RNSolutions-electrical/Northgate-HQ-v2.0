import { getSupabaseAccessToken } from '../../services/clerkToken.js';
import {useAuth} from '@clerk/clerk-react';
import {ArrowLeft,RefreshCw} from 'lucide-react';
import {useCallback,useEffect,useState} from 'react';
import {StatePanel} from '../../components/ui/StatePanel.jsx';
import {StatusBadge} from '../../components/ui/StatusBadge.jsx';
import {WorkspaceHeader} from '../../components/ui/WorkspaceHeader.jsx';
import {createSupabaseClient} from '../../services/supabaseClient.js';

const money=value=>value==null?'Not set':Number(value).toLocaleString(undefined,{style:'currency',currency:'USD'});
const sourceLabel=value=>({inventory_explicit:'Inventory override',estimating_master:'Estimating master',unverified:'Unverified'})[value]||value||'Unverified';

export function InventoryPriceWorkspace({item,onClose,onSaved}){
 const {getToken}=useAuth();
 const [current,setCurrent]=useState(item),[history,setHistory]=useState([]),[price,setPrice]=useState(item.inventory_price_per_unit??item.price_per_unit??''),[reason,setReason]=useState('');
 const [state,setState]=useState({loading:false,error:null,success:''});
 const client=useCallback(async()=>createSupabaseClient(await getSupabaseAccessToken(getToken)),[getToken]);
 const reload=useCallback(async()=>{
  setState(s=>({...s,loading:true,error:null}));
  try{const db=await client();const [rowResult,historyResult]=await Promise.all([
   db.from('items').select('id,material_code,name,unit_of_measure,division,price_per_unit,estimating_price_per_unit,inventory_price_per_unit,effective_price_source,estimating_price_updated_at,inventory_price_updated_at,updated_at').eq('id',item.id).single(),
   db.from('item_price_history').select('id,effective_price,price_source,estimating_price,inventory_price,changed_by_name,reason,recorded_at').eq('item_id',item.id).order('recorded_at',{ascending:false}).limit(50)
  ]);if(rowResult.error)throw rowResult.error;if(historyResult.error)throw historyResult.error;setCurrent(rowResult.data);setHistory(historyResult.data||[]);setPrice(rowResult.data.inventory_price_per_unit??rowResult.data.price_per_unit??'');setState(s=>({...s,loading:false}));}
  catch(error){setState(s=>({...s,loading:false,error}));}
 },[client,item.id]);
 useEffect(()=>{reload();},[reload]);
 async function save(event){event.preventDefault();const numeric=Number(price);if(!Number.isFinite(numeric)||numeric<0||!reason.trim())return;setState({loading:true,error:null,success:''});try{const db=await client(),result=await db.rpc('set_inventory_item_price',{p_item_id:item.id,p_price:numeric,p_reason:reason.trim()});if(result.error)throw result.error;setReason('');setState({loading:false,error:null,success:'Inventory price override saved. Existing estimates and transactions were not changed.'});await reload();onSaved?.();}catch(error){setState({loading:false,error,success:''});}}
 async function clear(){if(!reason.trim())return;setState({loading:true,error:null,success:''});try{const db=await client(),result=await db.rpc('clear_inventory_item_price',{p_item_id:item.id,p_reason:reason.trim()});if(result.error)throw result.error;setReason('');setState({loading:false,error:null,success:'Inventory override removed. The estimating-master price is effective again.'});await reload();onSaved?.();}catch(error){setState({loading:false,error,success:''});}}
 return <section className="workspace-stack">
  <WorkspaceHeader eyebrow="Inventory Pricing" title={`${current.material_code||'Material'} — ${current.name}`} description="Manage the explicit Inventory valuation price without rewriting saved estimates, assemblies, or transactions." actions={<><button className="secondary-button" onClick={onClose}><ArrowLeft/>Back to Catalogue</button><button className="secondary-button" disabled={state.loading} onClick={reload}><RefreshCw/>Refresh</button></>}/>
  <section className="summary-grid"><article className="card summary-card"><small>Effective price</small><strong>{money(current.price_per_unit)}</strong><StatusBadge>{sourceLabel(current.effective_price_source)}</StatusBadge></article><article className="card summary-card"><small>Estimating master</small><strong>{money(current.estimating_price_per_unit)}</strong><span>{current.estimating_price_updated_at?new Date(current.estimating_price_updated_at).toLocaleString():'Not established'}</span></article><article className="card summary-card"><small>Inventory override</small><strong>{money(current.inventory_price_per_unit)}</strong><span>{current.inventory_price_updated_at?new Date(current.inventory_price_updated_at).toLocaleString():'Not established'}</span></article></section>
  <form className="job-financials-form" onSubmit={save}><h2>Set explicit Inventory price</h2><p>This value takes precedence for inventory valuation and future catalogue selections. Historical snapshots remain unchanged.</p><div className="job-financials-form__grid"><label>Inventory unit price<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} required/></label><label>Shared-price change reason<input value={reason} onChange={e=>setReason(e.target.value)} required maxLength={1000} placeholder="Source and purpose of this valuation change"/></label></div>{state.error?<StatePanel tone="danger" title="Inventory price was not updated" description={state.error.message}/>:null}{state.success?<StatePanel tone="success" title="Inventory price updated" description={state.success}/>:null}<div className="job-financials-form__actions"><button className="primary-button" disabled={state.loading||!reason.trim()}>Save Inventory Override</button>{current.inventory_price_per_unit!=null?<button type="button" className="secondary-button" disabled={state.loading||!reason.trim()} onClick={clear}>Remove Override</button>:null}</div></form>
  <article className="card workspace-card"><h2>Price history</h2>{history.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Recorded</th><th>Source</th><th>Effective</th><th>Estimating</th><th>Inventory</th><th>Changed by</th><th>Reason</th></tr></thead><tbody>{history.map(row=><tr key={row.id}><td>{new Date(row.recorded_at).toLocaleString()}</td><td>{sourceLabel(row.price_source)}</td><td>{money(row.effective_price)}</td><td>{money(row.estimating_price)}</td><td>{money(row.inventory_price)}</td><td>{row.changed_by_name||'Unknown'}</td><td>{row.reason||'Catalogue update'}</td></tr>)}</tbody></table></div>:<StatePanel title="No price changes recorded yet" description="The current backfilled master value is preserved; new changes will appear here." compact/>}</article>
 </section>;
}
