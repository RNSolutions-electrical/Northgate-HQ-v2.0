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

## Staging publication update — 2026-10-05 14:13 EDT

The owner confirmed the Netlify Staging dashboard was available. The `staging` branch was fast-forwarded to `04fc74907e8e73b5f4b77701f70ed93283b9a2bd`. Netlify published deploy `6ac3e85f3e83670008da51ee` to `staging.rnsolutions.net`. The deployed page identifies itself as `[STAGING] Northgate HQ` and sent an unauthenticated visit to the Staging Clerk sign-in. Authenticated acceptance remains pending. No Supabase migration or Production deployment occurred.

This checkpoint does not authorize a Production deployment or migration.

## Staging inventory access repair — 2026-10-05 15:07 EDT

Marker `ENV-STAGING-INVENTORY-20261005-003`; machine `RYAN_NORTHGATE`. After the owner reported inventory REST 403 errors, Staging/Production comparison showed that `authenticated` had RLS read policies but lacked table-level `SELECT` on `items`, `storage_units`, `shelves`, `bays`, `bins`, and `inventory_balances` in Staging. `bin_items` joins these tables; `grand_master_inventory_view` is a security-invoker view. Staging migration `restore_staging_inventory_read_grants` (ledger `20261005190246`; local file `20261005190103_restore_staging_inventory_read_grants.sql`) restored only the six authenticated read grants. RLS remains enabled, anonymous table reads remain denied, and Production Supabase is unchanged. The separate Clerk `tokens/supabase` 404 originated in one inventory stock-review request using the Production-only JWT template; app commit `35b4c71` uses the shared environment-aware token helper instead.

All 259 explicit Node tests and the Staging-configured Vite build passed. `origin/staging` and the integration branch now point to `35b4c71`; Netlify published Staging deploy `6ac3f50e62e0af00081c092a`. This is not authenticated end-to-end acceptance: the owner must refresh and verify the inventory lists, Storage tree, location filters and stock-review badge. The requested Dashboard side-navigation and Project Health layout changes are deferred pending the owner's sketch. Production deployment and any Production schema work remain gated as above. The read-grant migration is idempotent against current Production grants, but do not blanket-replay this or any merged migration set during promotion.

## Dashboard sketch first pass — 2026-10-05 15:26 EDT

Marker `DASHBOARD-TREE-STAGING-20261005-001`; machine `Ryan_Northgate`. Ryan reported the Staging Inventory fix working and approved the Dashboard sketch interpretation. App commit `34661eb` was published on Staging as Netlify deploy `6ac3f99e62a77200081844d2`. The sticky global rail now nests Dashboard sections; a mobile drawer serves the same sections. Real subsection links select Dashboard views and scroll to their content. Project Health and assigned review lists open from Pulse drawers, and supplemental summaries are collapsed so the selected section is not buried. Personal Tools and saved My Preferences are roadmap items, not working navigation destinations. This is the first workspace slice, not an across-the-app conversion. No schema change or Production change occurred. A Staging-configured build and 273 explicit Node tests passed. Signed-in owner acceptance on desktop and mobile remains open; the public browser verified only the Staging sign-in gate.

The 15:28 EDT anchor refinement `55cf75e` makes repeated selection of the same child link scroll reliably and keeps section targets below the sticky header. Netlify published it as current Staging deploy `6ac3fa1cf731d70008a43334`; its targeted navigation tests and deploy build passed. No Production change.

## Inventory navigation trial — 2026-10-05 15:45 EDT

Marker `INVENTORY-TREE-STAGING-20261005-001`; machine `Ryan_Northgate`. App commits `7374bf0` and follow-up `024fed1` were pushed to the integration and `staging` branches; Netlify published current Staging deploy `6ac3feb865850000081e1d3e` at 15:49 EDT (initial `6ac3fe14a4556a0008b6063f`). The persistent desktop rail now exposes Inventory's existing permission-filtered sections, including the Stock Reviews badge, while the old duplicate desktop sidebar is hidden. Mobile retains the existing Page Menu. The follow-up keeps active-section indication accurate on Cart and review-notification routes. This is the second workspace navigation trial; other modules have not been converted. Storage, counts, stock mutations, permissions, and schema are unchanged. Full suite 276/276 passed before the badge refinement; targeted navigation tests and Staging-configured Vite builds passed afterward. Owner visual review on signed-in desktop/mobile is the next acceptance step. No Production change and no migration; existing parity gates still apply.

## Jobs navigation trial — 2026-10-05 16:48 EDT

Marker `JOBS-TREE-STAGING-20261005-001`; machine `Ryan_Northgate`. App commit `48f87d560c97729aaf3cb77b9bfeb649282ac069` was pushed to the integration and `staging` branches. Netlify published Staging deploy `6ac40cac591035000821f88b` at 16:46 EDT. The Jobs directory's existing Active, On Hold, Completed, Cancelled, and All Jobs filters now appear in the persistent desktop workspace rail. The old desktop directory sidebar is hidden; mobile retains its existing menu. Once a job is opened, the directory tree disappears and the job's own tabs remain unchanged. The Service Calls route and data operations are unchanged. The Staging-configured Vite build and 277/277 explicit Node tests passed. Authenticated owner visual review is pending. No migration or Production branch/site/database change; the broader parity gates remain in force.

The signed-in Staging browser confirmed the rail and URL-backed filters work. Visual inspection caught a doubled directory heading (for example, “All Jobs Jobs”); follow-up commit `5bcc5b8` normalizes Jobs and Service Calls headings without changing the directory filters. Its targeted test and Staging-configured build passed. Netlify published current deploy `6ac40d87ef5eb000087bc94a` at 16:50 EDT. A signed-in refresh confirmed “All Jobs” displays correctly and an opened job still shows its project tabs. Owner acceptance remains pending.

Ryan accepted the Jobs layout on October 6 and approved moving to Estimates.

## Estimates navigation trial — 2026-10-06 06:25 EDT

Marker `ESTIMATES-TREE-STAGING-20261006-001`; machine `Ryan_Northgate`. App commit `8afee97bcfa922d1483e88286db24cd39f0da20e` was pushed to the integration and `staging` branches. Netlify published Staging deploy `6ac4cc07bf6aa00008f63670` at 06:23 EDT. The active Estimates workbench now exposes Official Estimates, My Estimates, permission-gated Review Submissions, and Assembly Library in the persistent desktop rail. The previous directory shortcut buttons are retained for small screens. URLs identify the selected destination; direct review notifications still open the review queue. The rail's section tree is hidden while an estimate or review record is open, preserving the editor's own navigation. The older inactive Estimates workspace was intentionally not modified.

Verification: 279/279 explicit Node tests and a Staging-configured Vite build passed. Netlify confirms the exact commit as published. A signed-in Staging browser opened Official Estimates, My Estimates, Review Submissions, Assembly Library, then returned through the rail. The Staging account has no estimate records, so opening an existing estimate was not exercised. A stale dynamic asset on the pre-deploy page required a browser refresh; the refreshed build loaded normally. Owner acceptance remains pending. No schema migration or Production branch/site/database change; the broader parity gates remain in force.

Ryan accepted the Estimates layout on October 6 and approved moving to Employees. The open-estimate case was not exercised because the Staging account has no estimate records.

## Employees navigation trial — 2026-10-06 06:37 EDT

Marker `EMPLOYEES-TREE-STAGING-20261006-001`; machine `RYAN_NORTHGATE`. App commit `a0ae013f3d6400a104e63218efcb7261ff3067d2` was pushed to the integration and `staging` branches. Netlify published Staging deploy `6ac4cef0392d8b0008bbe803` at 06:35 EDT. The desktop workspace rail now provides My Profile and the permission-gated Employee Directory, with the same authorized department filters nested under Directory. The duplicate desktop module sidebar is hidden; its mobile Page Menu remains. Employee detail tabs and account setup are unchanged. No new employee authority, data write, or schema migration was introduced.

Verification: 262 explicit Node assertions passed in two isolated runs, and a Staging-configured Vite build passed. The default auto-discovery command encountered a Vite cache lock with an existing local preview and was stopped; no assertion failed. A signed-in Staging browser verified My Profile, Directory, and the Construction filter. Owner visual acceptance remains pending. Production `main`, the Production Netlify site, and both databases remain unchanged. Continue the parity acceptance and isolated schema-rehearsal gates before any Production promotion.

Ryan accepted the Employees layout on October 6 and approved moving to Vehicles.

## Vehicles navigation trial — 2026-10-06 06:42 EDT

Marker `VEHICLES-TREE-STAGING-20261006-001`; machine `RYAN_NORTHGATE`. App commit `5ede2c591e3b8157881f2b7d6d69f56a7c363c90` was pushed to the integration and `staging` branches. Netlify published Staging deploy `6ac4d06298c4fd0008ee7cef` at 06:42 EDT. The persistent desktop rail now lists My Vehicle, All Vehicles, Stock Vehicles, and General Fleet; the top menu uses the same working views instead of department options whose data source is incomplete. The old desktop module sidebar is hidden; mobile retains Page Menu. Assignment controls, selected-vehicle tabs, read permissions, and schema are unchanged.

Verification: 265 explicit Node assertions passed across isolated runs and a Staging-configured Vite build passed. A signed-in Staging browser verified all four rail destinations and the matching top menu. This account has no vehicle records, so selecting a vehicle and checking its detail tabs remains unverified. Ryan accepted Vehicles on October 6. No Production branch/site/database change; continue the existing parity acceptance and isolated schema-rehearsal gates before Production promotion.

## Documents navigation trial — 2026-10-06 06:50 EDT

Marker `DOCUMENTS-TREE-STAGING-20261006-001`; machine `RYAN_NORTHGATE`. App commit `f9d97d9a2726b78f8f4efee7e9907ed63465962e` was pushed to the integration and `staging` branches. Netlify published Staging deploy `6ac4d2220d8a060008f58339` at 06:49 EDT. The persistent desktop rail now provides Document Index, Job Checklist, Owner Scopes, and Controls, with the existing document, checklist, and owner count badges. The duplicate desktop module sidebar is hidden; mobile retains the Page Menu. Document data, file access, uploads, permissions, storage and schema are unchanged.

Verification: 267 explicit Node assertions passed across isolated runs and a Staging-configured Vite build passed. A signed-in Staging browser opened all four rail destinations and confirmed their URL-backed views. The Document Index showed three existing visible documents. Owner visual acceptance remains pending. No migration or Production branch/site/database change; continue the existing parity acceptance and isolated schema-rehearsal gates before Production promotion.

## Documents shared-filter refinement — 2026-10-06 07:24 EDT

Marker `DOCUMENTS-FILTERS-STAGING-20261006-001`; machine `RYAN_NORTHGATE`. App commits `079eb328005fc5d92e1076b4e1959cf158a002cf` and `c0a3553f0a20f830642d7fc468869817a021caa7` were pushed to the integration and `staging` branches. Netlify published current Staging deploy `6ac4da3ba9785700081625ad` at 07:23 EDT (initial filters deploy `6ac4d991fbbe290008d56551`). The existing Index filters now stay active while navigating all four Documents pages. Checklist coverage follows the filtered set and distinguishes “No match” from truly missing categories; Owner Scopes and Controls retain their guidance and show matching document rows. The global rail badge remains unfiltered. No document permissions, data or schema changed.

Verification: 268/268 explicit Node tests and a Staging-configured Vite build passed for the first commit; targeted filter tests and another build passed for the clarification. Signed-in browser checks verified the filter across all four pages and corrected Checklist status. Owner visual acceptance remains pending. Production remains unchanged and the existing parity promotion gates still apply.

## Documents compact-layout refinement — 2026-10-06 07:30 EDT

Marker `DOCUMENTS-COMPACT-STAGING-20261006-001`; machine `RYAN_NORTHGATE`. App commit `b3dc7fdbfe7e563bb8352c7cb587b66926b4297a` was pushed to the integration and `staging` branches. Netlify published Staging deploy `6ac4db933ec6830007320681` at 07:29 EDT. The Visible Documents, Visible Jobs and Checklist summary cards were removed, along with the isolated development-only permission card. The existing header and rail counts remain, and document filters and rows move higher on the page. No document data, actions, access model or schema changed.

Verification: eight targeted Documents tests and a Staging-configured Vite build passed. Signed-in browser inspection confirmed the compact layout. Ryan accepted the layout on October 6 and approved moving to Reports. Production remains unchanged; parity promotion gates still apply.

## Reports navigation trial — 2026-10-06 07:38 EDT

Marker `REPORTS-TREE-STAGING-20261006-001`; machine `RYAN_NORTHGATE`. App commit `55063a8f459739f060995cd9e41cddfdabc31086` was pushed to the integration and `staging` branches. Netlify published Staging deploy `6ac4dd550c56840008bc87b9` at 07:37 EDT. The persistent desktop rail now provides Report Library, Access Snapshot, and Operational Sources, backed by shareable URL views. The duplicate desktop module sidebar is hidden; mobile retains the Page Menu. Report data, authorization, exports, and schema are unchanged.

Verification: 270/270 explicit Node tests and a Staging-configured Vite build passed. A signed-in Staging browser opened the Reports library, Access Snapshot, and Operational Sources using the rail and verified the corresponding URL views. Owner visual acceptance remains pending. Production `main`, Production Netlify, and both databases remain unchanged. Continue the parity acceptance and isolated schema-rehearsal gates before Production promotion.
