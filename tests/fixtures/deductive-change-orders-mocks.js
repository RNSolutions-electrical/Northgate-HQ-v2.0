const fields = ['material_amount','labor_amount','equipment_amount','subcontract_amount','other_amount','markup_amount'];
const getToken = async () => 'fixture-token';
export const useAuth = () => ({getToken});
export const useUser = () => ({user:{id:'fixture-user'}});
window.creditFixture = {calls:[],failNext:false};
export function createSupabaseClient() {
  return {
    from() { return {select(){return this;},eq(){return this;},async order(){return {data:JSON.parse(sessionStorage.getItem('credit-lines')||'[]'),error:null};}}; },
    async rpc(name,args) {
      window.creditFixture.calls.push({name,args});
      if (window.creditFixture.failNext) {window.creditFixture.failNext=false;return {error:new Error('Fixture save rejected')};}
      let data = JSON.parse(sessionStorage.getItem('credit-order')||'null');
      if (name === 'save_job_change_order_draft') {
        const lines = args.p_lines.map((line,i)=>({...line,id:`line-${i}`}));
        data = {id:'co-1',co_number:args.p_co_number,title:args.p_title,status:'draft',
          price_amount:lines.reduce((sum,line)=>sum+fields.reduce((n,f)=>n+Number(line[f]||0),0),0)};
        sessionStorage.setItem('credit-lines',JSON.stringify(lines));
      } else if (name === 'submit_job_change_order') data.status='submitted';
      sessionStorage.setItem('credit-order',JSON.stringify(data));
      return {data,error:null};
    },
  };
}
