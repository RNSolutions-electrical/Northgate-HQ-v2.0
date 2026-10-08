export const EOS_STATUS = Object.freeze({ ACTIVE: 'Active', DORMANT: 'Dormant' });
export const EOS_VIEWS = Object.freeze(['Active', 'No Go', 'Dormant', 'Awards']);
export const EOS_MODULES = Object.freeze([
  { key: 'pursuits', label: 'Project Pursuit Tracker', available: true },
  { key: 'go-no-go', label: 'Go/No Go Tracker', available: false },
  { key: 'scorecard', label: 'Company Scorecard', available: false },
]);

export function differentReminderIndex(items, previousId, random = Math.random) {
  if (!items.length) return 0;
  const choices = items.map((_, index) => index)
    .filter((index) => items.length === 1 || items[index].id !== previousId);
  return choices[Math.floor(random() * choices.length)];
}

export function shiftCalendarDate(dateOnly, days) {
  if (!dateOnly) return null;
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function meetingDatePatch(initialMeeting) {
  return {
    initial_meeting: initialMeeting || null,
    follow_up_7_day: shiftCalendarDate(initialMeeting, 7),
    meeting_2_week: shiftCalendarDate(initialMeeting, 14),
  };
}

export function companyToday(now = new Date(), timeZone = 'America/New_York') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isOverdueStart(row, today = companyToday()) {
  return row.status === EOS_STATUS.ACTIVE && row.phase !== 'Awarded'
    && Boolean(row.potential_start_date) && row.potential_start_date < today;
}

export function inView(row, view) {
  if (row.deleted_at) return false;
  if (view === 'Awards') return row.phase === 'Awarded';
  if (view === 'Dormant') return row.status === EOS_STATUS.DORMANT && row.phase !== 'Awarded';
  if (view === 'No Go') return row.status === EOS_STATUS.ACTIVE && row.go_no_go === 'No Go' && row.phase !== 'Awarded';
  return row.status === EOS_STATUS.ACTIVE && row.phase !== 'Awarded' && row.go_no_go !== 'No Go';
}

export function summarizePursuits(rows) {
  const eligible = rows.filter((row) => inView(row, 'Active'));
  const card = (filtered) => ({
    count: filtered.length,
    value: filtered.reduce((sum, row) => sum + (row.planning_value == null ? 0 : Number(row.planning_value)), 0),
    missing: filtered.filter((row) => row.planning_value == null).length,
  });
  const pursuits = eligible.filter((row) => row.phase === 'Pursuit');
  const estimates = eligible.filter((row) => row.phase === 'Estimate');
  const awards = rows.filter((row) => !row.deleted_at && row.phase === 'Awarded');
  return {
    estimates: card(estimates), pursuits: card(pursuits),
    likely: card(pursuits.filter((row) => row.probability != null && Number(row.probability) > 50)),
    awards: card(awards),
    weighted: [...pursuits, ...estimates].reduce((sum, row) =>
      sum + (row.planning_value == null || row.probability == null ? 0
        : Number(row.planning_value) * Number(row.probability) / 100), 0),
    overdue: eligible.filter((row) => isOverdueStart(row)).length,
    missingProbability: [...pursuits, ...estimates].filter((row) => row.probability == null).length,
    missingPhase: eligible.filter((row) => row.phase == null).length,
  };
}

export function sortPursuits(rows, field, direction, labelForManager = () => '') {
  const sign = direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const value = (row) => field === 'manager' ? labelForManager(row)
      : field === 'client' ? row.eos_clients?.display_name : row[field];
    const left = value(a); const right = value(b);
    if (left == null || left === '') return right == null || right === '' ? 0 : 1;
    if (right == null || right === '') return -1;
    if (['planning_value', 'probability'].includes(field)) return sign * (Number(left) - Number(right));
    return sign * String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
  });
}
