import { getSupabaseAccessToken } from '../../services/clerkToken.js';
import {useAuth} from '@clerk/clerk-react';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createSupabaseClient} from '../../services/supabaseClient.js';
import './materialCatalogue.css';

export function MaterialStockReviews({destinationId,onSaved}) {
 const {getToken}=useAuth(),lock=useRef(false);
 const [rows,setRows]=useState([]),[selected,setSelected]=useState(null),[bins,setBins]=useState([]),[binId,setBinId]=useState('');
 const [quantity,setQuantity]=useState(''),[confirmed,setConfirmed]=useState(false),[note,setNote]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const client=useCallback(async()=>createSupabaseClient(await getSupabaseAccessToken(getToken)),[getToken]);
 const reload=useCallback(async()=>{setLoading(true);setError('');try{const db=await client(),r=await db.rpc('read_catalogue_stock_reviews');if(r.error)throw r.error;setRows(r.data||[]);}catch(e){setError(e.message);}finally{setLoading(false);}},[client]);
 useEffect(()=>{reload();},[reload]);
 useEffect(()=>{if(destinationId)setSelected(rows.find(row=>row.id===destinationId)||null);},[destinationId,rows]);
 useEffect(()=>{let active=true;setBins([]);setBinId('');setQuantity('');setConfirmed(false);setNote('');if(!selected?.can_review||selected.status!=='pending')return;
  client().then(db=>db.rpc('read_catalogue_stock_locations',{p_item_id:selected.proposed_payload.item_id})).then(r=>{if(!active)return;if(r.error)throw r.error;setBins(r.data||[]);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};
 },[selected?.id,selected?.status,selected?.can_review,client]);
 const bin=bins.find(row=>row.id===binId);
 async function decide(decision){
  if(lock.current)return;
  if(!note.trim()){setError('Enter a review note.');return;}
  if(decision==='approve'&&(!bin||!confirmed||quantity.trim()===''||!Number.isFinite(Number(quantity))||Number(quantity)<0)){setError('Select the bin, enter the actual total count, and confirm it.');return;}
  lock.current=true;setBusy(true);setError('');setMessage('');
  try{const db=await client(),r=await db.rpc('review_catalogue_stock',{p_destination_id:selected.id,p_expected_version:selected.version,p_expected_payload_hash:selected.payload_hash,p_decision:decision,p_bin_id:decision==='approve'?binId:null,p_confirmed_quantity:decision==='approve'?Number(quantity):null,p_expected_quantity:decision==='approve'?bin.quantity:null,p_expected_balance_updated_at:decision==='approve'?bin.balance_updated_at:null,p_note:note.trim()});if(r.error)throw r.error;
   setSelected(null);setMessage(decision==='approve'?'Stock count approved and recorded.':decision==='return'?'Request returned with your note.':'Request declined.');await reload();onSaved?.();
  }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 return <article className="card workspace-card material-stock-reviews"><div className="catalogue-review-heading"><div><h2>Stock reviews</h2><p>Inventory Manager, Inventory Administrator, or a Developer confirms each count. Authorized submitters may review their own request in this separate confirmation step.</p></div><button className="secondary-button" disabled={loading||busy} onClick={()=>{setSelected(null);reload();}}>Refresh</button></div>
  {error&&<p role="alert" className="save-error">{error}</p>}{message&&<p role="status">{message}</p>}
  {loading?<p>Loading stock reviews…</p>:<div className="catalogue-review-list">{rows.map(row=><button className="secondary-button" key={row.id} onClick={()=>{setSelected(row);setError('');}} disabled={busy}><strong>{row.proposed_payload.name}</strong><span>{row.status} · {row.submitted_by_name} · {row.proposed_payload.division}</span></button>)}{!rows.length&&<p>No stock requests in your scope.</p>}</div>}
  {selected&&<section className="material-stock-review"><h3>{selected.proposed_payload.material_code} — {selected.proposed_payload.name}</h3>
   <dl><dt>Suggested quantity</dt><dd>{selected.proposed_payload.stock.quantity??'Not supplied'} {selected.proposed_payload.unit}</dd>
    {['storage_unit','shelf','bay','bin'].map(key=><div key={key}><dt>{key.replace('_',' ')}</dt><dd>{selected.proposed_payload.stock[key]||'Not supplied'}</dd></div>)}
   </dl>
   <p>Status: {selected.status}{selected.review_note?` — ${selected.review_note}`:''}</p>
   {!selected.can_review&&selected.status==='pending'&&<p>Awaiting an authorized inventory reviewer.</p>}
   {['returned','declined'].includes(selected.status)&&<p>Your catalogue changes remain saved. Open the material, correct the stock details, and save a new request when ready.</p>}
   {selected.can_review&&selected.status==='pending'&&<fieldset disabled={busy} className="resource-fields"><legend>Confirm actual on-hand inventory</legend>
    <label className="wide">Actual bin<select value={binId} onChange={e=>{setBinId(e.target.value);setConfirmed(false);}}><option value="">Select the verified location</option>{bins.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
    {!bins.length&&<p className="wide">No active bins are available in this Department. Set up the storage location through Inventory before approving; you can return the request for clarification.</p>}
    {bin&&<p className="wide">Currently recorded: {bin.quantity==null?'No count recorded':`${bin.quantity} ${selected.proposed_payload.unit}`}. Enter the total physically present, including any stock already recorded.</p>}
    <label>Confirmed total quantity ({selected.proposed_payload.unit})<input type="number" min="0" step="any" value={quantity} onChange={e=>{setQuantity(e.target.value);setConfirmed(false);}}/></label>
    <label className="wide catalogue-checkbox"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I verified this bin and the actual total count.</label>
    <label className="wide">Review note<textarea maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>
    <div className="wide dialog-actions"><button className="primary-button" disabled={!confirmed||!bin||!note.trim()} onClick={()=>decide('approve')}>Approve & record count</button><button className="secondary-button" onClick={()=>decide('return')}>Return for clarification</button><button className="secondary-button" onClick={()=>decide('decline')}>Decline</button></div>
   </fieldset>}
  </section>}
 </article>;
}
