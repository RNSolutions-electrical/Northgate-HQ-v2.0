import React,{useEffect,useRef,useState} from 'react';
import CatalogueMaterialForm from './CatalogueMaterialForm.jsx';
import {catalogueEditSeed,applyCatalogueFields} from './catalogueLineEdit.mjs';
export default function CatalogueLineEditor({line,material,onSave,onApply,onClose}){
 const dialog=useRef(),saving=useRef(false),[busy,setBusy]=useState(false),[saved,setSaved]=useState(null),[error,setError]=useState(''),[fields,setFields]=useState([]);
 useEffect(()=>{dialog.current.showModal();},[]);
 let seed,seedError;try{seed=catalogueEditSeed(line,material);}catch(e){seedError=e.message;}
 return <dialog ref={dialog} className="blank-work-dialog editor" aria-label="Edit catalogue item" onCancel={e=>{e.preventDefault();if(!saving.current)onClose();}}>
 <header className="actions"><h2>Edit catalogue item</h2><button disabled={busy} onClick={onClose}>Close</button></header>
 <p>This saves to the shared catalogue immediately, even if you later cancel this work item. Other estimates keep their recorded values. Your unsaved work stays open.</p>
 {error&&<p role="alert">{error}</p>}{seedError?<p role="alert">{seedError}</p>:saved?<section><h3>Catalogue saved</h3><p>Optionally apply selected fields to this resource only. Quantity, unit, discounts, notes, stage and other overrides remain unchanged. Selecting unit cost explicitly replaces this row’s price override. Nothing is selected automatically.</p>
 {['name','price','hours'].map(key=><label className="check" key={key}><input type="checkbox" checked={fields.includes(key)} onChange={e=>setFields(old=>e.target.checked?[...old,key]:old.filter(f=>f!==key))}/>{{name:'Description',price:'Unit cost',hours:'Labor hours per unit'}[key]}: {saved[key]??'Unknown'}</label>)}
 <button onClick={onClose}>Keep current work item values</button><button disabled={!fields.length} onClick={()=>{try{onApply(applyCatalogueFields(line,saved,fields));onClose();}catch(e){setError(e.message);}}}>Apply selected fields</button></section>:<><p>Suggestions fill missing catalogue labor from this resource. A missing estimating-master price is suggested only when no effective catalogue price exists or this row has a manual price override. Inventory-derived prices are not promoted to estimating-master prices automatically. Existing catalogue values, including zero, take precedence. Saving does not apply these values to your work item automatically.</p><CatalogueMaterialForm line={line} material={seed} busy={busy} onSave={async values=>{if(saving.current)return;saving.current=true;setBusy(true);setError('');try{setSaved(await onSave(line,material,values));}catch(e){setError(e.message);}finally{saving.current=false;setBusy(false);}}}/></>}
 </dialog>;
}
