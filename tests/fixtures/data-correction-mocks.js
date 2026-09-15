const getToken=async()=>'fixture';export const useAuth=()=>({getToken});
window.correctionFixture={enabled:!new URLSearchParams(location.search).has('denied'),calls:[],fail:false,rows:[{id:'retired1',item_name:'EMT Set Screw Connectors',material_code:'EMT-050',quantity:0,archived_at:'2026-09-15T16:14:09Z',archive_reason:'Incorrect location'},{id:'retired2',item_name:'Needs stock review',material_code:'REVIEW',quantity:2,archived_at:'2026-09-15T16:14:09Z',archive_reason:'Fixture discrepancy'}]};
export function createSupabaseClient(){return{async rpc(name,args){
 const f=window.correctionFixture;f.calls.push({name,args});
 if(f.fail){f.fail=false;return {error:{message:'Correction access changed. Refresh and retry.'}};}
 if(name==='set_developer_data_correction'){f.enabled=args.p_enabled;return{data:{enabled:f.enabled}};}
 if(!f.enabled)return{error:{message:'Developer Data Correction permission is required'}};
 if(name==='read_retired_bin_assignments')return{data:structuredClone(f.rows)};
 if(name==='restore_retired_bin_assignment'){f.rows=f.rows.filter(r=>r.id!==args.p_bin_item_id);return{data:{restored:true,id:args.p_bin_item_id}};}
 throw new Error('Unexpected RPC '+name);
}};}
