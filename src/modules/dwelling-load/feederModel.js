import {inspectNameplateSources} from './nameplateModel.js';
/** Reviewed feeder assessment, not an NEC calculation engine or an adequacy verdict.
 * No demand factors, ampacity tables, neutral sizing, or automatic upgrade selection.
 */
const text = value => typeof value === 'string' && value.trim().length > 0;
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const positive = value => number(value) && value > 0;
const ratingKeys = ['panelBus', 'upstreamOcpd', 'conductorAmpacity'];
const requiredReviews = ['codeBasis', 'methodEligibility', 'inventory', 'demandFactors', 'continuousLoads', 'motors', 'noncoincidentLoads', 'phaseAllocation', 'neutral', 'conductorBasis', 'terminals', 'installationConditions'];
export const FEEDER_LIMITATION = 'Reviewed numerical comparison only. No calculated exceedance does not establish adequacy, safety, code compliance, or permission to energize. Professional review is required.';

/** Every physical load has one direct panel assignment. Ancestors inherit membership,
 * not discounted VA subtotals. Multiple independent service roots are allowed. */
export function inspectFeederTopology(panels, loadIds) {
  const errors = [];
  if (!Array.isArray(panels) || panels.length > 200 || !Array.isArray(loadIds) || loadIds.length > 2000) return {valid:false, errors:['Invalid or oversized topology.'], upstreamLoadIds:{}};
  const knownLoads = new Set(loadIds);
  if (knownLoads.size !== loadIds.length || loadIds.some(id => !text(id))) errors.push('Load identifiers must be unique nonempty strings.');
  const byId = new Map(); const assigned = new Map();
  for (const panel of panels) {
    if (!panel || !text(panel.id) || byId.has(panel.id)) { errors.push('Panel identifiers must be unique nonempty strings.'); continue; }
    byId.set(panel.id, panel);
  }
  for (const panel of byId.values()) {
    if (panel.parentId !== null && (!text(panel.parentId) || !byId.has(panel.parentId))) errors.push(`Unknown parent for ${panel.id}.`);
    if (!Array.isArray(panel.loadIds)) {errors.push(`Missing load assignments for ${panel.id}.`); continue;}
    for (const id of panel.loadIds) {
      if (!knownLoads.has(id)) errors.push(`Unknown load in ${panel.id}.`);
      if (assigned.has(id)) errors.push(`Load assigned more than once: ${id}.`);
      assigned.set(id, panel.id);
    }
    const visited = new Set(); let cursor = panel;
    while (cursor) {
      if (visited.has(cursor.id)) {errors.push(`Panel cycle involving ${panel.id}.`); break;}
      visited.add(cursor.id); cursor = byId.get(cursor.parentId);
    }
  }
  for (const id of knownLoads) if (!assigned.has(id)) errors.push(`Unassigned load: ${id}.`);
  if (errors.length) return {valid:false, errors:[...new Set(errors)], upstreamLoadIds:{}};
  const upstream = new Map([...byId.keys()].map(id => [id, new Set()]));
  for (const [loadId, panelId] of assigned) {
    let cursor = byId.get(panelId);
    while (cursor) {upstream.get(cursor.id).add(loadId); cursor = byId.get(cursor.parentId);}
  }
  return {valid:true, errors:[], upstreamLoadIds:Object.fromEntries([...upstream].map(([id, loads]) => [id,[...loads].sort()]))};
}

/** Inputs are reviewer-supplied design currents, already including applicable rules.
 * Review booleans are workflow attestations, not server-verified credentials.
 * Valid topology and explicit membership are mandatory to avoid omitted loads. */
export function assessFeeder(study, topology) {
  const missing = []; const comparisons = [];
  const s = study && typeof study === 'object' ? study : {};
  if (!topology?.valid || !Object.hasOwn(topology.upstreamLoadIds || {}, s.panelId)) missing.push('Valid topology and panel membership');
  if (!text(s.codeBasis) || !text(s.methodBasis)) missing.push('Applicable code and reviewed calculation basis');
  if (!text(s.reviewer) || !text(s.reviewedAt)) missing.push('Reviewer and review date');
  for (const key of requiredReviews) if (s.reviews?.[key] !== true) missing.push(`Review: ${key}`);
  const expectedLegs = s.system === 'single-phase-3-wire' ? 2 : s.system === 'three-phase-4-wire' ? 3 : 0;
  if (!expectedLegs || !positive(s.lineToLineVoltage)) missing.push('Supported, verified voltage/phase system');
  if (s.systemVerified !== true) missing.push('Verified voltage/phase');
  if (!Array.isArray(s.designCurrentA) || s.designCurrentA.length !== expectedLegs || s.designCurrentA.some(a => !number(a))) missing.push('Reviewed design current for every ungrounded conductor');
  if (!number(s.reviewedDemandVA)) missing.push('Reviewed demand VA');
  // Membership must match the current topology, including all downstream loads.
  const expected = topology?.upstreamLoadIds?.[s.panelId];
  if (!Array.isArray(s.reviewedLoadIds) || new Set(s.reviewedLoadIds).size !== s.reviewedLoadIds.length || !expected || s.reviewedLoadIds.length !== expected.length || s.reviewedLoadIds.some(id => !expected.includes(id))) missing.push('Reviewed load membership matches current topology');
  const maxCurrentA = Array.isArray(s.designCurrentA) && s.designCurrentA.length === expectedLegs && expectedLegs > 0 && s.designCurrentA.every(number) ? Math.max(...s.designCurrentA) : null;
  for (const key of ratingKeys) {
    const rating = s.ratings?.[key];
    if (!rating || !positive(rating.amps) || rating.verified !== true || !text(rating.source)) missing.push(`Verified ${key} rating and source`);
  }
  const status = missing.length ? 'incomplete' : ratingKeys.some(key => maxCurrentA > s.ratings[key].amps) ? 'calculated-exceedance' : 'no-calculated-exceedance';
  // Never emit favorable partial comparisons when prerequisites are incomplete.
  if (!missing.length) for (const key of ratingKeys) comparisons.push({rating:key, amps:s.ratings[key].amps, demandA:maxCurrentA, exceeds:maxCurrentA > s.ratings[key].amps});
  return {status, missing, maxCurrentA, reviewedDemandVA:number(s.reviewedDemandVA) ? s.reviewedDemandVA : null, comparisons,
    conditionNote:text(s.conditionNote) ? s.conditionNote.trim() : '',
    conditionRecommendation:text(s.conditionRecommendation) ? s.conditionRecommendation.trim() : '',
    nextAction:missing.length ? 'Complete missing inputs and professional review before comparison.' : status === 'calculated-exceedance' ? 'Investigate calculated exceedance with the responsible professional; do not select an upgrade from this result alone.' : 'Retain separate condition, installation and code review; this result is not an adequacy finding.',
    limitation:FEEDER_LIMITATION};
}

export const FEEDER_REVIEW_KEYS = [...requiredReviews];
export function newFeederStudy(panelId) {
  return {panelId,codeBasis:'',methodBasis:'',reviewer:'',reviewedAt:'',reviewSnapshot:'',system:'single-phase-3-wire',lineToLineVoltage:240,systemVerified:false,designCurrentA:[null,null],reviewedDemandVA:null,reviewedLoadIds:[],reviews:Object.fromEntries(requiredReviews.map(k=>[k,false])),ratings:Object.fromEntries(ratingKeys.map(k=>[k,{amps:null,verified:false,source:''}])),conductorBasis:'',terminalBasis:'',neutralBasis:'',conditionNote:'',conditionRecommendation:''};
}
const canonical = value => {
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
};
/** Exact input identity, not a cryptographic signature or verified professional approval. */
export function feederInputSnapshot(payload) {
  const next=structuredClone(payload);
  for(const key of ['updatedAt','lastBackup','lastImport']) delete next[key];
  if(next.feederStudies){
    delete next.feederStudies.reviewSnapshot;
    for(const study of next.feederStudies.studies){delete study.reviews;delete study.reviewedAt;delete study.reviewSnapshot;delete study.reviewedLoadIds;}
  }
  return canonical(next);
}
export function clearFeederReviews(payload) {
  const next=structuredClone(payload);
  if(next.feederStudies){for(const s of next.feederStudies.studies){s.reviews=Object.fromEntries(requiredReviews.map(k=>[k,false]));s.reviewedAt='';s.reviewSnapshot='';s.reviewedLoadIds=[];}}
  return next;
}
const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const boundedText = (value,max=4000) => typeof value==='string' && value.length<=max;
const exactKeys = (obj,keys) => obj && typeof obj==='object' && !Array.isArray(obj) && Object.keys(obj).length===keys.length && keys.every(k=>Object.hasOwn(obj,k));
export function validateFeederWorkspace(payload) {
  if(payload?.feederStudies===undefined)return payload;
  if(payload.schema!==2)throw Error('Feeder metadata requires schema 2.');
  const f=payload.feederStudies, fail=()=>{throw Error('Invalid feeder workspace backup.');};
  if(!exactKeys(f,['version','panels','studies'])||f.version!==1||!Array.isArray(f.panels)||f.panels.length>50||!Array.isArray(f.studies)||f.studies.length!==f.panels.length)fail();
  const ids=new Set();
  for(const p of f.panels){
    if(!exactKeys(p,['id','label','parentId','loadIds'])||!uuid(p.id)||ids.has(p.id)||!boundedText(p.label,200)||(p.parentId!==null&&!uuid(p.parentId))||!Array.isArray(p.loadIds)||p.loadIds.length>500||p.loadIds.some(id=>!uuid(id))||new Set(p.loadIds).size!==p.loadIds.length)fail();
    ids.add(p.id);
  }
  const seen=new Set(), template=newFeederStudy('');
  for(const s of f.studies){
    if(!exactKeys(s,Object.keys(template))||!ids.has(s.panelId)||seen.has(s.panelId))fail();seen.add(s.panelId);if(!boundedText(s.reviewSnapshot,1000000))fail();
    for(const key of ['codeBasis','methodBasis','reviewer','reviewedAt','conductorBasis','terminalBasis','neutralBasis','conditionNote','conditionRecommendation'])if(!boundedText(s[key]))fail();
    if(!['single-phase-3-wire','three-phase-4-wire','unknown'].includes(s.system)||!(s.lineToLineVoltage===null||positive(s.lineToLineVoltage))||typeof s.systemVerified!=='boolean'||!Array.isArray(s.designCurrentA)||s.designCurrentA.length<2||s.designCurrentA.length>3||s.designCurrentA.some(v=>v!==null&&!number(v))||!(s.reviewedDemandVA===null||number(s.reviewedDemandVA)))fail();
    if(!Array.isArray(s.reviewedLoadIds)||s.reviewedLoadIds.length>500||s.reviewedLoadIds.some(id=>!uuid(id))||new Set(s.reviewedLoadIds).size!==s.reviewedLoadIds.length||!exactKeys(s.reviews,requiredReviews)||requiredReviews.some(k=>typeof s.reviews[k]!=='boolean')||!exactKeys(s.ratings,ratingKeys))fail();
    for(const k of ratingKeys){const r=s.ratings[k];if(!exactKeys(r,['amps','verified','source'])||!(r.amps===null||positive(r.amps))||typeof r.verified!=='boolean'||!boundedText(r.source))fail();}
  }
  return payload;
}
export function assessFeederWorkspace(payload,panelId) {
  validateFeederWorkspace(payload);
  const f=payload.feederStudies;
  const topology=inspectFeederTopology(f?.panels||[],(payload.rows||[]).map(r=>r.id));
  const original=f?.studies.find(s=>s.panelId===panelId);
  const snapshotMatches=Boolean(original?.reviewSnapshot && original.reviewSnapshot===feederInputSnapshot(payload));
  const study=original ? structuredClone(original) : null;
  if(study && !snapshotMatches) study.reviews={};
  const result=assessFeeder(study,topology);
  if(study && (!text(study.conductorBasis)||!text(study.terminalBasis)||!text(study.neutralBasis))){result.status='incomplete';result.comparisons=[];result.missing.push('Conductor, terminal and neutral review basis');result.nextAction='Complete missing inputs and professional review before comparison.';}
  const sources=inspectNameplateSources(payload);
  if(sources.blocksConfidence){result.status='incomplete';result.comparisons=[];result.missing.push('Selected equipment nameplate/source values must be reviewed and reapplied or explicitly cleared.');result.nextAction='Resolve stale equipment calculation sources before confirming feeder review.';}
  return {...result,snapshotMatches,topologyErrors:topology.errors};
}
