import snapshot from 'virtual:production-financial-snapshot';
import {groupFinancialDivisions} from '../../src/modules/jobs/financialDivisionGroups.js';
import {mergeFinancialNames} from '../../src/modules/jobs/financialNames.js';
const getToken=async()=>'local-fixture';
export const useAuth=()=>({getToken});export const useUser=()=>({user:{id:'local-fixture',fullName:'Local fixture'}});
export const withSupabaseTokenRetry=async(_token,operation)=>operation(createSupabaseClient());
const original=structuredClone(snapshot),job={...snapshot.job,name:'Production-shaped Toro fixture',job_number:'FIXTURE'};
let rows=structuredClone(snapshot.lines),divisions=structuredClone(snapshot.divisions),masters=structuredClone(snapshot.master_divisions),catalogue=structuredClone(snapshot.catalogue);
const visible=()=>rows.filter(r=>!r.archived_at&&(!location.search.includes('restricted')||!r.is_protected_financial));
function names(){return {divisions:divisions.filter(d=>!d.archived_at).map(d=>{const master=masters.find(m=>m.id===d.catalogue_division_id);return {id:d.id,code:master?.code||d.code,catalogue_division_id:d.catalogue_division_id,name_override:d.name_override,name_version:d.name_version,updated_at:d.updated_at,catalogue_name:master?.name,effective_name:d.name_override??master?.name??d.name,catalogue_active:master?.is_active??true};}),
 lines:visible().map(r=>{const c=catalogue.find(c=>c.id===r.catalogue_line_id),master=masters.find(m=>m.id===c?.division_id),d=divisions.find(d=>!d.archived_at&&(d.id===r.project_division_id||(!r.project_division_id&&d.catalogue_division_id===c?.division_id))),dm=masters.find(m=>m.id===d?.catalogue_division_id);return {id:r.id,catalogue_line_id:r.catalogue_line_id,name_override:r.name_override,is_job_only_custom:r.is_job_only_custom,updated_at:r.updated_at,catalogue_name:c?.description,effective_name:r.name_override??c?.description??r.description,cost_code:c?.cost_code??r.cost_code,catalogue_active:(c?.is_active??true)&&(master?.is_active??true),catalogue_division_id:master?.id,catalogue_division_code:master?.code,catalogue_division_name:master?.name,effective_division_name:d?.name_override??dm?.name??d?.name??master?.name};})};}
window.groupingFixture={calls:[],reads:[],failNext:false,rows:()=>structuredClone(rows),original:()=>structuredClone(original),
 groups:()=>groupFinancialDivisions(mergeFinancialNames(visible().map(r=>({...r,project_division:divisions.find(d=>d.id===r.project_division_id)||null})),names()),{projectDivisions:names().divisions,catalogueDivisions:masters}),
 reverse(){rows.reverse();window.dispatchEvent(new Event('northgate:financial-catalogue-updated'));},
 rename(code,name,override){const master=masters.find(m=>m.code===code);master.name=name;const d=divisions.find(d=>d.catalogue_division_id===master.id);if(d&&override!==undefined)d.name_override=override;window.dispatchEvent(new Event('northgate:financial-catalogue-updated'));},
 retire(code){masters.find(m=>m.code===code).is_active=false;window.dispatchEvent(new Event('northgate:financial-catalogue-updated'));}};
export function createSupabaseClient(){return {from(table){const filters=[];return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},is(k,v){filters.push([k,v]);return this;},in(){return this;},order(){return this;},limit(){return this;},then(resolve){window.groupingFixture.reads.push({table,filters});let data=table==='jobs'?[job]:table==='job_budget_lines'?visible().map(r=>({...r,project_division:divisions.find(d=>d.id===r.project_division_id)||null})):table==='job_budget_divisions'?divisions:table==='change_order_financial_postings'?snapshot.postings:table==='change_orders'?snapshot.change_orders:[];if(!['jobs','change_orders'].includes(table))data=data.filter(row=>filters.every(([k,v])=>row[k]===v||(v===null&&row[k]===undefined)));return Promise.resolve({data:structuredClone(data),error:null}).then(resolve);}};},async rpc(name,args){
 if(name==='read_financial_catalogue')return {data:{divisions:masters.filter(d=>args.p_include_retired||d.is_active),lines:catalogue.filter(c=>args.p_include_retired||(c.is_active&&masters.find(m=>m.id===c.division_id)?.is_active))},error:null};
 if(name==='read_job_financial_names')return {data:structuredClone(names()),error:null};
 window.groupingFixture.calls.push({name,args:structuredClone(args)});
 if(window.groupingFixture.failNext){window.groupingFixture.failNext=false;return {error:{message:'Synthetic rejected save'}};}
 if(name==='save_v5_job_financial_proposal')return {data:{id:'local-proposal',version:1},error:null};
 if(name==='submit_v5_job_financial_proposal')return {data:{id:'local-submission'},error:null};
 if(name==='save_job_financial_batch'){
  const saved=[];for(const patch of args.p_lines){const prior=rows.find(r=>r.id===patch.id),d=divisions.find(d=>d.id===patch.project_division_id&&!d.archived_at),c=catalogue.find(c=>c.id===patch.catalogue_line_id||(!patch.catalogue_line_id&&c.cost_code===patch.cost_code)),master=masters.find(m=>m.id===c?.division_id);
   if(args.p_job_id!==job.id||patch.project_division_id&&!d||d&&c&&d.code!==c.division_code||!patch.is_job_only_custom&&(!c?.is_active||!master?.is_active))return {error:{message:'Synthetic division/catalogue scope rejected'}};
   if(prior&&patch.expected_updated_at!==prior.updated_at)return {error:{message:'This financial line changed. Reload before saving.'}};
   saved.push({...prior,...patch,id:prior?.id||`local-new-${rows.length+saved.length}`,job_id:job.id,project_division_id:patch.project_division_id??null,catalogue_line_id:patch.is_job_only_custom?null:c?.id??prior?.catalogue_line_id??null,archived_at:null,updated_at:new Date().toISOString()});
  }for(const row of saved){const i=rows.findIndex(r=>r.id===row.id);if(i<0)rows.push(row);else rows[i]=row;}return {data:saved,error:null};
 }
 return {data:[],error:null};
}};}
