import {studyResults} from './model.mjs';
import {afcPdf} from './pdf.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function releaseStudy({user,admin,body}){
 if(!uuid(body.id)||!uuid(body.requestId)||!Number.isInteger(body.version)||body.version<1||typeof body.note!=='string'||!body.note.trim()||body.note.length>4000)throw Error('Study, version, request and reviewed scope note are required.');
 const {data:context,error}=await user.rpc('afc_release_context',{p_id:body.id,p_version:body.version,p_request:body.requestId});if(error)throw error;
 if(context.receipt)return context.receipt;
 const results=studyResults(context.document);
 if(results.errors.length)throw Error(results.errors.join('\n'));
 results.releaseContext={reviewerName:context.reviewer_name,jobSnapshot:context.job_snapshot??null,reviewedAt:context.reviewed_at};
 const revision={revision:context.revision,reviewed_at:context.reviewed_at,reviewer_name:context.reviewer_name,review_note:body.note};
 // Calculate and render everything before the first storage write.
 const artifacts=[
  {kind:'report',name:'report.pdf',bytes:await afcPdf({document:context.document,results,revision})},
  {kind:'labels',name:'labels.pdf',bytes:await afcPdf({document:context.document,results,revision,kind:'labels'})},
  {kind:'source',name:'study.json',bytes:new TextEncoder().encode(JSON.stringify({document:context.document,results,revision,job:context.job_snapshot},null,2))}
 ];
 for(const n of context.document.nodes)artifacts.push({kind:'label',node_id:n.id,equipment:n.name+' / '+n.fault,name:'label-'+n.id+'.pdf',bytes:await afcPdf({document:context.document,results,revision,kind:'labels',nodeIds:[n.id]})});
 if(artifacts.some(a=>a.bytes.byteLength>25000000))throw Error('An artifact exceeds the 25 MB file limit.');
 if(new TextEncoder().encode(JSON.stringify(results)).length>5000000)throw Error('The calculation snapshot exceeds the supported release size.');
 const prefix='afc/'+body.id+'/'+body.requestId+'/'+crypto.randomUUID()+'/',files=[];
 for(const a of artifacts){
  const contentType=a.kind==='source'?'application/json':'application/pdf',path=prefix+a.name;
  const {error:uploadError}=await admin.storage.from('northgate-files').upload(path,a.bytes,{contentType,upsert:false});if(uploadError)throw uploadError;
  const {data:stored,error:readError}=await admin.storage.from('northgate-files').download(path);if(readError)throw readError;
  const digest=await hash(a.bytes);if(stored.size!==a.bytes.byteLength||await hash(await stored.arrayBuffer())!==digest)throw Error('Stored artifact verification failed.');
  files.push({id:crypto.randomUUID(),kind:a.kind,node_id:a.node_id,equipment:a.equipment,file_name:a.name,storage_path:path,size:a.bytes.byteLength,sha256:digest});
 }
 // Uncommitted uploads are private: only a committed afc_files record can grant
 // read access. Retrying can leave a private orphan; it cannot overwrite history.
 const {data,error:commitError}=await admin.rpc('afc_finalize_release',{p_actor:context.actor,p_id:body.id,p_version:body.version,p_request:body.requestId,p_results:results,p_files:files,p_note:body.note,p_reviewed_at:context.reviewed_at});
 if(commitError)throw commitError;return data;
}
