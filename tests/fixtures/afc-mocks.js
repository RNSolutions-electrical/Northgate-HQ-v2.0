import {demo} from '../../src/modules/afc/engine.mjs';
import {importStudy} from '../../src/modules/afc/model.mjs';
const document=importStudy(demo()).document;document.title='Synthetic AFC study';document.reference='Test facility';document.preparedBy='Fixture preparer';
const row={id:'00000000-0000-4000-8000-000000000001',version:1,division:'Electrical',status:'draft',document,can_review:true,revisions:[],job_id:null,original_import:null};
const state=window.afcFixture={row,failSave:false,saves:0,releases:0};
const getToken=async()=> 'fixture';
const user={id:'fixture',fullName:'Fixture User'};
export const useAuth=()=>({getToken});
export const useUser=()=>({user});
export const withSupabaseTokenRetry=async(_,fn)=>fn({});
export const afcApi=()=>({
 async rpc(name,args={}){
  if(name==='afc_jobs')return [{id:'00000000-0000-4000-8000-000000000002',name:'Test job',number:'TEST',division:'Electrical'}];
  if(name==='afc_read')return structuredClone(args.p_id?state.row:[{...state.row,title:state.row.document.title,location:state.row.document.reference}]);
  if(name==='afc_save'){state.saves++;if(state.failSave){state.failSave=false;throw Error('Synthetic stale save; reload required');}state.row={...state.row,document:structuredClone(args.p_document),version:state.row.version+1,status:'draft',job_id:args.p_job};return structuredClone(state.row);}
  throw Error('Unexpected fixture RPC '+name);
 },
 async release(body){state.releases++;state.row.status='reviewed';state.row.version++;state.row.revisions.unshift({id:crypto.randomUUID(),revision:1,document:structuredClone(state.row.document),reviewer_name:'Fixture reviewer',review_note:body.note,reviewed_at:'2026-09-15',files:[]});return structuredClone(state.row);},
 async download(){return new Blob(['fixture']);}
});
