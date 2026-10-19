const getToken = async () => 'synthetic-only';
export const useAuth = () => ({getToken});
export const useUser = () => ({user:{id:'fixture',fullName:'Fixture'}});
export const withSupabaseTokenRetry = async (_token, operation) => operation(createSupabaseClient());
const jobId = '86725057-845a-41f3-bb6f-4381ebad3095';
const job = {id:jobId,name:'Budget Fixture',job_number:'101',division:'Electrical',status:'active',job_type:'job'};
const division = {id:'d4',code:'04',name:'Masonry',sort_order:4,job_id:jobId,archived_at:null};
const division7 = {id:'d7',code:'07',name:'Thermal&  MoistureProtection',sort_order:7,job_id:jobId,archived_at:null};
const base = {job_id:jobId,division:'Electrical',project_division_id:'d4',project_division:division,category:'labor',
  is_protected_financial:false,budget_amount:0,budget_change_amount:0,actual_cost_amount:0,committed_cost_amount:0,
  forecast_to_complete_amount:0,forecast_final_amount:0,current_budget_override_amount:null,archived_at:null,updated_at:'2026-10-01T00:00:00Z'};
const make = (id, extra={}) => ({...base,id,cost_code:`04.${id}`,description:id,...extra});
const scenario = new URLSearchParams(location.search).get('case') || 'toro';
const cases = {
  toro:[make('Labor',{cost_code:'04.1',budget_amount:5500}),make('Materials',{cost_code:'04.11',category:'material',actual_cost_amount:6729.59})],
  moved:[make('Labor',{cost_code:'04.1',budget_amount:5500,actual_cost_amount:6729.59}),make('Materials',{cost_code:'04.11',category:'material'})],
  credits:[make('Credit',{actual_cost_amount:-25.5})],
  zero:[make('Zero')],
  atBudget:[make('At budget',{budget_amount:100,actual_cost_amount:100})],
  negativeBudget:[make('Negative budget',{budget_amount:100,budget_change_amount:-300,actual_cost_amount:-50})],
  negative:[make('Reversal',{budget_amount:1000,budget_change_amount:-200,actual_cost_amount:700})],
  overrides:[make('Zero override',{budget_amount:1000,budget_change_amount:50,current_budget_override_amount:0,actual_cost_amount:100}),
    make('Positive override',{budget_amount:1000,budget_change_amount:-50,current_budget_override_amount:1200,actual_cost_amount:100})],
  decimals:[make('Decimal A',{budget_amount:0.1,actual_cost_amount:0.3}),make('Decimal B',{budget_amount:0.2})],
  empty:[],
  multi:[make('Masonry',{budget_amount:5000,actual_cost_amount:6000}),make('Roofing',{cost_code:'07.1',budget_amount:100,actual_cost_amount:25,project_division_id:'d7',project_division:division7})],
  labels:[make('Roofing',{cost_code:'07.1',budget_amount:2500,actual_cost_amount:1000,project_division_id:null,project_division:null}),
    make('Imported',{cost_code:'07.11',project_division_id:'d7',project_division:division7}),
    make('Generated',{cost_code:'07.CO',description:'Thermal&  MoistureProtection Change Orders',project_division_id:'d7',project_division:division7}),
    make('Top',{cost_code:'07',description:'Thermal&  MoistureProtection',project_division_id:'d7',project_division:division7})],
};
let rows = structuredClone(cases[scenario] || cases.toro);
// These sentinels must be filtered by the real component's job/archive query.
rows.push(make('Archived',{budget_amount:999999,actual_cost_amount:888888,archived_at:'2026-01-01'}),
  make('Other job',{job_id:'other',budget_amount:777777,actual_cost_amount:666666}));
const postings = scenario === 'negative' ? [{job_id:jobId,job_budget_line_id:'Reversal',amount_delta:300},{job_id:jobId,job_budget_line_id:'Reversal',amount_delta:-500}]
  : scenario === 'overrides' ? [{job_id:jobId,job_budget_line_id:'Zero override',amount_delta:999},{job_id:jobId,job_budget_line_id:'Positive override',amount_delta:-999}] : [];
const catalogue = ['07','07.1','07.11','07.CO'].map((cost_code,index) => ({id:`c${index}`,division_code:'07',division_name:division7.name,
  cost_code,description:cost_code === '07' ? division7.name : cost_code === '07.CO' ? 'Change Order' : 'Roofing Materials',is_active:true,sort_order:index}));
window.financialFixture = {calls:[],reads:[],rows:()=>rows,postings};
export function createSupabaseClient() {return {
  from(table) {
    const filters=[];
    return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},is(k,v){filters.push([k,v]);return this;},
      in(){return this;},order(){return this;},limit(){return this;},then(resolve){
        window.financialFixture.reads.push({table,filters});
        let data = table === 'jobs' ? [job] : table === 'job_budget_lines' ? rows : table === 'change_order_financial_postings' ? postings
          : table === 'job_budget_divisions' ? [division,division7] : table === 'financial_line_catalogue' ? catalogue : [];
        data = data.filter(row => filters.every(([k,v]) => row[k] === v));
        return Promise.resolve({data:structuredClone(data),error:null}).then(resolve);
      }};
  },
  async rpc(name,args) {
    if(name==='read_financial_catalogue')return {data:{divisions:[],lines:catalogue},error:null};
    if(name==='read_job_financial_names')return {data:{divisions:[division,division7].map(d=>({id:d.id,code:d.code,effective_name:d.name,catalogue_division_id:null})),lines:[]},error:null};
    window.financialFixture.calls.push({name,args});
    if(name === 'save_job_financial_batch') {
      const saved = args.p_lines.map(line => ({...rows.find(row=>row.id===line.id),...line,id:line.id || 'new-line',
        job_id:jobId,archived_at:null,project_division:[division,division7].find(d=>d.id === line.project_division_id),updated_at:'2026-10-19T00:00:00Z'}));
      rows=rows.map(row=>saved.find(s=>s.id===row.id)||row);rows.push(...saved.filter(s=>!rows.some(row=>row.id===s.id)));
      return {data:saved,error:null};
    }
    return {data:[],error:null};
  },
};}
