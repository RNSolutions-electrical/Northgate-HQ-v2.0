import {validateFeederWorkspace,clearFeederReviews} from './feederModel.js';
export const defaults=()=>({schema:2,project:'',jurisdiction:'',preparedBy:'',basis:'2017 NEC + NC amendments • applicability not yet confirmed',area:'',voltage:'240',service:'',small:'2',laundry:'1',rows:[],cookingDemand:'',cookingNote:'',dryerDemand:'',dryerNote:'',largestMotor:'',hvacStandard:'',hvacOptional:'',hvacNote:'',otherNote:'',notes:'',basisConfirmed:false,inventoryConfirmed:false,motorConfirmed:false,optionalEligible:false,optionalReviewed:false,lastBackup:'',lastImport:'',updatedAt:''});
const numeric=['area','voltage','service','small','laundry','cookingDemand','dryerDemand','largestMotor','hvacStandard','hvacOptional'];
export function validate(d){if(!d||![1,2].includes(d.schema)||!Array.isArray(d.rows)||d.rows.length>500)throw Error('Not a supported Northgate dwelling-load backup.');const base=defaults();for(const k in base){if(k==='rows')continue;if(typeof d[k]!==typeof base[k])throw Error('Invalid or missing field: '+k);if(typeof d[k]==='string'&&d[k].length>20000)throw Error('Text field too large.');}for(const k of numeric)if(d[k]!==''&&(!Number.isFinite(Number(d[k]))||Number(d[k])<0))throw Error('Invalid numeric field: '+k);for(const r of d.rows){if(!r||typeof r.label!=='string'||r.label.length>500||!['fixed','cooking','dryer','motor','hvac','other'].includes(r.cat))throw Error('Invalid equipment row.');for(const k of ['qty','va'])if(typeof r[k]!=='string'||(r[k]!==''&&(!Number.isFinite(Number(r[k]))||Number(r[k])<0)))throw Error('Invalid equipment number.');}if(d.schema===2)validateEquipmentMetadata(d.rows);validateFeederWorkspace(d);return d;}

export function imported(data, filename) { const next=clearFeederReviews(upgrade(data)); for(const k of ['basisConfirmed','inventoryConfirmed','motorConfirmed','optionalEligible','optionalReviewed'])next[k]=false; next.lastImport=filename+' • '+new Date().toISOString(); return next; }

export function preparedDocument(value) { if(!value||typeof value.id!=='string'||!Number.isInteger(value.version)||value.version<0)throw Error('Invalid saved study'); const payload=upgrade(value.payload); return {...value,payload,requiresMigration:value.payload.schema===1||Boolean(value.requiresMigration)}; }
export function restoreMatches(proposal,document){return Boolean(proposal&&document&&proposal.studyId===document.id&&proposal.version===document.version);}

export function validateEquipmentMetadata(rows){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, ids=new Set();
 const text=(v,max)=>typeof v==='string'&&v.length<=max;
 for(const r of rows){
  if(typeof r.id!=='string'||!uuid.test(r.id)||ids.has(r.id.toLowerCase()))throw Error('Equipment IDs must be unique UUIDs.');ids.add(r.id.toLowerCase());
  for(const k of ['model','serial'])if(r[k]!==undefined&&!text(r[k],200))throw Error('Invalid equipment '+k);
  if(r.provenance!==undefined){const p=r.provenance;if(!p||Array.isArray(p)||typeof p!=='object'||Object.keys(p).some(k=>!['sourceType','reference','attributedTo','notes'].includes(k))||!['nameplate','drawing','manual','other'].includes(p.sourceType))throw Error('Invalid equipment source.');for(const [k,max]of Object.entries({reference:1000,attributedTo:200,notes:4000}))if(p[k]!==undefined&&!text(p[k],max))throw Error('Invalid source '+k);}
  if(r.evidenceIds!==undefined&&(!Array.isArray(r.evidenceIds)||r.evidenceIds.length>20||new Set(r.evidenceIds.map(id=>typeof id==='string'?id.toLowerCase():id)).size!==r.evidenceIds.length||r.evidenceIds.some(id=>typeof id!=='string'||!uuid.test(id))))throw Error('Invalid equipment evidence references.');
 }
}
export function upgrade(data){const next=structuredClone(validate(data));if(next.schema===1){next.schema=2;next.rows=next.rows.map(r=>({...r,id:crypto.randomUUID()}));}return validate(next);}
