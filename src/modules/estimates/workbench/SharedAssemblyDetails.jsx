import React,{useEffect,useState} from 'react';
import {RecipePreview} from './DefaultRecipeLibrary.jsx';
import {listDefaultRecipes,readDefaultRecipe} from './defaultRecipeService.mjs';
import {assemblyOrigin} from './assemblyUsage.mjs';

export function useSharedAssemblyRows(client,division,loadOrigins,library){
 const [revision,setRevision]=useState(0);
 const idKey=library.map(row=>row.id).sort().join(",");
 const [state,setState]=useState({recipes:[],origins:{},loading:Boolean(client),error:false});
 useEffect(()=>{
  let live=true;
  if(!client){setState({recipes:[],origins:{},loading:false,error:false});return;}
  setState({recipes:[],origins:{},loading:true,error:false});
  (async()=>{
   const [recipes,origins]=await Promise.allSettled([
    (async()=>listDefaultRecipes(await client(),division))(),
    (async()=>loadOrigins&&idKey?loadOrigins(idKey.split(",")):{})(),
   ]);
   if(live)setState({recipes:recipes.value??[],origins:origins.value??{},loading:false,error:recipes.status==='rejected'});
  })();
  return()=>{live=false;};
 },[client,division,loadOrigins,revision,idKey]);
 return {...state,refresh:()=>setRevision(x=>x+1)};
}

function AssemblyUsage({row,loadUsage}){
 const [state,setState]=useState({loading:true});
 useEffect(()=>{
  let active=true;
  (async()=>loadUsage(row))().then(matches=>{if(active)setState({matches});},()=>{if(active)setState({error:true});});
  return()=>{active=false;};
 },[row,loadUsage]);
 return <section aria-label="Recorded assembly usage">
  <h3>Recorded estimate usage</h3>
  <p>Checks saved work items and approved snapshots for active estimates you can open. Older items without a recorded link, personal estimates, archived estimates and unsaved work aren’t counted. Copies don’t update automatically.</p>
  {state.loading?<p role="status">Checking estimates…</p>:state.error?<p role="alert">Couldn’t check estimate usage. Close and reopen to retry.</p>:<><p><strong>{state.matches.length}</strong> {state.matches.length===1?'estimate version':'estimate versions'} with a recorded link.</p>{state.matches.length>0&&<ul className="assembly-usage-list">{state.matches.map(match=><li key={match.id}><strong>{match.title}</strong> {match.number&&<>· {match.number} </>}· Version {match.version??1}{match.status&&<> · {match.status}</>}{match.approvedSnapshot&&<> · Approved snapshot</>}</li>)}</ul>}</>}
 </section>;
}
export function SharedAssemblyDetails({row,client,loadUsage,usageOnly}){
 const [state,setState]=useState({loading:true});
 useEffect(()=>{
  if(usageOnly||!client)return;
  let active=true;
  (async()=>readDefaultRecipe(await client(),row.id))().then(({recipe})=>{if(active)setState({recipe});},()=>{if(active)setState({error:true});});
  return()=>{active=false;};
 },[row.id,client,usageOnly]);
 return <><p>{assemblyOrigin(row)}</p>{usageOnly?(loadUsage&&<AssemblyUsage row={row} loadUsage={loadUsage}/>):state.loading?<p role="status">Loading assembly…</p>:state.error?<p role="alert">Couldn’t open this saved assembly. Close and reopen to retry.</p>:<><p>Saved pricing snapshot. Reuse it through your estimate’s Assembly Library picker.</p><RecipePreview recipe={state.recipe}/></>}</>;
}
