# Staging / Production reconciliation — 2026-10-05

Marker: `ENV-PARITY-20261005-001`
Machine: `RYAN_NORTHGATE`
Environment names: Production is `rnsolutions.net`; Staging is `staging.rnsolutions.net`. `main` is the Production code branch, not a third environment.

## Current verified state

- Production runs release `v0.6.0` from code commit `3ec69de`; its current Netlify deploy is `6ac100faf928bf000863128c` (published October 3). The later `origin/main` commits through `36cf543` are documentation-only `[skip ci]` changes.
- Staging's current Netlify deploy is `6ac011fa7c384ca852dc2f9c` (October 2 manual upload). Its code is represented by `abbf581`; `origin/staging` is `c668b9b` after a documentation-only commit.
- Development's remote branch is older than both deployed branches. Do not use it as the integration base.
- This isolated candidate branch, `integration/staging-production-parity-20261005`, merges `origin/main` into `origin/staging`. Neither deployed branch has been moved. It preserves Staging's guided Change Order builder, dashboard work, and Staging-compatible Clerk authentication while adding Production's inventory navigation/export and catalogue UI work. A duplicate, inactive Production Change Order editor was omitted because the active Staging editor has equivalent behavior plus the correct authentication adapter.
- A placeholder-config Vite production compile passed. Explicit Node suite: 256 passed, 0 failed. These verify code integration, not authenticated user acceptance or deployment configuration.

## Database divergence: do not apply a branch's full migration folder to the other environment

- Production Supabase project `keogysnoukbendfkfjcn`; Staging persistent branch project `fazfwzbuesvzhgodckiw`.
- Both environments have `change_order_lines.client_breakdown`, nullable Change Order cost/price, `record_type`, and the same definition hash for `save_contract_adjustment(jsonb)` (`72a99ad9c6fe1ab038157d11e6002a34`).
- Staging additionally has `change_orders.guided_state` and its own guided-builder, Billing lineage, and PDF bridge migrations. Production has equivalent state-model/PDF functionality through differently numbered integration migrations. The `save_job_change_order_draft` function definitions differ, so they must not be overwritten by a blanket migration replay.
- Production's `20261003131120_reconcile_carolina_retina_co9_revision.sql` is a one-time data correction. **Never replay it in Staging or a future environment.**
- The Production-specific Sept 29 authorization fixes are already represented by equivalent, differently numbered Staging migrations.
- No database mutation is required merely to test this candidate on Staging. Before any later Production promotion, rehearse the Staging-only migrations against a current isolated Production copy, identify actual schema deltas, and apply only reviewed, environment-appropriate migrations with a recovery point.

## Remaining gates before alignment

1. Confirm whether the separate uncommitted Inventory Management batch-editor candidate should remain out of this release. It is not in this integration branch.
2. Review the merge diff and authenticated Staging workflows: inventory return path, catalogue selection/search, Change Order draft/preview/PDF, guided draft, Billing continuity, dashboard My Work, and financial import.
3. Publish this candidate to Staging only after confirming Staging-specific environment variables and deploy settings. Do not promote it automatically to Production.
4. Obtain owner acceptance on Staging. Rehearse only the needed Staging-to-Production schema changes on a disposable current Production copy and confirm recovery capability.
5. Cut a new pre-1.0 release/tag from the accepted candidate, deliberately promote to `main`, deploy Production, then verify live smoke tests and record both deploy IDs.
6. After both sites are verified at the same release code, rebase or recreate the Development branch from that release. Keep its unfinished Inventory Management work separate for the next Staging cycle.

## Rollback

- Before Staging publication, abandoning this isolated branch leaves both live sites unchanged.
- For a Staging frontend regression, republish the verified Staging deploy `6ac011fa7c384ca852dc2f9c`; do not reset its database.
- For a later Production frontend regression, republish release `v0.6.0` deploy `6ac100faf928bf000863128c` while separately assessing schema/data compatibility. Database restore is a last resort: it can lose writes after the recovery point and does not include Supabase Storage objects.

This is a preparation checkpoint, not authorization to deploy or migrate Production.
