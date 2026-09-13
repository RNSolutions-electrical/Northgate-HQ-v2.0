import React,{useState} from 'react';
import {id} from './model.mjs';
import {defaults} from './pricing.mjs';
export function QuoteForm({quote,data,packageId,onSave}){
 const link=data.entries.find(e=>e.items.some(i=>i.quoteId===quote?.id));
 const [type,setType]=useState(quote?.type||'material');
 const linkedItem=link?.items.find(i=>i.quoteId===quote?.id);
 const [override,setOverride]=useState((linkedItem?linkedItem.materialMarkupOverride:quote?.materialMarkupOverride)??'');
 return <form onSubmit={event=>{event.preventDefault();const f=new FormData(event.target);onSave({...quote,id:quote?.id||id(),packageId:quote?.packageId||packageId,name:f.get('name').trim(),vendor:f.get('vendor').trim(),reference:f.get('reference').trim(),type,materialMarkupOverride:override===''?null:Number(override),materialAmount:Number(f.get('material')||0),otherAmount:Number(f.get('other')||0)});}}>
 <label>Quote / package name<input required name="name" defaultValue={quote?.name} placeholder="Lighting package"/></label><label>Vendor<input required name="vendor" defaultValue={quote?.vendor}/></label><label>Quote reference<input name="reference" defaultValue={quote?.reference}/></label>
 <label>Cost classification<select aria-label="Cost classification" value={type} onChange={e=>setType(e.target.value)}><option value="material">Material supply</option><option value="other">Subcontractor / other</option><option value="mixed">Mixed - split costs</option></select></label>
 {type!=='other'&&<label>Quoted material cost<input name="material" type="number" min="0" step=".01" required defaultValue={quote?.materialAmount||0}/></label>}
 {type!=='material'&&<label>Quoted other cost<input name="other" type="number" min="0" step=".01" required defaultValue={quote?.otherAmount||0}/></label>}
 <label>Material markup override %<input aria-label="Quote material markup override" name="markup" type="number" min="0" max="1000" step=".01" value={override} placeholder={'Estimate default: '+defaults(data).material+'%'} onChange={e=>setOverride(e.target.value)}/></label>
 <p className="dialog-note">Leave the override blank to use the estimate default. Only material markup is applied here. The fee is calculated separately at the end.</p>
 <div className="dialog-actions"><button className="primary">Save quote</button></div>
 </form>;
}
