import {createClient} from '@supabase/supabase-js';
import {runReadTool} from './_shared/northgateReadTools.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export default async request=>{
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const env=globalThis.Netlify?.env;
 if(env?.get('NORTHGATE_READ_TOOLS_ENABLED')!=='true')return json({error:'Northgate read tools are not enabled'},503);
 const token=request.headers.get('authorization');if(!/^Bearer \S+$/i.test(token||''))return json({error:'Sign in required'},401);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Origin not permitted'},403);
 try{
  const raw=await request.text();if(raw.length>2500)return json({error:'Request too large'},413);
  const body=JSON.parse(raw),url=env.get('SUPABASE_URL')||env.get('VITE_SUPABASE_URL'),key=env.get('SUPABASE_ANON_KEY')||env.get('VITE_SUPABASE_ANON_KEY');
  if(!url||!key)throw Error('Northgate read tools are not configured');
  // This internal API retains the caller's existing Clerk/Supabase session.
  // It has no service credential and no dynamic table/RPC/SQL parameter.
  const client=createClient(url,key,{global:{headers:{Authorization:token}},auth:{persistSession:false,autoRefreshToken:false}});
  return json(await runReadTool(client,body.tool,body.arguments));
 }catch(error){return json({error:error.message||'Read failed'},400);}
};
