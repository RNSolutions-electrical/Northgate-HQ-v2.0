export const INSPECTION_SCHEMA = 1;
export const VISUAL_ITEMS = ['Broken, damaged, or melted insulation','Missing or damaged breakers','Missing connectors','Open knockouts','Corrosion on bus bars, terminals, or wire','Broken or cracked wire insulation'];
export const LABEL_ITEMS = ['Arc flash warning labels present','Panel designators visible','Accurate panel schedule present','Panel schedule legible','Circuit numbers identified','Wire identification markings'];
export const RESPONSE_STATES = {not_assessed:'Not assessed',acceptable:'Acceptable',attention:'Needs attention',not_applicable:'Not applicable',inaccessible:'Inaccessible'};
export const READING_STATES = {not_recorded:'Not recorded',measured:'Measured',not_measured:'Not measured',not_applicable:'Not applicable',inaccessible:'Inaccessible'};
export const FINDING_CATEGORIES = {code:'Code Violations',safety:'Safety Issues/Concerns',repair:'Recommended Repairs'};
export const PRIORITIES = ['Low','Medium','High'];
export const WORKFLOW_LABELS = {draft:'Draft',in_progress:'In progress',ready_for_review:'Ready for review',issued:'Issued'};
export const BASE_SCOPE = 'Visual inspection of safely accessible panels, subpanels and service equipment; thermal observations and logged temperatures; written safety/code summary and repair recommendations. Repair quotations are available on request.';
export const newId = () => crypto.randomUUID();
export const textValue = value => value === null || value === undefined ? '' : String(value);
export const hasValue = value => value !== null && value !== undefined && String(value).trim() !== '';
export function numericValue(value, label = 'Reading') {
  if (!hasValue(value)) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(value).trim()) || !Number.isFinite(Number(value))) throw new Error(`${label} must be a finite number or blank.`);
  return Number(value);
}
export function blankReading(kind='temperature',label='',conductor='',unit=kind==='temperature'?'F':kind==='voltage'?'V':'A') {
  return {id:newId(),kind,label,conductor,unit,value:'',state:'not_recorded',reason:''};
}
export function blankFeeder() {
  return {id:newId(),sets:'',size:'',material:'',insulation:'',readings:['A','B','C','N'].flatMap(conductor=>[
    blankReading('temperature','Termination',conductor),blankReading('current','Feeder current',conductor),blankReading('voltage','Voltage','')])};
}
export function blankCircuit(number) {
  return {id:newId(),number,breakerAmps:'',wireSize:'',poles:'',description:'',temperature:blankReading('temperature',`Circuit ${number}`)};
}
export function blankEquipment() {
  return {id:newId(),designator:'',equipmentType:'Panel',nominalVoltage:'',amperage:'',mainConfig:'',phaseConfig:'',phaseRotation:'',faultCurrent:'',faultCurrentDate:'',visitDate:'',visitTime:'',notes:'',thermalNotes:'',voltageNotes:'',unassessedReason:'',circuitCount:42,
    visual:VISUAL_ITEMS.map((label,index)=>({id:`visual-${index+1}`,label,state:'not_assessed',notes:''})),
    labeling:LABEL_ITEMS.map((label,index)=>({id:`label-${index+1}`,label,state:'not_assessed',notes:''})),
    feeders:[],readings:[],circuits:Array.from({length:42},(_,i)=>blankCircuit(i+1))};
}
export function blankInspection() {
  return {schemaVersion:INSPECTION_SCHEMA,client:{clientName:'',siteAddress:'',contactName:'',contactPhone:'',contactEmail:'',jobNumber:'',visitNotes:''},visitDate:'',visitTime:'',timeZone:'America/New_York',scope:BASE_SCOPE,optionalScope:'',limitations:'',conditions:'',technicianLegacy:'',equipment:[],findings:[],reviewSummary:'',assessment:'',importWarnings:[]};
}
export function blankFinding(equipmentId='') {return {id:newId(),equipmentId,checklistId:'',category:'',priority:'',legacySeverity:'',description:'',recommendation:'',codeReference:'',completed:false,correctionEvidence:''};}
export function resizeCircuits(equipment,count) {
  const next=Number(count);
  if (!Number.isInteger(next)||next<1||next>168) throw new Error('Choose between 1 and 168 circuits.');
  const removed=equipment.circuits.filter(c=>c.number>next);
  if(removed.some(c=>[c.breakerAmps,c.wireSize,c.poles,c.description,c.temperature?.value,c.temperature?.reason].some(hasValue)||c.temperature?.state!=='not_recorded')) throw new Error('Populated circuits would be removed. Clear or move those observations explicitly before reducing the circuit count.');
  return {...equipment,circuitCount:next,circuits:Array.from({length:next},(_,i)=>equipment.circuits.find(c=>c.number===i+1)||blankCircuit(i+1))};
}
export function equipmentProgress(equipment) {
  const checklist=[...equipment.visual,...equipment.labeling];
  const readings=[...equipment.readings,...equipment.feeders.flatMap(f=>f.readings),...equipment.circuits.map(c=>c.temperature)];
  const responses=checklist.filter(r=>r.state!=='not_assessed').length;
  const measured=readings.filter(r=>r.state==='measured'&&hasValue(r.value)).length;
  const exceptions=readings.filter(r=>!['measured','not_recorded'].includes(r.state)&&r.reason.trim()).length;
  const total=checklist.length+readings.length;
  return {total,completed:responses+measured+exceptions,measured,exceptions,percent:total?Math.round(100*(responses+measured+exceptions)/total):0,unassessed:total-responses-measured-exceptions};
}
export function inspectionProgress(document) {
  const rows=document.equipment.map(equipmentProgress),total=rows.reduce((n,r)=>n+r.total,0),completed=rows.reduce((n,r)=>n+r.completed,0);
  return {total,completed,percent:total?Math.round(completed*100/total):0,unassessed:total-completed};
}
export function highestPriority(document) {return [...PRIORITIES].reverse().find(p=>document.findings.some(f=>!f.completed&&f.priority===p))||'None recorded';}
export function validateInspection(document,{issue=false}={}) {
  const errors=[];
  if(document?.schemaVersion!==INSPECTION_SCHEMA||!Array.isArray(document.equipment)||!Array.isArray(document.findings))return ['Unsupported inspection data.'];
  if(document.equipment.length>100||document.findings.length>1000)return ['This inspection exceeds the supported record limit.'];
  const ids=new Set();
  const unique=(id,label)=>{if(!id||ids.has(id))errors.push(`${label} needs a unique ID.`);ids.add(id);};
  for(const e of document.equipment){
    unique(e.id,'Equipment');
    if(!Number.isInteger(e.circuitCount)||e.circuitCount<1||e.circuitCount>168||e.circuits.length!==e.circuitCount)errors.push('Circuit count does not match the saved circuits.');
    const numbers=new Set();
    for(const c of e.circuits){unique(c.id,'Circuit');if(!Number.isInteger(c.number)||numbers.has(c.number)||c.number<1||c.number>e.circuitCount)errors.push('Circuit positions must be unique and within the panel.');numbers.add(c.number);
      for(const [key,label]of[['breakerAmps','Breaker rating'],['poles','Pole count']]){try{const n=numericValue(c[key],label);if(n!==null&&(n<0||(key==='poles'&&(!Number.isInteger(n)||n<1||n>4))))errors.push(`${label} is out of range.`);}catch(err){errors.push(err.message);}}}
    for(const r of [...e.readings,...e.feeders.flatMap(f=>f.readings),...e.circuits.map(c=>c.temperature)]){
      unique(r.id,'Reading');if(!READING_STATES[r.state])errors.push('Unknown reading state.');
      if(!['temperature','current','voltage'].includes(r.kind)||(r.kind==='temperature'&&!['F','C'].includes(r.unit))||(r.kind==='current'&&r.unit!=='A')||(r.kind==='voltage'&&r.unit!=='V'))errors.push('Reading kind and unit must agree.');
      try{numericValue(r.value);}catch(err){errors.push(err.message);}
      if(r.state==='measured'&&!hasValue(r.value))errors.push('A measured reading needs a value, including zero when measured.');
      if(r.state!=='measured'&&hasValue(r.value))errors.push('A recorded value must use the Measured state.');
      if(!['not_recorded','measured'].includes(r.state)&&!r.reason.trim())errors.push('Reading exceptions need a reason.');
      if(issue&&r.state==='measured'&&r.kind==='voltage'&&!/^[ABCLN123][\w]*\s*[-–]\s*[ABCLN123][\w]*$/i.test(r.conductor.trim()))errors.push('Each measured voltage needs an explicit conductor pair, such as A-N.');
    }
    for(const r of [...e.visual,...e.labeling]){if(!RESPONSE_STATES[r.state])errors.push('Unknown checklist response.');if(['not_applicable','inaccessible'].includes(r.state)&&!r.notes.trim())errors.push('Checklist exceptions need a reason.');}
    if(issue){if(!e.designator.trim())errors.push('Every equipment record needs a designator.');if(equipmentProgress(e).unassessed&&!e.unassessedReason.trim())errors.push(`${e.designator||'Equipment'} needs a reason for unassessed observations.`);}
  }
  for(const f of document.findings){unique(f.id,'Finding');if(f.equipmentId&&!document.equipment.some(e=>e.id===f.equipmentId))errors.push('A finding references unavailable equipment.');if(f.priority&&!PRIORITIES.includes(f.priority))errors.push('Unknown finding priority.');if(f.category&&!FINDING_CATEGORIES[f.category])errors.push('Unknown finding category.');if(issue&&(!f.description.trim()||!f.category||!f.priority||!f.recommendation.trim()))errors.push('Every finding needs a description, category, priority and recommendation before issue.');if(issue&&f.completed&&!f.correctionEvidence.trim())errors.push('Completed corrections need evidence before issue.');}
  if(issue){if(!document.client.clientName.trim()||!document.client.siteAddress.trim()||!document.visitDate)errors.push('Client, site and visit date are required before issue.');if(!document.equipment.length)errors.push('Add equipment before issue.');if(!document.scope.trim()||!document.assessment.trim()||!document.reviewSummary.trim())errors.push('Scope, reviewer assessment and summary are required before issue.');if(document.importWarnings.some(w=>!w.resolution?.trim()))errors.push('Resolve all import warnings before issue.');}
  return [...new Set(errors)];
}
export function reportDocument(document) {
  const copy=structuredClone(document);delete copy.importWarnings;
  return copy;
}
export function safePortalUrl(value) {
  if(!String(value||'').trim())return '';
  let url;try{url=new URL(value);}catch{throw new Error('Enter a complete HTTP or HTTPS portal URL.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an HTTP or HTTPS portal URL without credentials.');
  return String(value).trim();
}
