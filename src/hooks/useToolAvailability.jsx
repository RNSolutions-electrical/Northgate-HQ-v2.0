import {useAuth} from '@clerk/clerk-react';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {withSupabaseTokenRetry} from '../services/supabaseClient.js';
const Context=createContext(null);
export function ToolAvailabilityProvider({children}) {
 const {getToken,userId}=useAuth();
 const [state,setState]=useState({rows:[],loading:true,error:null});
 const seq=useRef(0);
 const reload=useCallback(async()=>{
  const request=++seq.current;
  try {
   const rows=await withSupabaseTokenRetry(getToken,async client=>{
    const {data,error}=await client.rpc('read_tool_availability');if(error)throw error;
    if(!Array.isArray(data))throw Error('Tool availability response is invalid');return data;
   });
   if(request===seq.current)setState({rows,loading:false,error:null});
  }catch(error){if(request===seq.current)setState({rows:[],loading:false,error});}
 },[getToken,userId]);
 useEffect(()=>{
  setState({rows:[],loading:true,error:null});reload();
  const timer=setInterval(reload,30000);
  window.addEventListener('focus',reload);window.addEventListener('northgate:tools-updated',reload);
  return ()=>{seq.current++;clearInterval(timer);window.removeEventListener('focus',reload);window.removeEventListener('northgate:tools-updated',reload);};
 },[reload]);
 return <Context.Provider value={{...state,reload}}>{children}</Context.Provider>;
}
export function useToolAvailability(){return useContext(Context);}
