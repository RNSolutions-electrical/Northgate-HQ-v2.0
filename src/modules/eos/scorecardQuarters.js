import {validDate} from './scorecardLogic.js';
import {shiftCalendarDate} from './eosLogic.js';

export const QUARTER_VIEWS = {management: 'Management Cycle Quarter', calendar: 'Calendar Quarter'};
export function validateCycles(cycles) {
  if (!Array.isArray(cycles) || cycles.length > 200) throw new Error('Use at most 200 named management cycles.');
  const ids = new Set(), starts = new Set(), names = new Set();
  for (const c of cycles) {
    if (!c || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.id || '')) throw new Error('A valid cycle identity is required.');
    if (typeof c.name !== 'string' || !c.name.trim() || c.name.trim().length > 100) throw new Error('Name each management cycle (up to 100 characters).');
    if (!validDate(c.starts_on) || c.starts_on < '1900-01-01' || c.starts_on > '2199-12-31') throw new Error('Choose a valid effective start date between 1900 and 2199.');
    if (ids.has(c.id) || starts.has(c.starts_on) || names.has(c.name.trim().toLowerCase())) throw new Error('Cycles need unique identities, names and start dates; their ranges must not overlap.');
    ids.add(c.id); starts.add(c.starts_on); names.add(c.name.trim().toLowerCase());
  }
  return cycles.map(c => ({id:c.id,name:c.name.trim(),starts_on:c.starts_on})).sort((a,b)=>a.starts_on.localeCompare(b.starts_on));
}
export function entryReportingDate(state,metricId,period) {
  const rows=state.reportingDates || [];
  const saved=rows.find(r=>r.metric_id===metricId&&r.period_id===period.id&&validDate(r.date))
    || rows.find(r=>r.metric_id==null&&r.period_id===period.id&&validDate(r.date));
  return saved || {date:period.anchor,basis:'reporting-anchor-fallback',ambiguous:true};
}
export function reportingDateChoices(state,period) {
  const saved=(state.reportingDates || []).filter(r=>r.metric_id!=null&&r.period_id===period.id&&validDate(r.date));
  return [...new Set((saved.length?saved:[entryReportingDate(state,null,period)]).map(r=>r.date))].sort();
}
export function quarterRange(state, {periodId, quarterView = 'calendar',referenceDate} = {}) {
  const period = state.periods.find(p=>p.id===periodId);
  if (!period) return null;
  const date = validDate(referenceDate)?referenceDate:reportingDateChoices(state,period)[0];
  if (quarterView === 'calendar') {
    const month = Math.floor((Number(date.slice(5,7))-1)/3)*3+1;
    const from = `${date.slice(0,4)}-${String(month).padStart(2,'0')}-01`;
    const next = month===10 ? `${Number(date.slice(0,4))+1}-01-01` : `${date.slice(0,4)}-${String(month+3).padStart(2,'0')}-01`;
    return {name:`${date.slice(0,4)} Q${(month+2)/3}`,from,to:shiftCalendarDate(next,-1)};
  }
  if (quarterView !== 'management') throw new Error('Choose a supported quarter view.');
  const cycles = validateCycles(state.quarterSchedule?.cycles || []);
  const index = cycles.findLastIndex(c=>c.starts_on<=date);
  if (index < 0) return null;
  return {name:cycles[index].name,from:cycles[index].starts_on,to:cycles[index+1] ? shiftCalendarDate(cycles[index+1].starts_on,-1) : null};
}
export function entryInScope(state,metricId,period,filters={}) {
  const date=entryReportingDate(state,metricId,period).date;
  if(filters.scope==='quarter') {
    const range=quarterRange(state,filters);
    return Boolean(range&&date>=range.from&&(!range.to||date<=range.to));
  }
  if(filters.scope==='year') {
    const selected=state.periods.find(p=>p.id===filters.periodId);
    const reference=validDate(filters.referenceDate)?filters.referenceDate:selected&&reportingDateChoices(state,selected)[0];
    return Boolean(reference&&date.slice(0,4)===reference.slice(0,4));
  }
  return true;
}
export const quarterRangeLabel = range => range ? `${range.name}: ${range.from} through ${range.to || 'next defined cycle (open)'}` : 'No management cycle is defined for this reporting week.';
