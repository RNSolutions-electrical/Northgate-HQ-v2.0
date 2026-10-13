import React,{createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Calculator as CalculatorIcon} from 'lucide-react';
import {addHistory,clampPosition,evaluateExpression,MAX_EXPRESSION,readSession,storageKey} from './calculatorModel.mjs';
import './calculator.css';
const CalculatorContext=createContext(null);
const sessionStorageSafe=()=>{try{return window.sessionStorage;}catch{return null;}};

// Modal surfaces in same-origin module frames take precedence over this parent-shell utility.
function useModalBoundary(){
 const [blocked,setBlocked]=useState(false);
 useEffect(()=>{
  let observers=[];
  const check=()=>{let active=false;for(const root of roots())for(const element of root.querySelectorAll('dialog[open],[aria-modal="true"]'))if(!element.closest('[data-calculator-panel]')&&element.getClientRects().length)active=true;setBlocked(active);};
  const roots=()=>{const documents=[document];for(const frame of document.querySelectorAll('iframe'))try{if(frame.getClientRects().length&&frame.contentDocument)documents.push(frame.contentDocument);}catch{}return documents;};
  const connect=()=>{observers.forEach(observer=>observer.disconnect());observers=roots().map(root=>{const observer=new MutationObserver(check);observer.observe(root.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['open','aria-modal','hidden','style','class']});return observer;});check();};
  const parentObserver=new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&(node.tagName==='IFRAME'||node.querySelector?.('iframe')))))connect();});
  parentObserver.observe(document.documentElement,{subtree:true,childList:true});document.addEventListener('load',connect,true);connect();
  return()=>{parentObserver.disconnect();observers.forEach(observer=>observer.disconnect());document.removeEventListener('load',connect,true);};
 },[]);
 return blocked;
}
export function CalculatorLauncher({mobile=false,onOpen}){
 const context=useContext(CalculatorContext);if(!context)return null;
 return <button type="button" className={mobile?'calculator-mobile-launcher top-nav__item':'ng-shell__rail-link calculator-launcher'} aria-haspopup="dialog" aria-expanded={context.open&&!context.minimized&&!context.blocked} disabled={context.blocked} onClick={()=>{context.launch();onOpen?.();}}><CalculatorIcon aria-hidden="true"/><span>Calculator</span></button>;
}
export function CalculatorProvider({userId,environment,children}){
 // A changed identity mounts a fresh session synchronously, before any values can be shown.
 return userId?<CalculatorSession key={storageKey(environment,userId)} userId={userId} environment={environment}>{children}</CalculatorSession>:children;
}
function CalculatorSession({userId,environment,children}){
 const key=storageKey(environment,userId),[session,setSession]=useState(()=>readSession(sessionStorageSafe(),key));
 const [error,setError]=useState(''),[copyStatus,setCopyStatus]=useState('');
 const panel=useRef(null),expressionInput=useRef(null),launcher=useRef(null),drag=useRef(null),alive=useRef(true),positionRef=useRef(session.position);
 positionRef.current=session.position;
 const blocked=useModalBoundary();
 const evaluated=useMemo(()=>{try{return {result:evaluateExpression(session.expression),error:''};}catch(error){return {result:null,error:error.message};}},[session.expression]);
 const patch=values=>setSession(current=>({...current,...values}));
 useEffect(()=>{try{sessionStorageSafe()?.setItem(key,JSON.stringify(session));}catch{}},[key,session]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;try{sessionStorageSafe()?.removeItem(key);}catch{}};},[key]);
 const fit=(position=positionRef.current)=>{if(!panel.current)return;const rect=panel.current.getBoundingClientRect();const next=clampPosition(position||{x:window.innerWidth-rect.width-24,y:120},rect.width,rect.height,window.innerWidth,window.innerHeight);setSession(current=>current.position?.x===next.x&&current.position?.y===next.y?current:{...current,position:next});};
 useEffect(()=>{if(session.open&&!session.minimized&&!blocked)fit();},[session.open,session.minimized,blocked]);
 useEffect(()=>{if(session.open&&!session.minimized&&!blocked)expressionInput.current?.focus();},[session.open,session.minimized]);
 useEffect(()=>{const resize=()=>fit();window.addEventListener('resize',resize);const observer=panel.current?new ResizeObserver(()=>fit()):null;observer?.observe(panel.current);return()=>{window.removeEventListener('resize',resize);observer?.disconnect();};},[session.open,session.minimized,blocked,session.historyOpen]);
 const launch=()=>{launcher.current=document.activeElement;patch({open:true,minimized:false});};
 const dismiss=minimized=>{patch(minimized?{minimized:true}:{open:false,minimized:false});if(panel.current?.contains(document.activeElement)){const target=launcher.current?.isConnected&&launcher.current.getClientRects().length?launcher.current:[...document.querySelectorAll('.calculator-launcher,.calculator-mobile-launcher,.ng-shell__menu-button')].find(element=>element.getClientRects().length);target?.focus();}};
 const change=expression=>{if(expression.length>MAX_EXPRESSION){setError('Use an expression of 256 characters or fewer.');return;}patch({expression});setError('');setCopyStatus('');};
 const insert=value=>{const input=expressionInput.current,start=input?.selectionStart??session.expression.length,end=input?.selectionEnd??start;change(session.expression.slice(0,start)+value+session.expression.slice(end));requestAnimationFrame(()=>{input?.focus();input?.setSelectionRange(start+value.length,start+value.length);});};
 const backspace=()=>{const input=expressionInput.current,start=input?.selectionStart??session.expression.length,end=input?.selectionEnd??start,from=start===end?Math.max(0,start-1):start;change(session.expression.slice(0,from)+session.expression.slice(end));requestAnimationFrame(()=>{input?.focus();input?.setSelectionRange(from,from);});};
 const calculate=()=>{if(!evaluated.result){setError(evaluated.error);return;}setSession(current=>({...current,history:addHistory(current.history,current.expression,evaluated.result)}));setError('');};
 const copy=async value=>{try{await navigator.clipboard.writeText(value);if(alive.current)setCopyStatus('Copied.');}catch{if(alive.current)setCopyStatus('Copy unavailable. Select the displayed text to copy.');}};
 const move=(dx,dy)=>fit({x:(session.position?.x||12)+dx,y:(session.position?.y||120)+dy});
 const startDrag=event=>{if(event.target.closest('button')||event.button!==0||window.innerWidth<900)return;drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,position:session.position||{x:12,y:120}};event.currentTarget.setPointerCapture(event.pointerId);};
 const onDrag=event=>{if(!drag.current)return;fit({x:drag.current.position.x+event.clientX-drag.current.x,y:drag.current.position.y+event.clientY-drag.current.y});};
 const endDrag=()=>{drag.current=null;};
 const ui=session.open&&!blocked?session.minimized?<button className="calculator-minimized" type="button" onClick={launch}><CalculatorIcon aria-hidden="true"/> Calculator</button>:<section ref={panel} data-calculator-panel className="calculator-panel" role="dialog" aria-modal="false" aria-labelledby="calculator-title" style={window.innerWidth>=900&&session.position?{left:session.position.x,top:session.position.y}:undefined} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();event.preventDefault();dismiss(true);}else if(event.key==='Enter'&&event.target===expressionInput.current){event.stopPropagation();event.preventDefault();calculate();}}}>
  <header className="calculator-header" onPointerDown={startDrag} onPointerMove={onDrag} onPointerUp={endDrag} onLostPointerCapture={endDrag}><h2 id="calculator-title">Calculator</h2><button type="button" aria-label="Minimize calculator" onClick={()=>dismiss(true)}>−</button><button type="button" aria-label="Close calculator" onClick={()=>dismiss(false)}>×</button></header>
  <div className="calculator-body">
   <label>Expression<input ref={expressionInput} value={session.expression} maxLength={MAX_EXPRESSION} autoComplete="off" spellCheck={false} onChange={event=>change(event.target.value)} placeholder="200 + 20%"/></label>
   <label>Result<input readOnly value={evaluated.result?.value||''} aria-label="Calculator result"/></label>
   {evaluated.result?.percentage&&<div className="calculator-percentage" aria-label="Percentage amount"><span>Percentage amount</span><strong>{evaluated.result.percentage.percent}% of {evaluated.result.percentage.base} = {evaluated.result.percentage.amount}</strong><button type="button" aria-label="Copy percentage amount" onClick={()=>copy(evaluated.result.percentage.amount)}>Copy amount</button></div>}
   <div className="calculator-keypad">{['(',')','%','÷','7','8','9','×','4','5','6','−','1','2','3','+','0','.','⌫','='].map(value=><button type="button" key={value} aria-label={value==='⌫'?'Backspace':value==='='?'Calculate':value} onClick={()=>value==='='?calculate():value==='⌫'?backspace():insert(value)}>{value}</button>)}</div>
   <div className="calculator-actions"><button type="button" onClick={()=>change('')}>Clear</button><button type="button" disabled={!evaluated.result} onClick={()=>copy(evaluated.result.value)}>Copy result</button><button type="button" aria-expanded={session.historyOpen} onClick={()=>patch({historyOpen:!session.historyOpen})}>History ({session.history.length})</button></div>
   {error&&<p className="calculator-error" role="alert">{error}</p>}{copyStatus&&<p role="status">{copyStatus}</p>}
   {session.historyOpen&&<section className="calculator-history" aria-label="Calculator history"><button type="button" disabled={!session.history.length} onClick={()=>patch({history:[]})}>Clear history</button>{session.history.map((row,index)=><div key={index}><button type="button" aria-label={`Use ${row.expression}`} onClick={()=>change(row.expression)}>{row.expression} = {row.value}</button><button type="button" aria-label={`Copy ${row.expression}`} onClick={()=>copy(`${row.expression} = ${row.value}${row.percentage?'\n'+row.percentage.percent+'% of '+row.percentage.base+' = '+row.percentage.amount:''}`)}>Copy</button></div>)}</section>}
   <details className="calculator-position"><summary>Position / help</summary><div><button type="button" aria-label="Move calculator left" onClick={()=>move(-24,0)}>←</button><button type="button" aria-label="Move calculator up" onClick={()=>move(0,-24)}>↑</button><button type="button" aria-label="Move calculator down" onClick={()=>move(0,24)}>↓</button><button type="button" aria-label="Move calculator right" onClick={()=>move(24,0)}>→</button><button type="button" onClick={()=>fit({x:window.innerWidth-334,y:120})}>Reset position</button></div><p>200 + 20% = 240. For × / ÷, 20% means 0.2. Parentheses and normal operator order apply. Enter records history; Escape minimizes. Display and copy round to 12 decimal places.</p></details>
  </div>
 </section>:null;
 return <CalculatorContext.Provider value={{launch,open:session.open,minimized:session.minimized,blocked}}>{children}{ui&&createPortal(ui,document.body)}</CalculatorContext.Provider>;
}
