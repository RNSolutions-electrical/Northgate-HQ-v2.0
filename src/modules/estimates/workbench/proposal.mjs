/** Client-facing fields only. Internal notes, component costs and vendors are deliberately excluded. */
export function suggestedScope(document){
 return (document.entries||[]).filter(e=>(e.items||[]).length).map(e=>[
  [...new Set([e.section,e.location,e.name].filter(Boolean))].join(' — '),
  ...e.items.map(i=>`- ${i.quoteId ? e.name : i.name}${!i.quoteId&&i.qty!=null?` (${i.qty} ${Number(i.qty)===1?'unit':'units'})`:''}`),
 ].join('\n')).join('\n\n');
}
export function proposalFields(document){
 return {contact:'',siteAddress:document.job?.address||'',introduction:'',scope:suggestedScope(document),inclusions:'',exclusions:'',schedule:'',terms:document.proposalTerms||'',...document.proposal};
}
/** Resolve job defaults only for editable drafts; an intentional blank is preserved. */
export function proposalWithJob(document,job){
 if(document.approvedAt||!job?.address||Object.hasOwn(document.proposal||{},'siteAddress'))return document;
 return {...document,proposal:{...proposalFields(document),siteAddress:job.address}};
}
