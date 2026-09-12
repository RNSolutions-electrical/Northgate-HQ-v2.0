const getToken=async()=>'fixture';
export const useAuth=()=>({getToken});
export const useUser=()=>({user:{id:'fixture',fullName:'Tester'}});
export const withSupabaseTokenRetry=async(_getToken,operation)=>operation(createSupabaseClient());
const owner=location.search.includes('estimate')?'estimate':'job';
let docs=[{id:'doc1',owner_type:owner,owner_id:'owner1',division:'Electrical',file_name:'fixture.pdf',storage_path:'fixture.pdf',document_type:'misc',created_at:'2026-09-11T12:00:00Z',updated_at:'2026-09-11T12:00:00Z'}];
let archived=[];
window.documentFixture={calls:[],failNext:false,failUpload:false};
export function createSupabaseClient(){return {
 from(table){
  let payload;
  const q={select(){return this;},eq(){return this;},is(){return this;},in(){return this;},order(){return this;},limit(){return this;},range(){return this;},or(){return this;},maybeSingle(){return this;},
   insert(value){payload=value;return this;},
   then(resolve){
    if(payload){docs.push(payload);window.documentFixture.calls.push({insert:payload});return Promise.resolve({data:payload,error:null}).then(resolve);}
    const data=table==='jobs'?[{id:'owner1',job_number:'101',name:'Document Fixture',division:'Electrical',status:'active',job_type:'job'}]
      :table==='estimates'?[{id:'owner1',estimate_number:'EST-1',title:'Document Fixture',division:'Electrical',status:'draft'}]
      :table==='documents'?[...docs]:[];
    return Promise.resolve({data,error:null}).then(resolve);
   }};return q;
 },
 storage:{from(){return {async upload(){return {error:window.documentFixture.failUpload?{message:'Fixture upload failed'}:null};}};}},
 async rpc(name,args){
  window.documentFixture.calls.push({name,args});
  if(window.documentFixture.failNext){window.documentFixture.failNext=false;return {error:{message:'Fixture archive failed'}};}
  if(name==='read_archived_owner_documents')return {data:archived.slice(args.p_offset,args.p_offset+50),error:null};
  if(name==='maintain_owner_document'){
   if(args.p_action==='edit')docs=docs.map(d=>d.id===args.p_document_id?{...d,...args.p_changes,updated_at:new Date().toISOString()}:d);
   else {docs.push({...archived.find(d=>d.id===args.p_document_id),archived_at:null});archived=archived.filter(d=>d.id!==args.p_document_id);}
  }
  if(['archive_job_document','archive_estimate_document','archive_failed_document_upload'].includes(name)){
   archived.push({...docs.find(d=>d.id===args.p_document_id),archived_at:new Date().toISOString(),archive_reason:args.p_reason,updated_at:new Date().toISOString()});
   docs=docs.filter(d=>d.id!==args.p_document_id);
  }
  return {data:[],error:null};
 }
};}
