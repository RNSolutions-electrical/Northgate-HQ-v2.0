import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync(new URL('../src/modules/jobs/JobsWorkspace.jsx', import.meta.url), 'utf8');
const categories = readFileSync(new URL('../src/modules/documents/documentCategories.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260923195722_job_cost_report_documents.sql', import.meta.url), 'utf8');

test('financial import preserves its source file in Job Documents and audit metadata', () => {
  const flow = workspace.slice(workspace.indexOf('async function handleBudgetImport(event)'), workspace.indexOf('function nextScheduleSortOrder()'));
  assert.match(categories, /key: 'cost_reports', label: 'Cost Reports'/);
  assert.match(flow, /document_type: 'cost_reports'/);
  assert.match(flow, /document_id: uploadedDocument\.id/);
  assert.ok(flow.indexOf(".from('documents').insert") < flow.indexOf(".rpc('save_job_financial_batch'"));
  assert.ok(flow.indexOf('.upload(storagePath, budgetImport.file') < flow.indexOf(".rpc('save_job_financial_batch'"));
  assert.match(flow, /source report remains in Documents; no financial values were changed/);
});

test('cost report metadata and file reads require protected project financial access', () => {
  assert.match(migration, /CREATE POLICY job_cost_reports_visibility ON public\.documents\s+AS RESTRICTIVE FOR SELECT/);
  assert.match(migration, /CREATE POLICY job_cost_reports_storage_visibility ON storage\.objects\s+AS RESTRICTIVE FOR SELECT/);
  assert.match(migration, /current_user_can_access_job\(owner_id, 'can_view_protected_project_financials'\)/);
  assert.match(migration, /current_user_can_edit_job\(owner_id, 'can_approve_budget'\)/);
});
