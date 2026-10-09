import { createHash } from 'node:crypto';

const literal = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const APPROVED_SOURCE_SHA256 = 'c2daa6371dcf28b38658db21ff907fbdedf0af4bd0500d01c366ce3450aaf6fe';

/**
 * Build a single-transaction, insert-only import for a separately approved
 * Production execution. This module cannot connect to a database.
 */
export function buildEosProductionImportSql(plan, seed) {
  if (plan?.counts?.pursuits !== 41 || plan.counts.clients !== 29
      || plan.counts.linkedJobs !== 0 || plan.counts.assignedManagers !== 0
      || plan.pursuits.some((row) => row.job_id !== null || row.manager_ids.length)) {
    throw new Error('The approved 41-pursuit, unlinked EOS import plan is required.');
  }
  const sourceSha256 = createHash('sha256').update(JSON.stringify(seed)).digest('hex');
  if (sourceSha256 !== APPROVED_SOURCE_SHA256) {
    throw new Error('EOS workbook source changed since the reviewed import plan.');
  }
  const clients = plan.clients.map(({ source_label, display_name, company, phone, email, address, notes }) => ({
    source_label, display_name, company, phone, email, address, notes,
  }));
  const pursuits = plan.pursuits.map(({
    source_sheet, source_row, source_batch, project_name, client_source_label,
    discussion, phase, planning_value, probability, potential_start_date,
    go_no_go, initial_meeting, source_manager_labels, original_stage,
    original_job_number,
  }) => ({
    source_sheet, source_row, source_batch, project_name, client_source_label,
    discussion, phase, planning_value, probability, potential_start_date,
    go_no_go, initial_meeting, source_manager_labels, original_stage,
    original_job_number,
  }));

  return `-- EOS Production source import. Generated from SHA-256 ${sourceSha256}.
-- Run only after separate owner approval, schema deployment, and target verification.
-- No credentials, inferred Job links, manager assignments, or source-label merges.
-- The entire import is atomic; a rerun inserts missing source identities only.
BEGIN;

CREATE TEMP TABLE eos_import_clients ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset(${literal(clients)}) AS x(
  source_label text, display_name text, company text, phone text,
  email text, address text, notes text
);
CREATE TEMP TABLE eos_import_pursuits ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset(${literal(pursuits)}) AS x(
  source_sheet text, source_row integer, source_batch text, project_name text,
  client_source_label text, discussion text, phase text,
  planning_value numeric, probability numeric, potential_start_date date,
  go_no_go text, initial_meeting date, source_manager_labels text[],
  original_stage text, original_job_number text
);

DO $check$
BEGIN
  IF (SELECT count(*) FROM eos_import_clients) <> 29
    OR (SELECT count(*) FROM eos_import_pursuits) <> 41
    OR EXISTS (SELECT 1 FROM eos_import_pursuits WHERE source_batch <> '${plan.batch}')
    OR EXISTS (
      SELECT 1 FROM eos_import_pursuits s
      LEFT JOIN eos_import_clients c ON c.source_label=s.client_source_label
      WHERE s.client_source_label IS NOT NULL AND c.source_label IS NULL
    ) THEN
    RAISE EXCEPTION 'EOS source manifest is incomplete or changed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM eos_import_pursuits s JOIN public.eos_pursuits p
      USING (source_sheet,source_row)
    WHERE p.source_batch IS DISTINCT FROM s.source_batch
  ) THEN
    RAISE EXCEPTION 'EOS source identity conflicts with an existing pursuit';
  END IF;
END $check$;

INSERT INTO public.eos_clients(
  source_label,display_name,company,phone,email,address,notes,created_by
)
SELECT source_label,display_name,company,phone,email,address,notes,'workbook-import'
FROM eos_import_clients
ON CONFLICT (source_label) WHERE source_label IS NOT NULL DO NOTHING;

-- An imported Awarded row can legitimately have no Job link. Insert it with
-- a null phase, then set the historical phase under the transaction-local
-- handoff guard. This does not call the Job-creating award RPC.
CREATE TEMP TABLE eos_import_inserted ON COMMIT DROP AS
WITH inserted AS (
  INSERT INTO public.eos_pursuits(
    source_sheet,source_row,source_batch,project_name,client_id,discussion,
    phase,planning_value,probability,potential_start_date,go_no_go,
    initial_meeting,source_manager_labels,original_stage,original_job_number,
    created_by
  )
  SELECT s.source_sheet,s.source_row,s.source_batch,s.project_name,c.id,
    s.discussion,CASE WHEN s.phase='Awarded' THEN NULL ELSE s.phase END,
    s.planning_value,s.probability,s.potential_start_date,s.go_no_go,
    s.initial_meeting,s.source_manager_labels,s.original_stage,
    s.original_job_number,'workbook-import'
  FROM eos_import_pursuits s
  LEFT JOIN public.eos_clients c ON c.source_label=s.client_source_label
  ON CONFLICT (source_sheet,source_row) DO NOTHING
  RETURNING id,source_sheet,source_row
)
SELECT * FROM inserted;

SELECT set_config('app.eos_award_handoff','yes',true);
UPDATE public.eos_pursuits p SET phase='Awarded'
FROM eos_import_inserted i JOIN eos_import_pursuits s
  USING (source_sheet,source_row)
WHERE p.id=i.id AND s.phase='Awarded';

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM eos_import_pursuits s
    LEFT JOIN public.eos_pursuits p USING (source_sheet,source_row)
    WHERE p.id IS NULL OR p.source_batch IS DISTINCT FROM s.source_batch
  ) OR EXISTS (
    SELECT 1 FROM eos_import_inserted i JOIN public.eos_pursuits p ON p.id=i.id
    JOIN eos_import_pursuits s ON s.source_sheet=i.source_sheet AND s.source_row=i.source_row
    WHERE p.job_id IS NOT NULL OR p.phase_before_award IS NOT NULL
      OR p.phase IS DISTINCT FROM s.phase
  ) THEN
    RAISE EXCEPTION 'EOS import postflight failed; rolling back';
  END IF;
END $verify$;

-- Existing source rows and any later user edits are deliberately untouched.
SELECT (SELECT count(*) FROM eos_import_inserted) AS pursuits_inserted,
  (SELECT count(*) FROM eos_import_pursuits s JOIN public.eos_pursuits p
    USING (source_sheet,source_row) WHERE p.source_batch=s.source_batch)
    AS source_pursuits_present,
  (SELECT count(*) FROM eos_import_pursuits WHERE phase='Awarded')
    AS source_awarded_rows;
COMMIT;\n`;
}
