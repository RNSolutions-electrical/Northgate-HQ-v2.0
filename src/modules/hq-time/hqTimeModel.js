export const CLASSIFICATIONS = Object.freeze({ scheduled: 'Scheduled work hours', outside_hours: 'Outside scheduled hours' });

export function localDateTime(instant = new Date(), zone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// Enumerate real instants instead of silently normalizing a missing DST hour or
// choosing one of two repeated hours. Also works when reviewing from a new zone.
export function localTimeCandidates(value, zone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return [];
  const wall = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wall)) return [];
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = wall + hours * 3600000;
    offsets.add(Date.parse(`${localDateTime(sample, zone)}:00Z`) - sample);
  }
  return [...offsets].map((offset) => wall - offset)
    .filter((instant) => localDateTime(instant, zone) === value)
    .sort((a, b) => a - b).map((instant) => new Date(instant).toISOString());
}

export function emptyTimeEntry(now = new Date(), zone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const start = localDateTime(now, zone);
  return { entry_date: start.slice(0, 10), activity: '', start, end: '', start_occurrence: '', end_occurrence: '',
    classification: '', focused_minutes: '', notes: '', accomplishments: '', next_steps: '', work_items: [], time_zone: zone };
}

export function formFromEntry(row) {
  const zone = row.time_zone || 'UTC';
  const start = localDateTime(row.started_at, zone), end = row.ended_at ? localDateTime(row.ended_at, zone) : '';
  const startOccurrence = String(localTimeCandidates(start, zone).findIndex((instant) => Math.floor(Date.parse(instant)/60000) === Math.floor(Date.parse(row.started_at)/60000)));
  const endOccurrence = row.ended_at ? String(localTimeCandidates(end, zone).findIndex((instant) => Math.floor(Date.parse(instant)/60000) === Math.floor(Date.parse(row.ended_at)/60000))) : '';
  return { entry_date: row.entry_date, activity: row.activity, start, end,
    original_start: start, original_end: end, started_at: row.started_at, ended_at: row.ended_at,
    start_occurrence: startOccurrence, end_occurrence: endOccurrence,
    original_start_occurrence: startOccurrence, original_end_occurrence: endOccurrence,
    classification: row.classification || '', focused_minutes: row.focused_minutes ?? '', notes: row.notes || '',
    accomplishments: row.accomplishments || '', next_steps: row.next_steps || '', work_items: row.work_items || [], time_zone: zone };
}

function instantFor(form, name) {
  const originalInstant = name === 'start' ? form.started_at : form.ended_at;
  if (originalInstant && form[name] === form[`original_${name}`] && form[`${name}_occurrence`] === form[`original_${name}_occurrence`]) return originalInstant;
  const candidates = localTimeCandidates(form[name], form.time_zone);
  if (!candidates.length) throw new Error(`Choose a valid ${name} date and time. This time may fall in a daylight-saving gap.`);
  if (candidates.length > 1 && !['0', '1'].includes(form[`${name}_occurrence`])) {
    throw new Error(`Choose the first or second occurrence of the repeated ${name} time.`);
  }
  return candidates[candidates.length > 1 ? Number(form[`${name}_occurrence`]) : 0];
}

export function entryPayload(form) {
  const activity = form.activity.trim();
  if (!activity || activity.length > 200) throw new Error('Enter an activity of 1–200 characters.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.entry_date)
      || new Date(`${form.entry_date}T00:00:00Z`).toISOString().slice(0, 10) !== form.entry_date) throw new Error('Choose a valid log date.');
  if (form.classification && !CLASSIFICATIONS[form.classification]) throw new Error('Choose a valid hours classification.');
  const started_at = instantFor(form, 'start'), ended_at = form.end ? instantFor(form, 'end') : null;
  const elapsed = ended_at ? (Date.parse(ended_at) - Date.parse(started_at)) / 60000 : Infinity;
  if (elapsed <= 0) throw new Error('End must be after start. For overnight work, change the end date.');
  const focused = form.focused_minutes === '' ? null : Number(form.focused_minutes);
  if (focused !== null && !ended_at) throw new Error('Add a focused-time estimate after clocking out.');
  if (focused !== null && (!Number.isFinite(focused) || focused < 0 || focused > elapsed)) throw new Error('Focused time must be between zero and elapsed minutes, or left blank.');
  if ([form.notes, form.accomplishments, form.next_steps].some((value) => value.length > 5000)) throw new Error('Keep each note section within 5,000 characters.');
  if (form.work_items.length > 50) throw new Error('Use at most 50 work items per session.');
  const work_items = form.work_items.map((item) => {
    if (!item.title.trim() || item.title.length > 200) throw new Error('Each work item needs a title of 1–200 characters.');
    if (!['underway', 'completed', 'discarded'].includes(item.status)) throw new Error('Choose a valid work-item status.');
    if (item.notes.length > 2000) throw new Error('Keep each work-item note within 2,000 characters.');
    return { ...item, title: item.title.trim(), notes: item.notes.trim() };
  });
  return { entry_date: form.entry_date, activity, started_at, ended_at, classification: form.classification || null,
    focused_minutes: focused, notes: form.notes.trim(), accomplishments: form.accomplishments.trim(), next_steps: form.next_steps.trim(),
    work_items, time_zone: form.time_zone };
}

export function durationLabel(minutes) {
  const value = Math.round(Number(minutes) || 0);
  return `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, '0')}m`;
}

export function summarizeEntries(rows) {
  return rows.filter((row) => !row.archived_at).reduce((sum, row) => ({
    elapsed: sum.elapsed + Number(row.elapsed_minutes),
    outside: sum.outside + (row.classification === 'outside_hours' ? Number(row.elapsed_minutes) : 0),
    focused: sum.focused + Number(row.focused_minutes || 0),
    estimated: sum.estimated + (row.focused_minutes === null ? 0 : 1),
  }), { elapsed: 0, outside: 0, focused: 0, estimated: 0 });
}
