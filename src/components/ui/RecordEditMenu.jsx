import {ChevronDown} from 'lucide-react';
import {useEffect,useId,useRef,useState} from 'react';

// Callers own authorization and navigation/draft guards. New edit destinations
// are data entries rather than another branch of menu keyboard behavior.
export function RecordEditMenu({options,disabled=false,triggerRef:providedRef,menuLabel='Record edit options'}) {
  const [open,setOpen]=useState(false),root=useRef(null),ownRef=useRef(null),initialIndex=useRef(0);
  const triggerRef=providedRef||ownRef,id=useId();
  const items=()=>[...(root.current?.querySelectorAll('[role="menuitem"]:not(:disabled)')||[])];
  function dismiss(restore=false){setOpen(false);if(restore)triggerRef.current?.focus();}
  function show(last=false){initialIndex.current=last?-1:0;setOpen(true);}
  useEffect(()=>{if(open){const nodes=items();nodes.at(initialIndex.current)?.focus();}},[open]);
  useEffect(()=>{
    if(!open)return;
    const outside=event=>{if(!root.current?.contains(event.target))setOpen(false);};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  if(!options.length)return null;
  function menuKey(event){
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss(true);return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();const nodes=items(),index=nodes.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?nodes.length-1:(index+(event.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length;
    nodes[next]?.focus();
  }
  return <div className="record-edit-menu" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <button ref={triggerRef} type="button" className="secondary-button" aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined}
      disabled={disabled} onClick={()=>open?dismiss():show()} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();show(event.key==='ArrowUp');}else if(event.key==='Escape')dismiss(true);}}>
      Edit <ChevronDown aria-hidden="true"/>
    </button>
    {open?<div id={id} className="record-edit-menu__items" role="menu" aria-label={menuLabel} onKeyDown={menuKey}>
      {options.map(option=><button key={option.key} type="button" role="menuitem" tabIndex={-1} disabled={option.disabled}
        onClick={()=>{dismiss(true);option.onSelect();}}>{option.label}</button>)}
    </div>:null}
  </div>;
}
