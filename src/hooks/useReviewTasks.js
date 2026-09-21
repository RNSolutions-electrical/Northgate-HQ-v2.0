import {useAuth} from '@clerk/clerk-react';
import {useEffect,useState} from 'react';
import {createSupabaseClient} from '../services/supabaseClient.js';

const EMPTY=Object.freeze([]);

export function reviewTaskPath(task){
 if(task.module_key==='estimating')return '/estimates';
 if(task.module_key==='inventory')return '/inventory';
 return '/dashboard';
}

export function useReviewTasks(enabled=true){
 const {getToken}=useAuth();
 const [refreshKey,setRefreshKey]=useState(0);
 const [state,setState]=useState({isLoading:false,error:null,items:EMPTY});
 useEffect(()=>{
  let mounted=true;
  async function load(){
   if(!enabled){setState({isLoading:false,error:null,items:EMPTY});return;}
   setState(current=>({...current,isLoading:true,error:null}));
   try{
    const client=createSupabaseClient(await getToken({template:'supabase'}));
    const {data,error}=await client.rpc('read_my_review_task_inbox',{p_limit:200});
    if(error)throw error;
    if(mounted)setState({isLoading:false,error:null,items:data||EMPTY});
   }catch(error){
    console.error('Review task inbox failed to load',error);
    if(mounted)setState({isLoading:false,error,items:EMPTY});
   }
  }
  load();return()=>{mounted=false;};
 },[enabled,getToken,refreshKey]);
 return {...state,reload:()=>setRefreshKey(value=>value+1)};
}
