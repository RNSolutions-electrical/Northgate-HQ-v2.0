# Northgate HQ Cross-Machine Sync Status

This file is the repository-visible source of truth for Codex handoffs between machines.

## Current durable sync marker

- Marker: `TOOLS-AUDIT-20260906-001`
- Release commit: `68e74b9`
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
- Production deploy: `6a9dd1dce22db200080ec5e6`
- Production URL: `https://rnsolutions.net/northgate/`
- Verified: September 6, 2026 (America/New_York)

The current marker publishes Tools catalogue atomic audit workflows. Migration
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
