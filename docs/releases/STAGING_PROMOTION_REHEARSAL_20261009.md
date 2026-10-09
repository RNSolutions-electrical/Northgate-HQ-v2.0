# Staging promotion database rehearsal — October 9, 2026

**Status:** Targeted Production-copy schema rehearsal passed; this is not Production promotion approval.

**Sync marker:** `STAGING-PROMOTION-RESTORE-REHEARSAL-20261009-1210-EDT-RYAN_NORTHGATE`

**Recorded:** 2026-10-09 12:10 EDT (UTC-04:00), machine `RYAN_NORTHGATE`, checkout `job-assignment-fix`, branch `dev-eos-pursuit-tracker-20261006`.

## Isolation and recovery boundary

- Source: Production Supabase `keogysnoukbendfkfjcn`, completed scheduled database backup from **2026-10-09 09:04:29 UTC**. Supabase quoted **$10.18/month while active**, within the owner's $15/month ceiling.
- Rehearsal target: separate project `northgate-staging-promotion-rehearsal-20261009` (`cmbdjcmsphfxxvvytvgp`). The owner privately entered its database password and started the restore. No test SQL was sent until the project finished restoring and a read query succeeded.
- The owner confirmed deletion at action time. Supabase displayed “Successfully deleted northgate-staging-promotion-rehearsal-20261009”; a subsequent project listing omitted `cmbdjcmsphfxxvvytvgp` and retained Production. A separate exit-survey submission failed, but project deletion succeeded. **The temporary copy no longer exists.**
- A Supabase database restore does **not** include Storage objects. This rehearsal could inspect document metadata/policies, not open restored files. Production and Staging database schemas/data and app deploys were not changed; any Git update for this record is documentation-only.

## Selective schema tested on the restored Production baseline

The following were executed on the temporary project only, with raw SQL rather than recording permanent migration-ledger entries:

1. The E.O.S. foundation and four later Job-link/Award-Reversal migrations: `20261006130000`, `20261009133828`, `20261009134158`, `20261009135509`, `20261009135737`.
2. The My Work responsibilities and budget-health acknowledgement migrations: `20260924162513`, `20260924191152`.
3. The cost-report Documents/Storage-policy migration: `20260923195722`.
4. A **targeted** guided CO delta: make `change_order_lines.job_budget_line_id` nullable, add checked `change_orders.guided_state`, install the final `save_guided_change_order_draft` definition from `20260923210036`, and explicitly revoke `PUBLIC`/`anon` execute while granting only `authenticated` execute.

Do **not** replay `20260923201445_change_order_uncoded_drafts.sql` against Production. Its draft-save function is older than Production's current function and would remove newer Job-scoped authorization, signed-document invalidation, and currency handling. The rehearsal preserved Production's existing `save_job_change_order_draft`, approval, validation, postings, and Billing functions. Production's `validate_contract_adjustment` already rejects uncoded lines before approval.

Important migration-authoring finding: the final guide-function file `20260923210036` does not carry the `REVOKE`/`GRANT` from its earlier creation file. Installing it alone temporarily gave `anon` execute on the restored copy. An explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO authenticated;` corrected that; `has_function_privilege` then returned `anon=false`, `authenticated=true`. **The eventual Production-targeted migration must include these grants in the same reviewed deployment unit.** No such exposure was created in Production.

## Checks and results

The restored baseline contained 61 Jobs, 617 budget lines, 48 Change Orders, 15 CO financial postings, eight Pay Apps, 382 Pay App lines, and 35 Documents. Before/after totals were identical: original budget amounts `$6,958,067.85`, actual costs `$3,489,758.99`, CO posting deltas `$7,103.51`, and CO header prices `$354,512.41`. The rehearsal created no lasting pursuits or other QA records; write tests used explicit rollback transactions.

- E.O.S.: two eligible existing accounts received the conditional initial grants on the copy; no accounts were created or promoted. Six reminder rows appeared. RLS was enabled, `anon` had no table read, a granted account saved a pursuit, an ungranted account was denied and could not see a rollback-only pursuit. Link → award → reasoned reversal restored the prior phase, retained its Job association, and left Job budget/posting totals unchanged.
- Guided CO: an authorized account saved an empty draft and a draft with an uncoded zero-dollar line; approval of the uncoded draft was rejected by Production validation. Both QA drafts were rolled back.
- Security advisor comparison: the copy retained Production's four pre-existing security-definer-view findings and other existing notices. One additional `RLS enabled no policy` informational finding is for the intentionally non-direct-readable `eos_access_grants`. The temporary anonymous guided-function warning was resolved before cleanup; anon-executable function count returned to Production's baseline of 11. This rehearsal did not remediate unrelated existing advisor findings.

## Not yet cleared for Production

- Author and review the formal targeted Production migration, including guide grants and environment-specific policy checks. The local `supabase` CLI was not installed here, so no new migration file was generated in this turn.
- Build and rehearse an idempotent Production E.O.S. importer. The existing 41-pursuit manifest is read-only and intentionally creates no automatic client consolidation, manager link, or Job link. No workbook rows were imported into the temporary copy.
- Finish signed-in, combined-candidate cross-module checks, especially cost-report upload/file-open and unauthorized access (not verifiable from a database-only restore without Storage objects), historical CO/Billing revisions/Pay Apps, estimate and vehicle detail, and Production-scoped build configuration.
- Reconfirm a fresh Production recovery point immediately before any real migration. A frontend rollback would not roll back a database schema; use a reviewed forward-repair plan. Obtain a **separate explicit owner approval** before any Production migration, import, merge, release tag, or deploy.
