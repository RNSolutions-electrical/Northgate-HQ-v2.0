import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {suggestCatalogueCode} from '../../../lib/catalogueCodeSuggestion.mjs';
import {catalogueCreateSeed,makeCatalogueCreatePayload,possibleCatalogueDuplicates} from './catalogueLineCreate.mjs';

export default function CatalogueLineCreate({line,materials,onSave,onLink,onClose}){
 const dialog=useRef(),saving=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const formId=useId();
 const [values,setValues]=useState(()=>catalogueCreateSeed(line));
 const duplicates=useMemo(()=>possibleCatalogueDuplicates(materials,values),[materials,values]);
 const update=patch=>{setError('');setValues(current=>({...current,...patch}));};
 useEffect(()=>{
  const node=dialog.current,previous=node.ownerDocument.activeElement;
  node.showModal();
  return ()=>{if(node.open)node.close();previous?.focus();};
 },[]);
 function link(material){try{onLink(material);onClose();}catch(e){setError(e.message);}}
 async function submit(event){
  event.preventDefault();
  if(saving.current||duplicates.length)return;
  saving.current=true;setBusy(true);setError('');
  try{const material=await onSave(line,makeCatalogueCreatePayload(values));link(material);}
  catch(e){setError(e.message||'Could not save the catalogue item. Your work item is unchanged.');}
  finally{saving.current=false;setBusy(false);}
 }
 return <dialog ref={dialog} className="blank-work-dialog editor" aria-label="Save to catalog" onCancel={e=>{e.preventDefault();e.stopPropagation();if(!saving.current)onClose();}}>
  <header className="estimate-popout-header"><h2>Save to catalog</h2><div className="estimate-popout-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" form={formId} className="primary" disabled={busy||duplicates.length>0}>{busy?'Saving…':'Save catalog item'}</button></div></header>
  <p>Creates a shared catalog item and links it to this draft. Your quantity, installed labor, notes and estimate pricing stay as entered. Canceling the work item later does not remove the catalog item.</p>
  {error&&<p role="alert">{error}</p>}
  <form id={formId} onSubmit={submit}>
   <fieldset className="resource-fields" disabled={busy}>
    <legend>Reusable material details</legend>
    <label className="wide">Description<input required maxLength={500} value={values.name} onChange={e=>update({name:e.target.value})}/></label>
    <label>Catalog unit<input readOnly value={values.unit}/></label>
    <label>Catalog number<input required maxLength={160} value={values.material_code} onChange={e=>update({material_code:e.target.value})}/></label>
    <button type="button" disabled={!values.name.trim()} onClick={()=>update({material_code:suggestCatalogueCode({name:values.name},materials.map(row=>row.material_code))})}>Suggest catalog number</button>
    <label>Verified unit cost (optional)<input type="number" min="0" step="any" value={values.price} onChange={e=>update({price:e.target.value})}/></label>
    <p className="wide">Leave cost blank unless it’s a verified price per {values.unit}. Estimate-only prices and labor aren’t copied automatically.</p>
   </fieldset>
   {duplicates.length>0&&<section aria-label="Possible catalog matches"><h3>Possible catalog matches</h3><p>Use the existing item or correct the description or catalog number before saving a new one.</p>
    <ul>{duplicates.slice(0,8).map(material=><li key={material.id}>{material.material_code} · {material.name} · {material.unit} {String(material.unit_of_measure||material.unit).trim().toLowerCase()===values.unit.toLowerCase()&&<button type="button" disabled={busy} onClick={()=>link(material)}>Link existing item</button>}</li>)}</ul>
   </section>}
  </form>
 </dialog>;
}
