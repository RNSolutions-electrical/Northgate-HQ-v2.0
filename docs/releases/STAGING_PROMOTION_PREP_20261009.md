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

## October 9 E.O.S. acceptance and import-plan follow-up

**Sync marker:** `EOS-PRODUCTION-IMPORT-PLAN-20261009-1110-EDT-RYAN_NORTHGATE`

Ryan accepted the signed-in Staging Award Reversal flow after its controlled Staging deployment. The preceding owner report also accepted the Silas-guided Change Order flow. These close the specific owner-reported browser gates, while the cross-module, Production-copy migration, recovery, and final release gates remain. The Staging E.O.S. Job-link and Award Reversal migrations must be included in the later targeted database delta.

`scripts/plan-eos-production-import.mjs` is a **read-only** source manifest: no database connection or write mode. It verifies 41 unique source pursuits (33 General, eight Electrical), 29 client labels, eight blank-client rows, five original Job numbers retained as source text, and zero inferred Job or manager links. It preserves exact ambiguous client and manager labels. `src/modules/eos/eosProductionImportPlan.js` provides the pure mapping/validation model and `tests/eosProductionImportPlan.test.js` guards these decisions. The existing `scripts/import-eos-workbook.mjs` is Staging-only and can auto-link exact Job-number matches; it must **not** be reused for the initial Production import. A separate idempotent Production writer, source-identity collision handling, and an isolated restore rehearsal are still required before any live import.

A read-only live object check reconfirmed on October 9 that Production lacks the E.O.S. tables and Award Reversal RPC, `change_orders.guided_state`, `job_budget_health_acknowledgements`, and `read_my_job_responsibilities()`, while Staging has them. This is an object-presence check, not a complete schema-diff certification. No Production schema, data, app, or branch was changed by this step.

## October 9 test-gate follow-up

**Sync marker:** `STAGING-PROMOTION-TEST-GATE-20261009-0912-EDT-RYAN_NORTHGATE`

The Inventory breadcrumb's authorized hierarchy-to-link mapping was extracted into a small pure module and its test now exercises that same model without Vite's failing CommonJS SSR fixture. The rendered component still uses React Router `Link` and the same Storage destination, ancestor order, current-location marker, and title text. The obsolete fixture was removed. The explicit suite now passes **297/297**; the Staging-identity compile-only build passes with the same non-blocking XLSX/chunk warnings. This clears the local test-harness gate but does not replace signed-in cross-module acceptance or a Production-configured build.

A read-only live object check reconfirmed that Production lacks the five E.O.S. tables, `job_budget_health_acknowledgements`, and `read_my_job_responsibilities()`, while Staging has them. Both have `save_job_change_order_draft(...)` with the same signature but different definitions as noted in the prior audit. This remains a selective-migration task, not a blanket Staging migration replay.

The correction was committed as `cc7bbcfb9dcdfe7d231522c004d622cd1dc4a17a` and pushed to the development and `staging` branches. Netlify reports the Staging site's ready/current deploy `6ac8e8634c128300081cc10d` for that exact commit, published at 2026-10-09 09:13:24 EDT with no secret-scan matches. Production was not deployed.
