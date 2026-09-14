import {withSupabaseTokenRetry} from '../../services/supabaseClient.js';
import {sha256} from './legacyInspectionImport.js';

export function inspectionApi(getToken){
 const use=operation=>withSupabaseTokenRetry(getToken,operation);
 const rpc=(name,args={})=>use(async client=>{const {data,error}=await client.rpc(name,args);if(error)throw error;return data;});
 const download=path=>use(async client=>{const {data,error}=await client.storage.from('northgate-files').download(path);if(error)throw error;return data;});
 return {rpc,download,async upload({id,inspection,version,file,kind='photo',equipmentId='',findingId='',caption='',revisionId=null}){
   const bytes=await file.arrayBuffer(),hash=await sha256(bytes);
   if(!file.size||file.size>25*1024*1024)throw new Error('Choose a file up to 25 MB.');
   const header=new Uint8Array(bytes);
   if(kind==='photo'&&!((file.type==='image/png'&&[137,80,78,71,13,10,26,10].every((v,i)=>header[i]===v))||(file.type==='image/jpeg'&&header[0]===255&&header[1]===216&&header[2]===255)))throw new Error('Choose a valid JPEG or PNG photo.');
   if(kind==='photo'){let bitmap;try{bitmap=await createImageBitmap(file);if(!bitmap.width||!bitmap.height)throw new Error('Empty image');}catch{throw new Error('This photo cannot be decoded. Choose a readable JPEG or PNG.');}finally{bitmap?.close();}}
   if(kind==='report'&&new TextDecoder().decode(header.slice(0,5))!=='%PDF-')throw new Error('Report bytes are not a PDF.');
   const reserved=await rpc('hi_file_reserve',{p_id:id,p_inspection_id:inspection,p_expected_version:version,p_file:{kind,file_name:file.name,mime_type:file.type,file_size_bytes:file.size,sha256:hash,equipment_id:equipmentId,finding_id:findingId,caption,revision_id:revisionId}});
   if(reserved.status==='ready')return reserved;
   // Retry uses the same reservation and never overwrites an existing object.
   await use(async client=>{const {error}=await client.storage.from('northgate-files').upload(reserved.storage_path,file,{contentType:file.type,upsert:false});if(error&&!/already exists|duplicate|resource.*exists/i.test(error.message))throw error;});
   const stored=await download(reserved.storage_path);
   if(stored.size!==file.size||await sha256(await stored.arrayBuffer())!==hash)throw new Error('Stored file differs from the selected file. Keep this upload pending and contact an administrator.');
   return rpc('hi_file_finish',{p_id:reserved.id,p_sha256:hash});
 }};
}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function importPhotoFile(file){
 if(file.type!=='image/webp')return file;
 const bitmap=await createImageBitmap(file);try{const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Photo conversion failed.')),'image/png'));return new File([blob],file.name.replace(/\.[^.]*$/,'')+'.png',{type:'image/png'});}finally{bitmap.close();}
}
