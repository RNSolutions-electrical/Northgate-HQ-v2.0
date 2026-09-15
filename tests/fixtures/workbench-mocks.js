const getToken=async()=>'fixture-token';
export const useAuth=()=>({getToken});
export const usePermissions=()=>({isLoading:false,canEstimate:!location.search.includes('view-only'),canApproveEstimates:true,canEditCatalog:!location.search.includes('readonly-catalogue'),division:'Electrical'});
const materialRows=Array.from({length:1615},(_,i)=>({id:'material-'+i,name:i===1614?'Copper test conductor':'Material '+i,material_code:'M'+i,unit_of_measure:'FT',price_per_unit:0,price_confirmed:false,labor_rate_hrs:null,updated_at:null}));
window.workbenchFixture={calls:[],rows:[],snapshots:[],library:[],handoffs:[],failNext:false};
if(location.search.includes('editing')){
 const doc=seed('Revision test','Acme customer','Commercial');
 doc.entries=[{id:'entry-1',number:1,name:'Lighting circuits',location:'Lobby',section:'Power',status:'Not started',items:[{id:'item-1',number:1,name:'Install receptacles',kind:'Material',qty:4,status:'Not started',notes:'Private field note',lines:[{id:'line-1',name:'Receptacle',qty:1,price:10,hours:0.1,unit:'EA',stage:'Rough-in'}]}]}];
 if(location.search.includes('references'))doc.entries[0].items=Array.from({length:3},(_,i)=>({
  ...structuredClone(doc.entries[0].items[0]),id:'item-'+(i+1),number:i+1,name:'Assembly '+(i+1),kind:'Assembly',
  lines:['Trim-out','Rough-in','Trim-out'].map((stage,j)=>({id:`line-${i}-${j}`,name:`Component ${i+1}-${j+1}`,qty:1,price:10,hours:0.1,unit:'EA',stage,notes:''})),
 }));
 window.workbenchFixture.rows=[{estimate_id:'estimate-1',revision:1,document:doc,estimates:{division:'Electrical',status:'draft',version_number:1}}];
}
export function createSupabaseClient(){return {
 from(table){
  let start=0,end=999,filters={},single=false;
  const q={select:()=>q,eq(k,v){filters[k]=v;return q;},in:()=>q,single(){single=true;return q;},is:()=>q,order:()=>q,limit:()=>q,range(a,b){start=a;end=b;return q;},
   then(resolve){const f=window.workbenchFixture;let data=table==='estimate_workflow_handoffs'?f.handoffs:table==='jobs'?[{id:'job-1',name:'Review job',job_number:'TEST',division:'Electrical',job_type:'job'},{id:'call-1',name:'Service review',job_number:'SC-1',division:'Electrical',job_type:'service_call'}]:table==='job_budget_lines'?[{id:'budget-1',job_id:'job-1',cost_code:'16.CO',description:'Electrical Change Orders'}]:table==='items'?materialRows.slice(start,end+1):table==='assemblies'?f.library.slice(start,end+1):table==='estimate_snapshots'?f.snapshots:table==='estimates'?f.rows.map(r=>({id:r.estimate_id,...r.estimates})):f.rows;data=data.filter(r=>Object.entries(filters).every(([k,v])=>table==='items'||table==='assemblies'||k.includes('.')||r[k]===v));return Promise.resolve({data:single?data[0]:data}).then(resolve);}};
  return q;
 },
 async rpc(name,args){
  const f=window.workbenchFixture;f.calls.push({name,args});
  if(f.failNext){f.failNext=false;return {error:{message:'Fixture stale catalogue; input retained'}};}
  if(name==='submit_estimate_for_review'){
   const saved=f.handoffs.find(h=>h.estimate_id===args.p_estimate_id)||{id:'handoff-1',estimate_id:args.p_estimate_id,job_id:args.p_job_id||'new-job',change_order_id:args.p_destination==='change_order'?'co-1':null,destination:args.p_destination,source_version:1,source_revision:args.p_expected_revision};
   if(!f.handoffs.includes(saved))f.handoffs.push(saved);return {data:saved};
  }
  if(name==='approve_workbench_estimate'){
   const row=f.rows.find(r=>r.estimate_id===args.p_estimate_id);
   const snapshot={id:'snapshot-'+row.estimate_id,estimate_id:row.estimate_id,approved_at:'2026-09-14T12:00:00Z',title:row.document.name,customer_name:row.document.customer,workbench_document:structuredClone(row.document),pricing_total:sumPricing(row.document.entries.flatMap(e=>e.items),row.document).price};
   f.snapshots.push(snapshot);row.estimates={...row.estimates,status:'approved'};return {data:snapshot.id};
  }
  if(name==='create_workbench_revision'){
   const original=f.rows.find(r=>r.estimate_id===args.p_estimate_id),snapshot=f.snapshots.find(s=>s.id===args.p_source_snapshot_id);
   const row={estimate_id:'estimate-'+(f.rows.length+1),revision:1,document:{...structuredClone(snapshot.workbench_document),approvedAt:null},estimates:{division:'Electrical',status:'draft',version_number:(original.estimates.version_number||1)+1,revision_of:original.estimate_id}};
   f.rows.push(row);return {data:structuredClone(row)};
  }
  if(name==='archive_assembly_library'){
   if(!args.p_reason.trim())return {error:{message:'Archive reason required'}};
   f.library=f.library.filter(a=>a.id!==args.p_assembly_id);return {data:null};
  }
  if(args.p_assembly){
   const a=args.p_assembly,prior=f.library.find(x=>x.id===a.id);
   if(prior&&prior.updated_at!==a.updatedAt)return {error:{message:'Assembly changed. Refresh library.'}};
   const id=a.id||'assembly-'+(f.library.length+1);
   f.library=[...f.library.filter(x=>x.id!==id),{id,name:a.name,description:a.notes,categories:a.categories||[],updated_at:String(f.calls.length),
    assembly_items:a.lines.map((l,i)=>({id:l.libraryLineId||id+'-line-'+i,item_id:l.catalogueId,description:l.name,quantity:l.qty,unit:l.unit,
     unit_cost_snapshot:l.price??0,labor_rate_hrs_snapshot:l.hours??0,price_missing:l.price==null,labor_missing:l.hours==null,
     stage:l.stage,fixed_quantity:l.fixed,note:l.notes,sort_order:i}))}];
  }
  if(name==='save_assembly_library')return {data:f.library.at(-1)};
  const prior=f.rows.find(r=>r.estimate_id===args.p_estimate_id);
  const row={estimate_id:args.p_estimate_id||'estimate-1',revision:(args.p_expected_revision||0)+1,document:structuredClone(args.p_document),estimates:prior?.estimates||{status:'draft',division:'Electrical',version_number:1}};
  f.rows=[row,...f.rows.filter(r=>r.estimate_id!==row.estimate_id)];
  for(const patch of args.p_catalogue_updates){const m=materialRows.find(m=>m.id===patch.item_id);Object.assign(m,patch.changes,{price_confirmed:true,updated_at:'2026-09-13T01:00:00Z'});}
  return {data:row};
 }
};}
import {seed} from '../../src/modules/estimates/workbench/model.mjs';
import {sumPricing} from '../../src/modules/estimates/workbench/pricing.mjs';
