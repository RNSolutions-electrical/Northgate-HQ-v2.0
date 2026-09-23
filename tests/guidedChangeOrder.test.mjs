import assert from 'node:assert/strict';
import test from 'node:test';
import { guidedDraftLines, guidedInternalNotes, guidedMissing, newGuidedChangeOrder } from '../src/modules/silas/guidedChangeOrder.mjs';

test('guided Change Order starts incomplete and creates no priced line', () => {
  const state = newGuidedChangeOrder();
  assert.equal(state.workflow, 'change_order');
  assert.deepEqual(guidedDraftLines(state), []);
  assert.ok(guidedMissing(state).some((item) => item.includes('final Change Order number')));
});

test('guided lines use existing Change Order breakdown fields and keep internal details private', () => {
  const state = newGuidedChangeOrder();
  state.items[0] = { ...state.items[0], title: 'Install outlet', scope: 'Add 20 A outlet', materials: 'Cable and box', labor: 'Two hours', materialAmount: '12.50', laborAmount: '80', schedule: 'One day' };
  const [line] = guidedDraftLines(state);
  assert.equal(line.material_amount, 12.5);
  assert.equal(line.labor_amount, 80);
  assert.equal(line.job_budget_line_id, null);
  assert.match(line.description, /Schedule: One day/);
  assert.doesNotMatch(line.description, /Cable and box|Two hours/);
  assert.match(guidedInternalNotes(state), /Line 1 materials: Cable and box/);
});

test('explicit zero is addressed while an empty applicable cost remains on the checklist', () => {
  const state = newGuidedChangeOrder();
  state.coNumber = 'CO-009';
  state.title = 'Owner change';
  state.scope = 'Add an outlet';
  state.items[0] = { ...state.items[0], title: 'Outlet', scope: 'Install outlet', materialAmount: '0', addressed: { labor: true, equipment: true } };
  assert.deepEqual(guidedMissing(state), []);
  state.items[0].materialAmount = '';
  assert.ok(guidedMissing(state).some((item) => item.includes('materials')));
});
