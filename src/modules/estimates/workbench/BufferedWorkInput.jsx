import React,{useEffect,useRef} from 'react';
// Native input owns keystrokes; the parent holds an action-safe pending draft.
export function BufferedWorkInput({value,onDraft,onCommit,multiline=false,...props}){
 const input=useRef(null),focused=useRef(false);
 useEffect(()=>{if(!focused.current&&input.current&&input.current.value!==String(value??''))input.current.value=value??'';},[value]);
 const Tag=multiline?'textarea':'input';
 return <Tag {...props} ref={input} defaultValue={value??''} onFocus={()=>{focused.current=true;}} onInput={event=>onDraft(event.currentTarget.value)} onBlur={()=>{focused.current=false;onCommit();}}/>;
}
