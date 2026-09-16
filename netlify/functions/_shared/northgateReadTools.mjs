import {resolveMaterials} from '../../../src/lib/materialResolver.js';
const uuidPattern='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const uuid={type:'string',pattern:uuidPattern},query={type:'string',minLength:1,maxLength:150},limit={type:'integer',minimum:1,maximum:50};
const definition=(name,description,properties,required)=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:['northgate:read']}]});
export const READ_TOOLS=Object.freeze([
 definition('get_job_summary','Read an accessible Northgate job’s operational summary by canonical job ID. No financial values.',{id:uuid},['id']),
 definition('get_service_call','Read an accessible service call and its operational profile. No invoice, cost, or payment data.',{id:uuid},['id']),
 definition('search_catalog','Find visible active material catalogue candidates using the shared Northgate resolver. Never selects or writes a material.',{query,limit},['query']),
 definition('resolve_material','Resolve an identifier, name, or alias to candidate materials. Ambiguity and required confirmation are explicit.',{query,limit},['query']),
 definition('get_inventory_location','Read an accessible storage unit, shelf, bay, or bin. Bin stock preserves whether quantity was recorded.',{id:uuid,kind:{type:'string',enum:['unit','shelf','bay','bin']}},['id','kind']),
]);
export function validateToolArgs(name,args){
 const spec=READ_TOOLS.find(t=>t.name===name);if(!spec)throw Error('Unsupported read tool.');
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(spec.inputSchema.properties,k)))throw Error('Invalid tool arguments.');
 for(const key of spec.inputSchema.required)if(!Object.hasOwn(args,key))throw Error('Missing '+key+'.');
 if(args.id!==undefined&&(typeof args.id!=='string'||!new RegExp(uuidPattern).test(args.id)))throw Error('Use a canonical record ID.');
 if(args.query!==undefined&&(typeof args.query!=='string'||!args.query.trim()||args.query.length>150))throw Error('Enter a search up to 150 characters.');
 if(args.limit!==undefined&&(!Number.isInteger(args.limit)||args.limit<1||args.limit>50))throw Error('Use a limit of 1–50.');
 if(args.kind!==undefined&&!['unit','shelf','bay','bin'].includes(args.kind))throw Error('Choose a storage location kind.');
 return spec;
}
const result=async request=>{const {data,error}=await request;if(error)throw error;return data;};
const jobFields='id,job_number,service_call_number,name,status,description,address_line1,address_line2,city,state,postal_code,division,job_type,updated_at';
const itemFields='id,material_code,name,description,broad_category,sub_category,sub_category_2,sub_category_3,size,length,manufacturer,unit_of_measure,division,item_aliases(id,alias,archived_at)';
export async function runReadTool(client,name,args){
 validateToolArgs(name,args);
 const context=await result(client.rpc('northgate_read_context'));if(!context?.actor)throw Error('Active sign-in required.');
 const request=crypto.randomUUID(),audit=outcome=>result(client.rpc('northgate_audit_read',{p_request:request,p_tool:name,p_arguments:args,p_outcome:outcome}));
 await audit('started');
 try{
  let data;
  if(name==='get_job_summary'||name==='get_service_call'){
   let q=client.from('jobs').select(jobFields).eq('id',args.id).is('archived_at',null);if(name==='get_service_call')q=q.eq('job_type','service_call');
   const job=await result(q.maybeSingle());if(!job)throw Error('Record unavailable within your access.');
   data={job};if(name==='get_service_call')data.profile=await result(client.from('svc_service_profiles').select('job_id,classification,call_kind,related_job_id,completed_at,business_name,service_date,lead_name,work_stage,updated_at').eq('job_id',args.id).maybeSingle());
  }else if(name==='get_inventory_location'){
   const p=context.permissions;if(p.can_inventory_transactions!==true&&p.can_manage_inventory!==true)throw Error('Inventory access required.');
   const locations={unit:['storage_units','id,unit_code,name,division,physical_location,materials_summary,revision'],shelf:['shelves','id,unit_id,shelf_code,label,physical_location,materials_summary,revision'],bay:['bays','id,shelf_id,bay_code,label,physical_location,materials_summary,revision'],bin:['bins','id,bay_id,bin_code,label,physical_location,materials_summary,revision']};
   const [table,fields]=locations[args.kind],location=await result(client.from(table).select(fields).eq('id',args.id).is('archived_at',null).maybeSingle());if(!location)throw Error('Location unavailable within your access.');
   data={kind:args.kind,location};
   if(args.kind==='bin')data.stock=await result(client.from('inventory_cart_candidates_view').select('bin_item_id,item_id,bin_id,material_code,item_name,unit_of_measure,quantity_on_hand,quantity_recorded').eq('bin_id',args.id).order('bin_item_id').limit(1000));
   if(data.stock?.length===1000)data.stockIncomplete=true;
   if(data.stock)data.stock=data.stock.map(row=>({...row,quantity_on_hand:row.quantity_recorded===true?row.quantity_on_hand:null}));
  }else{
   const p=context.permissions;if(p.can_estimate!==true&&p.can_inventory_transactions!==true&&p.can_manage_inventory!==true)throw Error('Catalogue access required.');
   const items=[];let incomplete=false;
   for(let offset=0;offset<10000;offset+=1000){
    const rows=await result(client.from('items').select(itemFields).eq('is_active',true).eq('is_archived',false).order('id').range(offset,offset+999));items.push(...rows);if(rows.length<1000)break;if(offset===9000)incomplete=true;
   }
   const resolved=resolveMaterials(items,args.query),candidates=resolved.candidates.slice(0,args.limit||20).map(c=>({item:c.item,match:c.match,rank:c.rank}));
   data={candidates,ambiguous:resolved.ambiguous,requiresConfirmation:resolved.requiresConfirmation,incomplete,totalCandidatesInLoadedScope:resolved.candidates.length};
  }
  await audit('succeeded');return {asOf:new Date().toISOString(),tool:name,data};
 }catch(error){try{await audit('failed');}catch{}throw error;}
}
