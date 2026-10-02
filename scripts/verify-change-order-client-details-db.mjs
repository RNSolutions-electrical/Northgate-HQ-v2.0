// Isolated shape/persistence test. The existing financial RPC is represented
// by a narrow stub; run live-schema permission/financial tests before release.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE;
if (!modulePath) throw new Error('Set PGLITE_MODULE to a local PGlite index.js for the isolated database test.');
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const db = new PGlite();
let checks = 0;
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"sub":"test-user"}'::jsonb $$;
    CREATE FUNCTION public.change_order_actor() RETURNS text LANGUAGE sql AS $$ SELECT 'Test User' $$;
    CREATE FUNCTION public.current_user_can_edit_division(text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.change_orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL, division text NOT NULL,
      co_number text NOT NULL, title text NOT NULL, description text,
      price_amount numeric NOT NULL DEFAULT 0, cost_amount numeric NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'draft', change_order_date date, internal_notes text,
      created_by text, updated_by text, revision_of_id uuid, revision_number integer NOT NULL DEFAULT 0,
      overall_markup_percent numeric, archived_at timestamptz
    );
    CREATE TABLE public.change_order_lines(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), change_order_id uuid NOT NULL,
      job_budget_line_id uuid NOT NULL, division text NOT NULL, cost_code text,
      description text NOT NULL, vendor_name text, material_amount numeric NOT NULL DEFAULT 0,
      labor_amount numeric NOT NULL DEFAULT 0, equipment_amount numeric NOT NULL DEFAULT 0,
      subcontract_amount numeric NOT NULL DEFAULT 0, other_amount numeric NOT NULL DEFAULT 0,
      markup_amount numeric NOT NULL DEFAULT 0, markup_percent numeric,
      is_overall_markup boolean NOT NULL DEFAULT false, sort_order integer NOT NULL DEFAULT 0,
      created_by text, updated_by text
    );
    CREATE TABLE public.change_logs(user_id text,user_name text,table_name text,record_id text,
      action text,before_data jsonb,after_data jsonb,note text);
    CREATE FUNCTION public.save_job_change_order_draft_with_all_markups(
      p_change_order_id uuid,p_job_id uuid,p_division text,p_co_number text,p_title text,
      p_description text,p_change_order_date date,p_internal_notes text,p_lines jsonb,
      p_reason text,p_overall_markup_percent numeric,p_overall_markup_budget_line_id uuid
    ) RETURNS public.change_orders LANGUAGE plpgsql AS $stub$
    DECLARE saved public.change_orders%ROWTYPE; item jsonb; index_value integer := 0;
    BEGIN
      IF p_change_order_id IS NULL THEN
        INSERT INTO public.change_orders(job_id,division,co_number,title,description,status,price_amount)
        VALUES(p_job_id,p_division,p_co_number,p_title,p_description,'draft',100) RETURNING * INTO saved;
      ELSE
        SELECT * INTO saved FROM public.change_orders WHERE id=p_change_order_id AND status='draft';
        IF saved.id IS NULL THEN RAISE EXCEPTION 'draft required'; END IF;
        DELETE FROM public.change_order_lines WHERE change_order_id=saved.id;
      END IF;
      FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
        INSERT INTO public.change_order_lines(change_order_id,job_budget_line_id,division,description,
          material_amount,sort_order,created_by,updated_by)
        VALUES(saved.id,(item->>'job_budget_line_id')::uuid,p_division,item->>'description',
          COALESCE((item->>'material_amount')::numeric,0),index_value,'test-user','test-user');
        index_value := index_value + 1;
      END LOOP;
      RETURN saved;
    END $stub$;
  `);
  await db.exec(await readFile('supabase/migrations/20261002160002_change_order_client_pdf_breakdown.sql', 'utf8'));
  checks += 1;

  const jobId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const details = { rows: [{ description: 'Two devices', quantity: 2, unit: 'EA', unit_price: 20, amount: null }], show_remaining: true, remaining_label: 'Remaining work' };
  const line = { job_budget_line_id: budgetId, description: 'Electrical scope', material_amount: 100, client_breakdown: details };
  const call = (id, rows) => db.query(`SELECT (public.save_job_change_order_draft_with_client_details(
    $1::uuid,$2::uuid,'Electrical','CO-001','Test scope',NULL,CURRENT_DATE,NULL,
    $3::jsonb,NULL,0,NULL)).id AS id`, [id, jobId, JSON.stringify(rows)]);
  const savedId = (await call(null, [line])).rows[0].id;
  const queryDetails = () => db.query('SELECT client_breakdown FROM public.change_order_lines WHERE change_order_id=$1', [savedId]);
  assert.deepEqual((await queryDetails()).rows[0].client_breakdown.rows[0].description, 'Two devices');
  checks += 1;
  const updated = structuredClone(details);
  updated.rows[0].description = 'Revised client detail';
  await call(savedId, [{ ...line, client_breakdown: updated }]);
  assert.equal((await queryDetails()).rows[0].client_breakdown.rows[0].description, 'Revised client detail');
  checks += 1;
  await assert.rejects(() => call(savedId, [{ ...line, client_breakdown: { ...updated, rows: [{ description: '' }] } }]), /valid description/);
  assert.equal((await queryDetails()).rows[0].client_breakdown.rows[0].description, 'Revised client detail');
  checks += 1;
  await db.query("UPDATE public.change_orders SET status='approved' WHERE id=$1", [savedId]);
  const revisionId = (await db.query('SELECT (public.revise_job_change_order($1,NULL)).id AS id', [savedId])).rows[0].id;
  const revision = (await db.query('SELECT client_breakdown FROM public.change_order_lines WHERE change_order_id=$1', [revisionId])).rows[0];
  assert.equal(revision.client_breakdown.rows[0].description, 'Revised client detail');
  checks += 1;
  const original = (await db.query('SELECT client_breakdown FROM public.change_order_lines WHERE change_order_id=$1', [savedId])).rows[0];
  assert.equal(original.client_breakdown.rows[0].description, 'Revised client detail');
  checks += 1;
  console.log(`PASS: ${checks} isolated SQL migration, save, validation and revision assertions.`);
} finally {
  await db.close();
}
