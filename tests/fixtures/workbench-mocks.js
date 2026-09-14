const getToken=async()=>'fixture-token';
export const useAuth=()=>({getToken});
export const usePermissions=()=>({isLoading:false,canEstimate:true,canEditCatalog:!location.search.includes('readonly-catalogue'),division:'Electrical'});
const materialRows=Array.from({length:1615},(_,i)=>({id:'material-'+i,name:i===1614?'Copper test conductor':'Material '+i,material_code:'M'+i,unit_of_measure:'FT',price_per_unit:0,price_confirmed:false,labor_rate_hrs:null,updated_at:null}));
window.workbenchFixture={calls:[],rows:[],library:[],failNext:false};
export function createSupabaseClient(){return {
 from(table){
  let start=0,end=999;
  const q={select:()=>q,eq:()=>q,is:()=>q,order:()=>q,range(a,b){start=a;end=b;return q;},
   then(resolve){return Promise.resolve({data:table==='items'?materialRows.slice(start,end+1):table==='assemblies'?window.workbenchFixture.library.slice(start,end+1):window.workbenchFixture.rows}).then(resolve);}};
  return q;
 },
 async rpc(name,args){
  const f=window.workbenchFixture;f.calls.push({name,args});
  if(f.failNext){f.failNext=false;return {error:{message:'Fixture stale catalogue; input retained'}};}
  if(name==='archive_assembly_library'){
   if(!args.p_reason.trim())return {error:{message:'Archive reason required'}};
   f.library=f.library.filter(a=>a.id!==args.p_assembly_id);return {data:null};
  }
  if(args.p_assembly){
   const a=args.p_assembly,prior=f.library.find(x=>x.id===a.id);
   if(prior&&prior.updated_at!==a.updatedAt)return {error:{message:'Assembly changed. Refresh library.'}};
   const id=a.id||'assembly-'+(f.library.length+1);
   f.library=[...f.library.filter(x=>x.id!==id),{id,name:a.name,description:a.notes,updated_at:String(f.calls.length),
    assembly_items:a.lines.map((l,i)=>({id:l.libraryLineId||id+'-line-'+i,item_id:l.catalogueId,description:l.name,quantity:l.qty,unit:l.unit,
     unit_cost_snapshot:l.price??0,labor_rate_hrs_snapshot:l.hours??0,price_missing:l.price==null,labor_missing:l.hours==null,
     stage:l.stage,fixed_quantity:l.fixed,note:l.notes,sort_order:i}))}];
  }
  if(name==='save_assembly_library')return {data:f.library.at(-1)};
  const row={estimate_id:args.p_estimate_id||'estimate-1',revision:(args.p_expected_revision||0)+1,document:structuredClone(args.p_document)};
  f.rows=[row];
  for(const patch of args.p_catalogue_updates){const m=materialRows.find(m=>m.id===patch.item_id);Object.assign(m,patch.changes,{price_confirmed:true,updated_at:'2026-09-13T01:00:00Z'});}
  return {data:row};
 }
};}
