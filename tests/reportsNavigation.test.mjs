import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPORT_WORKSPACE_SECTIONS,
  reportsSectionFromSearch,
  reportsSectionUrl,
} from '../src/modules/reports/reportsNavigation.js';

test('Reports rail mirrors the existing read-only workspace sections', () => {
  assert.deepEqual(REPORT_WORKSPACE_SECTIONS.map(({ key }) => key), ['library', 'access', 'operations']);
});

test('Reports section URLs round-trip and unknown views fail back to the library', () => {
  for (const { key } of REPORT_WORKSPACE_SECTIONS) {
    const search = new URL(reportsSectionUrl(key), 'https://example.test').search;
    assert.equal(reportsSectionFromSearch(search), key);
  }
  assert.equal(reportsSectionFromSearch(''), 'library');
  assert.equal(reportsSectionFromSearch('?view=unknown'), 'library');
  assert.equal(reportsSectionUrl('unknown'), '/reports?view=library');
});
