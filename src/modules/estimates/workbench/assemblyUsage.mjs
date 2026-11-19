// Search exact saved provenance, never assembly names, private drafts or entire estimate documents.
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const footprint=reference=>({entries:[{items:[reference]}]});
export async function loadAssemblyUsage(client,division,row){
 if(!UUID.test(row?.id)||!['estimate-copy','library-record'].includes(row.libraryKind)||!division)throw Error('Assembly usage is unavailable.');
 const refs=row.libraryKind==='estimate-copy'?[{recipeProvenance:{id:row.id}}]:[{sourceAssemblyId:row.id},{libraryId:row.id}];
 async function collect(ref,snapshot){
  const table=snapshot?'estimate_snapshots':'estimate_workbenches';
  const document=snapshot?'workbench_document':'document';
  const relation=snapshot?'estimates':'estimates!estimate_workbenches_estimate_id_fkey';
  const results=[];
  for(let from=0;;from+=100){
   let query=client.from(table).select(`estimate_id,${relation}!inner(title,estimate_number,status,version_number)`);
   if(snapshot)query=query.eq('locked',true).eq('division',division);
   const {data,error}=await query.eq('estimates.division',division).is('estimates.archived_at',null).contains(document,footprint(ref))
    .order(snapshot?'id':'estimate_id').range(from,from+99);
   if(error)throw error;
   results.push(...(data||[]));if(!data||data.length<100)return results;
  }
 }
 const groups=await Promise.all(refs.flatMap(ref=>[collect(ref,false),collect(ref,true)]));
 const estimates=new Map();
 groups.forEach((rows,index)=>rows.forEach(({estimate_id,estimates:header})=>{
  if(!header||!estimate_id)return;
  const match=estimates.get(estimate_id)||{id:estimate_id,title:header.title,number:header.estimate_number,status:header.status,version:header.version_number};
  if(index%2)match.approvedSnapshot=true;
  estimates.set(estimate_id,match);
 }));
 return [...estimates.values()].sort((a,b)=>a.title.localeCompare(b.title)||a.version-b.version||a.id.localeCompare(b.id));
}
export const assemblyOrigin=row=>row.libraryKind==='estimate-copy'||row.libraryOrigin==='estimate'?'From estimate':row.libraryOrigin==='library'?'Built in library':'Origin not recorded';
export function combinedAssemblyRows(legacy,recipes,origins={}){
 return [
  ...legacy.map(row=>({...row,libraryOrigin:origins[row.id]??row.libraryOrigin,libraryKind:'library-record'})),
  ...recipes.map(row=>({
   id:row.id,name:row.name,updatedAt:row.created_at,resourceCount:row.resource_count,quoteCount:row.quote_count,
   lines:[],libraryKind:'estimate-copy',
  })),
 ];
}

export async function loadLegacyAssemblyOrigins(sessionClient,division,ids){
 const unique=[...new Set(ids)].filter(id=>UUID.test(id));
 if(!unique.length)return {};
 const db=await sessionClient(),origins={};
 for(let offset=0;offset<unique.length;offset+=500){
  const {data,error}=await db.rpc('read_legacy_assembly_origins',{p_division:division,p_assembly_ids:unique.slice(offset,offset+500)});
  if(error)throw error;
  for(const row of data??[])if(UUID.test(row.id)&&row.origin!=='unknown')origins[row.id]=row.origin==='from_estimate'?'estimate':row.origin==='built_in_library'?'library':undefined;
 }
 return origins;
}
