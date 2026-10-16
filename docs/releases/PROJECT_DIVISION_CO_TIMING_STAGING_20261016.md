# Project-division CO attachment timing — Staging, 2026-10-16

Ryan authorized fixing/testing this timing defect on Staging and preparing a separate legacy-job division-link repair plan at 20:46:39 UTC. Production deployment and live customer-record correction are excluded.

## Cause and migration

The existing attachment trigger updated an unassigned `##.CO` financial row with a new project-division ID in a BEFORE INSERT event, before the parent row existed. The immediate FK correctly rejected that update. This is an August trigger defect, independent of the v0.9.3 Add Line UI correction.

CLI-generated source: `supabase/migrations/20261016204812_fix_project_division_co_attachment_timing.sql`. It changes only the existing attachment trigger to AFTER INSERT, keeping its name and function. Alphabetical AFTER trigger order attaches the existing CO before `ensure_project_division_change_order_line_trigger` checks whether one must be created. No constraints, functions, ownership, grants, RLS policies or business data are changed. Preflight rejects unexpected/disabled trigger configurations; a five-second lock timeout and 30-second statement timeout bound application. Reapplication is safe.

Target: persistent Staging branch `fazfwzbuesvzhgodckiw`, PostgreSQL 17.6, parent Production `keogysnoukbendfkfjcn`. Base frontend/repository state: Staging receipt `d82a593`, existing deployed application `76221e03` / Netlify `6ad277ec3e1d3405f3a50496`. The independent estimate review-scroll fix remains intact and Staging-only. This database-only change requires no frontend rebuild or replacement.

## Validation

- Portable regression: `scripts/verify-project-division-co-timing.mjs`, reading the actual repository function/trigger definitions. It can use PGlite or a dedicated local PostgreSQL cluster through `PG_TEST_URL` and `PG_MODULE`; it refuses remote hosts and requires the dedicated synthetic user.
- PGlite isolated reproduction produces the exact `23503` FK error with the old BEFORE timing. Entire failed template calls roll back earlier division/line/audit/baseline work.
- Exact migration and repeat application pass in local PostgreSQL 18.4. Unexpected trigger preflight failure leaves the original enabled BEFORE trigger intact after rollback. Every function definition hash, owner and ACL is unchanged by the timing migration.
- Corrected timing reuses the existing CO ID, preserves amount vectors, creates no duplicate CO, and supports empty/existing/archived-division cases. A later protected alignment without a reason still fails and rolls back the entire transaction.
- Genuine two-connection test: the second simultaneous template application waits on the existing job lock; after the first commits it reports zero new/aligned lines or divisions. No duplicate division/CO and no amount changes.
- Staging's actual authorization evaluator was checked read-only under `authenticated` JWT context: an existing authorized actor receives budget approval authority; a nonexistent actor does not. Authenticated RPC execute permission remains available while the internal authorization gate decides access. Anonymous callers cannot execute the template RPC; authenticated callers cannot directly execute the trigger function. Local destructive/rollback tests use synthetic helpers; no real financial template was invoked for live authorization testing.
- Bounded named suite: 336 passed, 1 skipped, 0 failed. Application source and dependencies are unchanged. `git diff --check` passes.

Synthetic outputs and temporary local database/runtime are ignored under `.temp/project-division-co/`. The local server is stopped after testing. Detailed customer-specific reconciliation is retained locally for review, rather than publishing customer row IDs/notes in the repository. That plan maps only evidence-supported numeric prefixes and leaves three ambiguous rows unresolved. No repair of this or other customer jobs is included.

## Recovery and publication checks

The migration is transactional. A timeout or failed preflight must leave the previous trigger intact; do not retry after an uncertain result without reading the trigger definition and migration ledger first. Keep the exact predecessor definition as recovery evidence. If verification fails after successful application, stop affected template use and prepare a reviewed corrective migration; do not alter financial data, weaken the FK or blindly restore a database. Restoring the old BEFORE timing would reintroduce the known defect.

Before and after Staging application, compare the target trigger and function/ACL hashes, unchanged ensure trigger and FK, and full-row count/hash fingerprints for jobs, divisions, budget lines, revenue lines, financial baselines and change logs. Security-advisor notice categories should remain unchanged. Add the exact ledger/source/commit receipt after successful deployment. Keep main and Production untouched.
