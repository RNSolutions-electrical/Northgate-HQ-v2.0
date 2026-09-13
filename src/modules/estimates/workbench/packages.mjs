import {id,clone} from './model.mjs';

function writable(data){if(data.approvedAt)throw new Error('This estimate is approved. Awards and pricing are locked.');}
function syncEntry(data,pkg){
 let entry=data.entries.find(e=>e.packageId===pkg.id);
 if(!entry){entry={id:id(),number:Math.max(0,...data.entries.map(e=>e.number))+1,packageId:pkg.id,location:'Project-wide',drawing:'',items:[]};data.entries.push(entry);}
 entry.name=pkg.name;entry.section=pkg.section;entry.status=pkg.awardedQuoteId?'Complete':'Not started';
 const quote=data.quotes.find(q=>q.id===pkg.awardedQuoteId&&q.packageId===pkg.id);
 entry.items=quote?[{id:entry.items[0]?.id||id(),number:1,quoteId:quote.id,name:quote.vendor+' / '+quote.name,kind:'Awarded quote',qty:1,status:'Complete',materialMarkupOverride:quote.materialMarkupOverride??null,lines:[],notes:''}]:[];
}
export function normalizePackages(input){
 const data=clone(input);data.quotes??=[];data.packages??=[];
 for(const q of data.quotes){
  if(q.packageId)continue;
  const old=data.entries.flatMap(e=>e.items).find(i=>i.quoteId===q.id);
  const parent=data.entries.find(e=>e.items.some(i=>i.quoteId===q.id));
  const pkg={id:id(),name:q.name||'Vendor package',section:parent?.section||'Vendor quotes',awardedQuoteId:old?q.id:null};
  q.packageId=pkg.id;if(old)q.materialMarkupOverride=old.materialMarkupOverride??null;
  data.packages.push(pkg);
  for(const e of data.entries)e.items=e.items.filter(i=>i.quoteId!==q.id);
 }
 for(const p of data.packages)syncEntry(data,p);
 return data;
}
export function savePackage(data,fields){
 writable(data);
 const pkg={id:fields.id||id(),name:fields.name.trim(),section:fields.section,awardedQuoteId:null};
 if(!pkg.name)throw new Error('Package name is required.');
 const existing=data.packages.find(p=>p.id===pkg.id);
 if(existing){existing.name=pkg.name;existing.section=pkg.section;syncEntry(data,existing);}
 else{data.packages.push(pkg);syncEntry(data,pkg);}
 return data;
}
export function saveQuote(data,quote){
 writable(data);
 const pkg=data.packages.find(p=>p.id===quote.packageId);
 if(!pkg)throw new Error('Select a package.');
 const existing=data.quotes.find(q=>q.id===quote.id);
 if(existing&&existing.packageId!==quote.packageId)throw new Error('Quotes cannot move between packages.');
 if(!quote.vendor?.trim())throw new Error('Vendor is required.');
 if([quote.materialAmount,quote.otherAmount].some(n=>!Number.isFinite(n)||n<0))throw new Error('Enter valid quote costs.');
 if(existing)Object.assign(existing,quote);else data.quotes.push(quote);
 syncEntry(data,pkg);return data;
}
export function awardQuote(data,packageId,quoteId){
 writable(data);const pkg=data.packages.find(p=>p.id===packageId);
 if(!pkg)throw new Error('Package not found.');
 if(quoteId&&!data.quotes.some(q=>q.id===quoteId&&q.packageId===packageId))throw new Error('Quote does not belong to this package.');
 pkg.awardedQuoteId=quoteId||null;syncEntry(data,pkg);return data;
}
export function approveEstimate(data){
 writable(data);
 data.approvedAt=new Date().toISOString();return data;
}
