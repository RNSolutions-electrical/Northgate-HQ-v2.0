// Browser transport fixtures only. SQL authority is tested separately in PGlite.
const getToken=async()=>null;
export const useAuth=()=>({getToken});
export const getSupabaseAccessToken=async()=>null;
export const usePermissions=()=>({isLoading:false,canEstimate:!new URLSearchParams(location.search).has('denied'),canApproveEstimates:!new URLSearchParams(location.search).has('user'),canSavePersonalWork:true,division:'Electrical'});
export function createSupabaseClient(){return {
 from(table){let id=null;const response=()=>{const f=window.standaloneFixture;return {error:null,data:table==='assembly_library_settings'?f.settings:table==='estimate_workbenches'?[f.row]:table==='estimate_checklist_definitions'?f.definitions:table==='estimate_snapshots'?(id?f.row.snapshot:f.row.snapshot?[f.row.snapshot]:[]):table==='estimate_workflow_handoffs'?(f.handoff?[f.handoff]:[]):table==='jobs'?[{id:'job-fixture',job_number:'LOCAL-1',name:'Optional fixture',job_type:'job',division:'Electrical'}]:table==='job_budget_lines'?[{id:'budget-fixture',cost_code:'01.CO',description:'Electrical division',category:'other'}]:table==='financial_line_catalogue'?[{id:'catalogue-fixture',cost_code:'01.01',description:'Fixture cost',category:'material',division_code:'01',division_name:'Electrical'}]:[]};};
  const chain=new Proxy({}, {get:(_,key)=>key==='then'?(resolve)=>Promise.resolve(response()).then(resolve):(...args)=>{if(key==='eq'&&args[0]==='id')id=args[1];return chain;}});return chain;
 },
 async rpc(name,args){const f=window.standaloneFixture;
  if(name==='read_v5_estimate_task_queue')return {data:[]};
  if(name==='read_standalone_estimate_reviews')return {data:f.request?.status==='pending'?[{destination_id:f.request.id,destination_version:f.row.revision,payload_hash:'fixture-hash',submitted_at:'2026-10-13',submitted_by:'fixture-user',submitted_by_name:'Fixture author',shared_reason:f.request.reason,target_division:'Electrical',estimate_name:f.row.document.name,customer_name:f.row.document.customer,destination_key:'standalone_estimate',task_type:'Estimate approval',proposed_payload:f.row.document,estimate_id:f.row.estimate_id}]:[]};
  f.calls.push({name,args:structuredClone(args)});
  const snapshot=()=>{const value={id:'snapshot-fixture',estimate_id:f.row.estimate_id,approved_at:'2026-10-13T20:00:00Z',approved_by:'Fixture reviewer',pricing_total:f.total,workbench_document:{...structuredClone(f.row.document),approvedAt:'2026-10-13T20:00:00Z'}};f.row={...f.row,estimates:{...f.row.estimates,status:'approved'},snapshot:value};return value;};
  if(name==='save_estimate_workbench'){f.row={...f.row,revision:f.row.revision+1,document:args.p_document};return {data:f.row};}
  if(name==='submit_standalone_estimate_review'){
   const finish=()=>{if(f.mode==='failure')return {error:{message:'Fixture review submission failed'}};f.request={id:args.p_request_id,reason:args.p_reason,status:'pending'};f.row={...f.row,estimates:{...f.row.estimates,status:'submitted'}};return {data:f.request};};
   if(f.mode==='pending')return new Promise(resolve=>{f.pending=()=>resolve(finish());});return finish();
  }
  if(name==='review_standalone_estimate'){
   if(f.mode==='failure')return {error:{message:'Fixture review decision failed'}};
   f.request.status=args.p_decision==='approve'?'approved':'returned';if(args.p_decision==='approve')snapshot();else f.row={...f.row,estimates:{...f.row.estimates,status:'draft'}};return {data:{status:f.request.status,approved_snapshot_id:f.row.snapshot?.id}};
  }
  if(name==='approve_workbench_estimate')return {data:snapshot().id};
  if(name==='handoff_estimate_to_destination'){
   if(f.mode==='failure')return {error:{message:'Fixture handoff failed'}};
   f.handoff=f.handoff||{id:'handoff-fixture',estimate_id:f.row.estimate_id,source_revision:f.row.revision,source_version:1,destination:args.p_destination,job_id:args.p_job_id||'new-fixture-destination',source_document:structuredClone(f.row.document)};return {data:f.handoff};
  }
  throw Error('Unexpected fixture RPC '+name);
 }
};
}
