import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatedCurrentBudget, effectiveCurrentBudget, hasCurrentBudgetOverride } from '../src/modules/jobs/currentBudget.js';
import { requiresAuditReason, hasReasonCoverage, combineAuditReasons } from '../src/services/auditPolicy.js';

test('current budget includes original, approved adjustments and COs', () => {
  const line = { budget_amount: '1000', budget_change_amount: '50', forecast_final_amount: 9999 };
  assert.equal(calculatedCurrentBudget(line, 100), 1150);
  assert.equal(effectiveCurrentBudget(line, 100), 1150);
});
test('manual zero is an override; reset restores live calculation', () => {
  const line = { budget_amount: 1000, budget_change_amount: 50, current_budget_override_amount: 0 };
  assert.equal(hasCurrentBudgetOverride(line), true);
  assert.equal(effectiveCurrentBudget(line, 100), 0);
  assert.equal(effectiveCurrentBudget({ ...line, current_budget_override_amount: 1200 }, 300), 1200);
  assert.equal(effectiveCurrentBudget({ ...line, current_budget_override_amount: null }, 300), 1350);
});
test('protected edits and destructive actions cannot use routine exemptions', () => {
  assert.equal(requiresAuditReason({ action: 'update', workflow: 'financial.routine' }), false);
  assert.equal(requiresAuditReason({ action: 'update', workflow: 'financial.routine', protectedChange: true }), true);
  assert.equal(requiresAuditReason({ action: 'archive', workflow: 'financial.routine' }), true);
  assert.equal(requiresAuditReason({ action: 'permission_change', workflow: 'employee.self-profile' }), true);
  assert.equal(requiresAuditReason({ action: 'update', workflow: 'unknown' }), true);
});
test('required changes accept shared, individual, or both reasons without losing either', () => {
  assert.equal(hasReasonCoverage([{ requiresReason: true }, { requiresReason: false }], 'Approved batch'), true);
  assert.equal(hasReasonCoverage([{ requiresReason: true, reason: 'Line note' }]), true);
  assert.equal(hasReasonCoverage([{ requiresReason: true, reason: ' ' }], '\t'), false);
  assert.equal(combineAuditReasons(' batch ', ' line '), 'Batch: batch\nLine: line');
});
