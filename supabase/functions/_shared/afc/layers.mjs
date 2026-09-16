import {calculate,descendants,cValue,feeder,transformer} from './engine.mjs';
export const engineVersion='northgate-afc/1.0.0';
export const present=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
const pos=v=>present(v)&&Number.isFinite(+v)&&+v>0;
const str=v=>typeof v==='string'&&v.trim().length>0;
export const optionalDefaults=()=>({generators:[],motors:[]});
// Supplemental layers remain separate from the utility radial calculation.
// Motor screening deliberately does not model attenuation or angle: a pool of
// running induction motor FLA × a reviewed multiplier, referred by voltage.
// This is a preliminary estimate, not a network solver or interrupting-duty study.
export function evaluate(study){
 const base=calculate(study),errors=[],notes=[],cases=[{id:'utility',name:'Utility',results:base,ids:new Set(study.nodes.map(n=>n.id))}],nodes=study.nodes;
 const root=nodes.find(n=>n.kind==='source');
 const addError=(where,msg)=>errors.push(`${where}: ${msg}`);
 for(const g of study.layers?.generators||[]){
  if(![g.known,g.kva,g.xd,g.lnCurrent,g.lnVoltage].some(present))continue;
  try{
   const bus=nodes.find(n=>n.id===g.bus),br=base[g.bus];
   if(!bus||!br||br.error)throw Error('Select a valid connection point.');
   if(!str(g.name)||!str(g.reference))throw Error('Enter generator name and manufacturer/data reference.');
   if(g.method==='known'){if(!pos(g.known))throw Error('Enter a positive terminal fault current.');}
   else if(br.phase!==3||!pos(g.kva)||!pos(g.xd))throw Error('Reactance method requires 3Ø and positive alternator-base kVA and X″d %.');
   let terminal=g.method==='known'?+g.known:transformer(+g.kva,br.v,3,+g.xd);
   if(!pos(terminal))throw Error('Generator current is outside the supported range.');
   let current=terminal;const s=g.feeder||{};
   if(!present(s.length)||!Number.isFinite(+s.length)||+s.length<0)throw Error('Enter the generator feeder length, including 0 for a terminal connection.');
   if(+s.length>0){if(!pos(s.c)||!Number.isInteger(+s.sets)||+s.sets<1)throw Error('Enter a valid feeder C value and parallel sets.');current=feeder(current,br.v,br.phase,+s.length,+s.c,+s.sets);}
   const ids=descendants(nodes,g.bus),sub=nodes.filter(n=>ids.has(n.id)).map(n=>n.id===g.bus?{...n,kind:'source',parent:null,method:'known',known:current,phase:br.phase,voltage:br.v}:n);
   const results=calculate({...study,nodes:sub});
   const cs={id:g.id,name:g.name,results,ids,generator:g,terminal};cases.push(cs);
   if(present(g.lnCurrent)){
    if(!pos(g.lnCurrent)||!pos(g.lnVoltage)||g.lnVoltage>=br.v)throw Error('Enter positive L–N current and a valid L–N voltage.');
    let ln=+g.lnCurrent;
    if(+s.length>0){if(!pos(s.neutralC)||!Number.isInteger(+s.neutralSets)||+s.neutralSets<1)throw Error('Generator L–N requires feeder neutral C and parallel neutral sets.');ln=loopCurrent(ln,+g.lnVoltage,+s.length,+s.c,+s.sets,+s.neutralC,+s.neutralSets);}
    results[g.bus].ln=ln;results[g.bus].lnVoltage=+g.lnVoltage;
   }
  }catch(e){addError(g.name||'Generator',e.message);}
 }
 const motors=[];
 for(const m of study.layers?.motors||[]){
  if(!present(m.fla))continue;
  const b=base[m.bus];
  if(!b||b.error||b.phase!==3||!pos(m.fla)||!pos(m.multiplier)||!str(m.name)||!str(m.reference)||!['both','utility','generator'].includes(m.operation)){addError(m.name||'Motor group','Use a valid 3Ø bus, positive running FLA/multiplier, operating case, name and reference.');continue;}
  motors.push(m);
 }
 if(motors.length)notes.push('Motor screening: pooled running induction-motor FLA × entered factor; voltage-referred at every energized location. Feeder/transformer attenuation, phase shifts, motor decay and network diversion are not modeled. Not a detailed motor fault study. L–N estimates remain source-only. Do not include VFD/inverter-fed motors in this pool.');
 for(const cs of cases){
  const cache=new Set();
  function lnAt(n){
   if(cache.has(n.id))return;cache.add(n.id);const r=cs.results[n.id];if(!r||r.error)return;
   if(cs.id==='utility'&&(n.kind==='source'||n.kind==='transformer')&&n.ln?.mode&&n.ln.mode!=='none'){
    const x=n.ln;
    if(x.mode==='center'&&n.kind==='source'&&n.phase===1&&n.method==='transformer'){
     r.ln=r.i*1.5;r.lnVoltage=r.v/2;r.lnBasis='Center-tap 1.5× source approximation';
    }else if(x.mode==='known'&&pos(x.current)&&pos(x.voltage)&&+x.voltage<r.v&&str(x.reference)){
     r.ln=+x.current;r.lnVoltage=+x.voltage;r.lnBasis='Entered secondary source L–N current';
    }else if(x.mode==='known'&&!present(x.current)&&!present(x.voltage)){return;}
    else addError(n.name,'Complete optional L–N source data; center-tap approximation is only for a 1Ø infinite-primary utility transformer.');
    return;
   }
   if(present(r.ln))return;
   if(n.kind==='source')return;
   const p=nodes.find(p=>p.id===n.parent);if(!p||!cs.results[p.id])return;lnAt(p);const u=cs.results[p.id];
   if(!present(u.ln))return;
   if(n.kind==='transformer'){notes.push(`${cs.name} / ${n.name}: L–N not propagated across transformer; secondary fault data required.`);return;}
   let i=u.ln;
   for(const s of n.segments){
    if(!s.neutral?.mode||s.neutral.mode==='none'){notes.push(`${cs.name} / ${n.name}: L–N omitted; neutral path not entered.`);return;}
    const nc=s.neutral.mode==='same'?cValue(s):+s.neutral.c,nn=s.neutral.mode==='same'?+s.sets:+s.neutral.sets;
    if(!pos(nc)||!Number.isInteger(nn)||nn<1){addError(n.name,'Complete the optional neutral C value and parallel sets.');return;}
    i=loopCurrent(i,u.lnVoltage,+s.length,cValue(s),+s.sets,nc,nn);
   }
   r.ln=i;r.lnVoltage=u.lnVoltage;r.lnBasis='Phase + neutral loop estimate';
  }
  for(const n of nodes)if(cs.ids.has(n.id))lnAt(n);
  const pool=motors.filter(m=>cs.ids.has(m.bus)&&(m.operation==='both'||m.operation===(cs.id==='utility'?'utility':'generator')));
  for(const n of nodes){const r=cs.results[n.id];if(!r||r.error)continue;r.sourceI=r.i;
   const contribution=pool.reduce((sum,m)=>sum+(+m.fla)*(+m.multiplier)*base[m.bus].v/r.v,0);
   if(contribution>0){r.motor=contribution;r.i+=contribution;}
  }
 }
 const byNode=Object.create(null);
 for(const n of nodes){
  const r=base[n.id];const rows=[];
  for(const cs of cases){const x=cs.results[n.id];if(!x||x.error)continue;rows.push({caseId:cs.id,caseName:cs.name,fault:x.phase===3?'3Ø':'L–L',amps:x.i,motor:x.motor,source:x.sourceI,basis:cs.generator?'Generator initial symmetrical estimate':'Utility point-to-point'});if(pos(x.ln))rows.push({caseId:cs.id,caseName:cs.name,fault:'L–N',amps:x.ln,basis:'Source-only loop estimate'});}
  for(const ext of n.external||[]){if(!present(ext.amps))continue;
   if(!pos(ext.amps)||!str(ext.reference)||!str(ext.caseName)||!['L–G','L–L','L–N','3Ø','Parallel sources','Inverter / UPS'].includes(ext.fault)){addError(n.name,'External result needs a positive RMS current, fault/case and study reference.');continue;}
   rows.push({caseId:'external',caseName:ext.caseName,fault:ext.fault,amps:+ext.amps,basis:'External study: '+ext.reference,external:true});
  }
  const maximum=rows.reduce((a,b)=>!a||b.amps>a.amps?b:a,null);
  byNode[n.id]={...r,i:r.error?undefined:maximum?.amps,rows,maximum,sourceI:r.sourceI};
 }
 return {base,cases,byNode,errors:[...new Set(errors)],notes:[...new Set(notes)],engineVersion};
}
export function loopCurrent(input,voltage,length,phaseC,phaseSets,neutralC,neutralSets){return voltage/(voltage/input+length/(phaseC*phaseSets)+length/(neutralC*neutralSets));}
