/**
 * Offline-only import preparation. No database connection or write mode.
 * Usage: node scripts/prepare-eos-production-import.mjs --dry-run
 *        node scripts/prepare-eos-production-import.mjs --emit-sql
 * The emitted SQL contains source client data; handle it as sensitive.
 * It still requires separate target verification and approval.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { planEosProductionImport } from '../src/modules/eos/eosProductionImportPlan.js';
import { buildEosProductionImportSql } from '../src/modules/eos/eosProductionImportSql.js';

const args = process.argv.slice(2);
if (args.length !== 1 || !['--dry-run', '--emit-sql'].includes(args[0])) {
  throw new Error('Use exactly --dry-run or --emit-sql. This script cannot execute SQL.');
}
const seed = JSON.parse(await readFile(new URL('../src/modules/eos/workbookSeed.json', import.meta.url), 'utf8'));
const plan = planEosProductionImport(seed);
if (args[0] === '--emit-sql') {
  process.stdout.write(buildEosProductionImportSql(plan, seed));
} else {
  process.stdout.write(`${JSON.stringify({
    mode: 'offline-only', batch: plan.batch,
    sourceSha256: createHash('sha256').update(JSON.stringify(seed)).digest('hex'),
    counts: plan.counts,
    awardedWithoutJobLink: plan.pursuits.filter((row) => row.phase === 'Awarded').length,
    unresolvedManagerLabels: [...new Set(plan.pursuits.flatMap((row) => row.source_manager_labels))].sort(),
  }, null, 2)}\n`);
}
