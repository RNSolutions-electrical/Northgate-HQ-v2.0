// Exact pure worksheet engine; kept in sync with worksheet-source by contract test.
export function calculate(d){
 const n=x=>Number(x)||0, sum=a=>a.reduce((s,x)=>s+x,0), raw=r=>n(r.qty)*n(r.va);
 const rows=d.rows||[], by=c=>rows.filter(r=>r.cat===c), total=c=>sum(by(c).map(raw));
 const errors=[];
 for(const key of ['area','voltage','service','small','laundry','cookingDemand','dryerDemand','largestMotor','hvacStandard','hvacOptional']){if(d[key]!==''&&(!Number.isFinite(Number(d[key]))||Number(d[key])<0))errors.push('Invalid nonnegative numeric input: '+key);}
 for(const key of ['small','laundry'])if(!Number.isInteger(Number(d[key])))errors.push('Circuit counts must be whole numbers.');
 if(!rows.length)errors.push('Enter and verify the equipment inventory.');
 for(const r of rows){if(!['fixed','cooking','dryer','motor','hvac','other'].includes(r.cat))errors.push('Unsupported equipment category.');if(!Number.isFinite(Number(r.va))||!Number.isFinite(Number(r.qty)))errors.push('Equipment values must be finite.');}

 if(!(n(d.area)>0))errors.push('Enter verified floor area.');
 if(n(d.small)<2)errors.push('At least two small-appliance circuits are required in this worksheet.');
 if(n(d.laundry)<1)errors.push('Confirm laundry provision; this worksheet requires at least one laundry circuit.');
 if(!d.basisConfirmed)errors.push('Confirm jurisdiction, occupancy and adopted code basis.');
 if(!d.inventoryConfirmed)errors.push('Verify the complete inventory and nameplate values.');
 if(n(d.voltage)!==240)errors.push('This worksheet supports only 120/240 V single-phase, three-wire dwellings.');
 for(const r of rows){if(!r.label.trim()||!(n(r.qty)>0)||!Number.isInteger(n(r.qty))||!(n(r.va)>0)) errors.push('Every equipment row needs a name, positive whole quantity and positive VA.');}
 const g=n(d.area)*3+(n(d.small)+n(d.laundry))*1500;
 const gd=Math.min(g,3000)+Math.min(Math.max(g-3000,0),117000)*.35+Math.max(g-120000,0)*.25;
 const fixed=total('fixed'), fixedCount=sum(by('fixed').map(r=>n(r.qty))), fd=fixed*(fixedCount>=4?.75:1);
 const dryers=by('dryer'), dryerCount=sum(dryers.map(r=>n(r.qty))), dryerBase=sum(dryers.map(r=>n(r.qty)*Math.max(5000,n(r.va))));
 if(!by('cooking').length&&d.cookingDemand!=='')errors.push('Cooking demand exists without cooking inventory rows. Add equipment or clear the unused demand.');
 if(!by('hvac').length&&(d.hvacStandard!==''||d.hvacOptional!==''))errors.push('HVAC demand exists without HVAC inventory rows. Add equipment or clear unused demands.');
 const standardErrors=[...errors], optionalErrors=[...errors];
 let dd=dryerBase;
 if(dryerCount<=4&&d.dryerDemand!=='')standardErrors.push('Manual dryer demand is only used for more than four dryers. Clear the unused override.');
 if(dryerCount>4){if(d.dryerDemand===''||!d.dryerNote.trim())standardErrors.push('More than four dryers: enter reviewed Table 220.54 demand and rationale.');else dd=n(d.dryerDemand);}
 let cooking=0;
 if(by('cooking').length){if(d.cookingDemand===''||!d.cookingNote.trim())standardErrors.push('Cooking: enter reviewed Table 220.55 demand and its notes/classification.');else cooking=n(d.cookingDemand);}
 const motors=total('motor'), maxMotor=Math.max(0,...by('motor').map(r=>n(r.va)));
 const extraMotor=n(d.largestMotor);
 if(d.largestMotor==='')standardErrors.push('Enter the verified largest-motor VA, including explicit 0 if none.');
 if(!d.motorConfirmed)standardErrors.push('Verify largest-motor contribution, including motors embedded in other equipment.');
 if(extraMotor<maxMotor)standardErrors.push('Largest motor cannot be smaller than an itemized standalone motor.');
 let hs=0,ho=0;
 if(by('hvac').length){if(d.hvacStandard===''||!d.hvacNote.trim())standardErrors.push('Enter reviewed standard HVAC contribution and simultaneous-operation rationale.');else hs=n(d.hvacStandard); if(d.hvacOptional===''||!d.hvacNote.trim())optionalErrors.push('Enter reviewed optional HVAC contribution under 220.82(C) and rationale.');else ho=n(d.hvacOptional);}
 if(!d.optionalEligible)optionalErrors.push('Confirm 220.82 eligibility: entire dwelling load, one 120/240 V three-wire service/feeder, ampacity at least 100 A.');
 if(!d.optionalReviewed)optionalErrors.push('Verify optional method appliance/HVAC treatment; no additional automatic largest-motor adder is used.');
 const other=total('other'), otherStandard=other; // other rows are already reviewed calculated VA, not unknown nameplates
 if(by('other').length&&!d.otherNote.trim()){standardErrors.push('Explain additional full-demand loads and applicability.');optionalErrors.push('Explain additional full-demand loads; these stay outside the optional general demand pool.');}
 const optionalBase=g+fixed+total('cooking')+total('dryer')+motors;
 const optionalGeneral=Math.min(optionalBase,10000)+Math.max(optionalBase-10000,0)*.4;
 const standard=gd+fd+dd+cooking+motors+.25*extraMotor+hs+otherStandard;
 const optional=optionalGeneral+ho+other;
 if(!Number.isFinite(standard)){standardErrors.push('Calculation exceeds numeric range. Check inputs.');}
 if(!Number.isFinite(optional)){optionalErrors.push('Calculation exceeds numeric range. Check inputs.');}
 return {generalConnected:g,generalDemand:gd,fixed,fixedCount,fixedDemand:fd,dryerBase,dryerDemand:dd,cooking,motors,motorAdder:.25*extraMotor,hvacStandard:hs,hvacOptional:ho,other,optionalBase,optionalGeneral,standard,optional,standardAmps:standard/n(d.voltage),optionalAmps:optional/n(d.voltage),standardErrors:[...new Set(standardErrors)],optionalErrors:[...new Set(optionalErrors)],connected: g+sum(rows.map(raw))};
}
