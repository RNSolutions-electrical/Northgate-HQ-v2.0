const getToken=async()=>'';export const useAuth=()=>({getToken,userId:'fixture'});
const keys=['daybook','hq-time','afc','electrical-inspections','add-on-tools','inventory','jobs','estimates','employees','vehicles','tools','documents','reports','accounting','eos','silas','panel-directory'];
const rows=keys.map(module_key=>({module_key,is_enabled:true,version:1,enforcement_ready:true}));
export async function withSupabaseTokenRetry(_,fn){return fn({rpc:async(name,args)=>{
 if(new URLSearchParams(location.search).get('fail'))return {error:{message:'Fixture network failure'}};
 if(name==='read_tool_availability')return {data:structuredClone(rows)};
 if(name==='set_tool_availability'){const row=rows.find(r=>r.module_key===args.p_module_key);if(row.version!==args.p_expected_version)return {error:{message:'Status changed. Refresh and retry.'}};row.is_enabled=args.p_enabled;row.version++;return {data:row};}
 return {error:{message:'Unexpected RPC'}};
}})};
