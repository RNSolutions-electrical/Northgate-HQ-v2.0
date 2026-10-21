import {parseCsv} from './scorecardCsv.js';
import {definitionAt,validDate,weekAnchor} from './scorecardLogic.js';
import {shiftCalendarDate} from './eosLogic.js';
import {entryReportingDate} from './scorecardQuarters.js';

const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
const safe=v=>/^[\s]*[=+@\t\r\n'-]/.test(String(v??''))?"'"+v:String(v??'');
export function matrixDate(value){
 const s=String(value).trim();if(validDate(s))return s;
 const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
 if(m){const d=`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;if(validDate(d))return d;}
 throw new Error(`Unrecognized meeting date: ${s}. Use YYYY-MM-DD or M/D/YYYY with a four-digit year. Summary columns must be removed explicitly.`);
}
export function parseMatrix(text){
 // The header has no embedded newlines; fields and notes in data rows may have them.
 const line=String(text).replace(/^\uFEFF/,'').split(/\r?\n/,1)[0];
 const headers=[];let value='',quoted=false;for(let i=0;i<=line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if((c===','||i===line.length)&&!quoted){headers.push(value);value='';}else value+=c;}
 if(quoted||headers[0]!=='Who'||headers[1]?.trim()!=='Measurable'||headers[2]!=='Goal')throw new Error('Use Who, Measurable, Goal, followed by meeting-date columns.');
 const dates=[],notes={},excluded=[];for(const h of headers.slice(3)){if(/average|\bavg\b|quarter|\bQ[1-4]\b|summary|total/i.test(h)){excluded.push(h);continue;}if(h.startsWith('Notes ')){const d=matrixDate(h.slice(6));if(notes[d])throw new Error('Duplicate notes date');notes[d]=h;}else{const d=matrixDate(h);if(dates.some(x=>x.date===d))throw new Error('Duplicate meeting date');dates.push({header:h,date:d});}}
 if(!dates.length||dates.length>520)throw new Error('Use 1–520 explicit meeting dates.');
 if(Object.keys(notes).some(d=>!dates.some(x=>x.date===d)))throw new Error('A Notes column needs its corresponding meeting-date column.');
 const records=parseCsv(text,headers),guide=records.findIndex(r=>headers.slice(0,3).some(h=>/^\s*(?:import\s+)?review (?:guide|index|instructions)\b/i.test(r[h])));
 const rows=(guide<0?records:records.slice(0,guide)).map((r,i)=>({row:i+2,name:r[headers[1]].trim(),who:r.Who,goal:r.Goal,values:dates.map((d,j)=>({...d,column:headers.indexOf(d.header)+1,value:r[d.header],note:notes[d.date]?r[notes[d.date]]:null})),section:!r[headers[1]].trim()}));
 if(rows.length>500||rows.filter(r=>!r.section).length*dates.length>20000)throw new Error('Use at most 20,000 metric/date cells per file; split into smaller date ranges.');
 for(const r of rows.filter(r=>r.section))if(r.values.some(c=>c.value!==''||c.note))throw new Error(`Row ${r.row}: values without a Measurable require review.`);
 return {rows,dates,notes,excluded,ignoredGuideRows:guide<0?0:records.length-guide};
}
export function suggestedMappings(matrix,state){return Object.fromEntries(matrix.rows.filter(r=>!r.section).map(r=>{const ids=[...new Set(state.definitions.filter(d=>d.name===r.name).map(d=>d.metric_id))];return[r.row,ids.length===1?ids[0]:''];}));}
function valueFor(raw,d,scale){
 if(d.unit==='text')return raw;
 if(d.unit==='percent'&&!['whole','fraction'].includes(scale))throw new Error('Explicitly choose percentage scale; fractions are never guessed.');
 let s=raw;if(d.unit==='percent'&&s.endsWith('%'))s=s.slice(0,-1);
 if(!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))throw new Error('Use a plain number; currency symbols, commas, shorthand and formulas need review.');
 let n=Number(s);if(!Number.isFinite(n))throw new Error('Value is not finite.');
 if(d.unit==='percent'&&scale==='fraction'){if(raw.endsWith('%'))throw new Error('Percent sign conflicts with fraction scale.');const negative=s.startsWith('-'),[whole,decimal='']=s.replace(/^-/,'').split('.');s=(negative?'-':'')+(whole+(decimal+'00').slice(0,2)).replace(/^0+(?=\d)/,'')+(decimal.length>2?'.'+decimal.slice(2):'');n=Number(s);}
 if(d.unit==='percent'&&(n<0||n>100))throw new Error('Percentage must be 0–100 after the selected conversion.');
 if(d.unit==='count'&&!Number.isInteger(n))throw new Error('A count must be a whole number.');
 return s;
}
export function planMatrix(matrix,state,{mappings,scales={},weekly=false,sourceId,sourceRevision}){
 const entries=[],issues=[],conflicts=[],seen=new Set();
 for(const row of matrix.rows.filter(r=>!r.section))for(const cell of row.values){
  if(cell.value===''&&!cell.note)continue;const label={row:row.row,metric:row.name,date:cell.date,raw:cell.value};
  try{
   if(cell.value==='')throw new Error('Note without an actual value needs review; blank is not zero.');
   const id=mappings[row.row];if(!id)throw new Error('Choose an existing metric explicitly.');
   const anchor=weekAnchor(cell.date),key=id+'/'+anchor;if(seen.has(key))throw new Error('Duplicate metric/week, including two meeting dates in one week.');seen.add(key);
   const d=definitionAt(state,id,anchor);if(!d)throw new Error('No metric definition is effective for this historical week. Review Manage metrics; no definition will be invented.');
   const value=valueFor(cell.value,d,scales[row.row]);const old=state.observations.find(o=>o.metric_id===id&&o.period_id===anchor);
   const p=state.periods.find(p=>p.id===anchor);
   if(old){
    const report=entryReportingDate(state,id,p);if(report.ambiguous||report.date!==cell.date)throw new Error('Existing entry has a different or unverified original reporting date; review it in the app.');
    const note=cell.note||old.notes||'';const same=String(old.value??old.value_numeric??old.value_text??'')===value&&note===(old.notes||'');
    if(!same)conflicts.push({...label,metric_id:id,period_id:anchor,value,notes:note});
    continue;
   }
   let start=cell.date,end=cell.date;
   if(d.window==='period'){if(!weekly)throw new Error('Confirm that weekly values cover the preceding Monday–Sunday.');start=shiftCalendarDate(anchor,-7);end=shiftCalendarDate(anchor,-1);}
   else if(d.window!=='point-in-time')throw new Error('Cumulative/rolling measurement dates require separate reviewed preparation; no interval or total is inferred.');
   const source={id:sourceId,revision:sourceRevision,cell:`CSV!${columnName(cell.column)}${row.row}`,meeting_date:cell.date,measurement_start:start,as_of:end};
   entries.push({Metric:d.name,Date:cell.date,Value:value,Notes:cell.note||'',Format:d.unit,Review:'Needs review',Source:JSON.stringify(source),'System reference':''});
  }catch(e){issues.push({...label,message:e.message});}
 }
 return {entries,issues,conflicts};
}
function columnName(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
export function matrixCsv(state,dates){
 const ds=dates.map(matrixDate);if(new Set(ds).size!==ds.length)throw new Error('Duplicate meeting date.');
 const current=state.definitions.toSorted((a,b)=>b.effective_from.localeCompare(a.effective_from)||b.revision-a.revision);
 const metrics=state.metrics.filter(m=>!m.retired).map(m=>({m,d:current.find(d=>d.metric_id===m.id)})).filter(x=>x.d).sort((a,b)=>(a.d.category_label||'').localeCompare(b.d.category_label||'')||a.d.name.localeCompare(b.d.name));
 const noteDates=ds.filter(date=>metrics.some(({m})=>{const o=state.observations.find(o=>o.metric_id===m.id&&o.period_id===weekAnchor(date)),p=state.periods.find(p=>p.id===weekAnchor(date));return o?.notes&&p&&entryReportingDate(state,m.id,p).date===date;}));
 const headers=['Who','Measurable','Goal',...ds,...noteDates.map(d=>'Notes '+d)];const rows=[headers];
 for(const {m,d} of metrics){const values=ds.map(date=>{const o=state.observations.find(o=>o.metric_id===m.id&&o.period_id===weekAnchor(date)),p=state.periods.find(p=>p.id===weekAnchor(date));if(!o||!p||entryReportingDate(state,m.id,p).date!==date)return '';const v=o.value??o.value_numeric??o.value_text??'';const def=state.definitions.find(x=>x.id===o.definition_id)||d;return def.unit==='percent'&&v!==''?`${v}%`:v;});rows.push([d.owner_label||'',d.name,d.goal??'',...values,...noteDates.map(date=>{const p=state.periods.find(p=>p.id===weekAnchor(date));return p&&entryReportingDate(state,m.id,p).date===date?state.observations.find(o=>o.metric_id===m.id&&o.period_id===p.id)?.notes||'':'';})]);}
 return '\uFEFF'+rows.map((r,i)=>r.map((v,j)=>quote(i===0||j<3?safe(v):typeof v==='number'||/^-?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(String(v))?v:safe(v))).join(',')).join('\r\n');
}
