# Estimating workspace integration — September 16, 2026

Status: release authorized September 16, 2026. Migration applied as version
`20260916180034`; actual-schema rollback tests passed. Commit/deployment verification
is recorded in SYNC_STATUS.md. Local Old/New prototype and unrelated historical
build directories are preserved. The initial local-only findings below are historical.

## Implementation

The approved exploration design now runs in the existing Workbench editor and
route, rather than a second estimator. Overview is the landing section. It includes
editable project information, default rates/markups, scope, summaries, associated-job
navigation and the checklist banner. Existing approval, revision snapshots and
Job/Change Order/Service Call handoff endpoints remain authoritative.

Pricing uses Entry → Work Item → Component → material/labor rows. Group metadata
is additive to the existing flat pricing lines; legacy documents need no rewrite.
It includes jump navigation, stable decimal editing, explicit-zero validation,
work-item rate overrides, catalogue selection and custom-material promotion.
Shared catalogue edits never retroactively update estimate prices/hours. Missing
catalogue information is highlighted in estimating catalogue results and linked
resource details. Temporary material codes carry a review flag.

Takeoff provides ordered/export bulk selection, persisted hide/unhide annotations,
aligned controls, RFQ and internal exports. RFQ CSV is Excel-compatible and includes
blank vendor pricing columns, never our assumed costs. PDF is print/save-PDF.
There is no native XLSX exporter in this pass. Detailed internal, no-dollar field,
and entry-summary reports use explicit audience-specific data projections.

Proposal actions appear at both ends, blank sections are omitted, associated-job
address defaults are saved/exported consistently, and only new estimates receive
the introductory text. Company exclusions and legal terms remain user-entered;
no unapproved legal boilerplate was invented.

Library Simple/Detailed preference persists in browser storage and is shared by
library/picker. Incomplete resources are highlighted and editable. Duplicate creates
independent IDs. Quotes/packages support reasoned archive and confirmed Unaward,
retaining records. Shared checklist addition reuses catalogue-edit authority;
retirement is Developer-only with a reason and never deletes historical answers.
Existing live-checklist behavior remains: a new definition can require an existing
draft to refresh before finalization. Approved snapshots retain their prior checklist.

## Database migration

`20260916173238_estimating_workspace_integration.sql`:

- Add `assemblies.component_groups` JSONB and array constraint.
- Add `assembly_items.component_group_id` and `items.catalogue_draft`.
- Add invoker `validate_workbench_structure` for grouping/rate/archive integrity.
- Extend existing `save_estimate_workbench`, `save_assembly_library`,
  `workbench_handoff_pricing`, and `approve_workbench_estimate_internal`.
- Add narrowly scoped `save_estimating_catalogue_material` and
  `manage_estimate_checklist`, using existing department/permission helpers,
  atomic audit writes, stale checks and restricted function grants.
- Catalogue creation uses a stable candidate ID for retry safety; normalized code
  writes are transaction-locked. Existing code duplicates are rejected, not merged.
- No new tables, routes, permission system, destructive backfill, snapshot rewrite,
  or RLS weakening. Existing material audit trigger behavior is retained.

Labor override calculations and cent rounding are consistent between UI, approval
and handoff. Existing approved snapshots are not recalculated.

## Verification actually performed

- `node --test`: 124 passed, zero failed.
- `node scripts/verify-estimating-workspace-db.mjs`: isolated PGlite using real
  migration/functions/RLS. Save/reopen, approval/handoff totals, immutable previous
  snapshots, grouped library round trip, zero/blank/orphan validation, stale writes,
  catalogue create/retry/review, role denials, checklist controls, and audit-failure
  rollback passed. No production writes; no multi-session concurrency claim.
- `node scripts/verify-estimating-workspace-browser.mjs`: actual editor with
  synthetic callbacks. Decimal typing, custom catalogue promotion without snapshot
  changes, catalogue selection, save/reopen, takeoff controls, no-price RFQ, toolbar
  alignment, library edit/duplicate/persistence, viewer locks, proposal actions and
  approval callback passed. Responsive widths 1440/1024/390 checked. This is not an
  authenticated end-to-end production test.
- Compile-only Vite build passed using explicitly nonproduction placeholders.
  `.temp/estimates-integration-build` MUST NOT be deployed. Existing large-chunk
  and XLSX mixed-import warnings remain.
- Five synthetic PDF types generated with `verify-estimating-workspace-pdfs.mjs`.
  All 13 pages rendered and visually inspected: no clipping/overlap; no assumed
  pricing/internal notes in field/RFQ; blank proposal sections omitted.
- `git diff --check` passed. No live data or credentials used in fixtures.

## Release order and remaining checks

1. Obtain authorization to migrate, commit/push and deploy. Recheck remote main and
   the live definitions before replacing functions, preserving other-machine work.
2. Apply migration to the intended Supabase project, then verify schema/grants and
   authenticated role behavior. Schema must precede frontend: the new reads include
   additive columns. Do not remove columns to roll back; keep data intact.
3. Create a real target-environment build with verified Supabase/Clerk settings;
   never publish the compile-only placeholder artifact.
4. Commit/push scoped source/migration/tests/docs with a new sync marker and deploy.
   Do not accidentally include historical dist directories or test fixtures in
   the production output. Update SYNC_STATUS only after actual release verification.
5. Signed-in acceptance: open an existing draft and an approved snapshot, save
   grouped resources, promote a material, edit shared library, exercise checklist
   role boundaries, export/print, and submit through the established handoff.

Still needed from Ryan: approved company exclusion/terms templates, when ready.
Live database/Clerk/Netlify acceptance and actual-printer testing remain release
checks, not claims of completion from the isolated tests.

## Authorized release checks

- Remote main matched HEAD; four targeted live functions matched reviewed originals.
- Applied migration `20260916180034`; columns, restricted grants and history verified.
- `verify-estimating-workspace-live.sql` passed using real authenticated permissions
  in a rollback-only transaction: draft save, stale rejection, approval total $51.06,
  grouped library, catalogue blank/zero/retry/audit, checklist add/retire, RPC grants.
  Initial test-only ambiguous variable corrected; no application schema fix needed.
- Existing `verify-checklist-handoff-live.sql` also passed ($72.97), exercising
  both finalization gates and existing/new Job/CO/Service Call handoff.
- 124 unit tests, isolated DB tests and browser fixture tests rerun successfully.
  Start the fixture with `node scripts/serve-estimating-test.mjs` when port 5320
  is free; browser verification uses synthetic callbacks, not real signed-in data.
- Production-configured build: `.temp/estimating-release-20260916`, using only
  existing public production Clerk/Supabase client settings. No environment changes.
- Security advisors: pre-existing findings unchanged. The two added findings are
  intentionally authenticated, permission-checked transaction RPCs for catalogue
  and checklist management. Neither is executable by anon. See the
  [Supabase authenticated-definer guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Signed-in user browser acceptance and physical-printer tests remain Ryan's checks.

### Published release

Feature commit `d3fd73c23b889b26c857a03347dc58618d36a390` is pushed to main.
Netlify production deploy `6aaada89430eb80009564f8b` published that exact commit
at 18:06:26 UTC on September 16. `verify-estimating-release.mjs` passed: HTML and
all 15 assets match by SHA-256/MIME, production public settings and new features
present, deep links resolve, anonymous RPCs denied, existing functions retained.
Unauthenticated browser startup reached configured Clerk sign-in without uncaught
JavaScript errors. Netlify scanned 700 files with zero secret matches.
Sync marker: `SAPPHIRE-ESTIMATING-WORKSPACE-20260916-001`.
