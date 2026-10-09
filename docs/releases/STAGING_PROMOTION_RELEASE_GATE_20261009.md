# Staging-to-Production release gate — October 9, 2026

**Status:** Prepared for owner review only. Do not apply any Production migration, import data, merge `main`, tag a release, or deploy without separate approval.

**Sync marker:** `STAGING-PROMOTION-RELEASE-GATE-20261009-1310-EDT-RYAN_NORTHGATE`
**Recorded:** 2026-10-09 13:10 EDT (UTC-04:00), machine `RYAN_NORTHGATE`, checkout `job-assignment-fix`.

## Frozen scope and baselines

- Owner accepted the combined Staging browser checks; minor formatting tweaks are deferred. See `STAGING_PROMOTION_ACCEPTANCE_20261009.md`.
- Production Netlify currently serves app commit `3ec69de` from `main`; `origin/main` is `36cf543`. Staging Netlify currently serves accepted app commit `8acf959`; later branch commits are documentation/offline release preparation. Recheck both deploy IDs and Git refs at action time.
- Production Supabase: `keogysnoukbendfkfjcn`. Staging Supabase: `fazfwzbuesvzhgodckiw`. Never point one environment at the other database or Clerk instance.
- Proposed next immutable release version: `v0.7.0` (not created). Existing latest tag is `v0.6.0`. The eventual GitHub Release must list the exact commit, migration IDs, source-import fingerprint, and verification results.
- This candidate includes the accepted navigation/dashboard, Job financial setup and Documents import, E.O.S. pursuit tracker, and Silas guided Change Order. Cost-report revenue remains preview-only. The separate Inventory Management batch editor and unspecified formatting notes are excluded.

## Exact Production schema candidate

Apply **only** the reviewed migrations below, in this order, after fresh target preflight and approval. Staging and Production migration histories diverge; do not replay every file in `supabase/migrations`, use `db push` indiscriminately, or replay the old `20260923201445_change_order_uncoded_drafts.sql` over Production's newer draft-save function.

1. `supabase/migrations/20260923195722_job_cost_report_documents.sql` — cost-report Documents and narrow Storage policies.
2. `supabase/migrations/20260924162513_dashboard_job_responsibilities.sql` — My Work read model.
3. `supabase/migrations/20260924191152_dashboard_budget_health_acknowledgements.sql` — budget alert acknowledgements.
4. `supabase/migrations/20261006130000_eos_pursuit_foundation.sql` — E.O.S. tables, audited RPCs, and conditional initial grants.
5. `supabase/migrations/20261009133828_eos_pursuit_job_link.sql` — independent Job link/unlink.
6. `supabase/migrations/20261009134158_eos_prevent_reaward_after_unlink.sql` — award guard.
7. `supabase/migrations/20261009135509_eos_award_reversal.sql` — reasoned reversal.
8. `supabase/migrations/20261009135737_eos_award_reversal_audit_fix.sql` — audited reversal correction.
9. `docs/releases/production-migration-candidate/supabase/migrations/20261009170611_staging_promotion_targeted_production.sql` — Production-only guided-CO delta. It is intentionally outside the active migration directory. The preflight checks Production's current schema and the existing `save_job_change_order_draft` definition fingerprint `bbe14801752dc9fad7274cfe04984c79`; a mismatch must stop release. It grants the guided RPC to `authenticated`, not `anon`.

The numbered guided migration is a candidate, not yet applied or recorded in any database ledger. At execution time, verify the selected migration mechanism's transaction/ledger handling before using it; do not bypass failed preflight or manually mark a failed migration as applied. Rehearse this exact numbered file if its contents or execution method change. The October 9 isolated restore rehearsed the equivalent targeted SQL and the eight listed additive migrations, but raw SQL was used, so that rehearsal did not certify ledger behavior.

## Data import, after schema and app are ready

Run `node scripts/prepare-eos-production-import.mjs --dry-run` and verify source SHA-256 `c2daa6371dcf28b38658db21ff907fbdedf0af6fe`, batch `eos-workbook-2026-20261006`, 41 pursuits (33 General, eight Electrical), 29 exact client labels, eight blank-client rows, five historical Awarded rows, and **zero inferred Job/manager links**. Only `--emit-sql` produces the reviewed, insert-only, idempotent SQL; the script cannot connect to a database. The emitted SQL contains client data: do not commit or publish it. Never use the Staging workbook importer for Production because it can auto-link Jobs.

After owner-approved Production execution, verify exactly 41 expected source identities and no duplicate `(source_sheet, source_row)` rows. Preserve ambiguous labels and source Job numbers for later audited human linking. The import must not alter Job budgets, postings, or Pay Apps. If any identity collision or unexpected client label appears, stop before commit.

## Recovery and stop conditions

- The latest visible Production scheduled **database** backup at this preparation check was **2026-10-09 09:04:29 UTC**. It is the backup used for the isolated rehearsal, not a new pre-promotion recovery point. Recheck for a newly completed backup and its timestamp immediately before Production migration; if Production has changed after the backup, disclose the recovery gap and obtain an explicit decision rather than assuming zero loss. Do not click a Production Restore button during preparation.
- Supabase database backup restoration does **not** restore Storage objects. Preserve document uploads separately; do not claim this backup is complete file recovery. The isolated restore was deleted after its tests and is not a standing rollback copy.
- Capture before/after counts and financial baselines for Jobs, budget lines, COs, CO postings, Pay Apps/lines, and Documents. Stop on a failed preflight, unexpected migration drift, unauthorized-grant finding, or financial drift. The rehearsal baseline and security-advisor findings are in `STAGING_PROMOTION_REHEARSAL_20261009.md`.
- Do not use a frontend rollback as a schema rollback. If post-release behavior fails, stop new writes for the affected workflow, retain the prior Production Netlify deploy for possible frontend rollback, assess compatibility of that build with the additive schema, and use a reviewed forward repair. A full database restore is a separate destructive decision because it can lose all post-backup writes and will not restore Storage objects.

## Promotion sequence requiring owner approval

1. Freeze/review the exact Git candidate; rerun the full explicit test set, Production-identity compile, and targeted migration/import tests. A placeholder public-key compile proves code generation only, not Production authentication or live connectivity.
2. Reconfirm Production schema, migration ledger, latest completed recovery point, current Netlify deploys, and the supplied E.O.S. workbook hash. Resolve any drift before proceeding.
3. Obtain explicit owner approval for the **specific** Production schema application, 41-row import, release tag/GitHub Release, `main` promotion, and Netlify deployment under the stated database/Storage recovery limits.
4. Apply the nine selected migrations in reviewed order; verify permissions and no financial drift. Import E.O.S. source data once, then verify identities/counts and unchanged Job financials.
5. Promote the accepted Git candidate deliberately to `main`, build/deploy with Production-scoped Netlify variables, verify the exact deployed commit and signed-in Production smoke tests. Create the immutable release tag/GitHub Release and record its migration/import/recovery notes according to the approved release procedure. Never auto-promote Staging.
6. Record final UTC/local timestamps, machine, commit, migration IDs, import counts, Netlify deploy ID, and smoke-test result in `HANDOFF.md`. Reconcile the development branch only after Production is verified.

No Production system was modified by this release-gate preparation.
