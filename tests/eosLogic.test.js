import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { companyToday, differentReminderIndex, inView, isHighProbabilityOpportunity, isOverdueStart, meetingDatePatch, shiftCalendarDate, sortPursuits, summarizePursuits } from '../src/modules/eos/eosLogic.js';

test('meeting follow-ups use calendar days across month and year boundaries', () => {
  assert.deepEqual(meetingDatePatch('2026-12-27'), {
    initial_meeting: '2026-12-27', follow_up_7_day: '2027-01-03', meeting_2_week: '2027-01-10',
  });
  assert.equal(shiftCalendarDate('2028-02-28', 7), '2028-03-06');
  assert.deepEqual(meetingDatePatch(''), { initial_meeting: null, follow_up_7_day: null, meeting_2_week: null });
});

test('pipeline metrics distinguish missing and zero, strict greater than fifty, and overlapping cards', () => {
  const rows = [
    { phase: 'Pursuit', status: 'Active', probability: 50, planning_value: 100 },
    { phase: 'Pursuit', status: 'Active', probability: 50.1, planning_value: 0 },
    { phase: 'Pursuit', status: 'Active', probability: 80, planning_value: null },
    { phase: 'Estimate', status: 'Active', probability: 25, planning_value: 200 },
    { phase: 'Estimate', status: 'Active', probability: 75, planning_value: 400 },
    { phase: null, status: 'Active', probability: null, planning_value: 50 },
    { phase: 'Pursuit', status: 'Dormant', probability: 90, planning_value: 500 },
    { phase: 'Pursuit', status: 'Active', go_no_go: 'No Go', planning_value: 500 },
    { phase: 'Awarded', status: 'Active', planning_value: 300 },
  ];
  const result = summarizePursuits(rows);
  assert.deepEqual(result.pursuits, { count: 3, value: 100, missing: 1 });
  assert.deepEqual(result.likely, { count: 3, value: 400, missing: 1 });
  assert.equal(result.estimates.value, 600);
  assert.equal(result.awards.count, 1);
  assert.equal(result.weighted, 400);
  assert.equal(result.missingPhase, 1);
});

test('dormant and no-go remain accessible; today is not overdue', () => {
  assert.equal(inView({ status: 'Dormant', phase: 'Pursuit' }, 'Dormant'), true);
  assert.equal(inView({ status: 'Active', phase: 'Pursuit', go_no_go: 'No Go' }, 'No Go'), true);
  assert.equal(isOverdueStart({ status: 'Active', phase: 'Pursuit', potential_start_date: '2026-10-06' }, '2026-10-06'), false);
  assert.equal(isOverdueStart({ status: 'Active', phase: 'Pursuit', potential_start_date: '2026-10-05' }, '2026-10-06'), true);
  assert.equal(companyToday(new Date('2026-10-07T02:00:00Z')), '2026-10-06');
  const noGo = { status: 'Dormant', phase: 'Pursuit', go_no_go: 'No Go' };
  assert.equal(inView(noGo, 'Dormant'), true);
  assert.equal(inView({ ...noGo, status: 'Active' }, 'No Go'), true);
  assert.equal(inView({ ...noGo, status: 'Active' }, 'Active'), false);
  assert.equal(inView({ status: 'Active', phase: 'Awarded', job_id: 'job' }, 'Awards'), true);
});

test('a high-probability estimate leaves the active metric when awarded', () => {
  const estimate = { phase: 'Estimate', status: 'Active', probability: 75, planning_value: 400 };
  assert.equal(isHighProbabilityOpportunity(estimate), true);
  assert.equal(summarizePursuits([estimate]).likely.count, 1);
  const awarded = { ...estimate, phase: 'Awarded', job_id: 'job-1' };
  assert.equal(isHighProbabilityOpportunity(awarded), false);
  assert.equal(summarizePursuits([awarded]).likely.count, 0);
  assert.equal(summarizePursuits([awarded]).awards.count, 1);
});

test('a Job association alone does not award or remove a pursuit from pipeline metrics', () => {
  const estimate = { phase: 'Estimate', status: 'Active', probability: 75, planning_value: 400 };
  assert.deepEqual(summarizePursuits([{ ...estimate, job_id: 'job-1' }]),
    summarizePursuits([estimate]));
  assert.equal(inView({ ...estimate, job_id: 'job-1' }, 'Active'), true);
  assert.equal(inView({ ...estimate, job_id: 'job-1' }, 'Awards'), false);
});

test('numeric sort keeps nulls last in either direction', () => {
  const rows = [{ planning_value: null }, { planning_value: 5 }, { planning_value: 100 }];
  assert.deepEqual(sortPursuits(rows, 'planning_value', 'asc').map((row) => row.planning_value), [5, 100, null]);
  assert.deepEqual(sortPursuits(rows, 'planning_value', 'desc').map((row) => row.planning_value), [100, 5, null]);
  const dated = [{ potential_start_date: null }, { potential_start_date: '2027-01-01' }, { potential_start_date: '2026-12-31' }];
  assert.deepEqual(sortPursuits(dated, 'potential_start_date', 'asc').map((row) => row.potential_start_date),
    ['2026-12-31', '2027-01-01', null]);
});

test('supplied workbook extraction has 41 unique source records and no invented award probabilities', async () => {
  const seed = JSON.parse(await readFile(new URL('../src/modules/eos/workbookSeed.json', import.meta.url), 'utf8'));
  const identities = seed.rows.map((row) => `${row.source}:${row.sourceRow}`);
  assert.equal(seed.rows.length, 41);
  assert.equal(seed.rows.filter((row) => row.source === 'General').length, 33);
  assert.equal(seed.rows.filter((row) => row.source === 'Electrical').length, 8);
  assert.equal(new Set(identities).size, 41);
  assert.ok(seed.rows.filter((row) => row.phase === 'Awarded').every((row) => row.probability == null));
  assert.ok(seed.rows.some((row) => row.managers.includes('DW')));
});

test('a dashboard visit chooses a different reminder when possible', () => {
  const items = [{ id: 'first' }, { id: 'second' }];
  assert.equal(differentReminderIndex(items, 'first', () => 0), 1);
  assert.equal(differentReminderIndex(items, 'second', () => 0), 0);
  assert.equal(differentReminderIndex([items[0]], 'first', () => 0), 0);
});
