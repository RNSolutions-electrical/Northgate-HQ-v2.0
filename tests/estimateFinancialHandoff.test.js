import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260921134103_fix_financial_template_and_estimate_budget_mapping.sql',import.meta.url),'utf8');
const route=fs.readFileSync(new URL('../src/modules/estimates/workbench/WorkbenchRoute.jsx',import.meta.url),'utf8');
const form=fs.readFileSync(new URL('../src/modules/estimates/workbench/EstimateHandoff.jsx',import.meta.url),'utf8');

test('estimate job handoff uses the atomic idempotent financial mapper',()=>{
 assert.match(route,/submit_estimate_for_review_v2/);
 assert.match(migration,/UNIQUE \(handoff_id, bucket_key\)/);
 assert.match(migration,/budget_amount=budget_amount\+amount/);
 assert.match(migration,/Estimate financial allocations do not reconcile to the estimate total/);
 assert.match(migration,/current_user_can_edit_job\(saved\.job_id,'can_approve_budget'\)/);
});

test('estimate job handoff requires visible cost-code assignments',()=>{
 assert.match(form,/Assign estimate costs to Job Financials/);
 assert.match(form,/Shared financial catalogue/);
 assert.match(form,/financialBuckets\.every\(bucket=>financialTargets\[bucket\.key\]\)/);
});

test('system managed change-order lines no longer require a user reason',()=>{
 assert.match(migration,/system_co_sync/);
 assert.match(migration,/System-managed change-order allocation line\./);
 assert.match(migration,/AND NOT system_co_sync/);
});
