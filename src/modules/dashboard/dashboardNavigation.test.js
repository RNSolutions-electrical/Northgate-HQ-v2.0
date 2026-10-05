import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardSections, dashboardSectionFromSearch, dashboardSectionUrl } from './dashboardNavigation.js';

test('dashboard tree exposes only real section destinations and scopes estimate review', () => {
  const user = { permissionSource: 'server', canEstimate: false, canApproveEstimates: false };
  const basic = dashboardSections(user);
  assert.deepEqual(basic.map((section) => section.key), ['my-info', 'my-work', 'my-vehicles', 'my-tools']);
  assert.equal(basic.some((section) => section.key === 'personal-tools' || section.key === 'my-preferences'), false);
  assert.deepEqual(basic.find((section) => section.key === 'my-work').children.map((child) => child.key), ['assigned-jobs', 'buyout-attention']);
  const reviewer = dashboardSections({ ...user, canApproveEstimates: true });
  assert.deepEqual(reviewer.find((section) => section.key === 'my-estimates').children.map((child) => child.key), ['assigned-estimates', 'estimate-review']);
  const estimator = dashboardSections({ ...user, canEstimate: true });
  assert.deepEqual(estimator.find((section) => section.key === 'my-estimates').children.map((child) => child.key), ['assigned-estimates']);
});

test('dashboard URL selection falls back safely and supports linked child sections', () => {
  const user = { permissionSource: 'server', canEstimate: false, canApproveEstimates: false };
  assert.equal(dashboardSectionFromSearch('?view=my-work', user), 'my-work');
  assert.equal(dashboardSectionFromSearch('?view=my-estimates', user), 'my-info');
  assert.equal(dashboardSectionFromSearch('?view=unknown', user), 'my-info');
  assert.equal(dashboardSectionUrl('my-work', 'assigned-jobs'), '/dashboard?view=my-work#assigned-jobs');
});
