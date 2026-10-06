import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('Reports opens directly to its workspace content without the redundant summary strip', () => {
  const source = readFileSync(new URL('../src/modules/reports/ReportsWorkspace.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<div className="summary-grid">/);
  assert.doesNotMatch(source, /<SummaryCard\b/);
  assert.match(source, /title="Report library"/);
  assert.match(source, /title="Effective access snapshot"/);
});
