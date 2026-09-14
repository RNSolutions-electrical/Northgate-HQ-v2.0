import {blankInspection,blankEquipment,blankCircuit,blankFinding,blankReading,newId,textValue,hasValue,validateInspection} from './inspectionModel.js';
export const MAX_IMPORT_BYTES=25*1024*1024;
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof bytes==='string'?new TextEncoder().encode(bytes):bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function canonicalJson(value){if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;return JSON.stringify(value);}
export function legacyDate(value){const raw=textValue(value);if(!raw)return '';let iso=raw;if(/^\d{2}\/\d{2}\/\d{4}$/.test(raw))iso=`${raw.slice(6)}-${raw.slice(0,2)}-${raw.slice(3,5)}`;if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||Number.isNaN(Date.parse(`${iso}T00:00:00Z`))||new Date(`${iso}T00:00:00Z`).toISOString().slice(0,10)!==iso)throw new Error(`Unsupported or invalid visit date: ${raw}`);return iso;}
const decodeEntities=value=>value.replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
function htmlState(text){
  const scripts=[...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(m=>/\bid\s*=\s*["']embeddedState["']/i.test(m[1])&&/\btype\s*=\s*["']application\/json["']/i.test(m[1]));
  if(scripts.length!==1)throw new Error('HTML must contain exactly one saved embeddedState JSON block.');
  return JSON.parse(scripts[0][2]);
}
function photoFile(photo,name){
  const url=typeof photo==='string'?photo:photo?.dataUrl;
  if(!url)return null;
  const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
  if(!match)throw new Error('Legacy photos must be inline JPEG, PNG or WebP images. External URLs and active formats are not imported.');
  const bytes=Uint8Array.from(atob(match[2].replace(/\s/g,'')),c=>c.charCodeAt(0));
  if(bytes.length>20*1024*1024)throw new Error('An imported image exceeds 20 MB.');
  return new File([bytes],name,{type:match[1]});
}
export async function prepareInspectionImport(file){
  if(!file||file.size>MAX_IMPORT_BYTES)throw new Error('Choose an inspection JSON or HTML file up to 25 MB.');
  const text=await file.text(),isHtml=/^\s*</.test(text);
  let source;try{source=isHtml?htmlState(text):JSON.parse(text);}catch(error){throw new Error(`The inspection file could not be read: ${error.message}`);}
  const warnings=[],warn=(path,message)=>warnings.push({id:newId(),path,message,resolution:''});
  let document=blankInspection(),photos=[];
  if(source.format==='northgate-health-inspection-1'){
    document=structuredClone(source.document);
    const errors=validateInspection(document);if(errors.length)throw new Error(errors.join(' '));
    if(source.attachments?.length)warn('attachments','This JSON references stored evidence. Attach the original files before issue; JSON alone does not contain those bytes.');
    document.importWarnings=[...(document.importWarnings||[]),...warnings];
  }else{
    let panels;
    if(Array.isArray(source.panels)){if(source._meta?.appVersion!=='northgate-inspection-2.0')throw new Error('Unsupported legacy inspection version.');panels=source.panels;}
    else if(source.inspectionData&&source.panel)panels=[source];
    else throw new Error('This file is not a supported saved inspection.');
    if(!panels.length||panels.length>100)throw new Error('Import requires between 1 and 100 panels.');
    for(const key of Object.keys(document.client))document.client[key]=textValue(source.client?.[key]);
    document.technicianLegacy=textValue(panels[0]?.inspectionData?.technician);
    for(const [index,p]of panels.entries()){
      const d=p.inspectionData||{},e=blankEquipment(),path=`panels[${index}]`;
      const outer=p.panel||{},inner=d.panel||{};
      for(const key of ['designator','amperage','mainConfig','phaseConfig','phaseRotation','faultCurrent','faultCurrentDate'])e[key]=textValue(outer[key]??inner[key]);
      e.nominalVoltage=textValue(outer.nominalVoltage??inner.voltage);
      for(const [outerKey,innerKey]of [['designator','designator'],['nominalVoltage','voltage'],['amperage','amperage'],['mainConfig','mainConfig'],['phaseConfig','phaseConfig'],['phaseRotation','phaseRotation'],['faultCurrent','faultCurrent'],['faultCurrentDate','faultCurrentDate']]){
        if(outer[outerKey]!==undefined&&inner[innerKey]!==undefined&&textValue(outer[outerKey])!==textValue(inner[innerKey]))warn(`${path}.panel.${outerKey}`,'Outer and nested saved setup differ. The outer value was selected; both original values remain in source provenance.');
      }
      e.visitDate=legacyDate(p.header?.date||d.date);e.visitTime=textValue(p.header?.time||d.time);
      if(textValue(p.header?.date)!==textValue(d.date)||textValue(p.header?.time)!==textValue(d.time))warn(`${path}.header`,'Header and nested visit date/time differ. The populated header was used. Verify it against the retained source.');
      e.thermalNotes=textValue(p.thermalNotes??d.thermalNotes);e.voltageNotes=textValue(p.voltageNotes);e.notes=textValue(p.notes);
      if(p.thermalNotes!==undefined&&d.thermalNotes!==undefined&&p.thermalNotes!==d.thermalNotes)warn(`${path}.thermalNotes`,'Thermal notes differ between saved representations. The outer notes were selected.');
      const responses=(rows,fallback,label)=>Array.isArray(rows)?rows.map((r,i)=>{const state={good:'acceptable',bad:'attention','':'not_assessed'}[textValue(r.status)];if(!state)warn(`${path}.${label}[${i}]`,'Unknown legacy checklist status retained in provenance; response is Not assessed.');return{id:`${label}-${i+1}`,label:textValue(r.label),state:state||'not_assessed',notes:textValue(r.notes)};}):fallback;
      e.visual=responses(d.visualChecklist,e.visual,'visual');e.labeling=responses(d.labelingChecklist,e.labeling,'labeling');
      const reading=(kind,label,conductor,value,unit)=>({...blankReading(kind,label,conductor,unit),value:textValue(value),state:hasValue(value)?'measured':'not_recorded'});
      e.feeders=(d.feeders||[]).map((f,fi)=>({id:newId(),sets:textValue(f.sets),size:textValue(f.size),material:textValue(f.type),insulation:textValue(f.insulation),readings:['a','b','c','n'].flatMap(phase=>{
        const temps=['f','c'].filter(unit=>hasValue(f.temp?.[phase]?.[unit]));
        return [...(temps.length?temps:['f']).map(unit=>reading('temperature','Termination',phase.toUpperCase(),f.temp?.[phase]?.[unit],unit.toUpperCase())),reading('current','Feeder current',phase.toUpperCase(),f.amps?.[phase],'A'),reading('voltage',`Legacy channel ${phase.toUpperCase()}`,'',f.voltage?.[phase],'V')];})}));
      for(const [channel,v]of Object.entries(d.feederTemps||{}))for(const unit of ['f','c'])if(hasValue(v?.[unit]))e.readings.push(reading('temperature','Legacy feeder temperature',channel,v[unit],unit.toUpperCase()));
      for(const [map,kind,unit]of [['feederAmps','current','A'],['voltageReadings','voltage','V']])for(const [channel,v]of Object.entries(d[map]||{})){if(v!==null&&typeof v==='object'){warn(`${path}.${map}.${channel}`,'Complex legacy reading retained in source; enter the observation explicitly.');continue;}if(hasValue(v))e.readings.push(reading(kind,`Legacy ${channel}`,kind==='voltage'?'':channel,v,unit));}
      e.circuitCount=Number(p.circuitCount||42);if(!Number.isInteger(e.circuitCount)||e.circuitCount<1||e.circuitCount>168)throw new Error('Legacy circuit count is outside 1–168.');
      for(const map of [d.circuitBreakers||{},d.circuitTemps||{}])for(const key of Object.keys(map))if(!/^\d+$/.test(key)||Number(key)<1||Number(key)>e.circuitCount)throw new Error('A saved circuit lies outside the declared circuit count. Resolve the source discrepancy before import.');
      e.circuits=Array.from({length:e.circuitCount},(_,i)=>{const c=blankCircuit(i+1),b=d.circuitBreakers?.[i+1]||{};let poles=textValue(b.poles);if(Object.hasOwn({single:'1',double:'2',triple:'3'},poles))poles={single:'1',double:'2',triple:'3'}[poles];if(poles&&!/^[1-4]$/.test(poles)){warn(`${path}.circuitBreakers.${i+1}.poles`,'Unknown pole configuration retained in source; verify the pole count.');poles='';}return{...c,breakerAmps:textValue(b.amps),wireSize:textValue(b.wireSize),poles,description:textValue(b.notes),temperature:reading('temperature',`Circuit ${i+1}`,'',d.circuitTemps?.[i+1],'F')};});
      for(const f of d.findings||[]){const finding={...blankFinding(e.id),description:textValue(f.description),legacySeverity:textValue(f.severity),recommendation:textValue(f.action),completed:f.completed===true};document.findings.push(finding);if(f.photo){const image=photoFile(f.photo,`finding-${finding.id}.jpg`);if(image)photos.push({file:image,equipmentId:e.id,findingId:finding.id,caption:textValue(f.photo?.caption)});}}
      for(const pphoto of d.photos||[]){const image=photoFile(pphoto,`photo-${newId()}.jpg`);if(image)photos.push({file:image,equipmentId:e.id,findingId:'',caption:textValue(pphoto.caption)});}
      document.equipment.push(e);
    }
    document.visitDate=document.equipment[0]?.visitDate||'';document.visitTime=document.equipment[0]?.visitTime||'';
    if(new Set(document.equipment.map(e=>e.visitDate)).size>1)warn('visitDate','Panels have different visit dates. The first panel supplies the inspection date; all equipment dates are preserved.');
    if(document.equipment.some(e=>[...e.readings,...e.feeders.flatMap(f=>f.readings)].some(r=>r.kind==='voltage'&&r.state==='measured'&&!r.conductor)))warn('voltagePairs','Legacy voltage channel names do not identify conductor pairs. Select the actual measured pairs before issue.');
    if(isHtml){
      const expected={...document.client,...(panels[source.activePanelIndex||0]?.panel||{})};
      for(const match of text.matchAll(/<input\b([^>]*)>/gi)){
        const id=/\bid\s*=\s*["']([^"']+)["']/i.exec(match[1])?.[1],value=/\bvalue\s*=\s*["']([^"']*)["']/i.exec(match[1])?.[1];
        if(id&&value!==undefined&&Object.hasOwn(expected,id)&&decodeEntities(value)!==textValue(expected[id]))warn(`html.${id}`,'Rendered input differs from embedded saved state. Embedded state was used; review the original source before issue.');
      }
    }
    document.importWarnings=warnings;
  }
  const errors=validateInspection(document);if(errors.length)throw new Error(errors.join(' '));
  return {document,source,sourceHash:await sha256(canonicalJson(source)),fileHash:await sha256(await file.arrayBuffer()),filename:file.name,photos,warnings:document.importWarnings||[]};
}
