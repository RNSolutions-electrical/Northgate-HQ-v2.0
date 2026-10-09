import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planEosProductionImport } from '../src/modules/eos/eosProductionImportPlan.js';
import { buildEosProductionImportSql } from '../src/modules/eos/eosProductionImportSql.js';

const seed = JSON.parse(await readFile(new URL('../src/modules/eos/workbookSeed.json', import.meta.url), 'utf8'));

test('Production EOS SQL is atomic, insert-only and preserves unlinked awarded source rows', () => {
  const sql = buildEosProductionImportSql(planEosProductionImport(seed), seed);
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(sql, /ON CONFLICT \(source_label\).*DO NOTHING/);
  assert.match(sql, /ON CONFLICT \(source_sheet,source_row\) DO NOTHING/);
  assert.match(sql, /CASE WHEN s\.phase='Awarded' THEN NULL ELSE s\.phase END/);
  assert.match(sql, /UPDATE public\.eos_pursuits p SET phase='Awarded'/);
  assert.match(sql, /p\.job_id IS NOT NULL OR p\.phase_before_award IS NOT NULL/);
  assert.doesNotMatch(sql, /INSERT INTO public\.jobs|public\.create_job\(|public\.eos_award_pursuit\(/);
  assert.doesNotMatch(sql, /INSERT INTO public\.eos_pursuit_managers/);
});

test('Production EOS SQL refuses changed source counts or automatic links', () => {
  const plan = planEosProductionImport(seed);
  plan.pursuits[0].job_id = 'unexpected';
  assert.throws(() => buildEosProductionImportSql(plan, seed), /approved 41-pursuit/);
  const changedSeed = structuredClone(seed);
  changedSeed.rows[0].name += ' changed';
  assert.throws(() => buildEosProductionImportSql(planEosProductionImport(changedSeed), changedSeed), /workbook source changed/);
});
