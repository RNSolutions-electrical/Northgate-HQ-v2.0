import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260918184924_pay_app_correction_workflows.sql', import.meta.url), 'utf8');
const billingUi = readFileSync(new URL('../src/modules/jobs/BillingActions.jsx', import.meta.url), 'utf8');

test('historical Pay App finalization is gated by Developer Data Correction and certification', () => {
  assert.match(migration, /current_user_can_correct_job_billing_data\(app\.job_id\)/);
  assert.match(migration, /i certify this matches the historical billing record/i);
  assert.match(migration, /Historical Pay Apps must be entered in billing order/);
});

test('billed Pay Apps cannot be hard deleted', () => {
  assert.match(migration, /Billed Pay Apps are immutable\. Use a correction or reversal\./);
  assert.match(migration, /app\.status='billed' OR app\.billed_at IS NOT NULL OR app\.finalization_key IS NOT NULL/);
});

test('unbilled deletion retains an audit backup', () => {
  assert.match(migration, /'lines',COALESCE/);
  assert.match(migration, /'change_orders',COALESCE/);
  assert.match(migration, /'job_pay_applications',app\.id::text,'delete',backup,reason/);
});

test('normal workflow exposes correction actions and the required correction reason', () => {
  assert.match(billingUi, /Correction reason/);
  assert.match(billingUi, /Create Correction/);
  assert.match(billingUi, /Create Reversal/);
  assert.match(billingUi, /Record Historical Billed/);
  assert.match(billingUi, /Delete Unbilled Record/);
});
