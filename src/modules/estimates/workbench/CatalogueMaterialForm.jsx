import React, {useState} from 'react';
import {cataloguePayload,laborHoursPerUnit,vendorAverage} from '../../../lib/materialCatalogueDetails.mjs';

export default function CatalogueMaterialForm({line={},material,busy,error,onSave,readOnly=false}) {
 const unit=material?.unit_of_measure||material?.unit||line.unit||'EA';
 const [values,setValues]=useState(()=>({
  name:material?.name||line.name||'',material_code:material?.catalogue_draft?'':material?.material_code||'',unit,
  price:material?material.estimating_price_per_unit??'':line.price??'',
  aliases:(material?.item_aliases||[]).filter(a=>!a.archived_at).map(a=>a.alias).join('\n'),
  vendor_prices:material?.vendor_prices||[],catalogue_notes:material?.catalogue_notes||'',
  neca_labor:material?.neca_labor_input||{hours:material?.labor_rate_hrs??material?.hours??line.hours??'',per:1,unit,units_per_catalogue_unit:1,reference:''},
  stock:{in_stock:false,quantity:'',storage_unit:'',shelf:'',bay:'',bin:''},
 }));
 const [validation,setValidation]=useState('');
 const update=patch=>setValues(current=>({...current,...patch}));
 const labor=patch=>update({neca_labor:{...values.neca_labor,...patch}});
 const stock=patch=>update({stock:{...values.stock,...patch}});
 const quote=(index,patch)=>update({vendor_prices:values.vendor_prices.map((row,i)=>i===index?{...row,...patch}:row)});
 let average,hours;
 try{average=vendorAverage(values.vendor_prices);}catch{average=null;}
 try{hours=laborHoursPerUnit(values.neca_labor,values.unit);}catch{hours=null;}
 const reviewRequested=values.stock.in_stock||['storage_unit','shelf','bay','bin'].some(key=>values.stock[key].trim())||String(values.stock.quantity).trim()!=='';
 async function submit(event){event.preventDefault();setValidation('');try{await onSave(cataloguePayload(values));}catch(caught){setValidation(caught.message);}}
 return <form className="material-catalogue-form" onSubmit={submit}>
  <p>Update the shared material catalogue. Saved estimates and inventory transactions retain their recorded prices and labor.</p>
  {(error||validation)&&<p role="alert" className="save-error">{error||validation}</p>}
  <fieldset disabled={busy||readOnly} className="resource-fields"><legend>Material</legend>
   <label className="wide">Description<input required value={values.name} maxLength={500} onChange={e=>update({name:e.target.value})}/></label>
   <label>Catalogue number<input value={values.material_code} maxLength={160} onChange={e=>update({material_code:e.target.value})}/></label>
   <label>Catalogue unit<input required readOnly={Boolean(material)} value={values.unit} maxLength={30} onChange={e=>update({unit:e.target.value})}/></label>
   <label className="wide">Aliases — one per line<textarea rows={3} value={values.aliases} onChange={e=>update({aliases:e.target.value})}/></label>
  </fieldset>
  <fieldset disabled={busy||readOnly} className="resource-fields"><legend>Material pricing</legend>
   <p className="wide">Each quote is divided by its quantity in {values.unit}. The average gives each vendor quote equal weight, including zero prices.</p>
   {values.vendor_prices.map((row,index)=><div className="wide catalogue-vendor-row" key={index}>
    <label>Vendor<input required maxLength={160} value={row.vendor} onChange={e=>quote(index,{vendor:e.target.value})}/></label>
    <label>Quoted price<input required type="number" min="0" step="any" value={row.price} onChange={e=>quote(index,{price:e.target.value})}/></label>
    <label>Per quantity ({values.unit})<input required type="number" min="0.000001" step="any" value={row.quantity} onChange={e=>quote(index,{quantity:e.target.value})}/></label>
    <label>Vendor link (optional)<input type="url" maxLength={2000} value={row.url} onChange={e=>quote(index,{url:e.target.value})}/></label>
    {/^https?:\/\/\S+$/i.test(row.url||'')&&<a href={row.url} target="_blank" rel="noopener noreferrer">Open vendor link</a>}
    <button type="button" onClick={()=>update({vendor_prices:values.vendor_prices.filter((_,i)=>i!==index)})}>Remove vendor</button>
   </div>)}
   <button type="button" onClick={()=>update({vendor_prices:[...values.vendor_prices,{vendor:'',price:'',quantity:1,url:''}]})}>Add vendor price</button>
   <label>Average material price / {values.unit}<input type="number" min="0" step="any" readOnly={values.vendor_prices.length>0} value={values.vendor_prices.length?average??'':values.price} onChange={e=>update({price:e.target.value})}/></label>
   <p className="wide">{values.vendor_prices.length?'Calculated from vendor pricing.':'Enter a reference price when no vendor quotes are available.'}{material?.inventory_price_per_unit!=null?` Inventory has an explicit override of ${material.inventory_price_per_unit} per ${values.unit}, which remains effective.`:''}</p>
  </fieldset>
  <fieldset disabled={busy||readOnly} className="resource-fields"><legend>NECA / source labor rate</legend>
   <label>Labor hours<input type="number" min="0" step="any" value={values.neca_labor.hours} onChange={e=>labor({hours:e.target.value})}/></label>
   <label>Rate basis<select value={String(values.neca_labor.per)} onChange={e=>labor({per:Number(e.target.value)})}><option value="1">Per 1 (each / ft / unit)</option><option value="100">Per C (100 units)</option><option value="1000">Per M (1,000 units)</option>{![1,100,1000].includes(Number(values.neca_labor.per))&&<option value={values.neca_labor.per}>Custom quantity</option>}</select></label>
   <label>Basis quantity<input required type="number" min="0.000001" step="any" value={values.neca_labor.per} onChange={e=>labor({per:e.target.value})}/></label>
   <label>Labor basis unit<input required maxLength={30} value={values.neca_labor.unit} onChange={e=>labor({unit:e.target.value})} placeholder="EA, FT, LB…"/></label>
   <label>{values.neca_labor.unit||'Labor units'} per catalogue {values.unit}<input required type="number" min="0.000001" step="any" value={values.neca_labor.units_per_catalogue_unit} onChange={e=>labor({units_per_catalogue_unit:e.target.value})}/></label>
   <label>NECA edition / source (optional)<input maxLength={500} value={values.neca_labor.reference} onChange={e=>labor({reference:e.target.value})}/></label>
   <p className="wide" role="status">Calculated labor: <strong>{hours==null?'Not set':`${Number(hours.toFixed(8))} hours / ${values.unit}`}</strong>. M means 1,000 of the stated labor unit. Enter rates from your source; no reference rates are supplied.</p>
   <label className="wide">Notes<textarea rows={4} maxLength={10000} value={values.catalogue_notes} onChange={e=>update({catalogue_notes:e.target.value})}/></label>
  </fieldset>
  <fieldset disabled={busy||readOnly} className="resource-fields"><legend>Optional stock review</legend>
   <label className="wide catalogue-checkbox"><input type="checkbox" checked={values.stock.in_stock} onChange={e=>stock({in_stock:e.target.checked})}/> We have this material in stock</label>
   <label>Suggested quantity (optional)<input type="number" min="0" step="any" value={values.stock.quantity} onChange={e=>stock({quantity:e.target.value})}/></label>
   {['storage_unit','shelf','bay','bin'].map(key=><label key={key}>{key==='storage_unit'?'Storage unit':key[0].toUpperCase()+key.slice(1)} (optional)<input maxLength={160} value={values.stock[key]} onChange={e=>stock({[key]:e.target.value})}/></label>)}
   <p className="wide">{reviewRequested?'Saving will send a stock review request. The reviewer confirms the bin and actual total count before on-hand inventory changes.':'Enter any known location or check “in stock” to request inventory review.'}</p>
  </fieldset>
  {!readOnly&&<div className="dialog-actions"><button className="primary primary-button" disabled={busy}>{busy?'Saving…':reviewRequested?'Save catalogue & request stock review':'Save catalogue material'}</button></div>}
 </form>;
}
