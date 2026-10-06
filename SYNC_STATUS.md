# Northgate HQ Cross-Machine Sync Status

## Documents summary-card cleanup on Staging — DOCUMENTS-COMPACT-STAGING-20261006-001

- Date/time: 2026-10-06 07:30 EDT (UTC-04:00); machine `RYAN_NORTHGATE`.
- App commit `b3dc7fdbfe7e563bb8352c7cb587b66926b4297a` on `staging` and `integration/staging-production-parity-20261005`; Netlify Staging published deploy `6ac4db933ec6830007320681` at 07:29 EDT on `staging.rnsolutions.net`.
- Removed the three redundant Visible Documents, Visible Jobs and Checklist summary cards, plus the otherwise isolated development-only Manage Job Docs card. The header and rail retain document/checklist counts, and the shared filters now sit directly below the workspace header. No document data, permission or schema change.
- Eight targeted Documents tests and a Staging-configured Vite build passed. A signed-in browser check confirmed the card-free layout and immediate access to filters and document rows. No Production branch/site/database change; owner visual acceptance remains pending.

## Documents shared filters on Staging — DOCUMENTS-FILTERS-STAGING-20261006-001

- Date/time: 2026-10-06 07:24 EDT (UTC-04:00); machine `RYAN_NORTHGATE`.
- App commits `079eb328005fc5d92e1076b4e1959cf158a002cf` and clarification `c0a3553f0a20f830642d7fc468869817a021caa7` on `staging` and `integration/staging-production-parity-20261005`; Netlify Staging published current deploy `6ac4da3ba9785700081625ad` at 07:23 EDT on `staging.rnsolutions.net` (initial filters deploy `6ac4d991fbbe290008d56551`).
- The Index filters now persist while switching among all four Documents views. Checklist category counts reflect matching documents, while its global navigation badge remains the unfiltered total; a category with files outside the filter says “No match,” not “Missing.” Owner Scopes and Controls retain their reference information and show a filtered document list beneath it.
- 268/268 explicit Node tests and a Staging-configured Vite build passed for the first commit; targeted filter tests and another build passed for the clarification. Signed-in browser checks covered Index, Checklist, Owner Scopes, Controls, persisted type filter, and “No match” status. No migration or Production branch/site/database change. Owner visual acceptance remains pending.

## Documents tree Staging trial — DOCUMENTS-TREE-STAGING-20261006-001

- Date/time: 2026-10-06 06:50 EDT (UTC-04:00); machine `RYAN_NORTHGATE`.
- App commit `f9d97d9a2726b78f8f4efee7e9907ed63465962e` on `staging` and `integration/staging-production-parity-20261005`; Netlify Staging published deploy `6ac4d2220d8a060008f58339` at 06:49 EDT on `staging.rnsolutions.net`.
- Document Index, Job Checklist, Owner Scopes, and Controls now live in the persistent desktop rail, with the existing Index/Checklist/Owner counts. The duplicate desktop module sidebar is hidden; mobile retains Page Menu. Document reads, uploads, permissions, and storage are unchanged.
- 267 explicit Node assertions passed across isolated runs; a Staging-configured Vite build passed. Signed-in browser checks confirmed all four sections and URL-backed selection. Ryan accepted the Vehicles trial and approved proceeding to Documents. Documents owner visual acceptance remains pending. No migration or Production branch/site/database change; Inventory Management batch editing remains excluded.

## Vehicles tree Staging trial — VEHICLES-TREE-STAGING-20261006-001

- Date/time: 2026-10-06 06:42 EDT (UTC-04:00); machine `RYAN_NORTHGATE`.
- App commit `5ede2c591e3b8157881f2b7d6d69f56a7c363c90` on `staging` and `integration/staging-production-parity-20261005`; Netlify Staging published deploy `6ac4d06298c4fd0008ee7cef` at 06:42 EDT on `staging.rnsolutions.net`.
- My Vehicle, All Vehicles, Stock Vehicles, and General Fleet now live in the persistent rail; the Vehicles top menu matches. The duplicate desktop module sidebar is hidden, with the Page Menu retained on mobile. Department menu choices were removed because the vehicle department source is still incomplete; no vehicle data, assignment permissions, or schema changed.
- 265 explicit Node assertions passed across isolated runs, and a Staging-configured Vite build passed. Signed-in browser checks covered all four rail views and matching top-menu labels. This Staging account has zero vehicle records, so selected-vehicle detail tabs could not be exercised. Ryan accepted Vehicles on October 6 and approved proceeding to Documents. No Production branch/site/database change.

## Employees tree Staging trial — EMPLOYEES-TREE-STAGING-20261006-001

- Date/time: 2026-10-06 06:37 EDT (UTC-04:00); machine `RYAN_NORTHGATE`.
- App commit `a0ae013f3d6400a104e63218efcb7261ff3067d2` on `staging` and `integration/staging-production-parity-20261005`; Netlify Staging published deploy `6ac4cef0392d8b0008bbe803` at 06:35 EDT on `staging.rnsolutions.net`.
- My Profile and the permission-gated Employee Directory now live in the persistent desktop rail. Existing authorized department filters appear beneath the Directory; the prior Page Menu remains for mobile. Employee detail tabs, account setup, and permissions are unchanged.
- 262 explicit Node test assertions passed across two isolated runs; a Staging-configured Vite build passed. The default auto-discovery test run was interrupted after a local Vite cache lock with an existing preview, not an assertion failure. Signed-in Staging browser checks covered My Profile, Directory, and Construction filter. Ryan accepted the Employees trial on October 6 and approved proceeding to Vehicles. No migration or Production branch/site/database change; the Inventory Management batch editor remains excluded.

## Estimates tree Staging trial — ESTIMATES-TREE-STAGING-20261006-001

- Date/time: 2026-10-06 06:25 EDT (UTC-04:00); machine `Ryan_Northgate`.
- App commit `8afee97bcfa922d1483e88286db24cd39f0da20e` on `staging` and `integration/staging-production-parity-20261005`; Netlify Staging published deploy `6ac4cc07bf6aa00008f63670` at `staging.rnsolutions.net` at 06:23 EDT.
- The live Estimates workbench now shows Official Estimates, My Estimates, Review Submissions (for approvers), and Assembly Library in the persistent desktop rail. Directory shortcut buttons remain available on small screens; an opened estimate retains its own editor navigation. An older inactive Estimates workspace component was not changed.
- 279/279 explicit Node tests and a Staging-configured Vite build passed. Signed-in Staging smoke checks confirmed all four rail destinations and return from Assembly Library. This test account has no estimates, so open-estimate navigation remains unverified. Ryan accepted the Estimates navigation trial on October 6 and approved proceeding to Employees. No migration or Production branch/site/database change. The unfinished Inventory Management batch editor remains excluded.

## Jobs tree Staging trial — JOBS-TREE-STAGING-20261005-001

- Date/time: 2026-10-05 16:48 EDT (UTC-04:00); machine `Ryan_Northgate`.
- App commits `48f87d560c97729aaf3cb77b9bfeb649282ac069` and heading follow-up `5bcc5b80a9c11d8b6d87c734c369dc3b35de367f` on `staging` and `integration/staging-production-parity-20261005`; Netlify Staging published current deploy `6ac40d87ef5eb000087bc94a` at `staging.rnsolutions.net` at 16:50 EDT (initial Jobs deploy `6ac40cac591035000821f88b`).
- Jobs directory status filters now appear under Jobs in the persistent desktop workspace rail. The redundant desktop Jobs directory sidebar is hidden, while the mobile menu remains. An open job retains its own existing project tabs; Service Calls are unchanged.
- 277/277 explicit Node tests and a Staging-configured Vite build passed; the heading follow-up passed its targeted test and another Staging-configured build. Signed-in browser smoke checks confirmed the rail, filters, corrected heading, and unchanged open-job tabs. Ryan accepted the Jobs trial on October 6 and approved continuing to Estimates. No migration or Production code/site/database change occurred. The unfinished Inventory Management batch editor remains excluded.

## Inventory tree Staging trial — INVENTORY-TREE-STAGING-20261005-001

- Date/time: 2026-10-05 15:49 EDT (UTC-04:00); machine `Ryan_Northgate`.
- App commits `7374bf0140e639e97ad8a6dc7948ec5e3773a78d` and follow-up `024fed19e8c7068798294bd339392b4e46cb9613` on `staging` and `integration/staging-production-parity-20261005`; Netlify Staging published current deploy `6ac3feb865850000081e1d3e` at `staging.rnsolutions.net` (initial deploy `6ac3fe14a4556a0008b6063f`).
- Inventory's existing permission-filtered sections now appear in the persistent desktop workspace rail. The old desktop module sidebar is hidden to reclaim content width; mobile retains its existing Page Menu. The Stock Reviews badge is preserved in the rail. Storage and Inventory Management workflows are unchanged.
- 276/276 explicit Node tests passed before the badge refinement; targeted navigation tests and Staging-configured Vite builds passed after the badge and route-selection refinements. Signed-in visual acceptance remains open. No migration or Production code/site/database change occurred. Inventory Management batch editing remains excluded.

## Dashboard tree first pass on Staging — DASHBOARD-TREE-STAGING-20261005-001

- Date/time: 2026-10-05 15:28 EDT (UTC-04:00); machine `Ryan_Northgate`.
- App commits `34661eb5d1205ea85c2ac3a00fa9757454a7b786` and follow-up `55cf75e3e9e2ca9790f6254ee15df1f318d0a6ba` on `staging` and `integration/staging-production-parity-20261005`; Netlify Staging published current deploy `6ac3fa1cf731d70008a43334` at `staging.rnsolutions.net` (initial deploy `6ac3f99e62a77200081844d2`).
- The persistent app rail now includes the Dashboard section tree; on mobile, Dashboard Sections opens a drawer. Project Health and assigned reviews open from Northgate HQ Pulse instead of filling the top of the page. Personal Tools is recorded in `docs/ROADMAP.md` as a future feature and is not a working navigation destination.
- A Staging-configured Vite build and 273 explicit Node tests passed for the first commit; the follow-up anchor fix passed its targeted navigation tests and Netlify build. The browser reached the Staging sign-in screen, so signed-in visual acceptance is still required. Ryan reported the prior Staging inventory access fix working. No Production code, site or database changed; no new migration in this Dashboard slice.

## Staging inventory access repair — ENV-STAGING-INVENTORY-20261005-003

- Date/time: 2026-10-05 15:07 EDT (UTC-04:00); machine `RYAN_NORTHGATE`.
- `staging` and `integration/staging-production-parity-20261005` contain app commit `35b4c71148ba77b25f297ac6936cb66cca9246ce`. Netlify Staging published deploy `6ac3f50e62e0af00081c092a` at `staging.rnsolutions.net`.
- Staging Supabase `fazfwzbuesvzhgodckiw` applied migration `restore_staging_inventory_read_grants` (ledger version `20261005190246`; local file `20261005190103_restore_staging_inventory_read_grants.sql`). It restores authenticated `SELECT` on six inventory tables while retaining RLS and denying anonymous table reads. Production Supabase was not changed.
- The inventory stock-review request now uses the shared environment-aware Clerk token helper. 259/259 Node tests and a Staging-configured Vite build passed. Authenticated owner retest of Inventory, Storage, filters and stock-review badge is pending.
- The owner's Dashboard layout ideas are pending a sketch; no Dashboard UI change is included. Inventory Management batch editing remains excluded. No Production code or site was changed. See [the parity checkpoint](docs/releases/STAGING_PRODUCTION_PARITY_20261005.md).

## Staging parity candidate published — ENV-PARITY-STAGING-20261005-002

- Date/time: 2026-10-05 14:13 EDT (UTC-04:00); machine `RYAN_NORTHGATE`.
- The `staging` branch fast-forwarded to `04fc74907e8e73b5f4b77701f70ed93283b9a2bd`. Netlify Staging site `northgate-hq-staging` published deploy `6ac3e85f3e83670008da51ee` at `staging.rnsolutions.net`; Netlify reported build, redirects, headers and functions complete.
- The live Staging URL displayed `[STAGING] Northgate HQ` and redirected unauthenticated visitors to the Staging Clerk sign-in. Authenticated owner acceptance is still pending.
- `main`, Production Netlify, and both Supabase databases were not changed. The uncommitted Inventory Management batch editor remains excluded. Do not promote to Production before acceptance and isolated schema rehearsal.
- Release sequence and rollback: [parity checkpoint](docs/releases/STAGING_PRODUCTION_PARITY_20261005.md).

## Staging / Production reconciliation candidate — ENV-PARITY-20261005-001

- Date/time: 2026-10-05 13:30 EDT (UTC-04:00); machine `RYAN_NORTHGATE`.
- Branch: `integration/staging-production-parity-20261005`, based on `origin/staging` and merged with `origin/main` locally. Neither deployed branch or database changed at this checkpoint.
- Production is `rnsolutions.net` at `v0.6.0`; Staging is `staging.rnsolutions.net` with additional unfinished Staging features. The isolated candidate combines the code while keeping the uncommitted Inventory Management batch editor separate.
- Placeholder-config Vite build and 256 explicit Node tests passed. Authenticated Staging acceptance and database-migration rehearsal remain release gates.
- See [the parity checkpoint](docs/releases/STAGING_PRODUCTION_PARITY_20261005.md) for branch/deploy IDs, database differences, exact sequence, and rollback.

## Production v0.5.4 Change Order client PDF details — CO-CLIENT-DETAILS-PROD-20261002-001

- Date/time: 2026-10-02 13:17 EDT (UTC-04:00); machine `RYAN_NORTHGATE`.
- Release commit: `ca35b83c867d2a94e01c7f45ea69be14106a5282` on `main`;
  immutable tag and GitHub Release `v0.5.4`.
- Production Supabase migration `change_order_client_pdf_breakdown` recorded as
  `20261002171310`; staging was not changed.
- Netlify Production deploy `6abfe6d0df400a474bf2171b` published the
  release commit on 2026-10-02 17:16:17 UTC. Netlify's current site deploy
  matches. Signed-out live URL redirects to Clerk sign-in; authenticated UI
  acceptance remains for the owner.
- Release record and rollback: [v0.5.4](docs/releases/CHANGE_ORDER_CLIENT_DETAILS_20261002.md).

## Change Order schema rehearsal limitation — CO-CLIENT-DETAILS-20261002-003

- Date/time: 2026-10-02 12:34 EDT (UTC-04:00); machine `RYAN_NORTHGATE`.
- Owner-approved temporary Supabase branch was created at $0.01344/hour,
  but Supabase replayed only 31 early migrations, leaving Change Order tables
  absent. The migration could not be rehearsed there. The branch was deleted
  and removal verified; Production and Staging were not changed.
- Candidate remains on `feature/change-order-client-details-20261002`.
  Full-schema rehearsal and final Production-config build remain release gates.
  See [release checkpoint](docs/reviews/CHANGE_ORDER_CLIENT_PDF_DETAILS_20261002.md).

## Change Order PDF release verification — CO-CLIENT-DETAILS-20261002-002

- Date/time: 2026-10-02 12:25 EDT (UTC-04:00); machine `RYAN_NORTHGATE`.
- Branch: `feature/change-order-client-details-20261002`, based on current
  `origin/main` commit `85047fc`. Production and Staging remain unchanged.
- All 231 explicit Node tests, six isolated PGlite assertions, and the
  placeholder-config production compile pass. A three-page sample client PDF
  was rendered and visually checked. Project address is escaped in the PDF.
- Read-only Production schema checks match the expected legacy markup and
  revision functions; the new column is not applied. An isolated full-schema
  migration rehearsal and actual Production-config build remain release gates.
  See [release checkpoint](docs/reviews/CHANGE_ORDER_CLIENT_PDF_DETAILS_20261002.md).

## Optional Change Order PDF details — CO-CLIENT-DETAILS-20261002-001

- Date/time: 2026-10-02 12:06 EDT (UTC-04:00); machine `RYAN_NORTHGATE`.
- Branch: `feature/change-order-client-details-20261002`, based on `85047fc`.
  **Local, uncommitted and unpushed**; another machine cannot fetch it yet.
- Optional per-line client PDF details, quantity/price or manual amounts,
  mismatch warning and optional calculated remainder are implemented locally.
  The CO line total remains authoritative; existing financial posting is not
  changed. Migration `20261002160002_change_order_client_pdf_breakdown.sql`
  is prepared but unapplied. No Production or Staging deployment occurred.
- 231 Node tests, six isolated PGlite SQL assertions and a placeholder Vite
  compile pass. Full-schema rehearsal, actual PDF print QA, fresh remote sync,
  owner review and configured build
  remain release gates. See
  [the implementation checkpoint](docs/reviews/CHANGE_ORDER_CLIENT_PDF_DETAILS_20261002.md).

This file is the repository-visible source of truth for Codex handoffs between machines.

## Latest planning checkpoint — COMPASS-ROADMAP-20260928-001

- Date/time: 2026-09-28 16:00 EDT (UTC-04:00); machine `Ryan_Northgate`.
- Mode: Exploration. Documentation-only checkpoint, `[skip ci]`; no migrations
  or deployment. Local branch `codex/staging-demo-integration` -> `origin/staging`.
- Base: `1ae6a949602710798205ef1e203f91a229dd1537`. Resolve this checkpoint's
  commit with `git log origin/staging --format="%H %cI %s" --grep=COMPASS-ROADMAP-20260928-001 -1`.
- Start at [docs/ROADMAP.md](docs/ROADMAP.md), then
  [the intake](docs/planning/EXPLORATION_INTAKE_20260928.md). Both full prompts
  are archived under `docs/planning/sources/`; no local attachments required.
- Production: v0.5.2, app `86933c87717d630561e2ff95c624723583af44e2`, deploy
  `6ababcbc35bdf800087a45e8`; documentation head before intake `992e343`.
- Staging: app `d2e4f61153e6cfe871678a2f8c003266e4284458`, deploy
  `6ab6a4cea66ec50008a4acdd` (September 25 recorded evidence). CO/credit state
  model and Billing continuity are not Production-promoted; open gates remain.
- Main documentation mirror uses `COMPASS-ROADMAP-20260928-002`. These are
  documentation commits only, not authorization to merge the application branches.
- Preserve local work, fetch origin, verify branch + marker, then read HANDOFF.
  No claim is made that another machine has already fetched this checkpoint.

## Historical release — TOPAZ-COMPONENT-INPUTS-20260922-001

- LIVE September 22, 2026: Estimate Component names, descriptions, quantities,
  units, costs, labor hours, stages and resource notes use native buffers; pending
  values flush into Save Changes, Copy and catalogue actions. Catalogue search uses
  isolated deferred query state.
- Feature commit `779a9960c1b7cb5e11f9c8a109f40d2fa74e8a60`, pushed to main.
- Netlify production deploy `6ab29ef5e2faa700086aa55f` ready/published from that
  exact commit at 2026-09-22 15:30:17 UTC with no deployment error.
- Live Workbench JavaScript returns 200 with correct MIME and contains the buffered
  Component implementation. 197 tests and production build pass. No migration.
- Read HANDOFF Entries 294–295. Preserve local work, fetch/fast-forward main and
  verify this marker. Final documentation checkpoint uses `[skip ci]`.

## Previous release — EMERALD-NATIVE-NOTES-20260922-001

- LIVE September 22, 2026: inline Work Item notes use browser-native uncontrolled
  buffering, eliminating React state updates and parent rendering from the
  per-character path while retaining blur/save/copy/open flushing.
- Feature commit `db627bf4fb6e882af38c808c7c8c481bca0254c6`, pushed to main.
- Netlify production deploy `6ab29c530df2240008c2d6ed` ready/published from that
  exact commit at 2026-09-22 15:19:12 UTC with no deployment error.
- Live Workbench JavaScript returns 200 with correct MIME and contains the native
  input implementation. 196 scoped tests and production build pass. No migration.
- Read HANDOFF Entries 292–293. Preserve local work, fetch/fast-forward main and
  verify this marker. Final documentation checkpoint uses `[skip ci]`.

## Previous release — SAPPHIRE-NOTE-PERFORMANCE-20260922-001

- LIVE September 22, 2026: inline Work Item note typing uses isolated row-local
  state, committing on blur and merging pending text into Save Draft, Copy or Open
  without cloning and recalculating the full Estimate per keystroke.
- Feature commit `59fee551d2f15a486aecd92f36a4aa397d54ac12`, pushed to main.
- Netlify production deploy `6ab29a8c5821f4000898296a` ready/published from that
  exact commit at 2026-09-22 15:11:27 UTC with no deployment error.
- Live Workbench JavaScript returns 200 with correct MIME and contains the optimized
  local-state editor. 196 scoped tests and production build pass. No migration.
- Read HANDOFF Entries 290–291. Preserve local work, fetch/fast-forward main and
  verify this marker. Final documentation checkpoint uses `[skip ci]`.

## Previous release — RUBY-INLINE-NOTES-20260922-001

- LIVE September 22, 2026: editable internal Work Item notes appear directly in
  each All Entries/Entry workspace row between the description and workflow
  controls, persist through Save Draft and remain out of customer proposals.
- Feature commit `f6e0154b8b6e0b6344e95e56c6d9617d5be083b9`, pushed to main.
- Netlify production deploy `6ab26ff04caa6500086dfce1` ready/published from that
  exact commit at 2026-09-22 12:09:37 UTC with no deployment error.
- Live Workbench JavaScript returns 200 with correct MIME and contains the inline
  note control. 196 scoped project tests pass. No migration required.
- Read HANDOFF Entries 288–289. Preserve local work, fetch/fast-forward main and
  verify this marker. Final documentation checkpoint uses `[skip ci]`.

## Previous release — BRONZE-ESTIMATE-LAYOUT-20260922-001

- LIVE September 22, 2026: Estimate Entry and Work Item internal notes, reserved
  value/action spacing, bordered Work Item verification, stronger Components
  heading, bordered components and larger canonical hierarchy identifiers.
- Feature commit `59cb1d50f02604871daaab47b892ec71cf8dc898`, pushed to main.
- Netlify production deploy `6ab26c5accdc5c0008346c1f` ready/published from that
  exact commit at 2026-09-22 11:54:23 UTC with no deployment error.
- Live Northgate Workbench assets return 200 with JavaScript MIME and contain the
  release implementation. 196 scoped project tests pass. No migration required.
- Read HANDOFF Entries 286–287. Preserve local work, fetch/fast-forward main and
  verify this marker. Final documentation checkpoint uses `[skip ci]`.

## Previous release — JADE-ESTIMATE-ARCHIVE-20260921-001

- LIVE September 21, 2026 (September 22 UTC): Workbench estimate archive fix and
  aligned Estimates directory/create form.
- Feature commit `77c54889839c7af16708c28c3e9ba54f706dca13`, pushed to main.
- Netlify deploy `6ab1c56c50d3b3000824d07d` ready/published from that exact commit
  at 2026-09-22 00:02:07 UTC. Secret scan: 761 files, no matches.
- Migration applied as `20260922000116`; local file starts `20260921235409`.
  See MIGRATION_MAP; do not replay because timestamps differ.
- Live-schema draft/approved archive rehearsal passed and rolled back, preserving
  snapshots, documents and protected values. No estimates left archived by tests.
  Endpoint ACLs verified; security advisors unchanged. 193 tests, isolated archive
  regression, build and desktop fixture checks passed. Live Estimates routes and
  assets match exact release; authenticated browser acceptance not claimed.
- Follow HANDOFF Entries 284–285. Preserve local work, pull main and verify this
  marker. Final documentation checkpoint uses [skip ci].

## Previous release — AMBER-CATALOGUE-FILTERS-20260921-001

- LIVE September 21, 2026: Full Catalogue highlights missing pricing or labor on
  demand, excluding locations; Back to inventory retains browser filters and page.
- Feature commit `ad78b2c81815535fac0cb6334849b9f28c9534ef`, pushed to main.
- Netlify deploy `6ab1b8d82f5df200080320ef` ready and published at 23:08:25 UTC
  from that exact commit. Secret scan: 757 files, no matches.
- 193 tests, validation build, and local browser round-trip checks pass. Live HTML
  and referenced JS/CSS match the immutable deployment; feature/state code, live
  configuration, and Inventory/Estimate routes verified. Signed-in production
  interaction is not claimed. No migration or permission changes in this release.
- Read HANDOFF Entries 282–283. Preserve local work, fetch/fast-forward main and
  verify this marker. Documentation checkpoint uses [skip ci].

## Previous release — OPAL-CATALOGUE-20260921-001

- LIVE September 21, 2026: full material catalogue editing, vendor average pricing,
  NECA source-unit conversion, notes, optional stock hints/quantity, and separate
  v5 stock review with confirmed counts and authorized self-review.
- Feature commit: `fd21c6ddc78b063b1881b491538038ae6ad5979e`, pushed to `origin/main`.
- Netlify production deploy: `6ab1b3ac08065a0008197723`, ready/published from that
  exact commit at 22:46:23 UTC; secret scan 757 files, no matches.
- Supabase migration applied as `20260921224510`; local filename starts
  `20260921221242`. See MIGRATION_MAP; do not replay because timestamps differ.
- 191 local tests, isolated workflow database tests, production build, live-schema
  rollback rehearsal, endpoint ACL/RLS/default permissions, live routes/assets and
  anonymous RPC denial pass. Browser reaches configured sign-in; signed-in user
  acceptance remains. No actual stock, material records, or user grants changed.
- Follow HANDOFF Entry 281 and docs/reviews/FULL_MATERIAL_CATALOGUE_STOCK_REVIEW.md.
  Preserve local work, fetch/fast-forward main, and confirm this marker. Final
  documentation-only checkpoint uses [skip ci] to retain the verified deployment.

## Previous release — EMERALD-V5-FOUNDATION-20260921-001

- LIVE and reverified September 21, 2026. The v5 permission foundation, protected
  Primary identity, canonical 179-action catalogue, scoped evaluator, durable
  personal working copies, exact-payload change sets, My Estimates submission,
  Department-scoped review queue, and atomic Official Estimate promotion are live.
- Feature commit: `8201263c45e823230c136b7e153c0f042ee8ab09`, pushed to
  `origin/main` with subject `Implement v5 permission and estimate review foundation`.
- Netlify production deploy: `6ab0557698aae3000877f871`, ready and published from
  the exact feature commit at `https://rnsolutions.net` on September 20, 2026.
  Netlify secret scanning reported no matches.
- Production Supabase migrations are applied under versions `20260920214920`,
  `20260920214926`, `20260920214931`, `20260920215027`, `20260920215033`, and
  `20260920215037`. Do not replay the repository timestamps on another machine.
- Live verification confirms exactly one protected Primary binding, 179 active v5
  actions, all three Estimate submission/review/promotion RPCs, authenticated-only
  submission execution, and no existing personal working-copy rows at rollout.
- Focused v5 validation passes 29/29. The full local suite passes 146 tests; five
  environment-only failures remain from unavailable `pdf-lib` and sandbox port
  binding. Existing Supabase advisor findings remain backlog items and were not
  introduced as direct anonymous access to the v5 workflow tables.
- This release preserves the explicitly approved temporary Developer Pay App
  deletion exception. Signed-in browser acceptance remains Ryan's next action.
- Other machines must preserve local work, fetch and fast-forward `main`, verify
  this marker's sync commit and feature commit, and must not reapply the six live
  migrations. Continue from HANDOFF Entry 279 and the controlled sequence in
  `docs/reviews/V5_PERMISSION_USABILITY_REPOSITORY_MAPPING.md`.

## Previous release — RUBY-SOV-SAVE-20260918-001

- LIVE: September 18, 2026. New and edited Job Billing SOV lines now save through
  the job-aware `save_job_revenue_line` RPC instead of a legacy direct table write.
- The RPC requires existing `can_approve_budget` access, preserves protected-line
  validation, validates amounts, and saves the line plus its audit entry atomically.
  Table RLS remains enabled and unchanged; anonymous execution is denied.
- Hotfix commit: `bacec69`, pushed to `origin/main`.
- Migration `20260918180036_fix_job_revenue_line_save_rls.sql` is applied under
  the matching production version and its ACL/search-path configuration is verified.
- Netlify production deploy: `6aad7ca5563b513c69213f24`, published at
  `https://rnsolutions.net/northgate/`.
- Isolated PostgreSQL create/update/audit/denial tests and the production build
  pass. Live HTML, Jobs route and JavaScript MIME pass; the hosted JavaScript
  SHA-256 exactly matches the tested artifact and contains the RPC save path.
- No existing SOV, billing, Pay App, Change Order or financial records were changed.
  Other machines must preserve local work, pull `main`, and confirm this marker.

## Previous release — GARNET-JOBS-FINANCIALS-20260918-001

- LIVE: September 18, 2026. Job Financials now exports selectable Budget, Costs
  to Date, Change Orders, Monthly Forecast, Completion Forecast and Notes to PDF
  or CSV; Cost Code and Description are always included.
- Billing now supports scratch-built SOV lines plus Department-scoped reusable
  SOV templates. Template values are stored as percentages and applied with
  deterministic cent reconciliation without rewriting Job Financials.
- Unused zero-value Financial and SOV lines can be permanently deleted only when
  the server confirms no Change Order, Billing or Pay App history references them.
- Feature commit: `7bf835b`, pushed to `origin/main`.
- Netlify production deploy: `6aad76643a94578c98dd3cf7`, published at
  `https://rnsolutions.net/northgate/` from the exact feature commit artifact.
- Migration `20260918173055_job_financial_exports_deletion_sov_templates.sql`
  is applied under the matching production version. Live verification confirms
  both tables, RLS, two policies, authenticated grants and anonymous RPC denial.
- 127 unit tests, isolated PostgreSQL migration/RLS/RPC tests and the production
  build pass. Live HTML, Jobs deep link and JavaScript MIME pass; the live main
  JavaScript SHA-256 exactly matches the tested artifact and contains both features.
- Existing advisor and dependency findings are unchanged; no dependency versions,
  production records, role defaults or existing financial values were altered.
- Other machines must preserve local work, pull `main`, and confirm this marker
  and its sync-marker commit before beginning work.

## Previous release — TOPAZ-ESTIMATE-DECIMALS-20260916-001

- LIVE: September 16, 2026. Submission now accepts leading/trailing decimals
  consistently with estimate approval; blank/negative/invalid values still fail.
- Correction commit: `3907bf0ae899e7b132312a2b571267f4c13cd5be`, pushed to origin/main.
- Netlify production deploy: `6aaaf898ab7e5300072c815c`, ready/published at
  2026-09-16 20:14:32 UTC from that exact commit.
- Migration `20260916200942_workbench_decimal_validation.sql` applied as
  `20260916201141`. See MIGRATION_MAP; do not replay the different local timestamp.
- 124 scoped unit tests, isolated PostgreSQL regression, production build and
  live rollback-only approved-estimate-to-draft-CO regression passed.
- Actual Carolina Retina #11 Version 2 read-only total = approved $2,527.71;
  document and snapshot hashes unchanged. Ryan must retry Submit for review.
- Live HTML/all 15 assets match tested build by SHA-256/MIME; configuration,
  deep links and anonymous RPC denial verified. Security advisors unchanged.
- No frontend, role, permission, formula or saved-estimate changes. Netlify
  secret scan: 703 files, no matches. No synthetic fixture rows remain.
- See HANDOFF Entries 277–278 and docs/reviews/ESTIMATE_DECIMAL_VALIDATION.md.
- Final marker commit is documentation-only [skip ci]. Other machines must
  preserve their local work, pull main and confirm this marker.

## Previous release — SAPPHIRE-ESTIMATING-WORKSPACE-20260916-001

- Status: LIVE, verified September 16, 2026; approved estimating workspace integrated.
- Feature commit: `d3fd73c23b889b26c857a03347dc58618d36a390`, pushed to origin/main.
- Production deployment: `6aaada89430eb80009564f8b`, ready/published at
  2026-09-16 18:06:26 UTC from that exact commit through existing Git deployment.
- Live: https://rnsolutions.net/northgate/estimates
- Migration `estimating_workspace_integration` applied as `20260916180034`.
  Local filename `20260916173238_estimating_workspace_integration.sql`; see
  MIGRATION_MAP.md. Do not replay it because its timestamp differs.
- 124 unit tests, isolated database tests and browser fixtures passed. Both live
  rollback-only SQL suites passed; zero synthetic rows retained. HTML/all 15 assets
  match tested production build by SHA-256/MIME; deep links/configuration verified.
- Startup redirects to configured Clerk sign-in without uncaught JavaScript errors.
  Signed-in user acceptance and physical printing are not claimed; Ryan tests next.
- Netlify secret scan: 700 files, no matches. Existing Silas and disabled read
  endpoint retained. No environment, role-default or permission-bypass changes.
- Two new security advisor notices are the deliberately authenticated guarded
  catalogue/checklist RPCs; existing findings unchanged. See the release review.
- Read HANDOFF Entry 276 and docs/reviews/ESTIMATING_WORKSPACE_INTEGRATION.md.
- Final sync commit is documentation-only [skip ci], retaining verified deploy.
  Other machines must preserve local work, pull main and confirm this marker.
- Unrelated historical dist-* folders and the Old/New exploration prototype remain
  preserved locally, not included in the release. Company legal templates pending.

## Previous release — JUNIPER-INVENTORY-AUDIT-20260916-001

- September 16: authorized release of document tags, complete storage creation,
  parent physical-location inheritance and reviewed routine automatic audits.
- All three migrations are applied and rollback-only live tests pass. See
  MIGRATION_MAP.md for local-to-production version mapping and HANDOFF Entry 273.
- Source commit: `829b94a0c85c8285a99b712ca00fd3c5892baf3a`, pushed to origin/main.
- Production deploy: `6aaa9b15689e8b0008b7c9f5`, ready/published at
  2026-09-16 13:35:44 UTC from that commit via the existing Git build.
- Live: https://rnsolutions.net/northgate/. HTML and all 15 assets match the
  tested build by SHA-256 and MIME. Production config/deep links/anonymous RPC
  denial pass; northgate-read remains disabled and Silas remains deployed.
- Pull main on other machines and verify this marker before continuing.
- Final documentation/test-only follow-up is marked [skip ci]; the deployed source
  commit above remains authoritative. Startup redirects to Clerk without uncaught
  errors; hosted sign-in rendering/signed-in acceptance are not claimed (Entry 274).
- The local/unapplied checkpoints below are historical, superseded by this release.
- Backups remain backlog. Financial, technical, identity/access and permanent-delete
  protections remain; no permission bypass or inventory quantity rewrite.

## Pending local Inventory / audit-policy follow-up — September 16, 2026

- Storage creation includes physical location and materials/purpose; children
  inherit the nearest parent's location unless explicitly overridden. Ordinary
  storage lifecycle and reviewed routine operations use automatic server audit
  notes instead of mandatory prose. Financial/technical/access safeguards remain.
- Added unapplied migrations 20260916125643_inventory_creation_details.sql and
  20260916125644_routine_audit_notes.sql. Apply after the pending document-tags
  migration and before publishing this frontend. Recheck live functions first.
- No commit/push/deploy or live migration in this pass. Release marker remains
  SEQUOIA-HQ-WORKFLOWS-20260916-001; other machines do NOT yet have these files.
- Backups explicitly deferred to backlog. See HANDOFF Entry 272 and
  docs/reviews/INVENTORY_DETAILS_AND_AUDIT_POLICY.md for tests, scope and risks.
- The prior local checkpoint below is historical; its “only tagging changed”
  statement is superseded by this reviewed routine-audit follow-up.

## Pending local document-tag work — September 16, 2026

- Multi-department/custom tags, signed CO organization and Jobs-only filter choices
  implemented locally. Existing source files, approval/financial history and RLS
  retained. Service-call documents remain searchable.
- Migration 20260916112115_document_organization_tags.sql is NOT applied. Apply and
  verify it before deploying the new frontend. No new commit, push or deploy.
- Tests: 117 unit, 40 existing isolated database checks plus 33 tag assertions;
  mocked desktop/mobile tag UI and desktop/tablet/mobile document regressions;
  production-configured local build. See HANDOFF Entry 271 and the review document.
- Reason-prompt policy recorded; only tagging changed in this pass. Offsite backup
  policy proposed; nothing scheduled/exported/purchased. Existing provider coverage
  and destination/retention still need verification/approval.
- Released sync marker is still SEQUOIA-HQ-WORKFLOWS-20260916-001. This work and
  Entry 270's account-update notes remain local/uncommitted.

## Post-release account update — 2026-09-16 (local note)

- Owner-approved AFC reviewer grants are live for both Ryan Noel accounts. AFC add-on access is also enabled for the work account; both effective access checks pass. Other roles, permissions and assignments preserved.
- Ryan reports printing looks good. Real-input end-to-end acceptance remains pending. Historical documents remain Unclassified; no bulk classification performed.
- See HANDOFF Entry 270, including the existing batch-permission-editor allowlist limitation. These notes are not yet committed/pushed. No application deployment was needed; release marker remains SEQUOIA below.

## Previous durable sync marker — Checklist, AFC and Documents

- Marker: `SEQUOIA-HQ-WORKFLOWS-20260916-001`. Ryan explicitly authorized commit and deployment.
- Status: LIVE and verified September 16, 2026.
- Repository: `RNSolutions-electrical/Northgate-HQ-v2.0`; branch: `main`.
- Feature commit: `7a934cad0d04f075b8ee88c050563bd5c9c5c9a2`, pushed to origin/main.
- Production deployment: `6aaa72ae1676460008695216`, ready/published from that exact commit.
- Live URL: https://rnsolutions.net/northgate/estimates ; AFC: https://rnsolutions.net/northgate/afc ; Documents: https://rnsolutions.net/northgate/documents .
- Applied migrations: `20260916103538_estimate_finalization_checklist`, `20260916103702_afc_shared_studies`, `20260916103706_document_sections`, `20260916103711_northgate_read_tools_audit`. Local filenames match the recorded versions; do not replay former timestamps 20260915233355 / 20260915235701 / 20260916000558 / 20260916000942.
- Supabase AFC Edge Function: `afc-release` version 1, ACTIVE; custom Clerk/PostgREST authorization, server recalculation and service-only immutable finalization. Missing/forged-token denial and browser preflight verified.
- Checklist requires answers at both existing finalization actions; zero/excluded/N/A permitted and existing pricing retained. AFC shared studies/reports/labels and Documents sections preserve source/history/permissions.
- 113 unit tests, 40 isolated AFC/Document/read-audit checks, checklist SQL and real-schema rollback-only smoke suites passed. No synthetic records or temporary reviewer grants retained. Existing Developer correction permission preserved after fixing the migration's additive allowlist.
- Production HTML and all 15 assets match the tested build by SHA-256/MIME. Deep links and anonymous RPC denial passed. Netlify secret scan: 666 files, no matches. Existing silas-chat retained; northgate-read deployed but disabled.
- No permanent AFC reviewer grants or historical document reclassification. External MCP/OAuth connection is unconfigured and has no public route. Signed-in browser/upload/device acceptance and independent-session concurrency tests are not claimed.
- Read docs/reviews/ESTIMATE_FINALIZATION_CHECKLIST.md, docs/reviews/PHASES_2_4_AFC_DOCUMENTS_READ_TOOLS.md and HANDOFF Entries 268–269. Existing advisor/dependency findings remain documented; no frontend package versions changed.
- Other machines: preserve local changes, pull main with a fast-forward and verify this marker. Keep private files, credentials/integrations and historical untracked dist-* directories. No migration replay or local environment change is required.
- Final release-record commit uses [skip ci]; deployed application bytes are unchanged.

## Previous release — Estimate workflow handoff

- Marker: `CEDAR-ESTIMATE-HANDOFF-20260915-001`. Ryan approved migration, live verification, commit, push and deployment.
- Status: LIVE and verified September 15, 2026.
- Feature commit: `189b1c66b5f4ffa4ae7959375bb8f692f74bec92`, pushed to origin/main.
- Production deployment: `6aa9a0763c03550008271b42` (automatic Git production build of that commit, ready/published).
- Preview: `6aa9a12c4fe8b100a467997e`; exact committed source with tested assets and existing silas-chat function.
- Live URL: https://rnsolutions.net/northgate/estimates
- Read `docs/reviews/ESTIMATE_WORKFLOW_HANDOFF.md` and HANDOFF Entries 263–264.
- Migration `20260915194050_estimate_workflow_handoffs.sql` is applied. Local filename was aligned to Supabase's recorded version.
- Existing full-price CO posting preserved. Estimate-to-CO creates a draft; existing/new jobs and service calls receive proposed pricing for review, not actual costs or invoices.
- Authenticated rollback-only actual-schema smoke passed; zero test data retained. Security advisors reviewed; only new finding is the intentional guarded authenticated transaction endpoint.
- Production and preview HTML/all 14 assets match the tested build by SHA-256; MIME, live configuration, deep links and anonymous RPC denial passed. Netlify production secret scan: 613 files, no matches. silas-chat retained.
- 86 unit tests, isolated SQL, real-schema rollback smoke and existing estimator/CO/service-call browser regressions passed. Signed-in browser acceptance and independent-session concurrency tests are not claimed.
- Existing dependency/security findings are recorded in the review document; no dependency versions changed.

## Previous durable sync marker

- Marker: `JUNIPER-DATA-CORRECTION-20260915-001`
- Repository: `RNSolutions-electrical/Northgate-HQ-v2.0`; branch: `main`.
- Release: audited, narrowly scoped Developer restoration of retired material assignments.
- Status: LIVE and verified September 15, 2026.
- Feature commit: `c472d581d6a6b290d1b4fefef7d54c3bac2a4370`, pushed to origin/main.
- Production deployment: `6aa97df0c7c490000818b7b9`, ready/published from that exact commit.
- Live URL: https://rnsolutions.net/northgate/inventory?view=storage
- Live HTML and all 14 assets match the tested build by SHA-256/MIME; correction controls, retained workflows, public configuration and deep links verified. silas-chat retained. Netlify scanned 602 files with no secret matches.
- Final release-record commit uses [skip ci]; deployed frontend bytes are unchanged.
- Migration `20260915164220_developer_data_correction` is already applied; never replay former local version 20260915163330.
- Only the approved main Developer account has the new explicit correction grant. No actual retired assignments restored, quantities changed or transaction history removed.
- 84 Node tests, isolated SQL safety checks, actual-schema rollback smoke, responsive browser regressions and fresh production-config build passed.
- Other machines: pull main and verify this marker; read `docs/reviews/DEVELOPER_DATA_CORRECTION.md` and HANDOFF Entries 260–262. Preserve private files and historical untracked dist-* directories.
- Signed-in acceptance and independent-session concurrency stress remain follow-up checks. Revoke the temporary correction grant before official rollout.

## Previous release — WILLOW Storage Safety

- Marker: `WILLOW-STORAGE-SAFETY-20260915-001`
- Repository: `RNSolutions-electrical/Northgate-HQ-v2.0`; branch: `main`.
- Release: archived duplicate discovery and guarded Developer-only storage-location deletion.
- Previous marker: `BIRCH-STORAGE-EXPLORER-20260915-001`; starting HEAD `e9e3910`.
- Status: LIVE and verified September 15, 2026.
- Feature commit: `c016cf8ed706717d4c1c559265dc2cc92ec7de78`, pushed to origin/main.
- Production deployment: `6aa96fd3299c040008299945`, ready/published from that exact commit.
- Live URL: https://rnsolutions.net/northgate/inventory?view=storage
- Live HTML and all 14 assets match the tested fresh build by SHA-256/MIME; public configuration, retained workflows and deep links verified. silas-chat retained. Netlify scanned 590 files with no secret matches.
- Final release-record commit uses [skip ci]; deployed frontend bytes are unchanged.
- Applied migration: `20260915161130_inventory_storage_safe_delete`. Do not replay former local timestamp 20260915155751.
- 82 Node tests, isolated SQL safety matrix, responsive browser regressions, actual-schema rollback smoke and fresh production-config build passed.
- No real locations deleted. Concurrent user bay edits, counts and binding archives preserved. No permission defaults or grants to users changed.
- Other machines: pull main, verify this marker and read docs/reviews/STORAGE_SAFE_DELETE.md. Preserve private files and historical untracked dist-* directories.
- No AFC Phases 2–4. Signed-in production acceptance and independent-session concurrent stress remain follow-up checks.

## Previous release — BIRCH Storage Explorer

- Marker: `BIRCH-STORAGE-EXPLORER-20260915-001`
- Repository: `RNSolutions-electrical/Northgate-HQ-v2.0`; branch: `main`.
- Release: unified Storage Explorer, editable details and hierarchy moves, adjustable QR and bulk Avery 5164 labels.
- Previous marker: `ASPEN-CATALOG-FOUNDATION-20260915-001`; starting HEAD `21587a1`.
- Status: LIVE and verified September 15, 2026.
- Feature commit: `1beb5d36452855175976a45b3ccbaaadf523075d`, pushed to origin/main.
- Production deployment: `6aa96724e6c5dc0007992273`, ready/published from that exact commit.
- Live URL: https://rnsolutions.net/northgate/inventory?view=storage
- Live HTML and all 14 assets match the tested fresh build by SHA-256/MIME. Public Supabase/Clerk configuration and deep links verified; silas-chat retained. Netlify scanned 584 files with no secret matches.
- Final release-record commit uses [skip ci]; deployed frontend bytes are unchanged.
- Applied migration: `20260915153440_inventory_storage_workspace`; do not replay the former local timestamp 20260915151207.
- 81 Node tests, isolated SQL checks, actual-schema rollback smoke and responsive Storage/catalogue/location/stock regression tests passed. Fresh production-config build passed.
- Existing records, UUID scan links and stock ledger retained. Concurrent user shelf edits were audit-reconciled and preserved; timestamp-excluded profile hash stayed stable during release verification. No role defaults or user grants changed.
- Other machines: pull main and verify this marker. Read docs/reviews/STORAGE_WORKSPACE.md. Preserve local environments, private files and historical untracked dist-* directories.
- No AFC Phases 2–4. Signed-in acceptance, simultaneous-session stress checks and physical printer alignment remain follow-up tests.

## Previous release — ASPEN catalogue foundation

- Marker: `ASPEN-CATALOG-FOUNDATION-20260915-001`
- Repository: `RNSolutions-electrical/Northgate-HQ-v2.0`; branch: `main`.
- Release: Phase 1 catalogue aliases/shared search, quantity-free inventory mapping, audited location editing and archive/restore.
- Previous marker: `OAK-INVENTORY-SETUP-20260915-001`; starting HEAD `0607287`.
- Status: LIVE and verified September 15, 2026.
- Feature commit: `5f7a912267450e5ca1f8bc0b92e9c73e264e1dc6`, pushed to origin/main.
- Production deployment: `6aa93bf2078edd00080a6433`, ready/published from that exact commit.
- Live URL: https://rnsolutions.net/northgate/inventory
- Live HTML and all 13 assets match a fresh tested production build by SHA-256/MIME; required public configuration and deep links verified; silas-chat retained.
- Netlify secret scan: 572 files, no matches. Final release-record commit uses [skip ci]; frontend bytes are unchanged.
- Applied migration: `20260915122542_catalog_inventory_foundation`. Do not apply the original local timestamp 20260915115633.
- 78 Node tests, isolated SQL checks, real-schema rollback smoke, responsive inventory/location tests, existing stock/cart/count tests, and Estimate Workbench regressions passed; production-config build passed.
- Inventory, catalogue, transaction and permission records preserved across 11-table before/after checks.
- No AFC, Documents restructuring, AI/MCP or Phases 2–4 included.
- Other machines: pull main, verify this marker and read docs/reviews/CATALOG_INVENTORY_PHASE1.md. Preserve local environments, private files and historical dist-* folders.
- Signed-in user acceptance and true simultaneous-session validation remain follow-up checks.

## Previous release — OAK inventory setup

- Marker: `OAK-INVENTORY-SETUP-20260915-001`
- Repository: `RNSolutions-electrical/Northgate-HQ-v2.0`; branch: `main`.
- Release: Material Inventory storage-location setup and granular count access.
- Previous marker: `CEDAR-INSPECTIONS-20260914-001`; starting HEAD `9c010f5`.
- Status: LIVE and verified September 15, 2026.
- Feature commit: `78c4eed14db489725c9c0c9410506edbe2f63ff3`, pushed to origin/main.
- Production deployment: `6aa92ec765368c0009719a34`, ready/published from that commit.
- Live URL: https://rnsolutions.net/northgate/inventory
- Live HTML and all 13 assets match the tested production build by SHA-256 and MIME. Required public configuration and deep links verified; silas-chat retained; Netlify secret scan: 562 files, no matches.
- Applied migration: `20260915113613_inventory_location_setup_permissions`.
- Existing storage hierarchy, quantities and user permissions preserved by before/after hashes. No user grants or retirement-policy changes.
- 74 Node tests, isolated database checks and responsive inventory/location/cart tests pass.
- Other machines: pull main and verify this marker. Do not reapply the migration or overwrite local environment files/private imports/untracked dist-*.
- Release notes: docs/reviews/INVENTORY_LOCATION_SETUP.md; HANDOFF Entries 248–249. Signed-in physical-inventory acceptance is the next user test.

## Previous release — CEDAR inspections

- Marker: `CEDAR-INSPECTIONS-20260914-001`
- Repository: `RNSolutions-electrical/Northgate-HQ-v2.0`; branch: `main`.
- Release: Electrical Systems Health Inspection, branded PDF reports, job/service-call links and permit/jurisdiction inspection tracking.
- Previous marker: `PINE-ESTIMATE-HIERARCHY-20260914-001` (starting HEAD `1448800`).
- Feature commits: `8152528d8a802286a1f83166b489bc3d1c8116ac` and `fa26a6627f58d6c6947faa775bca1bc6b68cf3d9`, pushed to origin/main.
- Production deployment: `6aa88bc4748c3500071c76ba`, ready/published September 14, 2026; source commit `fa26a66`.
- Live URL: https://rnsolutions.net/northgate/electrical-inspections
- Verified HTML and all 13 assets against the tested production build by SHA-256 and MIME. Existing silas-chat function retained; Netlify scanned 551 files with no secret matches.
- Applied migrations: `20260914235450_electrical_inspection_workflow`, `20260915000120_inspection_reviewer_permission_management`, `20260915000719_inspection_list_alias`. The last fixes the live list/search row-alias conflict; no frontend rebuild is needed.
- Both Ryan Noel accounts have explicit reviewer grants; Manager Ryan also received add-on access. No other accounts or shared templates were changed.
- Validation: 77 Node tests; 58 PostgreSQL checks plus reviewer management assertions; responsive inspection, service-call and permission-editor browser coverage; branded PDF/pagination visual checks. Live rollback-only workflow passed canonical service-call creation/replay, permits/reinspection, issue/revise immutability and missing-upload rejection.
- Signed-in live Developer session verified add-on navigation, list, new form and successful draft PDF generation. The Codex embedded PDF frame stayed blank; ordinary-browser PDF viewing, real photo upload and a customer pilot remain acceptance checks.
- No test/customer inspection saved or issued persistently. Rollback tests retained zero synthetic records.
- See HANDOFF Entries 240–246. Pull main on other machines and confirm this marker. Migrations are already applied: do not replay them or overwrite local environment settings. Preserve untracked dist-* and private source files.

## Previous release — PINE

- Marker: `PINE-ESTIMATE-HIERARCHY-20260914-001`
- Branch: `main`
- Release: Estimates component references (001.1.1) and clearer collapsible work-item groups.
- Previous marker: `IRIS-SERVICE-STAGES-20260914-001` (baseline `d0f2fd3`).
- Feature commit: `59b59127b43d18c0660f4a87081dfada4e5505aa`, pushed to origin/main.
- Release status: live and verified September 14, 2026. Deploy `6aa862f8e966720008a22502` is published/ready.
- Production URL: `https://rnsolutions.net/northgate/`. Live HTML and every JavaScript/CSS SHA-256 match the tested build; new Workbench features, retained Service Call features, public configuration and deep links verified.
- Checks: 66 Node tests; three Estimates browser suites at desktop/tablet/phone widths; production-configured build.
- No database migrations, permission changes, financial changes or snapshot rewrites.
- References are display positions in the saved component order, not permanent record IDs; stage grouping does not restart numbering.
- See HANDOFF Entries 237–239. Preserve historical untracked dist-* and private imports. Authenticated live user acceptance remains next; browser tests used fixtures.

## Previous release — IRIS

- Marker: `IRIS-SERVICE-STAGES-20260914-001`
- Branch: `main`
- Release: configurable Service Call row colors/stages and Warranty/Pro-Bono zero-dollar closeout.
- Previous marker: `WILLOW-BILLING-CORRECTIONS-20260914-001` (baseline `d4144ef`).
- Migration: `20260914204755_service_stage_catalogue.sql`, applied to production.
- Feature commit: `0acd6aeba9f9ea9f2ced7afe2bf98d6018d12858`, pushed to origin/main.
- Release status: live and verified September 14, 2026. Production deploy `6aa85e2f1db4c100088ad5d6` is published/ready.
- Production URL: `https://rnsolutions.net/northgate/`. Live HTML and every JavaScript/CSS SHA-256 match the fresh tested build; feature strings, public production configuration and deep links verified.
- Checks: 64 Node tests; four Service Calls/scorecard browser suites; three rollback-only SQL suites; fresh production-configured build.
- Existing 31 invoices, 31 groups, 27 payments and 42 profiles preserved by pre/post hashes.
- Developer stage editor: Developer > Systems > Service Call Stages. Authenticated live user acceptance follows deployment.
- See HANDOFF Entries 234–236. Preserve old untracked dist-* and private imports.

## Previous release — WILLOW

- Marker: `WILLOW-BILLING-CORRECTIONS-20260914-001`
- Branch: `main`
- Release: audited Service Calls invoice/payment void actions, preserved history and corrected collection totals.
- Previous marker: `HARBOR-SERVICE-BILLING-20260914-001` (baseline `6bc4cfa`).
- Migration: `20260914195657_service_billing_voids.sql`, applied to production.
- Feature commit: `fff41961c48fa0304bb9b92121d34d63911d6d37`, pushed to origin/main.
- Release status: live and verified, September 14, 2026. Production deploy `6aa85234e8ac090008d977e7` is published/ready.
- Production URL: `https://rnsolutions.net/northgate/`. Live HTML and every JavaScript/CSS SHA-256 match the tested build; correction features, production configuration and deep links verified.
- All 30 existing invoices, 30 groups and 26 payments preserved, verified by pre/post hashes.
- Checks: 61 Node tests, three Service Calls/scorecard browser suites, rollback-only SQL correction and invoice-charge suites, production-configured build.
- No actual customer invoice or payment has been voided. Shared invoices void as a group; active payments block invoice voiding.
- See HANDOFF Entries 231–233. Preserve historical untracked dist-* and private import files. Authenticated user acceptance is next; automatic browser tests used fixtures.

## Previous release — HARBOR

- Marker: `HARBOR-SERVICE-BILLING-20260914-001`
- Branch: `main`
- Release: canonical Jobs Service Calls / scorecard, editing drawer, CSV/monthly/attention reporting, and percentage tax plus pass-through card fees.
- Previous marker: `MAPLE-SERVICE-REVIEW-20260914-001` (baseline `32d9dd1`).
- Database migration: `20260914192338_service_invoice_percentage_charges.sql`, applied and rollback-tested in production.
- Existing 27 invoices, 27 invoice groups and 24 payments verified unchanged by pre/post hashes (excluding new default/nullable columns).
- Checks: 59 unit tests; both Service Calls desktop/tablet/phone browser suites; legacy and percentage-charge SQL integration suites; production-configured build.
- Feature commit: `27b64e088c6841b06acbeab03a7bb1adada15307`, pushed to origin/main.
- Release status: live and verified, September 14, 2026. Production deploy `6aa84a412dea6b000814b521` is published/ready.
- Production URL: `https://rnsolutions.net/northgate/`. Live HTML and every JS/CSS SHA-256 match the tested production-configured build; required feature strings and deep links verified. Existing silas-chat function retained.
- Authenticated user acceptance remains next; automated UI tests used fixtures. See HANDOFF Entries 229–230.
- Existing private imports and historical untracked build directories are excluded. No historical financial values reinterpreted.

## Previous release — MAPLE

- Marker: `MAPLE-SERVICE-REVIEW-20260914-001`
- Branch: `main`
- Release: Service Call profit summaries/scorecard, billing-derived directory stages and row colors, and read-only Estimate work-item verification.
- Previous marker: `CEDAR-SERVICE-PROPOSAL-20260914-001` (baseline `9f3deeb`).
- Feature commit: `ec1214894ff080745f1663fec50c570e2c7ec2d6`, pushed to origin/main.
- Release status: live and verified on September 14, 2026.
- Production deploy: `6aa83f8ead53150008a34d51` (Git-triggered production, ready).
- Production URL: `https://rnsolutions.net/northgate/`.
- Live HTML and every JavaScript/CSS SHA-256 match the tested production-configured build. Deep links respond successfully; correct Supabase/Clerk configuration and new features verified.
- Netlify secret scan: 504 files, no matches. Existing `silas-chat` function preserved.
- Production environment variable presence confirmed without displaying values. Isolated locked-dependency build avoided Dropbox file locks; local dependencies subsequently restored and npm ls plus all 53 tests pass.
- Authenticated user acceptance remains next; browser regression coverage used fixtures, with no production business-data writes.
- Checks: 53 unit tests and Service Calls/Estimate desktop/tablet/phone browser suites passed.
- No new schema, permission, or RLS changes in this release. Existing authorized historical imports are live separately; see HANDOFF Entries 222–223.
- Preserve private imports and older untracked `dist-*` directories; neither belongs in Git or the deploy bundle.

## Previous release — CEDAR

- Marker: `CEDAR-SERVICE-PROPOSAL-20260914-001`
- Branch: `main`
- Release: combined Service Calls workflow/import preview and Estimate Proposal Builder / linked revisions / draft deletion.
- Previous marker: `COPPER-DECIMAL-20260914-001` (`e37d62c`).
- Feature commit: `23c2e9c2c5a36659281c1d9e504da20f80a851de`, pushed to origin/main.
- Production deploy: `6aa7eb647db05775d8eab870` (ready, published September 14, 2026).
- Production URL: `https://rnsolutions.net/northgate/`.
- Git-triggered build `6aa7eb33ef2f68000848f8b4` also completed for the same feature commit; its secret scan found no matches. Final CLI deployment uses the verified local dist and preserves silas-chat.
- Live verification: HTML and every JS/CSS SHA-256 match the tested build. Main and Workbench assets contain the correct configuration and new workflows.
- Anonymous browser deep link reached the account sign-in service with no app runtime errors, but Cloudflare's bot check prevented completing automated sign-in. Authenticated user acceptance is still required.
- Required database migrations are already applied: `20260914114401`, `20260914121940`, `20260914123229`.
- Release checks: 43 unit tests, configured production build, desktop/tablet/phone Service Calls and Estimates fixtures.
- No historical spreadsheet records imported. No production estimate/call was created, revised, billed, or deleted by verification.
- Preserve older untracked `dist-*` folders; they are not part of this release.

Details: `docs/SERVICE_CALLS_WORKFLOW.md`, `docs/ESTIMATE_PROPOSALS_AND_REVISIONS.md`, HANDOFF Entries 218–220.

## Previous durable sync record

- Marker: `COPPER-DECIMAL-20260914-001`
- Database hotfix: Workbench approval accepts `.32`, `0.32`, and `1.`; see the commit carrying this marker.
- Release commit: `c7ffbe1`
- Previous release marker: `DOCUMENTS-EDIT-RESTORE-20260912-001`
- Previous Documents upload/archive release: `08d950b`
- Previous Tools audit release: `68e74b9`
- Previous deductive Change Order release: `17af992`
- Previous audit workflow release commit: `added25`
- Audit workflow implementation commit: `7359881`
- Previous Tools compact UI commit: `8be1c04`
- Checkout notes commit: `7e09d29`
- Inventory search feature commit: `5305e73`
- Shared UI cleanup commit: `f5f78ac`
- Permission template feature commit: `d8c7c22`
- Panel mobile feature commit: `b4cfbc3`
- GitHub branch: `main`
- Production deploy: `6aa7d4187f242d50da22a2c1`
- Production URL: `https://rnsolutions.net/northgate/`
- Verified: September 14, 2026 (America/New_York)

The current marker fixes Workbench approval decimal validation with migration
`20260914111032_workbench_approval_decimal_values`, applied to production.
The original live regex was over-escaped and also rejected leading-dot decimal
strings saved by the editor. All seven checks now accept ordinary non-negative
decimal forms. No estimate data, calculations, permissions, or frontend assets
were changed. Rollback tests verified approval and its total, 21 invalid-input
cases, null rejection, unchanged grants, and approval of a temporary copy of the
affected saved estimate. Security advisor findings are unchanged (147). No test
records remain. The frontend deployment below remains current.

Previous marker `SANDSTONE-WORKBENCH-20260914-001` publishes Workbench estimate Draft → Approved approval and
customer-safe approved proposal export. Additive migrations
`20260914103331_estimate_workbench_approval` and
`20260914110000_validate_workbench_approval_components`, and
`20260914111500_restrict_workbench_approval_internal` are applied. Approval
uses the established immutable estimate snapshot and `can_approve_estimates`
permission; it remains unavailable to anonymous users. Job conversion is
intentionally excluded pending a separate estimate-to-Job financial mapping and
reconciliation design. Node tests, build, rollback-only database validation, and
live deployment-asset verification passed. The preceding frontend release marker was
`SANDSTONE-WORKBENCH-20260914-001`.

Historical marker `DOCUMENTS-EDIT-RESTORE-20260912-001` published document metadata edit and restore in Jobs and
Estimates. Migration `20260912134038_document_edit_restore` is applied. Owner
editors get a pencil action, one save-time reason, archived-list pagination and
restore with a reason. Audit and mutation are atomic; stale edits, missing stored
files and signed/CO-linked document maintenance are rejected. Stored paths,
owners and binaries cannot change. Document/storage RLS policies unchanged.
Twenty-one Node tests, desktop/tablet/phone real-component mocked-transport
checks, pre/post-migration rollback regressions and production build pass.
Netlify ready for `6cf8172`, secret scan clean; live HTML/JS 200, correct MIME,
edit/archive-read RPC code verified. No test records/storage metadata retained.
Advisors: five groups, 144 individual findings before, 146 after; two intentional
authenticated owner-checked definer RPC notices added, no new anonymous exposure.
Earlier references to five findings counted groups; no historic findings fixed.
Ryan's authenticated edit/restore/history acceptance is next. See
`docs/DOCUMENT_EDIT_RESTORE.md` and HANDOFF Entry 205. Interrupted-upload recovery
remains separate; next audit implementation candidate is Estimates' remaining
legacy mutation paths, not new estimating features.

The previous marker publishes Documents upload/archive integrity. Migration
`20260911171045_document_audit_integrity` is applied. Server triggers record
metadata creation and archive snapshots/actor/time/reason atomically; ordinary
uploads need no reason. Jobs/Estimates archive dialogs preserve retry input, and
six upload/quote failure paths use checked cleanup. RLS policies unchanged;
approved signed-CO protection retained. Storage remains a separate operation.
Document edit/restore controls were completed in the current follow-up;
interrupted-upload reconciliation remains unimplemented. See
`docs/DOCUMENT_AUDIT_WORKFLOW.md` for original boundaries and acceptance.
Twenty-one Node tests, desktop/tablet/phone owner-page fixtures, pre/post-migration
rollback and CO regression tests, build and live HTML/JS checks pass. Netlify ready
for `08d950b`, secret scan clean. Current advisors: five before/after, none new;
no claim that this task resolved older findings. No test fixtures retained.
Ryan's authenticated upload/archive/history acceptance is pending.

The previous marker publishes Tools catalogue atomic audit workflows. Migration
`20260906204812_tool_catalogue_audit_workflow` is applied. Normal creation needs
no reason; edit/archive/restore use one action-time reason dialog. Invoker RPC
preserves existing RLS and adds stale-save checks; restricted trigger records
trusted before/after/actor/time atomically. Failed audit writes roll back tool
changes. Operational notes stay separate. Old clients must refresh.
Nineteen Node tests, desktop/tablet/phone browser fixtures, pre/post-migration
authenticated rollback tests, build and live HTML/JS checks pass. Netlify ready
for `68e74b9`, secret scan clean. Advisors unchanged (143 existing, none new).
No test tools/users retained. Ryan's Tools acceptance remains pending; see
`docs/TOOLS_AUDIT_WORKFLOW.md`. Other module audit conversions remain outstanding.

The previous marker enables negative and mixed-sign Change Orders through draft,
submission, client PDF and approval. Migration `20260906200342_deductive_change_orders`
is applied. Signed financial postings, SOV allocations and existing Pay App credit
calculations passed rollback tests. Void reversals no longer conflict with the
obsolete posting uniqueness constraint. No permissions or RLS were relaxed.
Nineteen Node tests, desktop/tablet/phone real-component fixtures, production build,
pre/post-migration rollback tests and live HTML/JS checks pass. Netlify deploy is
ready for `17af992`, secret scan clean; security advisors unchanged (143 existing).
No test jobs retained. Ryan confirmed this Change Order pass worked beautifully. See
`docs/DEDUCTIVE_CHANGE_ORDERS.md` for steps and existing billing-revision limitations.

The previous marker publishes the first audit-policy/Current Budget rollout.
Ryan explicitly approved the multi-module migration after the earlier safety
review rejection. Migration `20260906191944_approved_financial_workflows` is
applied. Protected Original Budget edits require reasons; routine financial
updates, marked Current Budget overrides/reset, and atomic shared/line-reason
batches are available. Profile contact, fleet and CO-draft routine saves accept
optional notes. Existing archive/access/certification safeguards remain.

Nineteen Node tests, the build, desktop/tablet/phone mocked-transport checks,
post-migration authenticated rollback tests, and production HTML/JS checks passed.
No test users/jobs/vehicles remain. Netlify secret scan is clean. Security advisors
show 142 preexisting findings and one intentional authenticated SECURITY DEFINER
RPC warning, reviewed and documented. Full sitewide legacy audit migration and
Ryan's authenticated UI acceptance remain pending. See `docs/APPROVED_WORKFLOWS.md`.

The previous marker adds collapsed Tools catalogue rows showing Tool #, category,
and model, with inline expansion. Add a tool opens a dedicated module; successful
creation or cancellation returns to the catalogue. Edit/archive/history and their
existing permissions/audit paths are preserved. Fifteen Node tests, desktop/tablet/
phone browser checks, the build, and live page/JavaScript checks passed. No production
tools were created by tests. See `docs/TOOLS_COMPACT_CATALOGUE.md`.
Ryan's authenticated Tools acceptance and Inventory desktop/tablet check remain pending.

The previous marker adds uniform checkout note coverage across all destinations:
a cart note OR a note on every line, with both accepted and preserved separately.
Apply To All and destination changes no longer erase line notes. Transaction
history displays both notes. Migration `20260906180642_inventory_checkout_note_coverage`
is applied. Fifteen Node tests, desktop/tablet/phone browser checks, rollback-only
database persistence tests, and the build passed. Security advisors found no new
issues. No test users or transactions were retained. See
`docs/INVENTORY_CHECKOUT_NOTES.md` for contracts and acceptance checks.

The previous marker records the first Inventory search/cart cleanup pass. Inventory
defaults to tracked bin stock, groups materials by their locations, supports
multi-term search and category filters, and separates the full catalogue. Stock
reads now paginate beyond 1,000 rows. Add-to-cart opens/reuses the existing cart;
the compact responsive cart supports per-line destinations and review/confirmation.
Scan is mobile/narrow/coarse-pointer only, and bin scan results open stock search.
Diagnostic summary/footer cards are hidden behind the existing developer toggle.
No RLS, schema, ledger writes, tool custody, or financial posting rules changed.
Other / Uncoded maps to the existing `unknown` destination with a required note.

Nine Node tests, real-component mocked-transport browser checks at desktop/tablet/
phone sizes, and the production build passed. Live page and JavaScript returned
200 with the expected code and JavaScript MIME type; Netlify secret scan was clean.
No real inventory was modified in validation. Physical camera and authenticated
checkout acceptance remain Ryan's checks. Named job/service-call selectors,
dedicated van stock, unified tool discovery, and locations/counts cleanup remain
follow-ups. See `docs/INVENTORY_SEARCH_CART_PASS.md` for boundaries and checklist.

The previous pass added clean operational views for everyone, with technical
descriptions, source labels, and boundary panels available only through the
developer-only Show developer diagnostics toggle. Shared headers and sidebars,
Employees, Vehicles, Tools, Jobs, Estimates, Inventory, Documents, Accounting,
Dashboard, and Developer Console were reviewed. Unauthorized actions are hidden;
temporary disabled states, errors, required audit reasons, and business data remain.
Employees omits redundant single-view navigation, and Page Menu is mobile-only.
The real Employees component passed user/manager/developer browser fixture checks
on desktop, tablet, and phone. Build, seven Node tests, permission-template browser
regressions, and production HTTP/JavaScript MIME checks passed. Netlify's secret
scan was clean. See `docs/USER_INTERFACE_DIAGNOSTICS.md` for the rules and smoke check.

The baseline also includes named, live-linked permission templates in Developer Console
Access Control. Developers can edit existing role/department defaults and create,
rename, duplicate, and assign custom templates. Permission selections remain drafts
until Save opens an audit-reason dialog; template and user override saves are atomic,
audited, and protected against stale edits. Individual overrides take precedence.
Developer-console access remains protected by the existing role rules.

Migration `20260906142923_permission_templates` is applied. All 20 seeded defaults
preserve prior access. Database regression tests, seven Node tests, the full build,
and desktop/tablet/mobile browser fixture checks passed. Production HTML and JS
returned 200 with the new editor/RPC present and correct JavaScript MIME type.
Authenticated production UI acceptance remains Ryan's final check.
See `docs/PERMISSION_TEMPLATES.md` for implementation details and the test checklist.

The hierarchy feature commit establishes the official Page/Card/Module/Function vocabulary,
Department terminology for Northgate organizational scope, Inventory and Add-On
Tools navigation groups, Developer Display Controls, canonical roles through
Director, and server-enforced Protected Project Financials.

The current marker additionally records the desktop grouped-navigation fix: the
Inventory and Add-On Tools menus must remain visible and selectable below the
header rather than being clipped by the navigation container.

It also records grouped main-navigation entries for Jobs, Estimates, Employees,
and Vehicles. These reuse existing workspace routes and filter states rather
than duplicating routes, while only offering departments within the user's
existing department/all-department access scope.

The current marker adds the server-authorized My Profile path. Every signed-in
employee can read only their own safe profile fields and current vehicle label;
department directories and pending employee profile management remain gated by
the existing employee-management permission.

It also prepares the Employee Page for release: users may edit only their own
display name and phone with an audit reason, and may read only their own vehicle
assignment history. Email and management-controlled employment fields remain
protected.

The current marker adds employee-owned private Notes and My To-Do profile tabs.
To-do items with a due date surface only to their owner on Dashboard when they
are overdue, due today, or due within seven days. The new tables use RLS with no
direct client access; authenticated users receive only their own records through
server-authorized RPCs. Private note or to-do content is intentionally excluded
from the shared legacy audit table.

The current marker closes the seven legacy public-table RLS findings. Change
logs, vehicles, inventory transaction ledgers, vehicle-bin tables, and
notifications now have RLS enabled, no authenticated direct table privileges,
and explicit deny-direct-client policies. Existing scoped views and
permission-checked RPCs remain the approved read/write boundary; legacy browser
audit inserts now derive actor identity inside an authenticated RPC.

The current marker completes the Job Billing Pay Application interface and its
RPC-only production boundary. Billing now includes immutable application
history, Draft line and header editing, approved Change Order synchronization,
retainage and form selection, approval, idempotent Billed finalization, voiding,
and controlled correction/reversal Pay Apps. Billed source applications remain
locked, and production preserves the existing Draft Pay App.

The current marker also records the production mobile-navigation release. Phone
and tablet layouts now provide persistent Back, Workspace Home, Dashboard, and
App Menu controls; shared workspace tabs collapse into a focused section menu;
and existing workspace navigation controls use the consistent Page Menu label.

The baseline includes the shared Production Mode / Exploration Mode discipline
protocol in `AGENTS.md` and `docs/CODEX_DISCIPLINE_PROTOCOL.md`. The protocol is
documentation-only and does not require a separate production deployment.

The current marker includes the secured Panel Directory add-on and approved v7
renderer, followed by the mobile correction that converts the fixed-width
circuit editor into touch-sized responsive rows. Its print stylesheet now
isolates the panel sheet from the current application header, rail, menus, and
mobile controls so phone-initiated printing uses the intended page geometry.

## Superseded task-only marker

`TEAL-MERIDIAN-20260826` was reported in a Codex task but was not committed to the repository. It is retained here so machines searching for that marker can resolve it to the feature commit above.

## Required sync procedure

Before continuing Northgate HQ work on any machine:

1. Fetch `origin/main`.
2. Read this file and report the current durable marker.
3. Confirm the local base contains the feature commit listed above.
4. Preserve unrelated local work; do not reset or overwrite it to synchronize.

Every future completed cross-machine synchronization must replace the current marker with a new unique marker and retain the prior marker in the history section below.

## Marker history

- `AMETHYST-PERMISSIONS-20260906-001` - permission templates, feature `d8c7c22`, sync commit `eba5fc2`, deploy `6a9d7934bc228900086c8d3e`.

- `JADE-PANEL-MOBILE-20260904-001` - prior durable baseline at sync commit `6e76234`, mobile feature `b4cfbc3`, feature deploy `6a9b5f5cee81555663a9640a`.

- `CORAL-PANEL-MOBILE-20260904-001` — mobile Panel Directory editor and print isolation fix, commit `b4cfbc3`, deploy `6a9b5f5cee81555663a9640a`; made the durable cross-machine baseline by `JADE-PANEL-MOBILE-20260904-001`.
- `SAPPHIRE-PANEL-20260903-001` — approved v7 Panel Directory renderer, commit `4e7c3a2`.
- `TOPAZ-PANEL-20260903-001` — secured Panel Directory foundation, commit `987cae4`.
- `SAPPHIRE-UNISON-20260901-001` — unified mobile-navigation and production-discipline baseline, commit `e9f8450`.
- `COBALT-FOCUS-20260901-001` — shared production/exploration discipline protocol, commit `39cf0c1`.
- `MOBILE-NAV-20260829-947B9B5` — mobile navigation production release, commit `947b9b5`, deploy `6a92e0733797340009f6ddf6`; originally reported in task chat and made repository-visible by `SAPPHIRE-UNISON-20260901-001`.
- `BRONZE-PAYAPP-20260829-001` — Billing Pay App workflow and production record, commits `cd4507b` and `78a83e5`, deploy `6a927754f57b8f8c64ddcd25`.
- `SILVER-LOCK-20260827-001` — production RLS hardening, commits `041ddd1` and `e78f255`.
- `ROSEWOOD-TASKS-20260827-001` — employee-owned private notes, to-do items, and Dashboard reminders, commits `9eca69a` and `aa3535f`.
- `IVORY-EMPLOYEE-20260827-001` — secure employee self-service profile edit and vehicle-assignment history, commits `32f29e2` and `a8959f0`.
- `COBALT-PROFILE-20260827-001` — secure self-profile read path, commits `d4f774c` and `b762939`.
- `VERDANT-NAV-20260827-001` — grouped department-aware navigation, commits `4860d50` and `1120edb`.
- `CITRINE-MENU-20260827-001` — fixes clipped Inventory and Add-On Tools dropdown menus, commits `d235a3a` and `dfec32e`.
- `OPAL-GATEWAY-20260827-001` — production record for the final terminology-overlay deployment, commit `273226d`.
- `AMBER-ANCHOR-20260827-001` — activates undefined UI review markers, commit `4ef95ae`.
- `TOPAZ-HARBOR-20260827-001` — production record for the hierarchy cleanup deployment.
- `MOONSTONE-RELAY-20260827-001` — repository sync record for feature commit `2268e16`.
- `SABLE-COMPASS-20260827` — feature implementation commit `2268e16`.
- `ONYX-BEACON-20260827-001` — feature commit `9ec9e78`; durable repository status established.
- `TEAL-MERIDIAN-20260826` — feature commit `9ec9e78`; originally task-only, made discoverable by `ONYX-BEACON-20260827-001`.
