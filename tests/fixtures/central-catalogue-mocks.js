import {createSupabaseClient as base} from './financial-workflows-mocks.js';
export {useAuth,useUser,withSupabaseTokenRetry} from './financial-workflows-mocks.js';
let divisions=[{id:'master-d1',code:'16',name:'Electrical',is_active:true,version:1,sort_order:16,usage_count:1}];
let lines=[{id:'master-l1',division_id:'master-d1',division_code:'16',division_name:'Electrical',cost_code:'16.100',description:'Shared Material',category:'material',is_protected_financial:false,sort_order:1,is_active:true,version:1,usage_count:1,notes:'Default note'}];
let divisionOverride=null,divisionVersion=1;
const fixture=window.financialFixture;Object.assign(fixture,{master:()=>({divisions,lines}),stale:false});
export function createSupabaseClient(){const client=base();return {...client,async rpc(name,args){
 if(name==='read_financial_catalogue')return {data:structuredClone({divisions:divisions.filter(row=>args.p_include_retired||row.is_active),lines:lines.filter(row=>args.p_include_retired||row.is_active)}),error:null};
 if(name==='read_job_financial_names')return {data:{divisions:[{id:'d1',code:'16',catalogue_division_id:'master-d1',catalogue_name:divisions[0].name,effective_name:divisionOverride||divisions[0].name,name_override:divisionOverride,name_version:divisionVersion,catalogue_active:divisions[0].is_active}],lines:fixture.rows().map(row=>({id:row.id,catalogue_line_id:row.id==='l1'?'master-l1':null,is_job_only_custom:row.id!=='l1',catalogue_name:lines[0].description,effective_name:row.name_override|| (row.id==='l1'?lines[0].description:row.description),name_override:row.name_override||null,catalogue_active:lines[0].is_active}))},error:null};
 if(name==='save_financial_catalogue_entry'){
  fixture.calls.push({name,args});if(fixture.failNext){fixture.failNext=false;return {error:{message:'Fixture rejected catalogue save'}};}
  const collection=args.p_entity==='division'?divisions:lines,old=collection.find(row=>row.id===args.p_id);
  if(fixture.stale || old&&old.version!==args.p_expected_version){fixture.stale=false;return {error:{message:'Catalogue entry changed; reload before saving'}};}
  const parent=divisions.find(row=>row.id===args.p_values.division_id);
  const saved={...old,...args.p_values,...(parent?{division_code:parent.code,division_name:parent.name}:{}),id:old?.id||'added-master',version:(old?.version||0)+1,is_active:args.p_operation!=='retire',usage_count:old?.usage_count||0};
  if(args.p_entity==='division')divisions=old?divisions.map(row=>row.id===old.id?saved:row):[...divisions,saved];else lines=old?lines.map(row=>row.id===old.id?saved:row):[...lines,saved];
  return {data:saved,error:null};
 }
 if(name==='save_job_financial_batch'){
  if(fixture.stale){fixture.stale=false;return {error:{message:'This financial line changed. Reload before saving.'}};}
  const patch=args.p_lines[0];if(Object.hasOwn(patch,'project_division_name_override')){divisionOverride=patch.project_division_name_override;divisionVersion++;}
 }
 return client.rpc(name,args);
}};}
