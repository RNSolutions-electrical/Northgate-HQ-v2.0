import React,{memo,useEffect,useRef,useState} from 'react';
import {componentGroups,ensureComponents,addComponentLine,addComponentGroup} from './componentStructure.mjs';
import {invalid,catalogueMissing} from './workspaceModel.mjs';
import {MaterialPicker} from './MaterialPicker.jsx';
import {catalogue} from './model.mjs';
import {cataloguePriceSnapshot} from './catalogueService.js';

const BufferedInput=memo(function BufferedInput({label,value,onDraft,onCommit,disabled,inputMode,className}){
 const input=useRef(null),focused=useRef(false);
 useEffect(()=>{const next=value??'';if(!focused.current&&input.current&&input.current.value!==String(next))input.current.value=next;},[value]);
 return <label className={className}>{label}<input ref={input} inputMode={inputMode} aria-invalid={inputMode==='decimal'?invalid(value):undefined} defaultValue={value??''} disabled={disabled} onFocus={()=>{focused.current=true;}} onInput={event=>onDraft(event.currentTarget.value)} onBlur={event=>{focused.current=false;onCommit(event.currentTarget.value);}}/></label>;
});
function Numeric({label,value,onChange,onDraft,disabled}){
 const normalize=value=>value===''?null:value;
 return <BufferedInput label={label} inputMode="decimal" value={value} disabled={disabled} onDraft={value=>onDraft(normalize(value))} onCommit={value=>onChange(normalize(value))}/>;
}
function priceSourceLabel(source){return ({inventory_explicit:'Inventory override',estimating_master:'Estimating master',estimate_override:'Estimate override',legacy_snapshot:'Legacy snapshot'})[source]||'Unverified price';}
function Group({group,prefix,editable,onEdit,onStage,onCatalogue,canEditCatalog,focus,onCopy}){
 const missing=!group.name?.trim()||!group.lines.length||group.lines.some(l=>!l.name?.trim()||['qty','price','hours'].some(k=>invalid(l[k])));
 const [open,setOpen]=useState(missing||focus);
 const change=(id,patch)=>onEdit(i=>Object.assign(i.lines.find(l=>l.id===id),patch));
 const stageLine=(id,field,value,extra={})=>onStage(`line:${id}:${field}`,i=>Object.assign(i.lines.find(l=>l.id===id),{[field]:value,...extra}));
 const stageComponentName=value=>onStage(`component:${group.id}:name`,i=>{ensureComponents(i);i.components.find(c=>c.id===group.id).name=value;});
 return <details className={'component-group '+(missing?'incomplete':'')} open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary><strong>{prefix}.{group.number} · {group.name||'Unnamed component'}</strong><span>{missing?'Missing information':group.lines.length+' material / labor rows'}</span></summary>
  <div className="component-body">
   <BufferedInput label="Component name" disabled={!editable} value={group.name} onDraft={stageComponentName} onCommit={value=>onEdit(i=>{ensureComponents(i);i.components.find(c=>c.id===group.id).name=value;})}/>
   {group.lines.map((line,index)=>{
    const labor=line.kind==='labor'||line.unit==='HR',material=catalogue.find(m=>m.id===line.catalogueId);
    const bad=!line.name?.trim()||['qty','price','hours'].some(k=>invalid(line[k]));
    return <section className={'component-resource '+(bad?'resource-missing':'')} key={line.id} data-line-id={line.id}>
     <div className="section-heading"><strong>{prefix}.{group.number}.{index+1} · {labor?'Labor':'Material + labor'}</strong><button type="button" disabled={!editable} onClick={()=>onEdit(i=>{i.lines=i.lines.filter(l=>l.id!==line.id);})}>Remove row</button></div>
     <div className="resource-fields">
      <div className="wide">{labor?<BufferedInput label="Labor description" disabled={!editable} value={line.name} onDraft={value=>stageLine(line.id,'name',value)} onCommit={value=>change(line.id,{name:value})}/>:<MaterialPicker line={line} onDraft={name=>stageLine(line.id,'name',name,{catalogueId:'',priceOverride:true,laborOverride:true,priceSource:'estimate_override',priceSourceUpdatedAt:null,priceSnapshotAt:new Date().toISOString()})} onType={name=>change(line.id,{name,catalogueId:'',priceOverride:true,laborOverride:true,priceSource:'estimate_override',priceSourceUpdatedAt:null,priceSnapshotAt:new Date().toISOString()})} onSelect={m=>change(line.id,{catalogueId:m.id,name:m.name,unit:m.unit,price:m.price,hours:m.hours,priceOverride:false,laborOverride:false,...cataloguePriceSnapshot(m)})}/>}</div>
      <Numeric label="Quantity" value={line.qty} disabled={!editable} onDraft={qty=>stageLine(line.id,'qty',qty)} onChange={qty=>change(line.id,{qty})}/>
      <BufferedInput label="Unit" disabled={!editable||labor} value={line.unit} onDraft={value=>stageLine(line.id,'unit',value,{catalogueId:''})} onCommit={value=>change(line.id,{unit:value,catalogueId:''})}/>
      <Numeric label="Unit cost" value={line.price} disabled={!editable||labor} onDraft={price=>stageLine(line.id,'price',price,{priceOverride:true,priceSource:'estimate_override',priceSourceUpdatedAt:null,priceSnapshotAt:new Date().toISOString()})} onChange={price=>change(line.id,{price,priceOverride:true,priceSource:'estimate_override',priceSourceUpdatedAt:null,priceSnapshotAt:new Date().toISOString()})}/>
      <Numeric label="Labor hours per unit" value={line.hours} disabled={!editable} onDraft={hours=>stageLine(line.id,'hours',hours,{laborOverride:true})} onChange={hours=>change(line.id,{hours,laborOverride:true})}/>
      <BufferedInput label="Stage" disabled={!editable} value={line.stage||''} onDraft={value=>stageLine(line.id,'stage',value)} onCommit={value=>change(line.id,{stage:value})}/>
      <label className="check"><input type="checkbox" disabled={!editable} checked={!!line.fixed} onChange={e=>change(line.id,{fixed:e.target.checked})}/>Fixed total quantity</label>
      <BufferedInput className="wide" label="Resource notes" disabled={!editable} value={line.notes||''} onDraft={value=>stageLine(line.id,'notes',value)} onCommit={value=>change(line.id,{notes:value})}/>
     </div>
     {!labor&&<p className="muted">Price source: {priceSourceLabel(line.priceSource)}{line.priceSnapshotAt?` · copied ${new Date(line.priceSnapshotAt).toLocaleString()}`:''}</p>}
     {!labor&&canEditCatalog&&onCatalogue&&<button type="button" disabled={!editable||!line.name?.trim()} onClick={()=>onCatalogue(line,material)}>{material?'Review catalogue details':'Add to catalogue'}</button>}
     {material&&catalogueMissing(material).length>0&&<p className="missing-warning">Catalogue needs information: {catalogueMissing(material).join(', ')}</p>}
    </section>;
   })}
   <p className="muted">Enter 0 when no material cost or labor is needed. A blank is incomplete. Catalogue selections copy values; later catalogue edits do not change this estimate.</p>
   <div className="actions"><button type="button" disabled={!onCopy} onClick={()=>onCopy?.(group)}>Copy component</button><button type="button" disabled={!editable} onClick={()=>onEdit(i=>addComponentLine(i,group.id))}>Add material</button><button type="button" disabled={!editable} onClick={()=>onEdit(i=>addComponentLine(i,group.id,null,true))}>Add labor</button><button type="button" disabled={!editable} onClick={()=>onEdit(i=>{ensureComponents(i);i.components=i.components.filter(c=>c.id!==group.id);i.lines=i.lines.filter(l=>l.componentId!==group.id);})}>Remove component</button></div>
  </div>
 </details>;
}
export default function ComponentEditor({item,prefix,editable,onEdit,onStage,onCatalogue,canEditCatalog,focusLine,onCopyComponent}){
 const [focus,setFocus]=useState(focusLine||null);
 return <><h3>Components</h3><p className="muted">Entry → Work item → Component → Material / labor rows</p>{componentGroups(item).map(group=><Group key={group.id} group={group} prefix={prefix} editable={editable} onEdit={onEdit} onStage={onStage} onCatalogue={onCatalogue} canEditCatalog={canEditCatalog} focus={group.id===focus} onCopy={onCopyComponent}/>)}<button type="button" disabled={!editable} onClick={()=>{const id=crypto.randomUUID();setFocus(id);onEdit(i=>{ensureComponents(i);i.components.push({id,name:'New component'});});}}>Add component</button></>;
}
