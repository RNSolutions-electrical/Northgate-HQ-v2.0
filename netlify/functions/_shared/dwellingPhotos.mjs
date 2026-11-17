import {createHash,createHmac} from 'node:crypto';
export const PHOTO_LIMIT=4*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function boundedBytes(request){
 const length=Number(request.headers.get('content-length'));if(Number.isFinite(length)&&length>PHOTO_LIMIT)throw fail('Photo exceeds 4 MiB.',413);
 if(!request.body)throw fail('Photo required.');const reader=request.body.getReader(),chunks=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>PHOTO_LIMIT){await reader.cancel();throw fail('Photo exceeds 4 MiB.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 if(!total)throw fail('Photo required.');return Buffer.concat(chunks,total);
}
export async function normalizePhoto(input,sharp){
 const jpeg=input.length>=3&&input[0]===255&&input[1]===216&&input[2]===255, png=input.length>=8&&input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), webp=input.length>=12&&input.toString('ascii',0,4)==='RIFF'&&input.toString('ascii',8,12)==='WEBP';
 if(!jpeg&&!png&&!webp)throw fail('Unsupported photo signature.');
 const pipeline=sharp(input,{failOn:'warning',limitInputPixels:24_000_000,animated:false,sequentialRead:true});
 const meta=await pipeline.metadata();
 if(!['jpeg','png','webp'].includes(meta.format)||!meta.width||!meta.height||(meta.pages||1)!==1||meta.width*meta.height>24_000_000)throw fail('Use a single JPEG, PNG or WebP photo, at most 24 megapixels.');
 // Decode and freshly encode; metadata is removed by default, not copied from input.
 const output=await pipeline.rotate().jpeg({quality:90,mozjpeg:false}).timeout({seconds:10}).toBuffer();
 if(!output.length||output.length>PHOTO_LIMIT)throw fail('Processed photo exceeds 4 MiB.',413);
 return {bytes:output,sha256:createHash('sha256').update(output).digest('hex'),size:output.length,mime:'image/jpeg'};
}
export const proofMessage=(reservation,photo)=>['dwelling-photo-v1',reservation.owner_id,reservation.id,reservation.study_id,reservation.item_id,reservation.nonce,photo.sha256,String(photo.size),'image/jpeg'].join('\n');
export function attest(reservation,photo,secret){if(!/^[a-f0-9]{64,128}$/i.test(secret||''))throw fail('Photo service unavailable.',503);return createHmac('sha256',Buffer.from(secret,'hex')).update(proofMessage(reservation,photo)).digest('hex');}
export function photoHandler({env,createClient,sharp}){return async request=>{
 try{
  if(!['POST','GET'].includes(request.method))return json({error:'Method not allowed.'},405);
  if(env('DWELLING_PHOTOS_ENABLED')!=='true')return json({error:'Photo upload/access is not enabled.'},503);
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw fail('Origin not permitted.',403);
  const authorization=request.headers.get('authorization');if(!/^Bearer \S+$/i.test(authorization||''))throw fail('Sign in required.',401);
  const url=env('SUPABASE_URL')||env('VITE_SUPABASE_URL'),key=env('SUPABASE_ANON_KEY')||env('VITE_SUPABASE_ANON_KEY');
  if(!url||!key)throw fail('Photo service unavailable.',503);
  const client=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const rpc=async(name,args)=>{const r=await client.rpc(name,args);if(r.error)throw fail('Photo request denied or unavailable.',r.error.code==='42501'?403:409);return r.data;};
  const q=new URL(request.url).searchParams,study=q.get('study'),item=q.get('item'),evidence=q.get('evidence');
  if(!uuid.test(study||''))throw fail('Valid study required.');
  if(request.method==='GET'){
   if(!uuid.test(evidence||''))throw fail('Valid evidence required.');
   const record=await rpc('get_dwelling_photo_access',{p_study:study,p_evidence:evidence});
   if(!record)throw fail('Photo unavailable.',404);
   const result=await client.storage.from('dwelling-evidence-private').download(record.object_key);
   if(result.error||!result.data)throw fail('Photo unavailable.',404);
   if(result.data.size>PHOTO_LIMIT)throw fail('Photo unavailable.',409);
   const bytes=Buffer.from(await result.data.arrayBuffer());
   if(!Number.isSafeInteger(record.byte_size)||record.byte_size!==bytes.length||!record.sha256||createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw fail('Photo integrity check failed.',409);
   return new Response(bytes,{headers:{'Content-Type':'image/jpeg','Content-Disposition':'attachment; filename="dwelling-photo.jpg"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }
  if(!uuid.test(item||''))throw fail('Valid equipment item required.');
  if(!['image/jpeg','image/png','image/webp'].includes(request.headers.get('content-type')?.split(';')[0]))throw fail('Only JPEG, PNG and WebP photos are supported. PDF upload remains pending.',415);
  const secret=env('DWELLING_PHOTO_ATTESTATION_KEY');if(!/^[a-f0-9]{64,128}$/i.test(secret||''))throw fail('Photo service unavailable.',503);
  // Supabase verifies the bearer JWT and current owner/developer policy BEFORE decoding bytes.
  const reservation=await rpc('reserve_dwelling_photo',{p_study:study,p_item:item});
  const photo=await normalizePhoto(await boundedBytes(request),sharp);
  const upload=await client.storage.from('dwelling-evidence-private').upload(reservation.object_key,photo.bytes,{contentType:'image/jpeg',upsert:false,cacheControl:'0'});
  if(upload.error)throw fail('Photo could not be stored. No evidence was attached.',409);
  const saved=await rpc('finalize_dwelling_photo',{p_id:reservation.id,p_sha256:photo.sha256,p_size:photo.size,p_proof:attest(reservation,photo,secret)});
  return json({evidenceId:saved.id,studyId:study,itemId:item,sha256:photo.sha256,byteSize:photo.size,note:'Verified photo saved. Add its evidence ID to the worksheet and save the worksheet.'},201);
 }catch(error){return json({error:error.status?error.message:'Photo processing failed. No evidence was attached.'},error.status||400);}
};}
