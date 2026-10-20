import {useEffect,useId,useRef,useState} from 'react';

export function ScorecardDialog({open,title,onClose,busy=false,returnFocusRef,children}) {
  const ref=useRef(null),id=useId();const [notice,setNotice]=useState('');
  useEffect(()=>{const dialog=ref.current;if(open&&!dialog.open){setNotice('');dialog.showModal();}else if(!open&&dialog.open){dialog.close();returnFocusRef?.current?.focus();}},[open,returnFocusRef]);
  function close(){if(busy){setNotice('Wait for the current request to finish. If its result is uncertain, recover the saved review.');return;}setNotice('');onClose();}
  function keepFocus(e){
    if(e.key!=='Tab')return;
    const targets=[...ref.current.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
    if(!targets.length)return;e.preventDefault();
    const index=targets.indexOf(document.activeElement),step=e.shiftKey?-1:1;
    targets[(index+step+targets.length)%targets.length].focus();
  }
  return <dialog className="scorecard-dialog" ref={ref} aria-labelledby={id} onKeyDown={keepFocus} onCancel={e=>{e.preventDefault();close();}}>
    <header><h3 id={id}>{title}</h3><button autoFocus type="button" onClick={close}>Close {title}</button></header>
    {notice&&<p role="status">{notice}</p>}
    <div className="scorecard-dialog-body">{children}</div>
  </dialog>;
}
