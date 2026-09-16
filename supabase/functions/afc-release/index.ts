import {createClient} from '@supabase/supabase-js';
import {releaseStudy} from '../_shared/afc/release.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors,status:204});
 if(req.method!=='POST')return new Response(null,{status:405,headers:cors});
 const authorization=req.headers.get('Authorization');
 if(!authorization?.startsWith('Bearer '))return Response.json({error:'Sign in required'},{status:401,headers:cors});
 try{
  const raw=await req.text();if(raw.length>12000)throw Error('Request too large');
  const body=JSON.parse(raw);
  const url=Deno.env.get('SUPABASE_URL')!;
  const pub=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||Deno.env.get('SUPABASE_ANON_KEY')!;
  const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // The user-scoped database RPC verifies Clerk's signature/claims via PostgREST
  // and the active HQ account before any privileged client is used.
  const user=createClient(url,pub,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await releaseStudy({user,admin,body});
  return Response.json(result,{headers:{...cors,'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Release failed'},{status:400,headers:{...cors,'Cache-Control':'no-store'}});}
});
