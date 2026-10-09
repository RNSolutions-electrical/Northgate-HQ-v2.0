/** Read-only source manifest. This script cannot connect to or write a database. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { planEosProductionImport } from '../src/modules/eos/eosProductionImportPlan.js';

if (process.argv.slice(2).some((arg) => arg !== '--dry-run')) {
  throw new Error('Only --dry-run is supported. This script has no database write mode.');
}
const seed = JSON.parse(await readFile(new URL('../src/modules/eos/workbookSeed.json', import.meta.url), 'utf8'));
const plan = planEosProductionImport(seed);
const sourceHash = createHash('sha256').update(JSON.stringify(seed)).digest('hex');
process.stdout.write(`${JSON.stringify({
  mode: 'read-only', batch: plan.batch, sourceSha256: sourceHash,
  counts: plan.counts,
  unresolvedManagerLabels: [...new Set(plan.pursuits.flatMap((row) => row.source_manager_labels))].sort(),
  originalJobNumbers: plan.pursuits.map((row) => row.original_job_number).filter(Boolean),
}, null, 2)}\n`);
