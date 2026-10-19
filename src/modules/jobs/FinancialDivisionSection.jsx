import {useLayoutEffect,useRef} from 'react';

export function FinancialDivisionSection({expanded,children}){
  const section=useRef(null);
  useLayoutEffect(()=>{
    if(!expanded)return;
    const element=section.current,header=element.querySelector('.job-budget-division__header');
    const chrome=[...document.querySelectorAll('.ng-shell__header,.ng-environment-banner')];
    const measure=()=>{
      element.style.setProperty('--financial-sticky-top',`${chrome.reduce((sum,node)=>sum+node.getBoundingClientRect().height,0)}px`);
      element.style.setProperty('--financial-division-header-height',`${header?.getBoundingClientRect().height||0}px`);
    };
    measure();const observer=new ResizeObserver(measure);
    [header,...chrome].filter(Boolean).forEach(node=>observer.observe(node));
    return()=>observer.disconnect();
  },[expanded]);
  return <section ref={section} className={`job-budget-division${expanded?' job-budget-division--expanded':''}`}>{children}</section>;
}
