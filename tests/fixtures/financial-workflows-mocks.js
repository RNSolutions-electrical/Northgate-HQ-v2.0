const getToken = async () => 'fixture';
const user = { fullName:'Fixture',id:'fixture' };
export const useAuth = () => ({ getToken });
export const useUser = () => ({ user });
export const withSupabaseTokenRetry = async (_getToken, operation) => operation(createSupabaseClient());
const division = {id:'d1',code:'16',name:'Electrical',sort_order:16};
const divisions = [
  {...division,job_id:'j1',archived_at:null},
  {id:'d2',code:'26',name:'Communications',sort_order:26,job_id:'j1',archived_at:null},
  {id:'archived',code:'99',name:'Archived',sort_order:99,job_id:'j1',archived_at:'2026-01-01'},
  {id:'other-job',code:'88',name:'Other job',sort_order:88,job_id:'j2',archived_at:null},
];
const job = {id:'j1',name:'Budget Fixture',job_number:'101',division:'Electrical',status:'active',job_type:'job'};
let rows = [{id:'l1',job_id:'j1',division:'Electrical',project_division_id:'d1',project_division:division,
  category:'material',is_protected_financial:false,cost_code:'16.100',description:'Material',
  budget_amount:1000,budget_change_amount:50,actual_cost_amount:200,committed_cost_amount:0,
  forecast_to_complete_amount:250,forecast_final_amount:1000,schedule_of_values_amount:0,
  current_budget_override_amount:null,note:'',updated_at:'2026-09-06T12:00:00Z'}];
if (location.search.includes('empty')) rows = [];
window.financialFixture = {calls:[],reads:[],failNext:false,failDivisions:false,delaySave:false,rows:()=>rows};
export function createSupabaseClient() {return {
  from(table) {
    const filters=[];
    const q = {
      select(){return this;},eq(key,value){filters.push([key,value]);return this;},is(key,value){filters.push([key,value]);return this;},in(){return this;},order(){return this;},limit(){return this;},
      then(resolve) {
        window.financialFixture.reads.push({table,filters});
        if(table==='job_budget_divisions' && window.financialFixture.failDivisions) return Promise.resolve({data:null,error:{message:'Fixture division access denied'}}).then(resolve);
        const activeDivisions=location.search.includes('no-divisions')?[]:divisions.filter(d=>filters.every(([k,v])=>d[k]===v));
        const data = table==='jobs'?[job]:table==='job_budget_lines'?[...rows]:table==='job_budget_divisions'?activeDivisions
          :table==='change_order_financial_postings'?[{job_budget_line_id:'l1',amount_delta:100}]:[];
        return Promise.resolve({data,error:null}).then(resolve);
      },
    };return q;
  },
  async rpc(name,args) {
    if(name==='read_financial_catalogue')return {data:{divisions:[],lines:[]},error:null};
    if(name==='read_job_financial_names')return {data:{divisions:(location.search.includes('no-divisions')?[]:divisions.filter(d=>d.job_id===args.p_job_id&&!d.archived_at)).map(d=>({id:d.id,code:d.code,effective_name:d.name,catalogue_division_id:null})),lines:[]},error:null};
    window.financialFixture.calls.push({name,args});
    if(window.financialFixture.delaySave && name==='save_job_financial_batch') await new Promise(resolve=>setTimeout(resolve,300));
    if(window.financialFixture.failNext){window.financialFixture.failNext=false;return {error:{message:'Fixture rejected save'}};}
    if(name==='save_v5_job_financial_proposal') return {data:{id:'proposal1',version:1},error:null};
    if(name==='submit_v5_job_financial_proposal') return {data:{id:'submission1'},error:null};
    if(name==='save_job_financial_batch'){
      const saved=args.p_lines.map((line)=>{const old=rows.find(r=>r.id===line.id);return {...old,...line,project_division:divisions.find(d=>d.id===(line.project_division_id||old?.project_division_id)),id:line.id||`new-${rows.length}`,updated_at:new Date().toISOString()};});
      rows=rows.map(row=>saved.find(s=>s.id===row.id)||row);
      rows.push(...saved.filter(s=>!rows.some(r=>r.id===s.id)));
      return {data:saved,error:null};
    }
    return {data:[],error:null};
  },
};}
