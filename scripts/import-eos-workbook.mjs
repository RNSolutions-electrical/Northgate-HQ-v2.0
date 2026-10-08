/**
 * Staging-only, idempotent import of the supplied 2026 workbook extraction.
 * Usage: node scripts/import-eos-workbook.mjs --dry-run
 *        EOS_STAGING_URL=... EOS_STAGING_SERVICE_KEY=... node scripts/import-eos-workbook.mjs --apply
 * No production URL is accepted. Never print credentials.
 */
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const seed = JSON.parse(await readFile(new URL('../src/modules/eos/workbookSeed.json', import.meta.url), 'utf8'));
const sourceNames = { General: '2026 Pursuits&Estimates', Electrical: '2026 Electrical Pursuits' };
const sourceRows = seed.rows.filter((row) => row.name?.trim() && sourceNames[row.source]);
const unresolved = {
  managerLabels: [...new Set(sourceRows.flatMap((row) => row.managers || []))].sort(),
  ambiguousClients: seed.clients.filter((client) => /\b(and|\/|&)\b|\bGRR\b|\bAlex\b|\bPete\b|Kyle/i.test(client.name)).map((client) => client.name),
  jobNumbers: sourceRows.filter((row) => row.job).map((row) => row.job),
};
const report = { batch: 'eos-workbook-2026-20261006', rows: sourceRows.length,
  general: sourceRows.filter((row) => row.source === 'General').length,
  electrical: sourceRows.filter((row) => row.source === 'Electrical').length,
  ...unresolved };
if (process.argv.includes('--dry-run')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(0);
}
if (!process.argv.includes('--apply')) throw new Error('Use --dry-run or --apply explicitly.');
const url = process.env.EOS_STAGING_URL;
const key = process.env.EOS_STAGING_SERVICE_KEY;
const expectedRef = process.env.EOS_EXPECTED_STAGING_REF;
// This is the established isolated Staging project. A caller-supplied ref
// alone would not be a safe guard against accidentally targeting Production.
const STAGING_REF = 'fazfwzbuesvzhgodckiw';
if (!url || !key || !expectedRef || new URL(url).hostname !== `${expectedRef}.supabase.co`
    || expectedRef !== STAGING_REF) {
  throw new Error('A matching explicit staging project reference, URL and service key are required.');
}
const client = createClient(url, key, { auth: { persistSession: false } });
const check = (response) => { if (response.error) throw response.error; return response.data; };

// Preserve exact source labels; do not infer a surname or merge ambiguous names.
const clientIds = new Map();
for (const contact of seed.clients) {
  const existing = check(await client.from('eos_clients').select('id')
    .eq('source_label', contact.name).limit(1));
  const id = existing[0]?.id || check(await client.from('eos_clients').insert({
    display_name: contact.name, source_label: contact.name,
    company: contact.company || null, phone: contact.phone || null,
    email: contact.email || null, address: contact.address || null,
    notes: contact.notes || null, created_by: 'workbook-import',
  }).select('id').single()).id;
  clientIds.set(contact.id, id);
}

const unresolvedJobs = [];
for (const row of sourceRows) {
  let jobId = null;
  if (row.job) {
    const matches = check(await client.from('jobs').select('id').eq('job_number', row.job).limit(2));
    if (matches.length === 1) jobId = matches[0].id;
    else unresolvedJobs.push({ source: row.source, sourceRow: row.sourceRow, jobNumber: row.job });
  }
  const payload = {
    source_sheet: sourceNames[row.source], source_row: row.sourceRow,
    source_batch: report.batch, project_name: row.name.trim(),
    client_id: clientIds.get(row.client) || null, discussion: row.notes || null,
    phase: row.phase || null, planning_value: row.value ?? null,
    probability: row.probability ?? null, potential_start_date: row.start || null,
    go_no_go: row.go || null, initial_meeting: row.initial || null,
    source_manager_labels: row.managers || [], original_stage: row.originalPhase || null,
    original_job_number: row.job || null, job_id: jobId, created_by: 'workbook-import',
  };
  // Do not overwrite any later human edits on repeat import.
  const existing = check(await client.from('eos_pursuits').select('id')
    .eq('source_sheet', payload.source_sheet).eq('source_row', payload.source_row).limit(1));
  if (!existing.length) check(await client.from('eos_pursuits').insert(payload));
}
process.stdout.write(`${JSON.stringify({ ...report, unresolvedJobs }, null, 2)}\n`);
