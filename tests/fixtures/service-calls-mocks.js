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
window.serviceFixture={calls,requests:[]};
export async function withSupabaseTokenRetry(_getToken,operation) {
 return operation({rpc:async(name,args)=>{
  window.serviceFixture.requests.push({name,args});
  if(name==='svc_read_calls')return {data:calls.filter(c=>!!c.archived_at===args.p_archived)};
  if(name==='svc_save_call'){
   const existing=calls.find(c=>c.id===args.p_job_id);
   if(existing){Object.assign(existing,args.p_data);existing.profile={...existing.profile,...args.p_data};return {data:existing.id};}
   const id=crypto.randomUUID();calls.push({...calls[0],...args.p_data,id,profile:{...args.p_data,job_id:id},financials:{invoices:[],costs:[],audit:[]}});return {data:id};
  }
  if(name==='svc_archive_call'){const call=calls.find(c=>c.id===args.p_job_id);call.archived_at='2026-09-14';call.archive_reason=args.p_reason;call.can_manage=false;call.can_bill=false;return {data:call.id};}
  return {data:args.p_request_id || args.p_job_id};
 }});
}

