// Compile and exercise the v5 Jobs / Financials foundation against an isolated
// PGlite schema. No production connection or data mutation is used.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const modulePath = process.env.PGLITE_MODULE;
if (!modulePath) throw Error('Set PGLITE_MODULE to an installed PGlite dist/index.js');
const { PGlite } = await import(pathToFileURL(modulePath));
const db = new PGlite();
const exec = (sql) => db.exec(sql);
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const scalar = async (sql, params = []) => Object.values(await one(sql, params))[0];
const migration = await readFile(
  new URL('../supabase/migrations/20260922162009_v5_jobs_financials_foundation.sql', import.meta.url),
  'utf8',
);

const jobId = randomUUID();
const lineId = randomUUID();
const copyId = randomUUID();
const changeSetId = randomUUID();
const destinationId = randomUUID();

try {
  await exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT jsonb_build_object('sub',current_setting('test.actor',true)) $$;
    CREATE TABLE public.user_permissions(clerk_user_id text PRIMARY KEY,display_name text,email text,is_active boolean);
    CREATE TABLE public.jobs(id uuid PRIMARY KEY,name text NOT NULL,archived_at timestamptz);
    CREATE TABLE public.job_budget_divisions(id uuid PRIMARY KEY,job_id uuid,archived_at timestamptz);
    CREATE TABLE public.job_budget_lines(
      id uuid PRIMARY KEY,job_id uuid NOT NULL,project_division_id uuid,category text,
      is_protected_financial boolean DEFAULT false,cost_code text,description text,
      budget_amount numeric DEFAULT 0,budget_change_amount numeric DEFAULT 0,
      actual_cost_amount numeric DEFAULT 0,committed_cost_amount numeric DEFAULT 0,
      forecast_to_complete_amount numeric DEFAULT 0,forecast_final_amount numeric DEFAULT 0,
      schedule_of_values_amount numeric DEFAULT 0,current_budget_override_amount numeric,
      note text,updated_at timestamptz DEFAULT now(),archived_at timestamptz
    );
    CREATE TABLE public.job_revenue_lines(id uuid PRIMARY KEY,job_id uuid NOT NULL);
    CREATE TABLE public.v5_working_copies(
      id uuid PRIMARY KEY,owner_user_id text,module_key text,work_type text,scope_context jsonb,
      payload jsonb,payload_hash text,status text DEFAULT 'draft',version integer DEFAULT 1,
      source_version text,updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.v5_change_sets(
      id uuid PRIMARY KEY,working_copy_id uuid,initiated_by text,working_copy_version integer,
      payload_hash text,shared_reason text,created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.v5_change_set_destinations(
      id uuid PRIMARY KEY,change_set_id uuid,destination_key text,action_id text,scope_context jsonb,
      proposed_payload jsonb,payload_hash text,status text DEFAULT 'pending',version integer DEFAULT 1
    );
    CREATE FUNCTION public.current_scoped_authorization_decision(text,jsonb) RETURNS jsonb
      LANGUAGE sql STABLE AS $$ SELECT '{"allowed":true}'::jsonb $$;
    CREATE FUNCTION public.current_user_can_access_job(uuid,text DEFAULT NULL) RETURNS boolean
      LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.current_user_can_read_project_financial_line(uuid,uuid) RETURNS boolean
      LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.save_v5_working_copy(uuid,uuid,integer,text,text,jsonb,jsonb,text,text,text)
      RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE saved public.v5_working_copies; BEGIN
        INSERT INTO public.v5_working_copies(id,owner_user_id,module_key,work_type,scope_context,payload,payload_hash,source_version)
        VALUES(coalesce($2,gen_random_uuid()),auth.jwt()->>'sub',$4,$5,$6,$7,md5($7::text),$10)
        ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=public.v5_working_copies.version+1
        RETURNING * INTO saved; RETURN to_jsonb(saved); END $$;
    CREATE FUNCTION public.submit_v5_working_copy(uuid,uuid,integer,jsonb,text) RETURNS jsonb
      LANGUAGE sql AS $$ SELECT jsonb_build_object('submitted',true) $$;
    CREATE FUNCTION public.save_job_financial_batch(uuid,jsonb,text) RETURNS jsonb
      LANGUAGE plpgsql AS $$ DECLARE entry jsonb; result jsonb:='[]'; saved public.job_budget_lines; BEGIN
        FOR entry IN SELECT value FROM jsonb_array_elements($2) LOOP
          IF nullif(entry->>'id','') IS NULL THEN
            INSERT INTO public.job_budget_lines(id,job_id,description,budget_amount,updated_at)
            VALUES(gen_random_uuid(),$1,entry->>'description',coalesce((entry->>'budget_amount')::numeric,0),now()) RETURNING * INTO saved;
          ELSE
            UPDATE public.job_budget_lines SET description=entry->>'description',updated_at=now()
            WHERE id=(entry->>'id')::uuid AND job_id=$1 RETURNING * INTO saved;
          END IF;
          result:=result||jsonb_build_array(to_jsonb(saved));
        END LOOP; RETURN result; END $$;
    CREATE FUNCTION public.complete_v5_destination_application(uuid,integer,text,text,jsonb,text) RETURNS jsonb
      LANGUAGE plpgsql AS $$ DECLARE saved public.v5_change_set_destinations; BEGIN
        UPDATE public.v5_change_set_destinations SET status='applied',version=version+1 WHERE id=$1 RETURNING * INTO saved;
        RETURN to_jsonb(saved); END $$;
    INSERT INTO public.user_permissions VALUES('reviewer','Reviewer','reviewer@example.test',true);
    INSERT INTO public.jobs VALUES('${jobId}','Fixture Job',NULL);
    INSERT INTO public.job_budget_lines(id,job_id,description,budget_amount) VALUES('${lineId}','${jobId}','Existing line',100);
  `);
  await exec(migration);
  console.log('Migration compiled against isolated schema.');

  assert.equal(await scalar('SELECT count(*)::int FROM job_financial_baselines'), 1);
  assert.equal(Number(await scalar('SELECT budget_amount FROM job_budget_lines WHERE id=$1', [lineId])), 100);
  assert.equal(await scalar('SELECT source FROM job_financial_baselines WHERE job_id=$1', [jobId]), 'legacy_backfill');
  console.log('Legacy baseline backfill preserved authoritative values.');

  await exec("SELECT set_config('test.actor','reviewer',false)");
  const savedCopy = await scalar(
    'SELECT save_v5_job_financial_proposal($1,NULL,NULL,$2,$3)',
    [randomUUID(), jobId, JSON.stringify([{ id: lineId, expected_updated_at: (await scalar('SELECT updated_at::text FROM job_budget_lines WHERE id=$1',[lineId])), description: 'Reviewed line', budget_amount: 100 }])],
  );
  assert.equal(savedCopy.module_key, 'jobs');
  assert.equal(savedCopy.work_type, 'financial_proposal');
  await assert.rejects(
    () => scalar('SELECT save_v5_job_financial_proposal($1,NULL,NULL,$2,$3)', [randomUUID(), jobId, JSON.stringify([{ description: 'Bad', unsupported: 1 }])]),
    /unsupported field/,
  );
  console.log('Constrained financial proposal save passed.');

  const payload = { job_id: jobId, baseline_version: 1, lines: [{ id: lineId, expected_updated_at: await scalar('SELECT updated_at::text FROM job_budget_lines WHERE id=$1',[lineId]), description: 'Applied line', budget_amount: 100 }] };
  await db.query(
    `INSERT INTO v5_working_copies(id,owner_user_id,module_key,work_type,scope_context,payload,payload_hash,status,version,source_version)
     VALUES($1,'reviewer','jobs','financial_proposal',$2,$3,'hash','submitted',1,'1')`,
    [copyId, {job_id:jobId}, payload],
  );
  await db.query(
    `INSERT INTO v5_change_sets(id,working_copy_id,initiated_by,working_copy_version,payload_hash,shared_reason)
     VALUES($1,$2,'reviewer',1,'hash','Fixture proposal')`,[changeSetId,copyId],
  );
  await assert.rejects(
    () => db.query(
      `INSERT INTO v5_change_set_destinations(id,change_set_id,destination_key,action_id,scope_context,proposed_payload,payload_hash,status,version)
       VALUES($1,$2,'official_job_financials','CFG-004',$3,$4,'destination-hash','pending',1)`,
      [destinationId,changeSetId,{job_id:jobId},payload],
    ),
    /Use the Job Financials workflow/,
  );
  // PGlite executes each db.query in its own transaction; use a session fixture
  // value here to model the wrapper's transaction-local context.
  await db.query("SELECT set_config('northgate.job_financial_submission',$1,false)",[copyId]);
  await db.query(
    `INSERT INTO v5_change_set_destinations(id,change_set_id,destination_key,action_id,scope_context,proposed_payload,payload_hash,status,version)
     VALUES($1,$2,'official_job_financials','CFG-004',$3,$4,'destination-hash','pending',1)`,
    [destinationId,changeSetId,{job_id:jobId},payload],
  );
  const applied = await scalar(
    'SELECT apply_v5_job_financial_proposal($1,1,$2,$3)',
    [destinationId,'destination-hash','Reviewed fixture application'],
  );
  assert.equal(applied.status,'applied');
  assert.equal(Number(await scalar('SELECT version FROM job_financial_baselines WHERE job_id=$1',[jobId])),2);
  assert.equal(await scalar('SELECT description FROM job_budget_lines WHERE id=$1',[lineId]),'Applied line');
  const retry = await scalar(
    'SELECT apply_v5_job_financial_proposal($1,1,$2,$3)',
    [destinationId,'destination-hash','Reviewed fixture application'],
  );
  assert.equal(retry.idempotent,true);
  assert.equal(Number(await scalar('SELECT version FROM job_financial_baselines WHERE job_id=$1',[jobId])),2);
  console.log('Atomic apply, baseline version advance and idempotent retry passed.');

  console.log('PASS: isolated v5 Jobs / Financials foundation verification.');
} finally {
  await db.close();
}
