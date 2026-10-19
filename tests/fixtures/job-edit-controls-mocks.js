import {createSupabaseClient as base} from './central-catalogue-mocks.js';
export {useAuth,useUser,withSupabaseTokenRetry} from './central-catalogue-mocks.js';
const fixture=window.financialFixture,rows=fixture.rows(),original=structuredClone(rows[0]);
for(const code of ['16','07'])for(let i=0;i<35;i++)rows.push({...original,id:`${code}-${i}`,cost_code:`${code}.${200+i}`,description:`Synthetic ${code} work ${i}`,project_division_id:code==='16'?'d1':'d7',project_division:{id:code==='16'?'d1':'d7',code,name:code==='16'?'Electrical':'Roofing',sort_order:Number(code)},budget_amount:10,actual_cost_amount:1});
export function createSupabaseClient(){const db=base();return {...db,from(table){const q=db.from(table),oldThen=q.then,oldEq=q.eq,filters={};q.eq=function(key,value){filters[key]=value;return oldEq.call(this,key,value);};q.then=function(resolve){return oldThen.call(this,result=>{
 if(table==='jobs')result={...result,data:[...result.data,{id:'j2',name:'Second Fixture',job_number:'102',division:'Electrical',job_type:'job',status:'active'}]};
 if(table==='job_budget_lines'&&filters.job_id)result={...result,data:result.data.filter(row=>row.job_id===filters.job_id)};
 return resolve(result);
 });};return q;},async rpc(name,args){const result=await db.rpc(name,args);if(name==='read_job_financial_names'&&!result.error)result.data.divisions.push({id:'d7',code:'07',catalogue_division_id:'master-d7',catalogue_name:'Roofing',effective_name:'Roofing',name_override:null,name_version:1,catalogue_active:true});return result;}};}
