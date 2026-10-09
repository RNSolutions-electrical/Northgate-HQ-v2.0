import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planEosProductionImport } from '../src/modules/eos/eosProductionImportPlan.js';

const seed = JSON.parse(await readFile(new URL('../src/modules/eos/workbookSeed.json', import.meta.url), 'utf8'));

test('Production EOS plan preserves every source pursuit without inferred links', () => {
  const plan = planEosProductionImport(seed);
  assert.deepEqual(plan.counts, {
    pursuits: 41, general: 33, electrical: 8, clients: 29,
    blankClients: 8, sourceJobNumbersRetainedOnly: 5,
    linkedJobs: 0, assignedManagers: 0,
  });
  assert.ok(plan.pursuits.every((row) => row.job_id === null && row.manager_ids.length === 0));
  assert.ok(plan.pursuits.filter((row) => row.original_job_number).every((row) => row.job_id === null));
  assert.ok(plan.clients.every((client) => client.source_label === client.display_name));
  assert.ok(plan.pursuits.filter((row) => row.phase === 'Awarded').every((row) => row.phase_before_award === null));
});

test('Production EOS plan rejects source identity collisions and unknown clients', () => {
  const duplicate = structuredClone(seed);
  duplicate.rows.push({ ...duplicate.rows[0] });
  assert.throws(() => planEosProductionImport(duplicate), /Duplicate EOS source identity/);
  const unknown = structuredClone(seed);
  unknown.rows[0].client = 'missing-client';
  assert.throws(() => planEosProductionImport(unknown), /Unknown EOS source client/);
});
