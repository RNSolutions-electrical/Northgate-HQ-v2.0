import assert from 'node:assert/strict';
import test from 'node:test';
import { estimatesSectionFromLocation, estimatesSectionUrl, visibleEstimatesSections } from './estimatesNavigation.js';

test('Estimating rail includes only destinations allowed by the current authority', () => {
  const estimator = { canEstimate: true, canApproveEstimates: false, canSavePersonalWork: true };
  assert.deepEqual(visibleEstimatesSections(estimator).map(({ key }) => key), ['official', 'personal', 'assemblies']);
  assert.deepEqual(visibleEstimatesSections({ canSavePersonalWork: true }).map(({ key }) => key), ['personal']);
  assert.deepEqual(visibleEstimatesSections({ canApproveEstimates: true }).map(({ key }) => key), ['official', 'personal', 'review', 'assemblies']);
});

test('Estimating routes select the matching rail destination', () => {
  const reviewer = { canApproveEstimates: true };
  assert.equal(estimatesSectionFromLocation('/estimates', '', reviewer), 'official');
  assert.equal(estimatesSectionFromLocation('/estimates', '', reviewer, { reviewMode: true }), 'review');
  assert.equal(estimatesSectionFromLocation('/estimates', '?view=personal', reviewer, { reviewMode: true }), 'personal');
  assert.equal(estimatesSectionFromLocation('/estimates/assemblies', '', reviewer), 'assemblies');
  assert.equal(estimatesSectionFromLocation('/estimates', '?view=review', { canSavePersonalWork: true }), 'personal');
  assert.equal(estimatesSectionUrl('review'), '/estimates?view=review');
  assert.equal(estimatesSectionUrl('assemblies'), '/estimates/assemblies');
});
