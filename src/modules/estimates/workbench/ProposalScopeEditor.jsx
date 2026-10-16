import React,{useState} from 'react';
import {proposalLines,proposalScopeItems} from './proposal.mjs';

export default function ProposalScopeEditor({data,fields,onChange}){
 const [selected,setSelected]=useState([]),[text,setText]=useState('');
 const lines=proposalLines(data),groups=fields.scopeGroups||[];
 const grouped=new Set(groups.flatMap(group=>group.lineKeys||[]));
 const available=lines.filter(line=>!grouped.has(line.key));
 return <div className="wide proposal-scope-editor">
  <label>Scope presentation<select value={fields.scopeMode} onChange={e=>onChange({...fields,scopeMode:e.target.value})}><option value="letter">Written scope</option><option value="grouped">Numbered work items / groups</option></select></label>
  {fields.scopeMode==='grouped'?<>
   <p>Select work items and write a concise scope item. Select all remaining items for a whole-scope group. Included work descriptions stay visible beneath each group so safety/code work cannot disappear. Unassigned work items are included individually. Calculations are unchanged.</p>
   {groups.map((group,index)=><section className="proposal-scope-group" key={index}>
    <label>Scope item {index+1}<textarea value={group.text} onChange={e=>onChange({...fields,scopeGroups:groups.map((g,i)=>i===index?{...g,text:e.target.value}:g)})}/></label>
    <small>Source work items: {lines.filter(line=>(group.lineKeys||[]).includes(line.key)).map(line=>line.reference).join(', ')||'No matching work items — group will be omitted'}</small>
    <button type="button" onClick={()=>onChange({...fields,scopeGroups:groups.filter((_,i)=>i!==index)})}>Ungroup item {index+1}</button>
   </section>)}
   <button type="button" onClick={()=>setSelected(available.map(line=>line.key))}>Select all remaining work items</button>
   <div className="proposal-source-lines">{available.map(line=><label key={line.key}><input type="checkbox" checked={selected.includes(line.key)} onChange={e=>setSelected(current=>e.target.checked?[...current,line.key]:current.filter(key=>key!==line.key))}/><span>{line.reference} — {line.text}</span></label>)}</div>
   <label>New grouped scope item<textarea aria-label="New grouped scope item" value={text} onChange={e=>setText(e.target.value)}/></label>
   <button type="button" disabled={!text.trim()||!selected.some(key=>available.some(line=>line.key===key))} onClick={()=>{onChange({...fields,scopeGroups:[...groups,{text:text.trim(),lineKeys:selected.filter(key=>available.some(line=>line.key===key))}]});setSelected([]);setText('');}}>Group selected work items</button>
   <p className="muted">{proposalScopeItems(data).length} numbered scope items. Review Included, Exclusions and Terms below before exporting.</p>
  </>:<label>Customer-facing scope<textarea aria-label="Customer-facing scope" rows={10} value={fields.scope} onChange={e=>onChange({...fields,scope:e.target.value})}/></label>}
  <label>Customer pricing<select aria-label="Customer pricing" value={fields.showLinePrices?'lines':'total'} onChange={e=>onChange({...fields,showLinePrices:e.target.value==='lines'})} disabled={fields.scopeMode!=='grouped'}><option value="total">Total only</option><option value="lines">Scope item prices and total</option></select></label>
  <p className="muted">Scope item prices are selling prices before tax and card fee. Internal costs and markup are never shown.</p>
 </div>;
}
