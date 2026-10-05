import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Production-base adjustment migration keeps PDF details and Billing lineage in one unit', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261003131058_contract_adjustment_state_model_integration.sql', import.meta.url), 'utf8');
  const stateModel = sql.indexOf('ALTER TABLE public.change_orders ADD COLUMN record_type');
  const detailBridge = sql.indexOf('CREATE OR REPLACE FUNCTION public.save_contract_adjustment(p_data jsonb)', stateModel);
  const billingLineage = sql.indexOf('CREATE FUNCTION public.billing_contract_adjustments', detailBridge);
  assert.ok(stateModel >= 0 && detailBridge > stateModel && billingLineage > detailBridge);
  assert.match(sql.slice(detailBridge), /saved:=public\.save_job_change_order_draft_with_client_details\(/);
  assert.match(sql.slice(detailBridge), /sort_order,actor_id,actor_id,client_breakdown FROM public\.change_order_lines/);
  assert.match(sql, /target\.record_type/);
  assert.doesNotMatch(sql, /UPDATE public\.job_budget_lines SET budget_amount/i);
});

test('Billing rejects unreconciled historical postings and voiding an approved revision ancestor', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261003131058_contract_adjustment_state_model_integration.sql', import.meta.url), 'utf8');
  assert.match(sql, /sum\(amount_delta\) FROM public\.change_order_financial_postings WHERE change_order_id=ANY\(family\.members\)\) IS DISTINCT FROM approved_value/);
  assert.match(sql, /Void the latest approved revision first; an earlier version cannot be reversed beneath an active revision\./);
  assert.match(sql, /This adjustment has an audited financial reconciliation\. Review and reverse that posting through a controlled correction before voiding\./);
  assert.match(sql, /PERFORM public\.validate_pay_app_contract_basis\(app\.id\)/);
});

test('CO9 repair stays separate and preserves immutable financial history', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261003131120_reconcile_carolina_retina_co9_revision.sql', import.meta.url), 'utf8');
  const rehearsal = await readFile(new URL('../docs/reviews/CO9_RECONCILIATION_REHEARSAL_20261002.sql', import.meta.url), 'utf8');
  assert.equal(sql.slice(sql.indexOf('DO $guard$')), rehearsal.slice(rehearsal.indexOf('DO $guard$')));
  assert.match(sql, /Run after 20261003131058_contract_adjustment_state_model_integration/);
  assert.match(sql, /revision_co\.status<>'approved'/);
  assert.match(sql, /root_co\.status<>'voided'/);
  assert.match(sql, /posting_kind='reconciliation'/);
  assert.match(sql, /INSERT INTO public\.change_logs/);
  assert.match(sql, /IF posting_count<>3 OR family_net<>0 THEN/);
  assert.match(sql, /RETURN; -- Proven idempotent/);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM) public\.(?:change_order_financial_postings|job_budget_lines|job_pay_applications|job_pay_application_change_orders)/i);
});
