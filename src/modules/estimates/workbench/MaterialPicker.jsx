import React, {useDeferredValue, useEffect, useId, useRef, useState} from 'react';
import {catalogue, money, searchMaterials} from './model.mjs';
import {catalogueMissing} from './workspaceModel.mjs';
import {resolveMaterials} from '../../../lib/materialResolver.js';

export function MaterialPicker({line,onType,onDraft=()=>{},onSelect}) {
  const listId=useId();
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(-1);
  const [query,setQuery]=useState(line.name||'');
  const focused=useRef(false),deferredQuery=useDeferredValue(query);
  useEffect(()=>{if(!focused.current)setQuery(line.name||'');},[line.name]);
  const allMatches=searchMaterials(catalogue,deferredQuery);const matches=allMatches.slice(0,60);
  function select(material){setQuery(material.name);onSelect(material);setOpen(false);setActive(-1);}
  return <div className="material-picker" onBlur={event=>{
    if(!event.currentTarget.contains(event.relatedTarget)){focused.current=false;onType(query);setOpen(false);setActive(-1);}
  }}>
    <label htmlFor={`${listId}-input`}>Material / labor description</label>
    <input id={`${listId}-input`} required role="combobox" aria-autocomplete="list"
      aria-expanded={open} aria-controls={open?listId:undefined}
      aria-activedescendant={open&&matches[active]?`${listId}-${active}`:undefined}
      autoComplete="off" value={query}
      onFocus={()=>{focused.current=true;setOpen(true);setActive(-1);}}
      onChange={event=>{setQuery(event.target.value);onDraft(event.target.value);setOpen(true);setActive(-1);}}
      onKeyDown={event=>{
        if(event.key==='Escape'){event.preventDefault();setOpen(false);setActive(-1);}
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){
          event.preventDefault();setOpen(true);
          const next=event.key==='ArrowDown'?Math.min(active+1,matches.length-1):Math.max(active-1,0);
          setActive(next);
          const owner=event.currentTarget.ownerDocument;
          requestAnimationFrame(()=>owner.getElementById(`${listId}-${next}`)?.scrollIntoView({block:'nearest'}));
        }
        if(event.key==='Enter'&&open){event.preventDefault();if(matches[active])select(matches[active]);else setOpen(false);}
      }}/>
    {open&&<div className="material-suggestions">
      {resolveMaterials(catalogue,line.name).ambiguous&&<p>Multiple materials match. Verify the code, size, and description before selecting.</p>}
      <div role="listbox" id={listId} aria-label="Catalogue suggestions">
        {matches.map((material,index)=><button type="button" role="option" id={`${listId}-${index}`}
          className={catalogueMissing(material).length?'catalogue-incomplete':''} key={material.id} aria-selected={active===index} tabIndex={-1}
          onMouseDown={event=>event.preventDefault()} onClick={()=>select(material)}>
          <strong>{material.material_code?`${material.material_code} — `:''}{material.name}</strong><small>{material.price==null?'Not priced':money(material.price)} / {material.unit} · {material.hours==null?'Missing labor':material.hours+' labor h / '+material.unit}</small>{catalogueMissing(material).length>0&&<small>Needs information: {catalogueMissing(material).join(', ')}</small>}
        </button>)}
      </div>
      {allMatches.length>60&&<p>Keep typing to narrow {allMatches.length} matches.</p>}
      {!matches.length&&<p role="status">No catalogue matches</p>}
    </div>}
  </div>;
}
