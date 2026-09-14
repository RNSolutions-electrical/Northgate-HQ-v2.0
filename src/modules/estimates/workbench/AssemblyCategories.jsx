import React,{useState} from 'react';
import {Plus,Search} from 'lucide-react';
import {availableCategories,normalizeCategories} from './assemblyCategories.mjs';
export function AssemblyCategoryEditor({library,value=[],onChange}){
 const [adding,setAdding]=useState(false),[name,setName]=useState('');
 const choices=availableCategories(library,value);
 const add=()=>{
  const clean=name.trim();if(!clean)return;
  const canonical=choices.find(c=>c.toLowerCase()===clean.toLowerCase())||clean;
  onChange(normalizeCategories([...value,canonical]));setName('');setAdding(false);
 };
 return <fieldset className="assembly-categories"><legend>Categories</legend><p>Select all that apply</p>
  <div className="assembly-category-options">{choices.map(category=><label key={category}><input type="checkbox"
   checked={value.some(c=>c.toLowerCase()===category.toLowerCase())}
   onChange={e=>onChange(e.target.checked?normalizeCategories([...value,category]):value.filter(c=>c.toLowerCase()!==category.toLowerCase()))}/>{category}</label>)}</div>
  {adding?<div className="actions"><label>New category<input aria-label="New category" maxLength={80} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}/></label><button type="button" onClick={add} disabled={!name.trim()}>Add category</button><button type="button" onClick={()=>{setAdding(false);setName('');}}>Cancel</button></div>
   :<button type="button" onClick={()=>setAdding(true)}><Plus size={16}/> Add category</button>}
 </fieldset>;
}
export function AssemblyFilters({library,filters,onChange}){
 const set=(key,value)=>onChange({...filters,[key]:value});
 return <div className="assembly-filters">
  <label className="search"><Search size={17}/><input aria-label="Search assemblies" type="search" placeholder="Search assemblies..." value={filters.query} onChange={e=>set('query',e.target.value)}/></label>
  <label>Category<select aria-label="Filter assembly category" value={filters.category} onChange={e=>set('category',e.target.value)}><option value="">All categories</option>{availableCategories(library).map(c=><option key={c}>{c}</option>)}</select></label>
  <label>Sort<select aria-label="Sort assemblies" value={filters.sort} onChange={e=>set('sort',e.target.value)}><option value="name">Name A-Z</option><option value="reverse">Name Z-A</option><option value="updated">Recently updated</option></select></label>
 </div>;
}
