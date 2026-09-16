import React,{useEffect,useRef} from 'react';
export default function BulkCheckbox({label,rows,checked,disabled,onChange}){
 const input=useRef(),count=rows.filter(checked).length;
 useEffect(()=>{input.current.indeterminate=count>0&&count<rows.length;},[count,rows.length]);
 return <label className="inline-check"><input ref={input} type="checkbox" aria-label={label} checked={rows.length>0&&count===rows.length} disabled={disabled||!rows.length} onChange={e=>onChange(e.target.checked)}/>{label}</label>;
}
