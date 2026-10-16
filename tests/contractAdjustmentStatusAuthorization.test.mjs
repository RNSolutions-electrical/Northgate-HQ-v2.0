import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const patch = read('docs/reviews/CONTRACT_ADJUSTMENT_STATUS_AUTHORIZATION_PATCH.sql');
const original = read('supabase/migrations/20261003131058_contract_adjustment_state_model_integration.sql');

test('every record-return path follows financial visibility and canonical action checks', () => {
  const visibility = patch.indexOf('current_user_can_read_project_change_order(prior.job_id,prior.id) IS NOT TRUE');
  const authority = patch.indexOf('current_user_can_edit_job(prior.job_id,required_permission) IS NOT TRUE');
  const canonical = patch.indexOf("COALESCE((decision->>'allowed')::boolean,false) IS NOT TRUE");
  const firstReturn = patch.indexOf('THEN RETURN');
  assert.ok(visibility > 0 && authority > visibility && canonical > authority && firstReturn > canonical);
  assert.match(patch, /current_scoped_authorization_decision\(action_id,jsonb_build_object\('job_id',prior.job_id\)\)/);
  assert.ok(patch.indexOf('prior.updated_at<>p_expected_updated_at') < firstReturn);
});

test('authorized no-op returns before delegated actions, writes and audits', () => {
  const retry = patch.indexOf('IF p_status=prior.status THEN RETURN prior; END IF;');
  for (const marker of ['RETURN public.approve_job_change_order', 'RETURN public.submit_job_change_order', 'UPDATE public.change_orders', 'INSERT INTO public.change_logs']) {
    assert.ok(patch.indexOf(marker) > retry, marker);
  }
  // Actual financial mutation/audit tail is unchanged, rather than recreated.
  const tail = text => text.slice(text.indexOf(' UPDATE public.change_orders SET status=p_status'), text.indexOf('\nCREATE OR REPLACE FUNCTION public.deny_job_change_order') > 0 ? text.indexOf('\nCREATE OR REPLACE FUNCTION public.deny_job_change_order') : undefined).trim();
  assert.equal(tail(patch), tail(original.slice(original.indexOf('CREATE FUNCTION public.set_contract_adjustment_status'))));
  assert.match(patch, /REVOKE ALL ON FUNCTION.*FROM PUBLIC,anon/);
  assert.match(patch, /GRANT EXECUTE ON FUNCTION.*TO authenticated/);
});

test('action mapping preserves submit, approval, preparation and final-decision authorities', () => {
  for (const mapping of ["WHEN 'approved' THEN 'CFG-009'", "WHEN 'submitted' THEN 'CFG-007'", "WHEN 'denied' THEN 'V3-001'", "WHEN 'waived' THEN 'V3-001'"]) assert.ok(patch.includes(mapping));
  assert.match(patch, /prior.status IN \('denied','waived','rejected'\).*\n.*can_approve_change_orders/);
  assert.match(patch, /p_status IS NULL OR \(p_status NOT IN/);
  assert.match(patch, /p_status=prior.status AND p_status IN \('proposed','rejected','voided'\)/);
});

// Opt-in in-memory PostgreSQL; never connects to Supabase or any remote database.
// Point PGLITE_MODULE to an already-installed @electric-sql/pglite module.
test('synthetic SQL regression with repository access/read/action helpers', { skip: !process.env.PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.PGLITE_MODULE);
  const db = new PGlite();
  try {
    await db.exec(read('tests/fixtures/contractAdjustmentStatusAuthorization.sql'));
    const extract = (path, name) => {
      const sql = read(path);
      const at = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      assert.ok(at >= 0, name);
      const end = sql.indexOf('$$;', at);
      return sql.slice(at, end + 3);
    };
    await db.exec(extract('supabase/migrations/20260816164500_make_permission_scope_helpers_invoker.sql', 'current_user_can_read_division'));
    await db.exec(extract('supabase/migrations/20260816164500_make_permission_scope_helpers_invoker.sql', 'current_user_can_edit_division'));
    await db.exec(extract('supabase/migrations/202608240003_job_sub_division_access.sql', 'current_user_can_access_job'));
    await db.exec(extract('supabase/migrations/20260825170646_job_sub_division_edit_access.sql', 'current_user_can_edit_job'));
    await db.exec(extract('supabase/migrations/20260827131212_harden_protected_project_financial_rls_helpers.sql', 'current_user_can_read_project_change_order'));
    await db.exec(read('supabase/migrations/20260929193348_fix_scoped_authorization_job_id_ambiguity.sql'));
    await db.exec(patch);
    const id = '10000000-0000-0000-0000-000000000001';
    const actor = async name => db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: name, role: 'authenticated' })]);
    const call = (status = 'approved', stamp = null) => db.query('SELECT to_jsonb(public.set_contract_adjustment_status($1,$2,NULL,$3)) AS row', [id, status, stamp]);
    await db.exec('SET ROLE authenticated');
    await actor('ordinary');
    assert.equal((await db.query('SELECT public.current_user_can_access_job(job_id) AS allowed FROM public.change_orders WHERE id=$1', [id])).rows[0].allowed, true);
    await assert.rejects(call(), /financial read access required/);
    await actor('financial');
    await assert.rejects(call(), /action authority required/);
    await actor('explicit-deny');
    await assert.rejects(call(), /action authority required/);
    await actor('manager');
    await db.exec('RESET ROLE; INSERT INTO public.change_order_allocations VALUES (\'10000000-0000-0000-0000-000000000001\',\'30000000-0000-0000-0000-000000000001\'); SET ROLE authenticated');
    await assert.rejects(call(), /financial read access required/);
    await actor('protected-director');
    assert.equal((await call()).rows[0].row.price_amount, 123);
    await db.exec('RESET ROLE; DELETE FROM public.change_order_allocations; SET ROLE authenticated');
    // Canonical explicit deny: granular edit helper still says yes, evaluator says no.
    await actor('canonical-deny');
    await assert.rejects(call(), /not authorized/);
    await actor('manager');
    await assert.rejects(call('approved', '2000-01-01'), /Refresh before continuing/);
    for (const status of ['approved', 'submitted', 'draft', 'potential', 'denied', 'waived', 'proposed', 'rejected']) {
      await db.exec('RESET ROLE');
      await db.query('UPDATE public.change_orders SET status=$1 WHERE id=$2', [status, id]);
      const before = (await db.query('SELECT to_jsonb(c) AS row FROM public.change_orders c WHERE id=$1', [id])).rows[0].row;
      await db.exec('SET ROLE authenticated');
      assert.deepEqual((await call(status)).rows[0].row, before);
      assert.deepEqual((await call(status, before.updated_at)).rows[0].row, before);
      assert.deepEqual((await db.query('SELECT to_jsonb(c) AS row FROM public.change_orders c WHERE id=$1', [id])).rows[0].row, before);
    }
    await db.exec('RESET ROLE');
    await db.query("UPDATE public.change_orders SET status='voided' WHERE id=$1", [id]);
    await db.exec('SET ROLE authenticated');
    await actor('protected-director');
    assert.equal((await call('voided')).rows[0].row.status, 'voided');
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.change_logs')).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.change_order_financial_postings')).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.test_delegated_calls')).rows[0].n, 0);
  } finally { await db.close(); }
});
