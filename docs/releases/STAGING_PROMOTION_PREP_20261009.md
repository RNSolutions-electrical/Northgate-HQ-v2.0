# Staging whole-release preparation — October 9, 2026

**Status:** Candidate preparation only. No Production migration, data import, merge, tag, or deployment is authorized by this note.

**Sync marker:** `STAGING-PROMOTION-PREP-20261009-0909-EDT-RYAN_NORTHGATE`

**Recorded:** 2026-10-09 09:09 EDT (UTC-04:00), machine `Ryan_Northgate`, checkout `job-assignment-fix`, branch `dev-eos-pursuit-tracker-20261006`.

Read with [the full promotion audit](STAGING_FULL_PROMOTION_AUDIT_20261008.md); this records the owner's scope decisions and the next technical gate, not a replacement for the audit.

## Owner decisions

- Include the E.O.S. pursuit tracker and import the 41 source pursuits into Production **after** reviewing unresolved client, manager, and Job mappings. Do not copy Staging QA records or Staging-specific grants.
- Include the Staging-only Silas guided Change Order builder **after** signed-in acceptance testing. It is not yet release-approved by this scope decision alone.
- Keep cost-report revenue import **preview-only** for this release. Do not add a revenue write into Billing/SOV during promotion.

## Exact candidate and local checks

- Refreshed Git refs on October 9: checkout and `origin/staging` are both `4272269`; `origin/main` is 92 commits behind Staging and has no unique commits in the comparison. `4272269` and the intervening commits after app commit `7d54385` are documentation-only `[skip ci]`. The running Staging app still needs final deployed-commit verification just before release.
- Explicit Node test-file run: **293 passed, 1 failed** out of 294. The failure is `tests/storageReturnPath.test.js`: Vite's SSR fixture loader raises `ReferenceError: require is not defined` while evaluating its React rendering harness. This is a test-runner/module-loading failure, not an asserted breadcrumb mismatch; it must be resolved or replaced with equivalent verified coverage before calling the full suite green.
- A compile-only Staging-identity Vite build passed with placeholder public keys, transforming 2,260 modules. This checks compilation, **not** live Clerk/Supabase connectivity or a Production-configured build. It emitted existing large-chunk and XLSX mixed-import warnings; no build error.
- The worktree was clean after these read-only/build checks. No Production system was changed.

## E.O.S. mapping review

The source dry-run still reports 41 pursuits: 33 General and 8 Electrical. It lists manager labels `DW`, `Dave`, `Eric`, `Jason`, `Ryan`, and `Tim`; these are source labels, not verified account links. Nine source client labels require identity review: `Kyle Koyne`, `Kyle Coyne/BEACON`, `GRR`, `R&L`, `Alex/Pete`, `Kyle & Emily Reece`, `Walt/Caty`, `Alex kallimanis`, and `Kyle Coyne`. Eight pursuit rows have no source client. Preserve source labels unless the owner verifies a consolidation.

All five source Job numbers previously unmatched on Staging now have unique exact-number matches in Production, based on a read-only Production query:

| Source Job # | Production Job name | Division |
| --- | --- | --- |
| 26-022 | Levitate pendants | Electrical |
| 26-023 | Beacon Partners (3414 N Duke) | Electrical |
| 26-024 | Anderson Glover | Electrical |
| 26-026 | Raleigh Mechanical | Electrical |
| 26-028 | Loden Properties | Electrical |

These number matches are **not yet approved links**. Review the source description against each Job before assigning `job_id`. Do not assume a number alone proves the same work, and do not post pursuit planning value to Job budget.

## Next gates, in order

1. Resolve or isolate the one test-runner failure and rerun the explicit suite. Review the candidate diff for unfinished features, environment-specific values, and any Staging-only fixtures.
2. Complete owner acceptance of the guided CO builder on Staging: both entry points, interrupted draft/resume, AI-off/manual path, line pricing, stale-edit guard, handoff, permissions, and phone layout. Complete the financial cost-report/Documents file-open and unauthorized-user checks. Exercise estimate and vehicle detail with safe records.
3. Finalize E.O.S. client/manager/Job mapping and an idempotent Production import plan; no data import before the schema and app are ready.
4. Author a **targeted** Production database delta from the current Production schema; do not replay all Staging migrations. Rehearse on a fresh isolated restore with historic Change Order, Billing, Job, RLS, Storage, and financial-total checks. Confirm recovery point and cost before creating a paid restore.
5. Build the exact candidate with Production-scoped environment configuration, verify the final Staging deploy and cross-module smoke tests, then request separate approval for Production migration/data import/merge/deploy. Preserve a forward-repair rollback path and release notes.

No Production write is part of this preparation step.
