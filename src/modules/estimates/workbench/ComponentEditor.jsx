import React,{useState} from 'react';
import {componentGroups,ensureComponents,addComponentLine,addComponentGroup} from './componentStructure.mjs';
import {invalid,catalogueMissing} from './workspaceModel.mjs';
import {MaterialPicker} from './MaterialPicker.jsx';
import {catalogue} from './model.mjs';

function Numeric({label,value,onChange,disabled}){
 return <label>{label}<input inputMode="decimal" aria-invalid={invalid(value)} value={value??''} disabled={disabled} onChange={e=>onChange(e.target.value===''?null:e.target.value)}/></label>;
}
function Group({group,prefix,editable,onEdit,onCatalogue,canEditCatalog,focus}){
 const missing=!group.name?.trim()||!group.lines.length||group.lines.some(l=>!l.name?.trim()||['qty','price','hours'].some(k=>invalid(l[k])));
 const [open,setOpen]=useState(missing||focus);
 const change=(id,patch)=>onEdit(i=>Object.assign(i.lines.find(l=>l.id===id),patch));
 return <details className={'component-group '+(missing?'incomplete':'')} open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary><strong>{prefix}.{group.number} · {group.name||'Unnamed component'}</strong><span>{missing?'Missing information':group.lines.length+' material / labor rows'}</span></summary>
  <div className="component-body">
   <label>Component name<input disabled={!editable} value={group.name} onChange={e=>onEdit(i=>{ensureComponents(i);i.components.find(c=>c.id===group.id).name=e.target.value;})}/></label>
   {group.lines.map((line,index)=>{
    const labor=line.kind==='labor'||line.unit==='HR',material=catalogue.find(m=>m.id===line.catalogueId);
    const bad=!line.name?.trim()||['qty','price','hours'].some(k=>invalid(line[k]));
    return <section className={'component-resource '+(bad?'resource-missing':'')} key={line.id} data-line-id={line.id}>
     <div className="section-heading"><strong>{prefix}.{group.number}.{index+1} · {labor?'Labor':'Material + labor'}</strong><button type="button" disabled={!editable} onClick={()=>onEdit(i=>{i.lines=i.lines.filter(l=>l.id!==line.id);})}>Remove row</button></div>
     <div className="resource-fields">
      <div className="wide">{labor?<label>Labor description<input disabled={!editable} value={line.name} onChange={e=>change(line.id,{name:e.target.value})}/></label>:<MaterialPicker line={line} onType={name=>change(line.id,{name,catalogueId:'',priceOverride:true,laborOverride:true})} onSelect={m=>change(line.id,{catalogueId:m.id,name:m.name,unit:m.unit,price:m.price,hours:m.hours,priceOverride:false,laborOverride:false})}/>}</div>
      <Numeric label="Quantity" value={line.qty} disabled={!editable} onChange={qty=>change(line.id,{qty})}/>
      <label>Unit<input disabled={!editable||labor} value={line.unit} onChange={e=>change(line.id,{unit:e.target.value,catalogueId:''})}/></label>
      <Numeric label="Unit cost" value={line.price} disabled={!editable||labor} onChange={price=>change(line.id,{price,priceOverride:true})}/>
      <Numeric label="Labor hours per unit" value={line.hours} disabled={!editable} onChange={hours=>change(line.id,{hours,laborOverride:true})}/>
      <label>Stage<input disabled={!editable} value={line.stage||''} onChange={e=>change(line.id,{stage:e.target.value})}/></label>
      <label className="check"><input type="checkbox" disabled={!editable} checked={!!line.fixed} onChange={e=>change(line.id,{fixed:e.target.checked})}/>Fixed total quantity</label>
      <label className="wide">Resource notes<input disabled={!editable} value={line.notes||''} onChange={e=>change(line.id,{notes:e.target.value})}/></label>
     </div>
     {!labor&&canEditCatalog&&onCatalogue&&<button type="button" disabled={!editable||!line.name?.trim()} onClick={()=>onCatalogue(line,material)}>{material?'Review catalogue details':'Add to catalogue'}</button>}
     {material&&catalogueMissing(material).length>0&&<p className="missing-warning">Catalogue needs information: {catalogueMissing(material).join(', ')}</p>}
    </section>;
   })}
   <p className="muted">Enter 0 when no material cost or labor is needed. A blank is incomplete. Catalogue selections copy values; later catalogue edits do not change this estimate.</p>
   <div className="actions"><button type="button" disabled={!editable} onClick={()=>onEdit(i=>addComponentLine(i,group.id))}>Add material</button><button type="button" disabled={!editable} onClick={()=>onEdit(i=>addComponentLine(i,group.id,null,true))}>Add labor</button><button type="button" disabled={!editable} onClick={()=>onEdit(i=>{ensureComponents(i);i.components=i.components.filter(c=>c.id!==group.id);i.lines=i.lines.filter(l=>l.componentId!==group.id);})}>Remove component</button></div>
  </div>
 </details>;
}
export default function ComponentEditor({item,prefix,editable,onEdit,onCatalogue,canEditCatalog,focusLine}){
 const [focus,setFocus]=useState(focusLine||null);
 return <><h3>Components</h3><p className="muted">Entry → Work item → Component → Material / labor rows</p>{componentGroups(item).map(group=><Group key={group.id} group={group} prefix={prefix} editable={editable} onEdit={onEdit} onCatalogue={onCatalogue} canEditCatalog={canEditCatalog} focus={group.id===focus}/>)}<button type="button" disabled={!editable} onClick={()=>{const id=crypto.randomUUID();setFocus(id);onEdit(i=>{ensureComponents(i);i.components.push({id,name:'New component'});});}}>Add component</button></>;
}
