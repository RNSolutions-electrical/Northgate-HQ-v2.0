export const LEGACY_LIBRARY_RATE=75;
export function rateNumber(value,{optional=false}={}){
 if(value==null||value===''){if(optional)return null;throw new Error('Enter a labor rate.');}
 if(!/^([0-9]+([.][0-9]*)?|[.][0-9]+)$/.test(String(value)))throw new Error('Labor rate must be a finite nonnegative number.');
 const number=Number(value);if(!Number.isFinite(number)||number>1000000000)throw new Error('Labor rate is outside the supported range.');
 return number;
}
export function normalizeLaborRates(document){
 const next=structuredClone(document);
 if(next.laborRateVersion!==1){next.laborRateVersion=1;next.estimateLaborRateOverride=rateNumber(next.rate??LEGACY_LIBRARY_RATE);next.libraryDefaultRateSnapshot=LEGACY_LIBRARY_RATE;}
 return next;
}
export function newLaborRates(document,settings){
 return {...document,laborRateVersion:1,estimateLaborRateOverride:null,libraryDefaultRateSnapshot:rateNumber(settings.default_rate),rate:rateNumber(settings.default_rate)};
}
export function effectiveLaborRate(item,document,{library=false}={}){
 if(library)return item.libraryLaborRateOverride!=null?{rate:rateNumber(item.libraryLaborRateOverride),source:'Library assembly override',override:true}:{rate:rateNumber(document.libraryDefaultRateCurrent??document.libraryDefaultRateSnapshot??LEGACY_LIBRARY_RATE),source:'Assembly Library default',override:false};
 if(item.laborRateOverride!=null)return {rate:rateNumber(item.laborRateOverride),source:'Work item override',override:true};
 const estimate=document.laborRateVersion===1?document.estimateLaborRateOverride:document.rate;
 if(estimate!=null)return {rate:rateNumber(estimate),source:'Estimate override',override:true};
 if(item.libraryLaborRateSnapshot!=null)return {rate:rateNumber(item.libraryLaborRateSnapshot),source:'Library assembly override snapshot',override:true};
 return {rate:rateNumber(document.libraryDefaultRateSnapshot??document.rate??LEGACY_LIBRARY_RATE),source:'Assembly Library default snapshot',override:false};
}
export function inheritAssemblyRate(copy,assembly){
 return {...copy,sourceAssemblyId:assembly.libraryId||assembly.id,libraryLaborRateSnapshot:assembly.libraryLaborRateOverride==null?null:rateNumber(assembly.libraryLaborRateOverride),laborRateOverride:null};
}
export function setEstimateRate(document,value){
 const next=normalizeLaborRates(document);next.estimateLaborRateOverride=rateNumber(value,{optional:true});
 next.rate=next.estimateLaborRateOverride??next.libraryDefaultRateSnapshot;return next;
}
export function refreshLaborRates(document,library,settings){
 if(document.approvedAt)throw new Error('Approved estimates cannot refresh labor rates. Create an editable revision.');
 const next=normalizeLaborRates(document);next.libraryDefaultRateSnapshot=rateNumber(settings.default_rate);next.libraryDefaultRateCurrent=next.libraryDefaultRateSnapshot;next.library=structuredClone(library);
 next.rate=next.estimateLaborRateOverride??next.libraryDefaultRateSnapshot;
 for(const entry of next.entries)for(const item of entry.items){
  if(!item.sourceAssemblyId)continue;
  const assembly=library.find(a=>(a.libraryId||a.id)===item.sourceAssemblyId);
  if(!assembly)continue; // Removed/inaccessible sources retain their last snapshot.
  item.libraryLaborRateSnapshot=assembly.libraryLaborRateOverride==null?null:rateNumber(assembly.libraryLaborRateOverride);
 }
 return next;
}
export function validateLaborRates(document){
 rateNumber(document.rate);if(document.laborRateVersion!==1)return;
 rateNumber(document.libraryDefaultRateSnapshot);rateNumber(document.estimateLaborRateOverride,{optional:true});
 for(const e of document.entries)for(const i of e.items){rateNumber(i.laborRateOverride,{optional:true});rateNumber(i.libraryLaborRateSnapshot,{optional:true});}
}
