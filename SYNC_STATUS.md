# Northgate HQ Cross-Machine Sync Status

This file is the repository-visible source of truth for Codex handoffs between machines.

## Current durable sync marker

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
