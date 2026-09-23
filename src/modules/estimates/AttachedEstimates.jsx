import { getSupabaseAccessToken } from '../../services/clerkToken.js';
import {EstimateChecklistSummary} from './EstimateChecklistSummary.jsx';
import {useEffect,useState} from 'react';
import {useAuth} from '@clerk/clerk-react';
import {createSupabaseClient} from '../../services/supabaseClient.js';
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
export function AttachedEstimates({jobId,changeOrderId,permissions,onUseQuote}){
 const {getToken}=useAuth(),[rows,setRows]=useState([]),[error,setError]=useState('');
 const allowed=(permissions?.canViewProjectFinancials||permissions?.can_view_project_financials)&&(permissions?.canViewProtectedProjectFinancials||permissions?.can_view_protected_project_financials);
 useEffect(()=>{let active=true;setRows([]);setError('');if(!allowed||!jobId)return;
 (async()=>{try{const db=createSupabaseClient(await getSupabaseAccessToken(getToken));let query=db.from('estimate_workflow_handoffs').select('id,estimate_id,source_version,source_revision,destination,change_order_id,pricing,created_at,checklist:source_document->finalizationChecklist').eq('job_id',jobId).order('created_at',{ascending:false});
 query=changeOrderId?query.eq('change_order_id',changeOrderId):query.is('change_order_id',null);
 const result=await query;if(result.error)throw result.error;if(active)setRows(result.data||[]);
 }catch(e){if(active)setError(e.message);}})();return()=>{active=false;};},[getToken,jobId,changeOrderId,allowed]);
 if(!allowed)return null;if(error)return <p role="alert">Attached estimates could not be loaded: {error}</p>;if(!rows.length)return null;
 return <section className="workspace-stack" aria-label="Attached estimates for review"><h3>{changeOrderId?'Source estimate':'Estimates for review'}</h3>{rows.map(row=><details key={row.id}><summary>Estimate version {row.source_version} · {money(row.pricing.total)} · {new Date(row.created_at).toLocaleDateString()}</summary><p>Original handoff: saved revision {row.source_revision}. Proposed pricing only—not actual costs, authorization or billing. Destination edits do not alter this copy.</p><div style={{overflowX:'auto'}}><table><thead><tr><th>Scope</th><th>Material</th><th>Labor</th><th>Other</th><th>Markup / fee</th><th>Total</th></tr></thead><tbody>{row.pricing.lines.map(l=><tr key={l.key}><td>{l.description}</td><td>{money(l.material_amount)}</td><td>{money(l.labor_amount)}</td><td>{money(l.other_amount)}</td><td>{money(l.markup_amount)}</td><td>{money(l.line_total)}</td></tr>)}</tbody></table></div><EstimateChecklistSummary checklist={row.checklist}/>{onUseQuote&&<button type="button" className="secondary-button" onClick={()=>onUseQuote(row.pricing.total)}>Review as service call quoted amount</button>}</details>)}</section>;
}
