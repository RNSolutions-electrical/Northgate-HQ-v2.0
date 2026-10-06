import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ACCOUNTING_WORKSPACE_SECTIONS,
  accountingSectionFromSearch,
  accountingSectionUrl,
} from '../src/modules/accounting/accountingNavigation.js';

test('Accounting rail mirrors the four existing views', () => {
  assert.deepEqual(
    ACCOUNTING_WORKSPACE_SECTIONS.map(({ key }) => key),
    ['budget-review', 'category-totals', 'exports', 'controls'],
  );
});

test('Accounting view URLs round-trip and invalid values return to Budget Review', () => {
  for (const { key } of ACCOUNTING_WORKSPACE_SECTIONS) {
    const search = new URL(accountingSectionUrl(key), 'https://example.test').search;
    assert.equal(accountingSectionFromSearch(search), key);
  }
  assert.equal(accountingSectionFromSearch(''), 'budget-review');
  assert.equal(accountingSectionFromSearch('?view=unknown'), 'budget-review');
  assert.equal(accountingSectionUrl('unknown'), '/accounting?view=budget-review');
});

test('Accounting keeps Category Totals content while removing only the top summary strip', () => {
  const source = readFileSync(new URL('../src/modules/accounting/AccountingWorkspace.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<div className="summary-grid">/);
  assert.match(source, /className="accounting-category-grid"/);
  assert.match(source, /title="Budget Review"/);
});
