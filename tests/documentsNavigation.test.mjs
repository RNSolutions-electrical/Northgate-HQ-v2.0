import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOCUMENT_WORKSPACE_SECTIONS,
  documentsSectionFromSearch,
  documentsSectionUrl,
} from '../src/modules/documents/documentsNavigation.js';

test('document workspace rail mirrors the existing section set', () => {
  assert.deepEqual(DOCUMENT_WORKSPACE_SECTIONS.map(({ key }) => key), ['index', 'checklist', 'owners', 'controls']);
});

test('document section URLs round-trip and invalid values return to index', () => {
  for (const { key } of DOCUMENT_WORKSPACE_SECTIONS) {
    assert.equal(documentsSectionFromSearch(new URL(documentsSectionUrl(key), 'https://example.test').search), key);
  }
  assert.equal(documentsSectionFromSearch(''), 'index');
  assert.equal(documentsSectionFromSearch('?view=unknown'), 'index');
  assert.equal(documentsSectionUrl('unknown'), '/documents?view=index');
});
