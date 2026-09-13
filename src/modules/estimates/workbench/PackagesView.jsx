import React from 'react';
import {Plus,Check,RotateCcw,Pencil} from 'lucide-react';
import {money} from './model.mjs';
import {itemPricing} from './pricing.mjs';
export function PackagesView({data,onPackage,onQuote,onAward,onlyPackage}){
 const locked=!!data.approvedAt;
 return <>
 <div className="section-heading"><h2>{onlyPackage?'Vendor quotes':'Quotes & packages'}</h2>{!onlyPackage&&<button className="primary" disabled={locked} onClick={()=>onPackage()}><Plus size={16}/> Add package</button>}</div>
 {data.packages.filter(p=>!onlyPackage||p.id===onlyPackage).map(p=>{
  const entry=data.entries.find(e=>e.packageId===p.id);const quotes=data.quotes.filter(q=>q.packageId===p.id);
  return <section className="package-group" key={p.id}>
   <div className="section-heading"><div><h3>{p.name}</h3><small>Entry {String(entry.number).padStart(3,'0')} · {p.section} · {p.awardedQuoteId?(locked?'Award locked':'Awarded'):'Not awarded - excluded from price'}</small></div>
   <div className="actions"><button disabled={locked} aria-label={'Edit package '+p.name} onClick={()=>onPackage(p)}><Pencil size={16}/></button><button disabled={locked} onClick={()=>onQuote(null,p.id)}><Plus size={16}/> Add vendor quote</button></div></div>
   {quotes.map(q=>{const awarded=p.awardedQuoteId===q.id;const value=itemPricing({quoteId:q.id,qty:1,lines:[],materialMarkupOverride:q.materialMarkupOverride},data);return <div className={'quote-row '+(awarded?'awarded':'')} key={q.id}>
    <div><strong>{q.vendor}</strong><small>{q.name} · {q.reference}</small>{awarded&&<span className="badge complete">Awarded{locked?' / locked':''}</span>}</div>
    <div><strong>{money(value.cost)}</strong><small>Quoted cost</small></div><div><strong>{money(value.subtotal)}</strong><small>With material markup / before fee</small></div>
    <div className="actions"><button disabled={locked} aria-label={'Edit quote from '+q.vendor} onClick={()=>onQuote(q,p.id)}><Pencil size={16}/></button><button disabled={locked} onClick={()=>onAward(p.id,awarded?null:q.id)}>{awarded?<RotateCcw size={16}/>:<Check size={16}/>} {awarded?'Clear award':'Award quote'}</button></div>
   </div>;})}
   {!quotes.length&&<p className="muted">No vendor quotes yet.</p>}
  </section>;
 })}
 {!data.packages.length&&<div className="empty">No packages entered.</div>}
 </>;
}
