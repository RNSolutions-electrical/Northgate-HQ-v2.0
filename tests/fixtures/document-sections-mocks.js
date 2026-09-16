const rows=[
 {id:'doc1',owner_type:'job',owner_id:'job1',file_name:'plans.pdf',description:'Historical plans',document_type:'plans',division:'Electrical',mime_type:'application/pdf',created_at:'2026-09-10',updated_at:'2026-09-10',storage_path:'documents/job/job1/plans.pdf'},
 {id:'doc2',owner_type:'job',owner_id:'call1',file_name:'AFC-report.pdf',description:'Study 1, revision 1, Panel A',document_type:'afc_calculations',document_section:'electrical',division:'Electrical',mime_type:'application/pdf',created_at:'2026-09-15',updated_at:'2026-09-15',storage_path:'afc/study/report.pdf'},
 {id:'doc3',owner_type:'change_order',owner_id:'co1',file_name:'change-order.pdf',description:'Signed CO',document_type:'change_orders',division:'Electrical',mime_type:'application/pdf',created_at:'2026-09-15',updated_at:'2026-09-15',storage_path:'documents/change_order/co1/signed.pdf'},
];
const jobs=[{id:'job1',job_number:'J-001',name:'Fixture project',division:'Electrical'},{id:'call1',service_call_number:'SC-001',name:'Fixture service',division:'Electrical'}];
window.documentSectionsFixture={rows,calls:[]};
const getToken=async()=>'fixture';
export const useAuth=()=>({getToken});
export const withSupabaseTokenRetry=async(_,fn)=>fn(createSupabaseClient());
export function createSupabaseClient(){return {
 from(table){let id=null,single=false;const q={select(){return this;},is(){return this;},order(){return this;},range(){return this;},eq(key,value){if(key==='id')id=value;return this;},single(){single=true;return this;},then(resolve){const data=structuredClone(table==='documents'?rows:table==='jobs'?jobs:table==='change_orders'?[{id:'co1',job_id:'job1'}]:[]);return Promise.resolve({data:single?data.find(r=>r.id===id):data,error:null}).then(resolve);}};return q;},
 rpc:async(name,args)=>{window.documentSectionsFixture.calls.push({name,args});if(name==='set_document_section'){const row=rows.find(r=>r.id===args.p_id);row.document_section=args.p_section;row.updated_at='2026-09-16';return {data:row};}throw Error('Unexpected RPC');},
 storage:{from:()=>({createSignedUrl:async(path,options)=>{window.documentSectionsFixture.calls.push({path,options});return {data:{signedUrl:'https://example.com/fixture.pdf'}};}})}
};}
