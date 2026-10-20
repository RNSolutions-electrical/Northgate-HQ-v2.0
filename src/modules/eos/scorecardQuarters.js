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
export function quarterRange(state, {periodId, quarterView = 'calendar'} = {}) {
  const period = state.periods.find(p=>p.id===periodId);
  if (!period) return null;
  const anchor = period.anchor;
  if (quarterView === 'calendar') {
    const month = Math.floor((Number(anchor.slice(5,7))-1)/3)*3+1;
    const from = `${anchor.slice(0,4)}-${String(month).padStart(2,'0')}-01`;
    const next = month===10 ? `${Number(anchor.slice(0,4))+1}-01-01` : `${anchor.slice(0,4)}-${String(month+3).padStart(2,'0')}-01`;
    return {name:`${anchor.slice(0,4)} Q${(month+2)/3}`,from,to:shiftCalendarDate(next,-1)};
  }
  if (quarterView !== 'management') throw new Error('Choose a supported quarter view.');
  const cycles = validateCycles(state.quarterSchedule?.cycles || []);
  const index = cycles.findLastIndex(c=>c.starts_on<=anchor);
  if (index < 0) return null;
  return {name:cycles[index].name,from:cycles[index].starts_on,to:cycles[index+1] ? shiftCalendarDate(cycles[index+1].starts_on,-1) : null};
}
export const quarterRangeLabel = range => range ? `${range.name}: ${range.from} through ${range.to || 'next defined cycle (open)'}` : 'No management cycle is defined for this reporting week.';
