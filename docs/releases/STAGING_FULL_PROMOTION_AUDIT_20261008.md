# Staging-to-Production promotion audit — October 8, 2026

**Status:** Read-only inventory and release plan. No promotion approval, migration, tag, or Production change.

**Sync marker:** `STAGING-PROMOTION-AUDIT-20261008-1636-EDT-RYAN_NORTHGATE`

**Recorded:** 2026-10-08 16:36 EDT (UTC-04:00) on `Ryan_Northgate`, checkout `job-assignment-fix`, branch `dev-eos-pursuit-tracker-20261006`.

## Verified live baseline

| Environment | Git / deploy | Database |
| --- | --- | --- |
| Production (`rnsolutions.net`) | Netlify current ready deploy `6ac100faf928bf000863128c`, code `3ec69de` from `main` (v0.6.0); `origin/main` is now `36cf543`, with later documentation-only commits | Supabase `keogysnoukbendfkfjcn`; 195 migration-ledger entries |
| Staging (`staging.rnsolutions.net`) | Netlify current ready deploy `6ac7d0289550780008a32697`, code `7d54385` from `staging`; later commits through `4e7d812` are documentation-only `[skip ci]` | Isolated Supabase `fazfwzbuesvzhgodckiw`; 216 migration-ledger entries |

Fresh Git fetch showed `origin/staging` 91 commits ahead of `origin/main`, with no commits unique to `main`; the branch diff spans 140 files. A Git fast-forward is possible **technically**, but would promote every Staging feature and is not a release decision. The older `development` branch is not a suitable release base. Counts describe repository state, not 91 distinct user-facing features. No tests were rerun for this documentation audit.

## Release inventory

| Area | Staging state and acceptance | Work before a combined release |
| --- | --- | --- |
| Shared shell and module navigation | Dashboard, Inventory, Jobs, Estimates, Employees, Vehicles, Documents, Reports, Accounting, and the responsive header are deployed. Ryan accepted the main navigation/layout direction and the true 200% E.O.S. view. Most changes are presentation/navigation only. | Run a compact cross-module regression on the **combined** candidate, including mobile and permission-filtered rail links. Staging lacked real estimate and vehicle detail records for those paths; use a safe fixture or Production-copy rehearsal, not Production test writes. |
| Dashboard / My Work / Project Health | Assigned Jobs and budget-health alerts were owner-accepted earlier on Staging. Production lacks `read_my_job_responsibilities()` and `job_budget_health_acknowledgements`. | Rehearse the two additive migrations and verify RLS, per-user acknowledgement behavior, current budget values, and no assignment-derived permission expansion. |
| Job financial setup and cost-report documents | Staging has template selection, manual budget lines, import preview/selection, and uploaded cost-report linkage to Documents. The template was tested; some owner and unauthorized-user file-open checks are still recorded as pending. | Finish the report-import/Document Storage round-trip and access checks, including revenue-write scope. Review Staging-only document/storage policies before Production use. |
| Change Orders, Credits, Billing lineage, client PDF | Production v0.6.0 already has the state-model/PDF and Billing-lineage functions through differently numbered integration migrations. Staging has the accepted simpler flow plus nullable uncoded draft lines, `guided_state`, and a different `save_job_change_order_draft` definition. Core `save_contract_adjustment`, `revise_job_change_order`, `approve_job_change_order`, `sync_job_pay_application_change_orders`, and `create_job` definition hashes match across live databases. | **Do not replay Staging's CO migration chain.** Reconcile the exact draft/guide delta and function definition against current Production. Exercise submitted/approved/credit/revision, prior Pay Apps, SOV, document attachment, negative/zero lines, and historical totals on a current Production copy. Existing integration notes leave some correction/reversal, independent-session, Storage, and estimate/Silas consumer checks open. |
| Silas guided Change Order builder | Implemented only on Staging, using the existing draft and adding `guided_state` plus a stale-edit guard. Its own review still lists signed-in owner acceptance as pending. | Verify both entry points, save/exit/resume, AI-off behavior, multi-line pricing, manual-draft handoff, stale-edit protection, permissions, and responsive layout. Rehearse only the guide's needed schema/function delta. |
| E.O.S. Project Pursuit Tracker | Staging migration, 41-row workbook import, core signed-in owner tests, access/revocation, mobile/200% layout, award handoff, and overlapping-award database test are documented. Production has no E.O.S. tables. | Rehearse the additive migration on the current Production schema. Decide whether the 41 Staging pursuits/29 source clients should be imported into Production; that data does **not** move with a Git merge. Resolve any manager/client/Job mappings deliberately. Production currently has eligible Ryan and Tim accounts only among the six initial named emails; do not create/promote the others. A separate signed-in technical-Developer-without-business-authority UI check remains unobserved, though backend denial passed. |
| Environment-specific fixes | Staging includes a Clerk token fix, inventory authenticated read grants, and environment guards. Production already has inventory reads and uses a different Clerk instance. | Verify the candidate build uses Production Netlify/Clerk/Supabase values without copying Staging secrets, identity IDs, test Jobs, workbook fixtures, or Staging-only configuration. Do not replay the Staging inventory grant migration blindly. |

The separate Inventory Management batch-editor candidate is **not** in `origin/staging`; Personal Tools and persisted My Preferences are roadmap items, not deployed features. They must not be described as part of this release.

## Database delta and recovery boundary

The repository branch diff contains 12 Staging-side migration files, but the live migration ledgers are not linearly comparable because Staging was built with repaired foundation migrations and Production reached several features through different integration versions. Live column comparison found `change_order_lines.job_budget_line_id` nullable on Staging but required on Production, and `change_orders.guided_state` only on Staging. Other compared `jobs`, `job_budget_lines`, `job_revenue_lines`, `documents`, and `user_permissions` column signatures match. Production lacks E.O.S., Dashboard acknowledgement, and My Work responsibility objects. This is a **targeted** comparison, not a complete schema-diff certification.

Before any Production migration, prepare a reviewed delta script from the current Production schema, rehearse it on a new isolated Production restore, run old/new record and permission regressions, and confirm a recent restorable Production recovery point. The last backup/cost/Storage recovery state was **not** rechecked in this audit; Supabase database backups do not restore deleted Storage objects. Avoid replaying the historical Carolina Retina correction or Staging-specific baseline repairs. Preserve the existing Production deploy and a forward-repair path; never treat a frontend revert as a database rollback.

## Proposed sequence, without promoting yet

1. Freeze a named candidate from current `main` plus the intended Staging changes. Review the final diff for Staging-only values, unfinished features, and dependencies. Keep `main` and live sites unchanged during preparation.
2. Close the recorded acceptance gaps by area, especially financial imports/Documents, guided CO, and cross-module record-detail cases. Decide the E.O.S. workbook data policy and any feature exclusions explicitly.
3. Reconcile live Production/Staging database objects and author **only** the missing, compatible Production deltas. Rehearse on a fresh isolated Production restore with representative historical CO/Billing/Job records; verify security advisors and no financial drift.
4. Confirm the latest Production backup and recovery limitation, run the full explicit test suite and Production-configured build on the exact candidate, and perform a final Staging acceptance pass of that same candidate.
5. After separate owner approval, create a new immutable pre-1.0 release tag/GitHub Release with migration notes, apply reviewed Production schema changes, deliberately promote code to `main`, verify the ready Netlify deploy and signed-in Production smoke tests, then record the sync/deploy markers. Reconcile `development` afterward.

This audit supports planning; it does not conclude that all Staging work is ready for Production. Nothing in it authorizes a merge, migration, data copy, or deploy.
