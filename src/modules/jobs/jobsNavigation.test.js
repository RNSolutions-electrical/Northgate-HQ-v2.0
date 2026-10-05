import assert from 'node:assert/strict';
import test from 'node:test';
import { JOB_DIRECTORY_SECTIONS, jobDirectorySectionFromSearch, jobDirectorySectionUrl, jobDirectoryTitle } from './jobsNavigation.js';

test('Jobs rail mirrors the existing directory filters', () => {
  assert.deepEqual(JOB_DIRECTORY_SECTIONS.map(({ key }) => key), ['active', 'on_hold', 'complete', 'cancelled', 'all']);
  assert.equal(jobDirectorySectionFromSearch(''), 'active');
  assert.equal(jobDirectorySectionFromSearch('?view=complete'), 'complete');
  assert.equal(jobDirectorySectionFromSearch('?view=unknown'), 'active');
  assert.equal(jobDirectorySectionUrl('on_hold'), '/jobs?view=on_hold');
  assert.equal(jobDirectoryTitle('active'), 'Active Jobs');
  assert.equal(jobDirectoryTitle('all'), 'All Jobs');
  assert.equal(jobDirectoryTitle('on_hold', 'service_calls'), 'On Hold Service Calls');
});
