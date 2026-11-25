import React,{useEffect,useId,useRef,useState} from 'react';

const options=[
 ['scope','Proposal scope'],
 ['pricing','Selling prices'],
 ['materials','Materials and quantities'],
 ['labor','Labor hours'],
 ['quotes','Quotes and allowances'],
 ['costs','Internal costs'],
 ['notes','Internal work and line notes'],
];

export default function EstimateExportDialog({entries=[],onExport,onClose}){
 const dialog=useRef(null),title=useId();
 const [kind,setKind]=useState('proposal'),[depth,setDepth]=useState('work');
 const [sections,setSections]=useState(['scope','pricing','materials','labor','quotes']);
 const [excluded,setExcluded]=useState([]),[rfqFormat,setRfqFormat]=useState('pdf');
 const available=entries.filter(entry=>entry.id&&entry.items?.length);
 const entryKeys=available.filter(entry=>!excluded.includes(entry.id)).map(entry=>entry.id);
 const subset=entryKeys.length!==available.length;
 const internal=kind==='internal',audit=kind==='audit',rfq=kind==='rfq';
 useEffect(()=>{
  const node=dialog.current,previous=node.ownerDocument.activeElement;
  node.showModal();
  return ()=>{if(node.open)node.close();previous?.focus();};
 },[]);
 function toggle(set,value){set(current=>current.includes(value)?current.filter(key=>key!==value):[...current,value]);}
 function submit(event){
  event.preventDefault();
  if(internal&&subset&&!entryKeys.length)return;
  onExport(rfq?{rfqFormat}:audit?{audit:true,costs:sections.includes('costs'),notes:sections.includes('notes')}:internal?{internal:true,depth,sections,...(subset?{entryKeys}:{})}:{});
 }
 return <dialog ref={dialog} className="blank-work-dialog editor estimate-export-dialog" aria-labelledby={title}
  onCancel={event=>{event.preventDefault();onClose();}}>
  <form onSubmit={submit}>
   <header className="estimate-popout-header"><h2 id={title}>Export Proposal</h2><div className="estimate-popout-actions"><button className="primary" type="submit" disabled={internal&&subset&&!entryKeys.length}>{rfq&&rfqFormat==='csv'?'Download CSV':'Preview PDF'}</button><button type="button" onClick={onClose}>Cancel</button></div></header>
   <fieldset><legend>Choose an export</legend>
    <label className="check"><input name={title+'-kind'} type="radio" checked={kind==='proposal'} onChange={()=>setKind('proposal')}/> Client proposal</label>
    <label className="check"><input name={title+'-kind'} type="radio" checked={internal} onChange={()=>setKind('internal')}/> Internal review breakdown</label>
    <label className="check"><input name={title+'-kind'} type="radio" checked={audit} onChange={()=>setKind('audit')}/> Full estimate audit</label>
    <label className="check"><input name={title+'-kind'} type="radio" checked={rfq} onChange={()=>setKind('rfq')}/> Supplier material pricing request</label>
   </fieldset>
   {rfq&&<><p>Includes only material descriptions, our internal catalog numbers (when available), quantities and units. Supplier pricing and availability fields start blank. Internal pricing, labor and notes are excluded.</p>
    <label>Supplier request format<select value={rfqFormat} onChange={event=>setRfqFormat(event.target.value)}>
     <option value="pdf">Fillable PDF</option><option value="csv">CSV spreadsheet</option>
    </select></label></>}
   {audit&&<>
    <p><strong>Internal only.</strong> Includes all work added to the estimate, with material quantities, labor units, and how the included labor hours add up. Unincluded work drafts are not exported.</p>
    <fieldset><legend>Optional details</legend>
     {options.filter(([key])=>key==='costs'||key==='notes').map(([key,label])=><label className="check" key={key}><input type="checkbox" checked={sections.includes(key)} onChange={()=>toggle(setSections,key)}/> {label}</label>)}
    </fieldset>
   </>}
   {internal&&<>
    <p><strong>Internal only.</strong> Uses the Northgate proposal letterhead. No estimate changes are saved, and unincluded work drafts are not exported.</p>
    <label>Detail level<select value={depth} onChange={event=>setDepth(event.target.value)}>
     <option value="summary">Estimate summary</option>
     <option value="work">Work-item breakdown</option>
     <option value="lines">Individual resource lines</option>
    </select></label>
    <fieldset><legend>Details to include</legend>
     {options.map(([key,label])=><label className="check" key={key}><input type="checkbox" checked={sections.includes(key)&&!(subset&&key==='scope')&&!(depth==='summary'&&key==='notes')} disabled={(subset&&key==='scope')||(depth==='summary'&&key==='notes')} onChange={()=>toggle(setSections,key)}/> {label}</label>)}
     {subset&&<small>Full proposal scope is omitted when only selected work is exported.</small>}
     {depth==='summary'&&<p><small>Work and line notes require a work-item or resource breakdown.</small></p>}
    </fieldset>
    {available.length>1&&<details>
     <summary>Choose included work ({entryKeys.length} of {available.length} selected)</summary>
     {available.map((entry,index)=><label className="check" key={entry.id}><input type="checkbox" checked={!excluded.includes(entry.id)}
      onChange={()=>toggle(setExcluded,entry.id)}/> {entry.items.map(item=>item.name||entry.name||'Work item '+(index+1)).join(' / ')}</label>)}
    </details>}
   </>}

  </form>
 </dialog>;
}
