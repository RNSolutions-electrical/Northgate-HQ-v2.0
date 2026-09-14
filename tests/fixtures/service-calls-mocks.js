const token=async()=> 'fixture-token';
export const useAuth=()=>({getToken:token});
const readonly=new URLSearchParams(location.search).has('readonly');
const calls=[1,2].map(n=>({
 id:'00000000-0000-4000-8000-00000000000'+n,name:'Service fixture '+n,service_call_number:'26-00'+n,job_number:'26-00'+n,division:'Electrical',
 job_type:'service_call',status:'complete',updated_at:'2026-09-14T10:00:00Z',archived_at:null,
 can_manage:!readonly,can_bill:!readonly,can_archive:!readonly,
 profile:{job_id:'00000000-0000-4000-8000-00000000000'+n,work_stage:'complete',billing_method:'time_and_materials',business_name:'Fixture business',related_job_id:n===2?'00000000-0000-4000-8000-000000000001':null},
 financials:readonly?null:{quote_amount:100,changes_amount:0,invoices:[],costs:[],audit:[]},
}));
if(!readonly && new URLSearchParams(location.search).has('profit')) {
 for(const [index,call] of calls.entries()) {
  call.profile.service_date='2026-01-01';
  call.financials.invoices=[{id:crypto.randomUUID(),status:'posted',invoice_date:index===0?'2026-03-31':'2026-04-01',revenue_excluding_tax:index===0?100:900,sales_tax:0,payments:[]}];
  call.financials.costs=[{id:crypto.randomUUID(),is_active:true,total_hard_cost:index===0?20:630,reconciliation_status:'final'}];
 }
}
window.serviceFixture={calls,requests:[]};
if(new URLSearchParams(location.search).has('financial-viewer')) for(const call of calls) {
 call.can_manage=false;call.can_bill=false;call.can_archive=false;
}
if(!readonly && new URLSearchParams(location.search).has('stages')) {
 calls.push({...structuredClone(calls[0]),id:'stage-ready',name:'Ready fixture',service_call_number:'26-003'});
 calls[0].financials.invoices=[{id:'paid-invoice',status:'posted',revenue_excluding_tax:100,sales_tax:7.25,due_date:'2020-01-01',payments:[{amount:107.25}]}];
 calls[1].financials.invoices=[{id:'overdue-invoice',status:'posted',revenue_excluding_tax:100,sales_tax:7.25,due_date:'2020-01-01',payments:[]}];
}
export async function withSupabaseTokenRetry(_getToken,operation) {
 return operation({rpc:async(name,args)=>{
  window.serviceFixture.requests.push({name,args});
  if(name !== 'svc_read_calls' && window.serviceFixture.failNext) {window.serviceFixture.failNext=false;return {error:{message:'This call changed. Refresh before saving.'}};}
  if(name !== 'svc_read_calls' && window.serviceFixture.holdWrites) await new Promise(resolve=>{window.serviceFixture.releaseWrite=()=>{window.serviceFixture.holdWrites=false;resolve();};});
  if(name==='svc_read_calls')return {data:calls.filter(c=>!!c.archived_at===args.p_archived)};
  if(name==='svc_save_call'){
   const existing=calls.find(c=>c.id===args.p_job_id);
   if(existing){Object.assign(existing,args.p_data);existing.profile={...existing.profile,...args.p_data};return {data:existing.id};}
   const id=crypto.randomUUID();calls.push({...calls[0],...args.p_data,id,profile:{...args.p_data,job_id:id},financials:{invoices:[],costs:[],audit:[]}});return {data:id};
  }
  if(name==='svc_archive_call'){const call=calls.find(c=>c.id===args.p_job_id);call.archived_at='2026-09-14';call.archive_reason=args.p_reason;call.can_manage=false;call.can_bill=false;return {data:call.id};}
  if(name==='svc_save_commercial') {
   const call=calls.find(c=>c.id===args.p_job_id);
   if(args.p_action==='quote') Object.assign(call.financials,args.p_data);
   if(args.p_action==='cost') call.financials.costs=[{...args.p_data,id:crypto.randomUUID(),is_active:true,total_hard_cost:Number(args.p_data.labor_hard_cost)+Number(args.p_data.material_hard_cost)+Number(args.p_data.other_hard_cost)}];
   return {data:call.id};
  }
  return {data:args.p_request_id || args.p_job_id};
 }});
}
