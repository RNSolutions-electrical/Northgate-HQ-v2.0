const getToken=async()=>'fixture';
export const useAuth=()=>({getToken});
export const useUser=()=>({user:{id:'manager',fullName:'Fixture Manager'}});
window.adjustmentFixture={calls:[],saved:null};
export function createSupabaseClient(){return {
 from(table){const query={select(){return this;},eq(){return this;},order(){return this;},is(){return this;},limit(){return this;},insert(){return Promise.resolve({error:null});},then(resolve){return Promise.resolve({data:table==='change_order_lines'?[{id:'detail1',description:'Existing line',job_budget_line_id:'line1',material_amount:100,markup_amount:15,markup_percent:15}]:[]}).then(resolve);}};return query;},
 storage:{from(){return {upload:async()=>({error:null}),remove:async()=>({error:null})};}},
 async rpc(name,args){window.adjustmentFixture.calls.push({name,args});
 if(name==='save_contract_adjustment'){const p=args.p_data;window.adjustmentFixture.saved={...p,id:'order1',co_number:p.co_number||'CO-001',updated_at:new Date().toISOString(),price_amount:p.lines.reduce((sum,line)=>sum+Number(line.material_amount||0)+Number(line.markup_amount||0),0)};return {data:window.adjustmentFixture.saved};}
 if(name==='set_contract_adjustment_status')return {data:{...window.adjustmentFixture.saved,id:'order1',status:args.p_status,updated_at:new Date().toISOString()}};
 if(name==='attach_signed_job_change_order_document')return {data:{...window.adjustmentFixture.saved,id:'order1',status:'approved',signed_document_id:args.p_document_id,updated_at:new Date().toISOString()}};
 return {data:null,error:null};
 }
};}
