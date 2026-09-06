const getToken = async () => 'fixture';
const user = { fullName:'Fixture',id:'fixture' };
export const useAuth = () => ({ getToken });
export const useUser = () => ({ user });
export const withSupabaseTokenRetry = async (_getToken, operation) => operation(createSupabaseClient());
const division = {id:'d1',code:'16',name:'Electrical',sort_order:16};
const job = {id:'j1',name:'Budget Fixture',job_number:'101',division:'Electrical',status:'active',job_type:'job'};
let rows = [{id:'l1',job_id:'j1',division:'Electrical',project_division_id:'d1',project_division:division,
  category:'material',is_protected_financial:false,cost_code:'16.100',description:'Material',
  budget_amount:1000,budget_change_amount:50,actual_cost_amount:200,committed_cost_amount:0,
  forecast_to_complete_amount:250,forecast_final_amount:1000,schedule_of_values_amount:0,
  current_budget_override_amount:null,note:'',updated_at:'2026-09-06T12:00:00Z'}];
window.financialFixture = {calls:[],failNext:false,rows:()=>rows};
export function createSupabaseClient() {return {
  from(table) {
    const q = {
      select(){return this;},eq(){return this;},is(){return this;},in(){return this;},order(){return this;},limit(){return this;},
      then(resolve) {
        const data = table==='jobs'?[job]:table==='job_budget_lines'?[...rows]:table==='job_budget_divisions'?[division]
          :table==='change_order_financial_postings'?[{job_budget_line_id:'l1',amount_delta:100}]:[];
        return Promise.resolve({data,error:null}).then(resolve);
      },
    };return q;
  },
  async rpc(name,args) {
    window.financialFixture.calls.push({name,args});
    if(window.financialFixture.failNext){window.financialFixture.failNext=false;return {error:{message:'Fixture rejected save'}};}
    if(name==='save_job_financial_batch'){
      const saved=args.p_lines.map((line)=>{const old=rows.find(r=>r.id===line.id);return {...old,...line,id:line.id||'new',updated_at:new Date().toISOString()};});
      rows=rows.map(row=>saved.find(s=>s.id===row.id)||row);
      rows.push(...saved.filter(s=>!rows.some(r=>r.id===s.id)));
      return {data:saved,error:null};
    }
    return {data:[],error:null};
  },
};}
