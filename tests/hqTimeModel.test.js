import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLASSIFICATIONS, durationLabel, emptyTimeEntry, entryPayload, formFromEntry, localTimeCandidates, summarizeEntries } from '../src/modules/hq-time/hqTimeModel.js';
import { findModule, isModulePermitted, permittedNavigationGroups } from '../src/modules/registry.js';

const form = (extra = {}) => ({ ...emptyTimeEntry(new Date('2026-11-06T15:00:00Z'), 'America/New_York'), activity: 'HQ work',
  start: '2026-11-06T10:00', end: '2026-11-06T11:30', classification: 'outside_hours', ...extra });
test('elapsed and focused time remain separate, including a zero estimate', () => {
  const data = entryPayload(form({ focused_minutes: '45' }));
  assert.equal(data.started_at, '2026-11-06T15:00:00.000Z');
  assert.equal(data.ended_at, '2026-11-06T16:30:00.000Z');
  assert.equal(data.focused_minutes, 45);
  assert.equal(entryPayload(form({ focused_minutes: '0' })).focused_minutes, 0);
  assert.equal(entryPayload(form()).focused_minutes, null);
  assert.throws(() => entryPayload(form({ focused_minutes: '91' })), /Focused time/);
});
test('overnight sessions preserve explicit dates', () => {
  const data = entryPayload(form({ start: '2026-11-06T23:00', end: '2026-11-07T01:00' }));
  assert.equal((Date.parse(data.ended_at) - Date.parse(data.started_at)) / 60000, 120);
  assert.throws(() => entryPayload(form({ end: '2026-11-06T09:00' })), /End must/);
});
test('missing DST times are rejected and repeated hours need an explicit choice', () => {
  assert.deepEqual(localTimeCandidates('2026-03-08T02:30', 'America/New_York'), []);
  assert.deepEqual(localTimeCandidates('2026-11-01T01:30', 'America/New_York'), ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
  const repeated = form({ start: '2026-11-01T01:30', end: '2026-11-01T02:30' });
  assert.throws(() => entryPayload(repeated), /first or second/);
  assert.equal(entryPayload({ ...repeated, start_occurrence: '1' }).started_at, '2026-11-01T06:30:00.000Z');
});
test('active timer and not-yet-classified session are distinct from zero duration', () => {
  const data = entryPayload(form({ end: '', classification: '' }));
  assert.equal(data.ended_at, null); assert.equal(data.classification, null);
  assert.throws(() => entryPayload(form({ end: '', focused_minutes: '20' })), /after clocking out/);
  assert.equal(formFromEntry({ ...data, elapsed_minutes: null }).end, '');
});
test('saved timestamps round-trip in the recorded time zone across browsers', () => {
  const data = entryPayload(form());
  assert.deepEqual(entryPayload(formFromEntry(data)), data);
});
test('multiple item statuses do not multiply session hours', () => {
  const work_items = ['underway', 'completed', 'discarded'].map((status, index) => ({ id: `00000000-0000-4000-8000-00000000000${index}`, title: status, status, notes: '' }));
  const data = entryPayload(form({ work_items, accomplishments: 'Done one', next_steps: 'Review another' }));
  assert.equal(data.work_items.length, 3);
  assert.equal(data.work_items[2].status, 'discarded');
  assert.deepEqual(summarizeEntries([{ ...data, elapsed_minutes: 90, focused_minutes: 45 }, { ...data, elapsed_minutes: 50, focused_minutes: 10, archived_at: '2026-11-07' }]), { elapsed: 90, outside: 90, focused: 45, estimated: 1 });
  assert.equal(durationLabel(90), '1h 30m');
  assert.deepEqual(Object.keys(CLASSIFICATIONS), ['scheduled', 'outside_hours']);
});
test('tool navigation and route use the same fail-closed server-derived gate', () => {
  const module = findModule('hq-time');
  assert.equal(isModulePermitted(module, { canAccessDeveloper: true }), false);
  assert.equal(isModulePermitted(module, { canTrackHqTime: 'true' }), false);
  assert.equal(isModulePermitted(module, { canTrackHqTime: true }), true);
  assert.ok(permittedNavigationGroups({ canTrackHqTime: true }).find((group) => group.key === 'developer-tools'));
  const hook = readFileSync(new URL('../src/hooks/usePermissions.js', import.meta.url), 'utf8');
  assert.match(hook, /current_user_can_track_hq_time/);
  assert.match(hook, /!timeError && timeAccess === true/);
});
test('editing notes preserves precise server timer timestamps', () => {
  const saved = { ...entryPayload(form()), started_at: '2026-11-06T15:00:23.456789Z', ended_at: null };
  const editable = formFromEntry(saved);
  editable.notes = 'Update while timer runs';
  const payload = entryPayload(editable);
  assert.equal(payload.started_at, '2026-11-06T15:00:23.456789Z');
});
test('changing a saved repeated-hour occurrence changes the instant intentionally', () => {
  const original = entryPayload(form({ start: '2026-11-01T01:30', start_occurrence: '0', end: '2026-11-01T02:30' }));
  const editable = formFromEntry(original);
  editable.start_occurrence = '1';
  assert.equal(entryPayload(editable).started_at, '2026-11-01T06:30:00.000Z');
});
