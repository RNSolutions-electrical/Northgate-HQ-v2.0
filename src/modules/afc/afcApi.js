import {withSupabaseTokenRetry} from '../../services/supabaseClient.js';
export function afcApi(getToken){
 const use=fn=>withSupabaseTokenRetry(getToken,fn);
 return {
  rpc:(name,args={})=>use(async client=>{const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}),
  release:body=>use(async client=>{const {data,error}=await client.functions.invoke('afc-release',{body});if(error){let message=error.message;try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}if(data.error)throw Error(data.error);return data;}),
  download:path=>use(async client=>{const {data,error}=await client.storage.from('northgate-files').download(path);if(error)throw error;return data;}),
 };
}
