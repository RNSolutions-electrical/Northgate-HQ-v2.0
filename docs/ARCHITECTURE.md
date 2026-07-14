# Northgate HQ v2 — Architecture Lock Document
### Version 2.30 — Northgate UI System locked (new Section 50): approved cross-application visual and navigation standard based on Ryan's reference mockup (Entry 139); persistent global header (branding, permission-aware top-level module nav, compact profile menu replacing the standalone Clerk settings block); primary sidebar for stable workspace navigation and optional secondary sidebar for filters/saved views/status groups, both operating strictly at the workspace/module layer — explicitly reconciled against Section 42 (v2.24), whose "no sidebar inside record detail" rule and horizontal detail-tab pattern remain fully in force and unchanged; consistent main-workspace hierarchy (heading → controls → table/surface → record header → Section 42 tabs → summary cards → detail content); data-dense tables as default with protected columns omitted entirely (not blanked) per existing `can_view_financials` and other canonical flags — no new permission flags introduced; Northgate red as primary active-state accent (bright green excluded from general nav); full responsive behavior specified for desktop/tablet/mobile per Constitutional Rule 18, designed in from Phase 1; locked three-phase rollout — Phase 1 shell + Inventory conversion, Phase 2 Jobs reusing Section 42 unchanged, Phase 3 remaining modules; explicitly does not authorize schema changes, migrations, new permission flags, new RPCs, direct writes, or changes to inventory/checkout/financial/auth/Section 17b behavior; docs-only lock, does not authorize React/CSS/Supabase implementation. (Entry 139)
### Version 2.29 (documentation clarified — Entry 138) — Section 17b runtime behavior confirmed and documented after live post-implementation testing, no schema or behavior change: (1) `effective_permissions_for_user()` is caller-scoped only (resolves via `auth.jwt() ->> 'sub'` internally, no target-user parameter) — recorded as a permanent boundary, not a defect, and must not be repurposed for checking another user's permissions; any such future feature needs its own target-scoped function; (2) legacy `user_permissions.permission_overrides` JSONB confirmed single-purpose — read only for `can_access_developer`, all other flags resolve exclusively from role defaults + `user_permission_overrides`; (3) no-RLS-recursion mechanism confirmed via live inspection — `effective_permissions_for_user()` is `SECURITY DEFINER` owned by a role with `rolbypassrls = true`, a distinct and non-conflicting mechanism from the non-recursive `current_user_has_developer_access()` helper. All three confirmed directly against the live function body and database role configuration; Section 17b updated with a new "Confirmed Runtime Behavior" subsection recording these as permanent facts.
### Version 2.29 (second-pass corrected) — Granular Permission Overrides (Section 17b, locked — Entry 136, Rule 20 cross-cleared twice): user-level override system allowing developers to grant/revoke individual permission flags per user without role elevation. First cross-clearance pass (Entry 135) fixed identity model, invalid FK, history-preserving uniqueness, and the can_access_developer escalation gap. Second cross-clearance pass (Entry 136, this version) fixed three further implementation blockers found before Codex migration: (1) RLS recursion risk — the original write/read-all gate called `effective_permissions_for_user()`, which itself would query `user_permission_overrides`, creating a self-referential RLS loop; corrected to require a dedicated non-recursive Developer-authority check that never touches the override table; (2) wrong role source — `users.role` was referenced, but no `users` table exists in this schema; corrected to `user_permissions.role`, matching every other locked section's identity pattern; (3) direct client writes — the original draft allowed a client-facing INSERT RLS policy with app-layer target blocking; corrected to RLS-denies-all-client-writes with a single controlled `SECURITY DEFINER`-style RPC (`set_permission_override`) that atomically validates authority, rejects can_access_developer and cross-developer targets, deactivates the prior active row, inserts the new row, and writes the change_logs entry in one transaction. Entries 134 and 135 are both superseded and not implementation-accurate; this version (136) is final. No new canonical permission flags added. Use cases: grant `can_manage_inventory` to field tech auditor; revoke transaction capability from user on leave; grant `can_view_financials` to field supervisor for one contract.
### Version 2.27 — Jobs Module Completion Roadmap locked (new Section 45 roadmap; new Section 46 Job Documents v1 — first real implementation of the long-dormant Section 20 generic documents design, scoped to `owner_type = 'job'` with six other Section 20 owner types declared but not yet RLS-permitted; new Section 47 Job Schedule v1 — flat milestone/task list, no calendar/dependency/assignment integration; delta to Section 44 adding `sort_order` to `job_budget_lines` for manual/drag-drop reordering, no RLS change; Formatting Tuner ruled Bucket 1/no-lock (localStorage + CSS variables only, Developer-gated, no Supabase writes) — triggers for a future real architecture review specified; Job Export deliberately NOT locked this version — reserved as Section 48 pending Documents/Schedule going live, with hard boundaries pre-confirmed (browser print-to-PDF only, section-selectable, permission-aware per section, documents never bundled — index/list only, no database writes). (Entry 118)
### Version 2.26 — Job Financials v1 (Budget Foundation) locked (new Section 44): new `job_budget_lines` table, division-scoped via `division text not null`, references `public.jobs(id)`; `category` CHECK-constrained to material/labor/subcontractor/equipment/permit/other, required; `cost_code` free-text (Option A — formal cost-code table reserved); `description` required; `budget_amount` allows zero, CHECK `>= 0`; no `status` column; soft-archive per Section 18; read gated on `can_view_financials`, write gated on `can_approve_budget` — both already-canonical Section 17 flags, first real consumer of either; no new permission flags; Financials tab fully hidden from users lacking `can_view_financials`; helper copy locked; print/export deferred; numeric input blocks save on blank rather than coercing to 0; fully standalone from Job Transactions Log and Buyout List in v1 — no reads from either; actual cost, committed cost, issued inventory value, contract value, revenue, profit/margin, PO, invoice, change order, and accounting integration all explicitly reserved. (Entry 115).
### Version 2.25 — Job Transactions Log locked (new Section 43): new read-only view `job_transaction_log` over `transaction_items` + `inventory_transactions`, filtered to `destination_type = 'job'`; activates the previously-placeholder Transactions tab (Section 42) with a read-only table (date, item, quantity, source location, transaction type, performed by, notes); no cost/value column (reserved for Financials); no edit/delete/return actions; source-location-agnostic so future Vehicle Inventory transactions appear automatically; inbound Return-from-Job (5K.5) will require a follow-up delta to this view, flagged but not solved now; no new RPC, table, or permission flag; read access inherits existing `transaction_items` / `inventory_transactions` RLS. Financials remains unlocked and scoped separately. (Entry 110).
### Version 2.24 — Workspace Detail Sub-Navigation Pattern locked (new Section 42): reusable detail-view shell with a persistent selected-record header, horizontal sub-nav tabs, and a single focused content area; Jobs is the first application; active tabs Overview, Details, Materials, and Buyout are live; Transactions, Financials, Documents, and Schedule are disabled/Coming Soon using the existing 5J shell placeholder pattern; Job list/directory remains unchanged; no sidebar for job sub-nav; mobile responsive per Constitutional Rule 18; `ENABLE_JOB_DETAIL_ISSUE_TO_JOB_ACTION` remains false/hidden; no schema, Supabase, RPC, permission, runtime, or UI implementation changes yet. (Entry 108).
### Version 2.23 — Buyout Planning locked (new Section 41): new `job_buyout_lines` table, standalone (no FK to `job_materials`), division-scoped via `division text not null`; `item_id` nullable (supports free-text lines for non-catalog items via `item_description`); `quantity_ordered` nullable (null = not yet ordered; 0 = ordered, qty TBD); `status` CHECK-constrained text (`pending`, `ordered`, `received`, `cancelled`); no cost/price/PO number/vendor ID columns; soft-archive per Section 18; read gated on own-division / `can_view_all_divisions`; write gated on `can_manage_jobs`; no new permission flags; "In Stock" column reads `inventory_balances` at display time — read-only, never allocates; print-to-PDF and CSV export approved (display only, no accounting post); UI in Jobs workspace job detail view with locked helper copy; structured cost/vendor/PO tracking, link to `job_materials`, and accounting integration reserved. (Entry 106).
### Version 2.22 — Issue to Job locked (new Section 40): confirms the existing `destination_type = 'job'` / `destination_id` schema and checkout RPC (locked since Section 11, v2.5) already support Assign-to-Job movement with no schema or RPC change; 5K.3 is a UI-only binding — adds Job as a third destination option in the existing Cart/Checkout destination-selection UI (alongside user/vehicle) with a division-scoped job picker, and adds an "Issue to Job" navigation/prefill action on Job Material List lines (Section 39) that hands off to the existing cart/checkout flow with no direct write; requested_quantity may prefill the cart quantity as a suggestion only; a job not on a job's Job Material List may still receive issued material; no write to `job_materials`, no issued/fulfilled/remaining calculation in this milestone; no new transaction type, RPC, schema, or permission flag; gated on existing `can_inventory_transactions`. (Entry 102). Prior: v2.21 — Job Material List locked (new Section 39): implements the Section 37 demand layer; new `job_materials` table referencing `public.jobs(id)`, division-scoped via `division text not null`; `item_id` references existing catalog `items` (exact PK type confirmed by Codex preflight, not assumed); no fulfillment/issued/remaining/reserved/allocated/buyout/purchased columns, no procurement or cost columns; optional display-only `material_name_snapshot` / `material_code_snapshot`; soft-archive per Section 18; read gated on own-division / `can_view_all_divisions`; write gated on `can_manage_jobs` (not `can_manage_inventory`); no new permission flags; UI lives in Jobs workspace on job detail view with locked helper copy; display-only requested-quantity summary permitted, no fulfillment language; Issue to Job affordance may appear disabled only; Issue to Job, Buyout, and Return-to-Inventory remain reserved for 5K.3, 5K.4, 5K.5. (Entry 097). Prior: v2.20 — Jobs Foundation locked (new Section 38): new `jobs` table, division-scoped via `division text not null`; `job_type` and `service_call_number` included per Section 5b; `status` as CHECK-constrained text (`active`, `on_hold`, `complete`, `cancelled` — `archived` is not a status value; archive via `archived_at`); `job_number` unique-when-non-null via partial index; soft-archive per Section 18; read gated on own-division / `can_view_all_divisions` (Section 17a pattern); create gated on `can_create_jobs`; edit/archive gated on `can_manage_jobs`; no new permission flags (`can_create_jobs` and `can_manage_jobs` already canonical per Section 17); customer/client, budget/accounting, job_materials, and all job management features reserved; cross-reference note added to Section 5. (Entry 095). Prior: v2.19 — Job Material Workflow locked (new Section 37): demand/movement layer separation; Job Material List (`job_materials`) is a demand/planning artifact — never writes balances; fulfillment derived from the ledger (no stored counter, no second source of truth); Issue to Job = Assign to Job movement through the existing Cart / Checkout engine (Section 11) only — no parallel write path; Buyout = derived demand-side calculation + status, no ledger write, no auto-post to Financials; Return-to-Inventory = Return from Job inbound transaction via a new RPC (5K.5), gated on `can_inventory_transactions`, following Section 11 checkout RPC pattern; no new transaction types; reservation concept and "Allocation" term reserved for future architecture clearance; `jobs` table is a hard prerequisite for all 5K implementation (Bucket 3; requires its own Claude review); milestone sequence locked: 5K.1 → Jobs foundation → 5K.2 → 5K.3 → 5K.4 → 5K.5. (Entry 094). Prior: v2.18 — Section 36 (Tool Catalogue) corrected: division_id uuid references divisions(id) replaced with division text not null to match existing app convention (user_permissions.division, items.division); divisions table and UUID-based division normalization reserved for a future architecture-cleared milestone. No other changes to Tool Catalogue schema, RLS model, permissions, or reserved feature list. Rule 20 cross-cleared. (Entry 084). Prior: v2.17 — Tool Catalogue Foundation locked (new Section 36): new tools table, division-scoped via division_id FK; condition and status as CHECK-constrained text columns with starting value sets; tool_number and serial_number unique-when-non-null via partial indexes; archived_by as text (Clerk user ID); purchase_price and vendor deferred; home_location, current_location, and assigned_to as plain text placeholders until linkage is architecture-cleared; soft-archive per Section 18; read gated on division scope / can_view_all_divisions; write gated on can_manage_inventory; no new permission flags; no audit table; no attachments; UI title "Tool Catalogue" with locked helper copy; checkout, assignment history, QR labels, vehicle/bin linkage, job linkage, tracking history, audit table, tool-specific permission flags, and purchase accounting all reserved. Rule 20 cross-cleared. (Entry 083). Prior: v2.16 — Standard Codex Operating Instructions adopted (new Section 35): reusable task classification buckets (Safe UI/CSS, Existing-flow binding with positive confirmation gate, Architecture-sensitive); protected-scope rules with cross-location transfer and multi-bin batch action lock references (Section 10a, v2.15); explicit RLS-bypass prohibition in UI/client-side rule; explicit inventory_balances direct-write check in verification procedure; standard start procedure, HANDOFF requirement, routing verdict, and short-prompt footer. Rule 20 cross-cleared. (Entry 081). Prior: v2.15 — Scan Destination Behavior locked in new Section 10a: resolving a location QR opens a division-scoped, location-scoped view and action entry point; scan pages dispatch into existing cart/checkout and `physical_count_correction` engines and must not reimplement cart, transaction, or balance logic; authentication is required before contents; resolution is server-resolved and fail-closed generically; inventory cost is open within authorized inventory scope; bin pages allow cart add/remove through the existing cart flow and count correction through `physical_count_correction`; unit/shelf/bay pages are read + navigation and actions occur at bin level; no generic ambiguous +/- controls; scan pages initiate no location-to-location movement and do not surface Transfer Location; multi-bin batch cart actions are reserved; label layout may vary by level through `label_templates.scope_level`; QR payload is unchanged; no new transaction type or balance-derivation change (Entry 062). Prior: v2.14 — Inventory module-completion milestone locked: Division-Scoped Read Rule added in new Section 17a; `can_view_all_divisions` added for read-only cross-division scope; cross-division access comes from Developer role default and Admin division default/effective permission, while Administrator role outside Admin division remains own-division unless individually granted; own-division-full and self-scoped read tiers locked; inventory cost is open within authorized inventory scope and `can_view_financials` is not used for inventory cost; QR payload and web scanner scope locked in Section 10; Label Template Designer and `label_templates` table locked in Section 25; Section 29 inventory build sequence updated for QR scanner and label designer; HANDOFF Entry 051/052 presentation order repaired under Rule 20 (Entry 056). Prior: v2.13 — bin_item retirement locked (Section 23): a mistakenly added material is archived (Rule 13 / Section 18), never hard-deleted; archival is a structural action (no ledger row, no quantity change) gated on a zero ledger-derived balance — a non-zero balance must first be zeroed via `physical_count_correction`; one Developer/Admin-only RPC (`can_archive_records`) records `archived_at` / `archived_by` / `archive_reason`; archived `bin_items` are hidden from active count/intake views but preserved in transaction history (Entry 042). Prior: v2.12 — Count Intake locked (Section 23): UI-driven physical count intake establishes quantities solely via the existing `physical_count_correction` mechanic (`destination_type = NULL`); a single atomic RPC find-or-creates the `bin_item` (structural link, opens at zero — never a direct opening balance) then applies the same correction path; existing catalog items only (no in-UI catalog creation); zero is a valid count; Developer/Admin write gate; no new transaction type and no second source of truth (Entry 039). Prior: v2.11 — Office disposition resolved: 'office' is a physical location, not a material destination, and is removed from the material `destination_type` enum (Sections 9, 11). `destination_type` records outbound disposition only and is NULL for inbound/non-movement transactions; Physical Count Corrections write `destination_type = NULL` (existing pre-release 'office' correction rows migrated to NULL, balance-neutral, scoped by transaction type). Return-to-inventory and buyout reserved as defined-but-unbuilt concepts; tools-at-office is a Tools-module location. Section 16 display resolution updated for NULL destinations (Entry 037). Prior: v2.10 — Section 16 user→vehicle assignment model concretized (`vehicle_assignments`, a time-bounded bridge table keyed by Clerk user ID with at most one active row per user) plus `vehicles.display_name` unit label and a read-path destination display-resolution doctrine (structural destination IDs unchanged; vehicle unit label resolved dynamically, operator association resolved point-in-time from assignment history; no snapshot of display strings, no checkout change) (Entry 033). Prior: v2.9 — Constitutional Rule 20: coordination documents are never edited or repaired silently — any change beyond a clean append must be surfaced to Ryan first, brought to a model, and cross-cleared between Claude and ChatGPT; normal append-only HANDOFF logging is exempt (Entry 031). Prior: v2.8 — Section 30 escalation protocol "When Claude Must Be Involved": decision-ready routing rule (MUST-involve triggers, proceed-without conditions, tie-breaker) plus a required per-summary routing verdict from Codex (Entry 028). Prior: v2.7 — Constitutional Rule 19 (coordination documents are the versioned source of truth: append-only sequential entries, one identical entry format, canonical filenames never renamed) and Section 34 Documentation Standard (Entry 022). Prior: v2.6 — Section 14d Express Checkout / Manager Override (new transaction-completeness concept), Section 17 new permission flags (`can_express_checkout`, `can_approve_express_checkout`, `can_defer_completion`), Section 22 reason-gated developer override (Entry 017). Prior: v2.5 — Section 11 cart-open controls (server-side permission gate + server-derived vehicle snapshot) and Section 16 vehicle stock-carrying flag + user→vehicle assignment model (Entry 016). Prior: v2.4 — Section 29 updated to reflect completed build state (Entry 014). v2.3 — Constitutional Rule 18 added: Responsive UI is a Foundational Requirement (Entry 011). v2.2 — Responsive build requirement + React Native companion app future phase. v2.1 — Updated after Claude architectural review.
### Ryan is final authority on all decisions marked below.

---

## 0. Project Infrastructure

> **Ryan's Decision:** Version 2 is a clean build. All infrastructure is separate
> from v1. The v1 repository and Supabase project remain intact as a backup.

| Resource | v1 (Backup — do not touch) | v2 (Active build) |
|---|---|---|
| GitHub | `RNSolutions-electrical/Northgate-HQ` | `RNSolutions-electrical/Northgate-HQ-v2.0` |
| Supabase | Original project | New project (same naming scheme) |
| Netlify | `northgatehq.netlify.app` | New deployment |
| Clerk | Shared — same application for both versions |
| Google Sheets | `Northgate HQ — Master Data Workbook` (shared) |

### v2.0 Repository Structure

```
Northgate-HQ-v2.0/
  docs/
    ARCHITECTURE.md          ← Architecture Lock Document v2.23
    INVENTORY_SCHEMA.md      ← Inventory Schema Plan v2.3
  HANDOFF.md                 ← Cumulative session handoff log
  src/                       ← React + Vite application
  supabase/
    migrations/              ← SQL migration files
```

### Environment Variables (v2.0)

```
VITE_CLERK_PUBLISHABLE_KEY=   ← same key as v1
VITE_SUPABASE_URL=            ← new v2.0 Supabase project URL
VITE_SUPABASE_ANON_KEY=       ← new v2.0 Supabase anon key
```

---



Northgate HQ exists to help Northgate operate within one workspace without
needing to access a variety of other apps for day-to-day functions. The system
will keep internal documents, workflows, assets, job data, estimates, inventory,
tools, vehicles, and financial tracking organized, searchable, and easy to use.

The platform is intended to improve operational efficiency by tracking assets,
reducing duplicated purchases, reducing wasted labor spent searching for
tools/materials, and giving the company better real-time visibility into job
performance.

Northgate HQ must also support controlled visibility. Field users may see
condensed job-budget information needed to build the job, while protected
financial details such as profit remain hidden unless specifically permitted.

---

## 2. Core Architecture Philosophy

Northgate HQ will be built as a modular operational platform.

Each module should be able to operate independently where possible, but all
modules will share common database records where necessary.

Modules should not be hard-wired together in fragile ways. Communication between
modules should happen through:

- shared database tables
- linked records
- transaction systems
- snapshots
- audit logs
- controlled cross-module relationships

**Primary principle:**

> Independent modules. Shared source of truth. Controlled communication.

---

## 3. Source of Truth Rules

Supabase is the live source of truth for Northgate HQ.

Google Sheets / Excel workbooks may be used for:

- controlled imports
- controlled exports
- backup copies
- accounting review
- administrative editing interfaces
- disaster recovery

Google Sheets are not the live production database.

The system must support:

- scheduled Supabase → Google Sheets sync
- manual export
- full JSON backup export
- Excel workbook export
- transaction export
- sync history logging

The Grand Master Inventory view is read-only and generated automatically from
Supabase data. It is implemented as a Supabase SQL VIEW, not a Google Sheet.
A sync health indicator and last-updated timestamp must be visible wherever the
Grand Master view is displayed.

Users must not directly edit the Grand Master view.

---

## 4. Core Modules

Northgate HQ v2 includes:

- Dashboard
- Users / Employees
- **Jobs** *(primary job entity — see Section 5)*
- Project Management *(features within a Job: budget, schedule, procurement)*
- Estimating
- Inventory / Materials
- Tools
- Vehicles
- Documents
- Reports
- Financials / Accounting
- Admin / Settings
- Dev Console
- Future AI Assistant

Future systems should reserve extension points without delaying the current build.

---

## 5. Jobs and Estimates

> **Ryan's Decision:** The primary entity is called a **Job**. The database table
> is `jobs`. The nav item is "Jobs." All code, schema, and documentation must use
> "Job" as the canonical term. "Project Management" remains as a feature set
> *within* a Job (budget, schedule, procurement tabs) but is not a separate
> top-level entity. Any prior schema using `projects` must be renamed to `jobs`.

Jobs and estimates are independent records.

A job may exist before an estimate.

An estimate may exist before a job.

Estimates may later be:

- attached to existing jobs
- used to create new jobs
- saved as **pursuits** (status on an estimate — see Section 5a)
- saved as uncategorized
- archived
- deleted only with elevated permissions and confirmation

Once a job exists, the Job module becomes the ultimate source of truth for
job-related operational and financial information.

Jobs Foundation implementation details are locked in Section 38. Section 5
defines the canonical entity and service-call extension points; Section 38
defines the first implementation table, permissions, UI scope, and reserved
features.

### 5a. Estimate Statuses

Estimate status values (locked):

- `draft` — in progress, not submitted
- `pursuit` — saved as a lead/opportunity, not yet active
- `submitted` — sent to client
- `approved` — client accepted, triggers snapshot
- `rejected` — client declined
- `archived` — removed from active views

A pursuit is a standard estimate with `status = 'pursuit'`. It is not a
separate record type. It appears in a filtered "Pursuits" view.

### 5b. Service Call Extension Points

> **Ryan's Decision:** Reserve service call extension points now. Do not build
> the full service call module yet.

The `jobs` table must include:

- `job_type` TEXT DEFAULT 'job' CHECK (job_type IN ('job', 'service_call'))
- `service_call_number` TEXT (manually entered, nullable)

Transaction destination options must include service call as a valid
destination type from day one.

---

## 6. Estimate Approval and Snapshot Rules

When an estimate is approved, the system must create an immutable snapshot.

> **Ryan's Decision:** Snapshot immutability is enforced at the **database
> level** — not application level only. A Supabase trigger must block UPDATE
> and DELETE on `estimate_snapshots` after `locked = TRUE`. Application-level
> enforcement alone is insufficient for financial records.

### estimate_snapshots table (locked schema):

```
estimate_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id     UUID NOT NULL REFERENCES estimates(id),
  snapshot_data   JSONB NOT NULL,
  snapshot_type   TEXT NOT NULL CHECK (snapshot_type IN
                    ('initial_approval','revision','accepted','change_order')),
  locked          BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

Snapshots preserve:

- estimate data
- scope
- exclusions
- materials
- labor
- quotables
- cost codes
- pricing
- timestamp
- approving user

If an approved estimate is later edited:

- the original snapshot remains permanently preserved
- the estimate returns to `draft` status
- re-approval creates an additional snapshot
- both snapshots remain in history

Snapshot formats:

- JSON (true historical backup, queryable)
- PDF export (human-readable records)

---

## 7. Budget Rules

Approved estimates pushed to jobs create the initial job budget.

Budgets must map to cost codes automatically.

Budget changes after job creation must:

- require a save action
- require a reason (stored in audit log and on the budget change record)
- create audit log entries with before/after values
- record user and timestamp

Users may perform temporary "what-if" budget exercises without generating logs
until changes are formally saved. The UI must clearly distinguish what-if mode
from live budget mode. No database writes occur during what-if mode.

Division-appropriate Project Managers must be alerted when budget modifications
are saved. Alert infrastructure must be reserved even if notifications are not
fully built yet (`notifications` table and `app_settings` notification flags).

---

## 8. Inventory System Philosophy

Inventory must be transaction-driven.

> **Non-Negotiable Rule:** Inventory balances are transaction-derived only.
> No balance may be manually set without a formal Physical Count Correction
> transaction that creates an audit entry.

The inventory system architecture:

- Material Catalog (`items` table)
- Physical Storage Structure (unit → shelf → bay → bin)
- `inventory_balances` cache table (calculated from transactions, rebuildable)
- Locations model (physical + destination types — see Section 9)
- QR Codes
- Inventory Carts (session-based, abandoned carts are auto-voided after 24h)
- Cart Line Items
- Inventory Transactions
- Job / Vehicle / User / Service Call Links
- Cost Code Impacts
- Accounting Export

---

## 9. Inventory Locations

The system uses two distinct location concepts:

**Physical locations** (where things are stored):

```
Storage Unit → Shelf → Bay → Bin
Bin code format: A111 = Unit A / Shelf 1 / Bay 1 / Bin 1
```

**Transaction destinations** (where things are going):

- job
- service call
- vehicle (stocking the vehicle)
- user possession
- returned to vendor
- scrap / waste
- unknown / missing (requires a note)

> Physical bins and transaction destinations are not the same concept and must
> not be merged into a single "locations" model. They serve different purposes
> and are stored in different tables.
>
> **"Office" is a physical location, not a material disposition (locked v2.11).**
> The office/warehouse as a place where things sit belongs to the physical-location
> model (bins for material; tool locations for the future Tools module). It is
> therefore NOT a material transaction destination and has been removed from the
> list above. The cases it used to cover map elsewhere: returning material "to
> office" is **return-to-inventory** (material re-enters a bin and the job cost is
> reversed — an inbound transaction, see Section 11); a **buyout** staged at the
> office is job-earmarked material at a staging location (reserved future
> job-procurement concept — the office is its physical whereabouts, the job is its
> disposition); a tool at the office is a **Tools-module** location. See Section 11
> for the disposition rule.

Bins may contain multiple material items and tools.

---

## 10. QR Code Rules

QR codes may be generated for:

- storage units
- shelves
- bays
- bins

Future QR support reserved for (do not build yet):

- tools
- vehicles
- jobs
- materials

QR scan behavior:

- scanning a unit shows unit contents
- scanning a shelf shows shelf contents
- scanning a bay shows bay/bin contents
- scanning a bin shows bin contents

Users may navigate deeper or back up within the hierarchy after scanning.

### QR Payload Format (locked v2.14 - Entry 056)

Location QR codes encode the web route for the stable structural location UUID:

```text
https://<app-domain>/scan/location/<location_uuid>
```

The UUID is the QR identity. Human-readable location codes such as `A111` are
display/search labels only and are not the QR identity.

The typed route format is:

```text
/scan/<entity_type>/<uuid>
```

Generation remains locations-only for now: storage units, shelves, bays, and
bins. Tools, vehicles, jobs, and materials remain future QR entity types unless
their own locked milestone expands generation.

### QR Scanner - Web App Scope (locked v2.14 - Entry 056)

The web QR scanner is in scope for the Inventory module-completion milestone and
is not blocked by the reserved React Native companion app.

Scanner behavior is navigation/read-resolution only. Scanning a QR code resolves
the typed route and navigates to the appropriate in-app read surface. It is not a
permission bypass; all resolved data remains governed by server-authoritative
permissions and division-scoped read rules.

---

## 10a. Scan Destination Behavior (locked v2.15 — Entry 062)

### Core Rule

A scan destination page is a division-scoped, location-scoped view and action
entry point. It dispatches into existing cart/checkout and
`physical_count_correction` engines. It must not reimplement transaction, cart,
or balance logic.

Scan destination pages introduce no new transaction type and change no balance
derivation. Inventory balances remain transaction-derived only.

### Resolution and Access

Authentication is required before contents are shown. External phone-camera scans
route through sign-in first, then back to the scanned location.

Scan destinations are server-resolved and fail-closed under Rule 4. Unauthorized
scans do not confirm whether a location exists. Scan pages are navigation/action
entry points, never permission bypasses.

Division scope follows Section 17a. Current location contents/balances are an
operational read available to inventory-capable roles within division scope.
This current-contents read is broader than Section 17a transaction-history
self-scope, which still governs history reads only.

Inventory cost is open within authorized inventory scope. QR identity is the
UUID, not the human-readable code.

### Per-Level Behavior

Bin pages show current material rows and may expose action entry points for
add/remove to cart and correct count.

Bay pages show bins under the bay and aggregated contents. Bay pages are read +
navigation only; actions occur at bin level.

Shelf pages show bay/bin/material contents under the shelf. Shelf pages are read
+ navigation only; actions occur at bin level.

Unit pages show shelf/bay/bin/material contents under the unit. Unit pages are
read + navigation only; actions occur at bin level.

### Permitted Actions and Engines

Cart staging uses the existing cart/checkout flow only. Cart staging does not
change balances; balances change only on checkout finalization.

Cart staging gate: `can_inventory_transactions`, division-scoped to the
location.

Count correction uses `physical_count_correction` under existing Count Intake
rules. Count correction requires notes/reason and `can_manage_inventory`. Count
correction is the only mechanism that reconciles a quantity. Count correction is
never a direct `inventory_balances` write.

No generic ambiguous +/- controls are allowed. Any +/- affordance must resolve
clearly to either cart staging or count correction and be visually/semantically
distinct.

### Out of Scope From Scan Pages

Location-to-location/bin-to-bin movement is out of scope from scan pages. Scan
pages do not surface the Section 12 Transfer Location transaction type.

Multi-bin batch cart actions from hierarchy levels are RESERVED.

Scan pages add no new transaction type, ledger behavior, or balance-derivation
change.

### Relationship to Label Template Designer

QR payload remains `/scan/location/<uuid>` across all levels. Label layout may
differ by level using `label_templates.scope_level`.

Avery 5164 remains for unit/shelf/bay placards. Avery 8160 remains for bin
labels. Human-readable code may be printed as display text. Encoded identity
remains the UUID.

No new label mechanism is required.

### Build Sequencing

Read-before-write.

First build the location-scoped contents/navigation view. Then wire action
bindings to existing engines. Do not require both steps in one build.

---

## 11. Inventory Cart Rules

Users must be authenticated before using inventory.

The system automatically records at cart creation:

- user ID and display name
- user's **current active** vehicle assignment at the moment the cart is opened
  (stored as a snapshot on the transaction — do not re-query at checkout)
- date and time

Users do not manually enter "checked out by."

Checkout requires a destination before completion.

> **Ryan's Decision:** Per-line-item destinations are supported from day one.
> Each cart line item may be assigned a different destination. The
> `transaction_items` table must include `destination_type` and
> `destination_id` at the line item level, not only at the transaction header.

### transaction_items locked columns (additions):

```
destination_type  TEXT CHECK (destination_type IN
                    ('job','service_call','vehicle','user',
                     'vendor_return','scrap','unknown'))   -- NULL allowed; see disposition rule
destination_id    TEXT  -- FK target depends on destination_type
unit_cost_at_time NUMERIC NOT NULL DEFAULT 0
```

Default checkout: entire cart assigned to one destination.

Advanced checkout: split cart by line item.

Vehicle destination = stocking the vehicle (not job coding).

Material transported on a vehicle for a job = coded to the job, not the vehicle.

Unknown / missing requires a mandatory note.

> **Ryan's Decision — disposition vs. location (locked v2.11):**
> `destination_type` records an *outbound disposition* — where material goes, and
> what happens to its cost, when it LEAVES trackable stock. It is populated only
> for outbound moves and is **NULL for inbound and non-movement transactions**
> (Add Stock, Return-to-Inventory, Physical Count Correction), which instead act on
> a bin (physical location). In particular:
>
> - **Physical Count Correction → `destination_type = NULL`.** A correction is a
>   reconciliation, not a movement; its nature is already carried by the
>   transaction type, so it must never borrow a movement label. It previously wrote
>   `'office'`; that is retired. Existing pre-release count-correction rows are
>   migrated `'office' → NULL` — balance-neutral (destination_type does not affect
>   quantity), scoped strictly to rows whose transaction type is Physical Count
>   Correction.
> - **Return-to-Inventory** (returning material "to office") → a "Return from Job"
>   transaction with `destination_type = NULL`, landing back in a bin with the job
>   cost reversed. Built when Returns are built; reserved here so it is never
>   modeled as an "office destination."
> - **`'office'` is not a valid material `destination_type`** and is removed from
>   the enum (Section 9). The database enum change must follow the row migration,
>   never precede it (the constraint cannot tighten while `'office'` rows remain).

### Cart-open controls (v2.5 clarification — HANDOFF Entry 016)

Opening a cart is a server write into an inventory table, so it is gated by
permission, not by authentication alone. The cart-open RPC
(`open_inventory_cart`) must:

- use `auth.jwt() ->> 'sub'` as the authoritative `user_id` (never a
  client-supplied user ID);
- verify the caller's `can_inventory_transactions` from
  `user_permissions.effective_permissions` server-side and fail closed if it is
  false;
- block all direct client mutation of `inventory_carts` / `inventory_cart_items`
  (RLS deny-all; writes go only through controlled RPCs).

The active-vehicle snapshot is **server-derived, never client-passed.** The
client does not supply the vehicle ID. The server determines the snapshot from
the user's active vehicle assignment (see Section 16):

- if the user's assigned vehicle has `holds_stock = TRUE`, snapshot that vehicle
  on the cart at open time and do not re-query it at checkout;
- otherwise the snapshot is `NULL`. A `NULL`-vehicle cart is a valid, common
  state — it simply records who handled the material. `NULL` must never be
  treated as an error by add-to-cart or checkout.

This cart-open snapshot (the stock-carrying vehicle the user is operating from)
is distinct from the per-line checkout `destination_type = 'vehicle'` (where
material is going). They are not merged.

---

## 12. Inventory Transaction Types

```
Add Stock
Remove Stock
Transfer Location
Assign to Job
Return from Job
Assign to Vehicle
Return from Vehicle
Adjust Quantity
Mark Damaged
Scrap / Waste
Vendor Return
Physical Count Correction  ← always creates an audit entry
```

Physical Count Correction overrides the calculated balance. It is the only
transaction type that may set an absolute quantity rather than a delta. It
always generates both a transaction record and a main audit log entry.

Transactions are sortable by: date/time, user, division, job, service call,
vehicle, material, location.

---

## 13. Inventory Cost Rules

> **Ryan's Decision:** Cost at time of transaction is always stored in
> `transaction_items.unit_cost_at_time`. It is never back-calculated from the
> current catalog price. This is non-negotiable for accurate job costing.

Inventory checkout uses `unit_cost_at_time` = current `price_per_unit` from
the `items` table at the moment of transaction creation.

Material returns credit the job at the same `unit_cost_at_time` originally
recorded on the checkout transaction.

Inventory transactions automatically apply to the appropriate cost code, with
authorized override when permitted.

---

## 14. Two Distinct Approval Concepts

> **Ryan's Decision (reviewed by Claude, implemented by Codex):**
> Physical inventory movement approval and job-cost/accounting approval are
> two separate concepts. They must never be carried by the same field.

### 14a. Physical Movement Approval — `transaction_items.status`

`transaction_items.status` means **physical inventory movement approval only.**

```
status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'rejected'))
```

- `approved` means the material physically moved and the on-hand balance changed.
- It does NOT mean job-cost approval, accounting approval, AP approval,
  invoice approval, or reconciliation.
- Only `approved` rows affect `inventory_balances`.
- `pending` and `rejected` rows remain in the transaction log but do not
  affect `quantity_on_hand`.

Cart checkout/finalization sets `status = 'approved'`, stamps
`occurred_at = NOW()`, and snapshots `unit_cost_at_time` from catalog cost
at the moment of issue or return.

Supporting columns on `transaction_items`:
- `ledger_sequence BIGINT GENERATED ALWAYS AS IDENTITY` — deterministic
  ordering tie-breaker. Not treated as real-world event order.
- `occurred_at TIMESTAMPTZ` — physical movement event time, distinct from
  `created_at` (record entry time). Approved rows must have a non-null
  `occurred_at`. Balance ordering uses `occurred_at DESC, ledger_sequence DESC`.

### 14b. Job-Cost / Accounting Approval — Separate Mechanism (Reserved)

Job-cost and accounting approval is a **separate mechanism, built in the
Financials phase, not the Inventory phase.**

When a transaction has `destination_type = 'job'`, it will generate a
job-cost entry that carries its own approval lifecycle — its own status,
approver, and approved-at timestamp — independent of the physical movement.

This is an extension point reserved now and built later. Do not overload
`transaction_items.status` to carry accounting meaning.

Job budget screens (Financials phase) will display:
- approved job costs
- pending job costs (visually distinct)
- projected totals

Accounting and authorized users approve or reject pending **job costs** —
which is distinct from approving the physical movement that generated them.

### 14c. App Job-Cost Scope

App job-cost tracking covers internal-stock movements only. Direct/AP
purchases that never enter stock do not pass through the inventory
transaction system and do not touch the app's inventory cost tracking.

### 14d. Transaction Completeness — Express Checkout / Manager Override (v2.6)

> **Ryan's Decision (v2.6):** A controlled "take now, complete later" path for
> when a worker must grab material in a hurry. It is more rigorous than a normal
> checkout (passcode + audit + forced verification), not a bypass.

This introduces a **third, distinct concept** alongside the two in Section 14:
**transaction completeness.** It is separate from physical-movement approval
(14a) and from job-cost approval (14b). One field must never carry more than one
of these meanings.

Flow:

1. **Worker initiates** the express take (gated by `can_express_checkout`) and
   fills a short-answer form. The physical removal is real the moment it
   happens, so the transaction is written immediately with
   `status = 'approved'`, `occurred_at = NOW()`, and `unit_cost_at_time`
   snapshotted — the inventory balance stays correct (Rules 1, 9, 16). Express
   checkout never sets a balance directly and never skips the ledger.
2. The transaction is flagged `requires_completion = TRUE`, with the worker's
   short-answer text stored as provisional notes and the structured destination
   / cost-code fields left provisional. `requires_completion` is its own field —
   never `transaction_items.status`, never the job-cost approval field.
3. **An approver** (`can_approve_express_checkout`) fills in the real
   quantities, destination(s)/job number(s), and cost code(s), then approves.
   Approval is **blocked until the required structured fields are present** —
   this, not the passcode, is the real enforcement against rubber-stamping; it
   is also where Section 11's "destination required" is satisfied.
4. The approver enters their **own per-user passcode** to finalize. The passcode
   is verified server-side and stored hashed; it is a deliberateness gate and an
   unattended-device guard, NOT the authorization (the permission flag is that).
5. Express items surface as a **queue / worklist** routed to approvers. Today
   the only approver is the Developer; a division manager can be added later by
   granting `can_approve_express_checkout` — no code change. Worklist is in-app
   for now; email/push is deferred to the companion-app phase.

**"Finish later" (deferred completion).** Worklist items are queue-based, never
modal — a user is never locked out of the rest of the app while a task is
pending. Holders of `can_defer_completion` may additionally save partial
completion progress and resume later. This is reserved to the Developer (and any
explicitly granted select users), per Ryan's decision.

**Audit.** Every express take, every completion/approval, and every override
generates a mandatory audit entry (Rules 5, 6): who, when, passcode-verified for
approvals, items and quantities, the short-answer fields, and the override
reason where applicable.

**Sequencing.** Built after the normal cart checkout/finalization path. Express
checkout is that write minus the confirmed destination, plus the completeness
flag, passcode, audit, and deferred-completion handling.

---

## 15. Change Orders

> **Ryan's Decision:** Change orders are financial records, not documents.
> They are a distinct entity with their own approval workflow.

Change orders attach to jobs and:

- modify scope
- modify contract amount
- require approval workflow (proposed → approved → rejected)
- trigger a budget adjustment on approval
- generate an audit entry on approval
- may have documents attached to them

### change_orders table (locked schema):

```
change_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES jobs(id),
  co_number        TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  amount           NUMERIC NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'proposed'
                   CHECK (status IN ('proposed','approved','rejected')),
  submitted_by     TEXT,
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

---

## 16. Vehicles and Van Stock

Vehicles function as inventory locations when stocking material.

Vehicle classifications: Residential, Commercial, Service, Other (with description).

Van stock templates are reserved for future build:

- `vehicle_bin_items.min_quantity` and `vehicle_bin_items.max_quantity` columns
  must be added to the schema now even if the template UI is not yet built.

> **Ryan's Decision (v2.5):** Whether a vehicle is tracked as a persistent
> inventory location is set by an explicit stock-carrying flag at the vehicle
> level, separate from the classification above:
>
> ```
> vehicles.holds_stock  BOOLEAN NOT NULL DEFAULT FALSE
> ```
>
> Not all employees drive a company vehicle, and of those who do, only vehicles
> that hold stock for extended periods (e.g., the stocking vans) need inventory
> tracking. Transient stock carried in a truck between the office and a job is
> not tracked at the vehicle level; those carts record only who handled the
> material.
>
> A user is attached to a vehicle through an active user→vehicle assignment
> (minimal table or column; the design is locked here and built before van
> stock is onboarded). The inventory cart derives its vehicle snapshot from this
> assignment server-side: snapshot the assigned vehicle only when
> `holds_stock = TRUE`, otherwise `NULL` (see Section 11). The classification
> field (Residential/Commercial/Service/Other) is the vehicle's role and must
> not be overloaded to mean "carries stock." Add `holds_stock` now (schema-first)
> even though only a couple of vehicles will be flagged.

### User→Vehicle Assignment Model (locked v2.10 — HANDOFF Entry 033)

The "active user→vehicle assignment" referenced above (and consumed by the
Section 11 cart-open snapshot) is a dedicated, time-bounded bridge table — not a
column on `user_permissions`, and not a wait on the future Employee module.
Keying is by Clerk user ID (TEXT), consistent with the project-wide rule that
Clerk IDs are TEXT everywhere; when the Employee module lands, employees
reference the same Clerk identity, so no stored assignment data needs to migrate.

```
vehicle_assignments (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        TEXT NOT NULL,             -- Clerk sub; the assigned operator
  vehicle_id     <match vehicles PK type> NOT NULL REFERENCES vehicles(id),
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at  TIMESTAMPTZ,               -- NULL = currently active
  assigned_by    TEXT,                      -- Clerk sub of who set the assignment
  note           TEXT
)
-- at most one ACTIVE assignment per user:
CREATE UNIQUE INDEX ux_vehicle_assignments_active_user
  ON vehicle_assignments (user_id) WHERE unassigned_at IS NULL;
```

- The **active** assignment for a user is the single row with
  `unassigned_at IS NULL`. Reassignment closes the prior row
  (`unassigned_at = now()`) and inserts a new active row. Rows are never edited in
  place or deleted, so the table is a faithful assignment history.
- The Section 11 cart-open snapshot derives `active_vehicle_id` from this active
  row, snapshotting it only when the assigned vehicle's `holds_stock = TRUE`
  (otherwise `NULL`). The per-line `destination_type = 'vehicle'` destination is
  independent of this snapshot and is not merged with it.

### Vehicle Display Label (locked v2.10)

Vehicles carry their own stable, human-readable unit label, independent of who is
assigned to them:

```
vehicles.display_name  TEXT NOT NULL  -- e.g. "E-101", "Service Van 3", "Ryan's Truck"; stable unit label, not derived from assignment
```

This is the vehicle's identity. It is never derived from assignment and does not
change when the vehicle is reassigned.

### Destination Display Resolution (read-path only — locked v2.10)

The stored structural destination is unchanged: `transaction_items.destination_type`
+ `destination_id` remain the source of truth (Section 11). Readable labels are a
**read-path concern only** — resolving a label must never write a value, never
become a second source of truth, and never alter checkout/finalization. Resolution
by destination type:

- **user** → the operator's identity record: `user_permissions.display_name`, else
  `email`, else the raw Clerk ID. (Source swaps to the Employee module when it
  exists; `destination_id` is unchanged either way.)
- **vehicle** → the vehicle's *current* `display_name`, resolved dynamically by
  joining `destination_id` to `vehicles` — a renamed unit is the same physical
  vehicle, so current is correct. The operator association (e.g. "Miguel") is
  **point-in-time**: the person assigned to that vehicle is resolved from
  `vehicle_assignments` as of the transaction's `occurred_at`, never "who drives
  it now." Display is the unit label, optionally adorned with the historical
  operator when assignment history is available — e.g. `E-101` or
  `E-101 (Miguel)` — but the vehicle unit label remains canonical and the
  operator adornment is contextual.
- **job / service_call** → a readable job/service label once those modules exist;
  until then, the raw `destination_id`.
- **NULL destination** (inbound / non-movement — Add Stock, Return-to-Inventory,
  Physical Count Correction; see Section 11) → label from the *transaction type*,
  e.g. "Count correction", "Add stock", "Return to inventory" — never a raw ID and
  never "Office." (`'office'` is no longer a material destination — locked v2.11.)
- Any unresolved reference (archived/deleted vehicle, unknown user) falls back to
  the raw `destination_id` rather than failing.

This achieves historical correctness *without* snapshotting display strings onto
transactions: vehicle unit labels follow the current (corrected) name, while the
operator association is reconstructed from the time-bounded assignment history. A
write-once display-label fallback column MAY be added later — only if history is
opened beyond Developer and raw-ID fallbacks become user-visible — and that would
be a separately reviewed checkout addition, deliberately not built now.

---

## 17. Permissions Model

Permissions use role-based defaults with user-specific overrides.

Roles (locked, in order of authority):

1. Developer
2. Administrator
3. Project Manager
4. Estimator
5. Field Supervisor
6. User (Field Tech)

Divisions: Electrical, Construction, Admin.

Division visibility rules:

- Electrical users see Electrical inventory / tools / vehicles
- Construction users see Construction inventory / tools / vehicles
- Cross-division read is governed by `can_view_all_divisions`
- Admin-division users see all divisions by default
- `can_view_financials` governs job/project OH&P and margin visibility, not
  inventory cost

### Canonical Permission Flags (locked — do not add without lock document update):

```
can_access_developer
can_manage_users
can_view_reports
can_edit_catalog
can_manage_employees
can_manage_vehicles
can_manage_tools
can_manage_inventory
can_inventory_transactions
can_view_all_divisions
can_estimate
can_approve_estimates
can_create_jobs
can_manage_jobs
can_approve_budget
can_view_financials
can_field_access
can_archive_records
can_manage_change_orders
can_express_checkout
can_approve_express_checkout
can_defer_completion
```

> **Express-checkout flag defaults (v2.6 — see Section 14d):**
> `can_express_checkout` defaults ON for every role that has
> `can_inventory_transactions`, so any inventory-transacting user can initiate an
> express take today — but it is independently revocable per user without
> touching their inventory access and without a code change.
> `can_approve_express_checkout` defaults to Developer / Administrator only and
> is expandable to division managers by granting the flag.
> `can_defer_completion` defaults to Developer only.

> **Division-read flag defaults (v2.14 — see Section 17a):**
> `can_view_all_divisions` defaults ON for the Developer role and ON for
> Admin-division users. It may be granted to trusted users without elevating them
> to Developer. It is a read-only cross-division capability: it widens row scope
> only and does not grant write access, override authority, Dev Console access,
> or inventory cost gating.

> **Non-Negotiable Rule:** Permissions are server-authoritative. The UI may
> hide buttons based on permission state, but all permission enforcement happens
> at the API / database level. No local state, no client-side-only permission
> gates. A hidden button is UX convenience only — the server still validates.

---

## 17b. Granular Permission Overrides (locked v2.29 — Entry 136, Rule 20 cross-cleared, second pass)

### Overview

Role-based permission defaults establish baseline access for each role. Individual
users may receive additional, revoked, or modified permissions via a developer-only
override system, enabling fine-grained control without adding new roles or creating
overly-broad permission grants.

This section has been through two rounds of Rule 20 cross-clearance (Claude/
ChatGPT). Entries 134 and 135 are both superseded and are not
implementation-accurate. This version (Entry 136) is final.

### Identity Model

Northgate does not use Supabase Auth identities. All identity in this system is
Clerk-based, keyed as TEXT, consistent with project-wide convention
(`user_permissions.clerk_user_id`, `auth.jwt() ->> 'sub'`). The override table
follows this same pattern — no `auth.users` references anywhere.

### Role Source (corrected — second pass)

The user's role is sourced from `user_permissions.role`. There is no confirmed
`users` table in this schema; every other locked section of this architecture
reads role/division/identity from `user_permissions`
(`user_permissions.clerk_user_id`, `user_permissions.division`,
`user_permissions.display_name`), and Section 17b must follow the same pattern.
Codex must confirm the live column name against the deployed schema before
implementation, but the reference table is `user_permissions`, not `users`.

### Override Table Schema

New table: `user_permission_overrides`

```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id             TEXT NOT NULL          -- Clerk sub of the affected user
permission_flag     TEXT NOT NULL          -- validated against canonical Section 17 list
granted             BOOLEAN NOT NULL       -- TRUE = grant, FALSE = revoke
granted_by_user_id  TEXT NOT NULL          -- Clerk sub of the acting developer
granted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
reason              TEXT NOT NULL          -- mandatory, max 500 chars
is_active           BOOLEAN NOT NULL DEFAULT TRUE
```

`permission_flag` is validated at the application layer (or via CHECK constraint)
against the canonical Section 17 flag list. It does not reference
`user_permissions` as a lookup table — that table stores per-user permission
state, not a catalogue of permission names, and is not a valid FK target for this
purpose.

**History-preserving uniqueness:** Each grant/revoke is its own row, preserving
full history. Only one row per (user, flag) may be active at a time:

```sql
CREATE UNIQUE INDEX one_active_override_per_user_flag
  ON user_permission_overrides (user_id, permission_flag)
  WHERE is_active = TRUE;
```

Deactivating an override (setting `is_active = FALSE`) frees that slot for a new
override row, so the full sequence of past grants/revokes for a given user/flag
combination remains queryable rather than being overwritten in place.

### `can_access_developer` — excluded from general override

`can_access_developer` is **excluded from this override system entirely.** No
developer may grant or revoke Developer-level access — for themselves or anyone
else — through the mechanism described in this section. It is never written to
`user_permission_overrides` and never read from it during resolution.

> **Owner-only exception:** Ryan, as creator and primary developer, retains the
> ability to modify Developer-level access (including other developers'
> `can_access_developer` flag and general permission set) through a separate,
> more deliberate path outside this override system. This is identity-gated to
> Ryan's Clerk identity specifically, not to the Developer role generally.
> Implementation of this Owner-only path is reserved for a future milestone; it
> is not part of the v2.29 build. Until that path exists, Developer-role changes
> continue through direct, manual administration as they do today.

### Non-Recursive Developer Authority Check (corrected — second pass)

The original draft gated write/read-all access on
`effective_permissions_for_user()`, which itself would query
`user_permission_overrides` once that function is updated — creating a
recursion risk (RLS on the override table calls a function that queries the
override table, which re-triggers RLS, and so on).

**Correction:** Developer authority for managing overrides must be checked
through a path that never queries `user_permission_overrides`. `can_access_developer`
is never sourced from the override table (see above), so this is a natural
consequence, but the implementation must be explicit about it rather than
incidental:

- Provide a dedicated, non-recursive check — e.g. a small `SECURITY DEFINER`
  helper function or an inline query — that reads `can_access_developer`
  directly from the user's role/Owner-path assignment (`user_permissions` plus
  whatever mechanism currently grants Developer status), and nothing else.
- This helper must not call the general `effective_permissions_for_user()` if
  that function's execution path touches `user_permission_overrides`. If
  `effective_permissions_for_user()` is refactored so that the
  `can_access_developer` branch short-circuits before ever touching the
  override table, it may be reused safely — but Codex must verify this
  explicitly rather than assume it, since the two other flags it resolves
  (baseline + overrides) do touch that table.
- Whichever approach is used, it must be the same non-recursive check on both
  the read-all-history policy and the write-gate inside the controlled RPC
  (see below), so there is one source of truth for "is this person allowed to
  manage overrides."

### RPC-Only Writes (corrected — second pass)

The original draft exposed a client-facing `INSERT` RLS policy with the
justification that the application layer would additionally block forbidden
targets. That is weaker than this project's server-authoritative standard
(Section 17, Non-Negotiable Rule) and is corrected here.

**Corrected write model:**

- Authenticated clients may `SELECT` their own permitted override history via
  RLS (per Access Control below). There is **no direct client `INSERT`,
  `UPDATE`, or `DELETE`** on `user_permission_overrides` — RLS denies all
  client-side writes outright, matching the existing cart-open pattern
  (Section 11).
- All grants and revokes happen through a single controlled RPC (e.g.
  `set_permission_override`), which:
  1. Verifies the caller's Developer authority via the non-recursive check
     above; fails closed if not authorized.
  2. Rejects any attempt to target `can_access_developer`.
  3. Rejects any attempt to target a user who is themselves a Developer
     (reserved for the future Owner-only path).
  4. Validates `permission_flag` against the canonical Section 17 list.
  5. Requires a non-null `reason`.
  6. Deactivates any existing active row for that (user, flag) pair
     (`is_active = FALSE`).
  7. Inserts the new override row.
  8. Writes the corresponding `change_logs` entry.
  9. Performs steps 6–8 atomically (single transaction) so the override and its
     audit entry can never become separated.
- Revocation is a call to the same RPC with `granted = FALSE`, not a direct
  client `UPDATE` of `is_active`.

### Permission Resolution Logic

In `effective_permissions_for_user()`:

1. Fetch the user's role from `user_permissions.role`
2. Load baseline permissions from role-to-flag mapping (existing logic)
3. Query `user_permission_overrides` WHERE user_id = ? AND is_active = TRUE
4. For each active override: if `granted = TRUE`, add flag; if `granted = FALSE`,
   remove flag
5. Explicit revokes win over grants if conflicting active rows are ever present
   (should not occur given the partial unique index, but the resolution order is
   specified defensively)
6. Return only canonical Section 17 permission flags; fail closed on any
   unrecognized or malformed flag
7. `can_access_developer` is never modified by this resolution step — it is
   sourced from role/Owner-path assignment only, never from
   `user_permission_overrides`

Result: baseline role permissions + overrides = user's actual effective
permissions (excluding `can_access_developer`, which this system never touches).

### Access Control

- **Read:** A user may read their own override history (active and inactive
  rows) via RLS keyed on `auth.jwt() ->> 'sub'`. A user who passes the
  non-recursive Developer authority check may read any user's override history.
  All other users are denied.
- **Write:** Only through the controlled RPC described above. No direct client
  `INSERT`/`UPDATE`/`DELETE` under any circumstance.

### Audit Trail

Every override write (grant, revoke, or reactivation) logs to the existing main
audit log (Section 19, `change_logs`) using the real, already-live schema —
Codex must inspect the actual `change_logs` columns before implementation rather
than assume field names. At minimum the log entry must capture: affected user,
permission flag, previous effective state, new effective state, direction
(grant/revoke), reason, acting developer, and timestamp. This write happens
inside the same RPC transaction as the override row itself (see RPC-Only Writes
above) — never as a separate, decoupled step.

Override **reads are not audited** — only writes and state transitions.

### Expiration — deferred

**v2.29 supports manual overrides only.** No expiration/auto-revoke behavior is
included in this milestone. Time-bound overrides (`starts_at` / `expires_at`)
are explicitly deferred to a future architecture-cleared milestone and must not
be added speculatively now.

### Refresh Behavior

Because permissions are server-authoritative, an override takes effect on the
affected user's **next request** — no sign-out/sign-in required. Implementation
must:

- invalidate or refetch the affected user's cached effective-permission state
  after any override write;
- refetch immediately if a user's own effective permissions changed;
- ensure Silas (Section 48) computes effective permissions per-request (or
  refreshes at minimum on each new conversation/message), never holding a stale
  conversation-start snapshot indefinitely.

### Use Cases (Examples)

- Grant `can_manage_inventory` to a field tech designated as inventory auditor,
  without making them a Project Manager
- Revoke `can_inventory_transactions` from a specific user on leave without
  changing their role
- Grant `can_view_financials` to a field supervisor for one contract without
  elevating their role

### Interaction with Division Scope

Overrides are user-level (not division-scoped). A developer granting
`can_view_all_divisions` makes that override effective across all divisions
immediately. Division-scoped defaults remain in place (Section 17a); overrides
are applied after scope is resolved.

### Interaction with Silas (Section 48)

Silas reads the effective permission set (baseline + active overrides) via
`effective_permissions_for_user()`. Per the refresh behavior above, this must not
be cached indefinitely at conversation start — Silas needs to reflect permission
changes without requiring a new conversation.

### Confirmed Runtime Behavior (documented v2.29 — Entry 138)

The following were verified directly against the live function body and
database role configuration during post-implementation testing (Entry 138) and
are recorded here as permanent, load-bearing facts about this system rather than
implementation notes:

**Caller-scoped resolution only — a hard boundary, not a temporary gap.**
`effective_permissions_for_user(p_role, p_division, p_permission_overrides)`
resolves active overrides using `auth.jwt() ->> 'sub'` internally — it has no
parameter for an arbitrary target Clerk user ID. This means the function can
only ever return the *calling session's own* effective permissions, never
another user's. This is safe and correct for every current call site (all of
which check the caller's own access), but it also means this function **cannot**
be reused to build any feature that needs to inspect a *different* user's
effective permissions (e.g., an admin screen showing "what can this other
person do"). Any such feature requires a new, explicitly target-scoped function
— this one must not be repurposed or have its signature changed to try to serve
that need.

**Legacy `user_permissions.permission_overrides` JSONB is single-purpose.**
As of the live function body confirmed in Entry 138, this legacy column is
read for exactly one flag: `can_access_developer`. No other key present in that
JSONB has any effect on a user's effective permissions — all other flags
resolve exclusively from role defaults (`default_permissions_for_role()`) plus
active rows in `user_permission_overrides`. This column must not be treated as
a general-purpose override mechanism going forward; it exists solely as the
non-recursive source of Developer-access truth, consistent with
`can_access_developer` being deliberately excluded from the granular override
table (see above).

**No RLS recursion — confirmed via `SECURITY DEFINER` + `rolbypassrls`.**
`effective_permissions_for_user()` is `SECURITY DEFINER`, owned by a role with
`rolbypassrls = true` (confirmed live). Its internal read of
`user_permission_overrides` therefore bypasses that table's RLS policies
entirely, regardless of caller identity, which is what prevents the recursion
risk flagged during the second Rule 20 cross-clearance pass (Entry 136). This
is a different mechanism than the non-recursive Developer-authority helper
(`current_user_has_developer_access()`), which avoids recursion by never
querying the override table at all. Both are correct; they solve the same
class of problem via different, non-conflicting paths and must not be
collapsed into one another.

---

## 17a. Division-Scoped Read Rule (locked v2.14 — Entry 056)

The Inventory module uses server-authoritative division-scoped reads. Client-side
row filtering is not a security boundary and must not be the source of truth for
division visibility.

### Scope Tiers

1. **Cross-division read:** Users with `can_view_all_divisions` may read
   authorized inventory data across divisions.
2. **Own-division full read:** Administrator, Project Manager, Estimator, and
   Field Supervisor users without `can_view_all_divisions` may read full
   inventory data for their own division.
3. **Self-scoped read:** Field Tech / User may read their own carts and
   transactions within their division.

The division anchor must reuse the existing division-scoping model from the
`202606120001_harden_inventory_reference_division_scope.sql` scoped reference
views. New read surfaces should extend that server-side pattern instead of
inventing a client-side division filter.

### Permission Semantics

- Developer role defaults to cross-division read.
- Admin division defaults to cross-division read through effective permission.
- Administrator role outside the Admin division remains own-division unless
  individually granted `can_view_all_divisions`.
- `can_view_all_divisions` is read-only row-scope widening. It does not grant
  write access, override authority, Dev Console access, or archive authority.
- Inventory cost is open within the user's authorized inventory scope.
- `can_view_financials` is not an inventory cost gate; it governs job/project
  OH&P and margin visibility.
- Full-division transaction/history surfaces are gated by
  `can_manage_inventory`.
- Self-scoped "my transactions" surfaces are gated by
  `can_inventory_transactions`.

This closes the division-scoped-read drift warning for Inventory.

The same division-scope plus read-capability pattern is the template for future
read access in tools, vehicles, and jobs as those modules are built.

---

## 18. Archive Rules

Archive is always preferred over deletion.

Archived records preserve all history and relationships.

Archived records remain visible in: transactions, reports, snapshots, audit logs,
historical views.

Archived records are hidden from active dropdowns and searches unless
"Show Archived" is explicitly enabled.

### All of the following are archivable (locked list):

estimates, jobs, inventory items, tools, vehicles, employees, assemblies,
cost codes, documents, change orders, reports, users

Archived users may be disabled from login but remain attached to historical
actions permanently.

---

## 19. Audit Logging Rules

> **Non-Negotiable Rule:** Audit logging cannot be bypassed by any user,
> role, or system including the Dev Console. All Dev Console actions generate
> audit entries.

Two separate logs:

1. **Main audit log** (`change_logs`) — business-critical structural changes
2. **Inventory transaction log** (`inventory_transactions` + `transaction_items`)
   — all material movement

Main audit log events (locked):

- budget changes (with reason)
- estimate approval
- estimate edits after approval
- job status changes
- PM reassignment
- labor edits
- cost code edits
- archive / delete actions
- permission changes
- role changes
- Dev Console actions
- change order approval
- physical count corrections
- document uploads and deletions
- employee profile changes
- vehicle record changes

Each audit entry includes: user, action, record type, record ID, timestamp,
before value, after value, reason (where required).

---

## 20. Documents

One centralized document system. Every module accesses the same `documents`
table filtered by the relevant record. No module-level document storage.

### Storage location (locked):

Documents are stored in **Supabase Storage**. The `documents` table stores
the file path / URL, not the file itself.

Documents may attach to: jobs, estimates, vehicles, tools, employees,
change orders, reports, snapshots.

Document naming format:

```
[Job_Name] [YYYY-MM-DD] [HHMM] [Document_Type] [Description]
```

Example:

```
Chatham Ridge 2026-05-28 1430 Approved Estimate Snapshot Original Budget.pdf
```

---

## 21. Financials / Accounting

### Module boundary (locked):

- **Jobs / PM** owns: budget creation, budget tracking, forecasting, procurement
- **Financials** owns: pending cost approval, invoice review, accounting exports,
  cost reports

Both modules read the same budget and cost tables. Financials writes the
`approved_by` and `status` fields. PM writes the budget amounts and forecasts.

Accounting exports support selectable output fields via checkboxes.

Export fields include: job number, date, material, quantity, unit cost at time,
total cost, cost code, user, source location, destination location.

---

## 22. Dev Console

Developer-only operational control center. All actions logged.

Responsibilities:

**Data & Sync**
- Sheets → Supabase import
- Supabase → Sheets export
- JSON backup export
- Excel export
- sync history with health status and timestamps
- failed sync review

**Database Utilities**
- raw table viewer
- relationship viewer
- orphaned record repair
- rebuild inventory balances (from transaction history)
- rebuild Grand Master views
- manual snapshot creation
- pending transaction review

**Permissions**
- role management
- user-specific permission overrides
- module toggles
- feature toggles

**Inventory Utilities**
- QR regeneration
- label template management
- bulk location creation
- van stock templates
- bulk material import

**System Utilities**
- audit log viewer
- notification controls
- backup scheduling
- system health dashboard

**Future AI Utilities (reserved, do not build yet)**
- AI settings table
- AI prompt templates table
- AI interaction log table
- semantic indexing flags

### Developer Override — Process, Not Ledger (v2.6)

> **Ryan's Decision (v2.6):** The Developer may override a human **workflow
> gate** — for example self-approving an express item or force-closing a
> completion task — but only with a **mandatory reason that is written to the
> audit trail.**

This does not conflict with Rules 5 and 6. Those rules forbid *skipping the
audit log*, not having elevated power; a reason-required, always-logged override
is the intended expression of developer authority, not an exception to it.

The override is strictly limited to process gates. It does **not** extend to
structural data invariants: inventory balances are never set directly and locked
estimate snapshots are never edited — even by the Developer, even with a reason.
A wrong balance is corrected through a Physical Count Correction transaction
(itself audited), never a raw override. Override the process, not the ledger.

---

## 23. Inventory Balance Cache

> **Ryan's Decision:** An `inventory_balances` cache table must exist in the
> schema. Balances are calculated from transaction history but cached for
> performance. The Dev Console must expose a "Rebuild Inventory Balances"
> function that recalculates all balances from transaction history.

### inventory_balances table (locked schema):

```
inventory_balances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bin_item_id  UUID NOT NULL UNIQUE REFERENCES bin_items(id),
  quantity     NUMERIC NOT NULL DEFAULT 0,
  last_rebuilt TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

Balance cache is updated on every transaction. If the cache is suspected to be
wrong, the Dev Console rebuild function recalculates from full transaction
history.

### Count Intake — establishing physical quantities (locked v2.12 — Entry 039)

The Inventory Count Intake workflow follows the existing balance discipline exactly:
it adds a controlled way to count physical stock into the system, never a new source
of truth.

- **One mechanic.** All official quantity establishment and correction uses the
  existing `physical_count_correction` transaction (Section 12), with
  `destination_type = NULL` (v2.11). No new transaction type is introduced for
  counting, and `inventory_balances` (and any cached `bin_item` quantity) is never
  written directly.
- **`bin_item` creation is structural only.** When a catalog item is physically
  present in a bin but no `bin_item` exists for that (bin, item) pair, the intake flow
  may create the `bin_item` — but it only links the item to the bin and **opens at
  zero balance**. The counted quantity is established solely by the
  `physical_count_correction` that follows. A `bin_item` is never created with a
  non-zero opening quantity; its balance comes from the ledger and nowhere else.
- **Atomic intake RPC.** A single server-authoritative RPC performs the intake: it
  find-or-creates the `bin_item` for (bin, item) — idempotent, opening 0 — and then
  applies the *same* count-correction path used by `set_inventory_count_quantity`
  (it does not fork a parallel correction). One transaction: no orphaned zero-balance
  `bin_item` without a count, and no count without a `bin_item`.
- **Catalog is authoritative elsewhere.** The intake UI selects only from existing
  catalog `items`; it does not create catalog items. A physically present item that is
  not in the catalog is added through the catalog data flow (the Materials workbook)
  before it can be counted. The count screen never becomes a back-door catalog editor.
- **Zero is a valid count.** Counting an existing `bin_item` to 0 (confirming a bin is
  empty) is a normal `physical_count_correction` setting the absolute quantity to 0. It
  sets the balance to 0; it does not delete the `bin_item` or its history.
- **Audit.** Every intake records who counted, when, the prior system quantity, the
  counted quantity, the variance, and a required reason/note (e.g. "initial shelf
  count", "cycle count", "correction"). The reason is captured in the correction's
  reason text; count-type is not a separate structured field in this version.
- **Permissions (server-authoritative).** Read: `can_manage_inventory`. Official
  count-correction writes and `bin_item` creation: Developer/Admin only. Catalog-item
  creation: not available here (deferred to the catalog flow).

### bin_item Retirement — removing a mistakenly added material (locked v2.13 — Entry 042)

Removing a material that was mistakenly added to a bin follows the project Archive
convention (Rule 13, Section 18) — it is archived, never hard-deleted — with one
inventory-specific safeguard:

- **Archive, never delete.** Retiring a `bin_item` marks it archived; the row and ALL
  its ledger references and history are preserved (Section 18). Hard-deleting a
  `bin_item` is forbidden — it would orphan or destroy transaction history.
- **Zero-balance precondition.** A `bin_item` may be archived only when its
  ledger-derived balance is **zero**. If the balance is non-zero, the operator must
  first bring it to zero with a `physical_count_correction` (the existing mechanic,
  with its own reason). Quantity is never reduced by the structural archive — this is
  what prevents retirement from silently hiding real stock.
- **Structural action, not a transaction.** Archiving a `bin_item` writes NO ledger
  row and changes NO quantity (the balance is already zero). It is a structural /
  metadata change, distinct from the count mechanic, and must never create a
  `physical_count_correction` or any inventory transaction.
- **One controlled RPC.** A single server-authoritative RPC performs the retirement:
  it validates the balance is zero, sets the archive metadata, and records the audit.
  No client-side structural delete and no direct table mutation.
- **Audit.** The archive records who retired it, when, and a required reason (e.g.
  "added by mistake during count"), stored as `bin_item` archive metadata
  (`archived_at`, `archived_by`, `archive_reason`), consistent with the archive
  convention. Add these columns only if not already present.
- **Visibility.** Archived `bin_items` are hidden from active count / intake pickers
  and active bin views (Section 18), but remain visible in transaction history and
  reports so the record stays complete ("Show Archived" may reveal them).
- **Permissions.** Developer/Admin only, via `can_archive_records`, server-enforced.
- **Surface.** A Dev Console utility; an equivalent Developer/Admin-gated "retire"
  action may also appear inline in Count Intake (same RPC).

---

## 24. Non-Negotiable Architectural Rules

These are the constitutional laws of Northgate HQ. They may not be overridden
by implementation convenience, time pressure, or AI recommendation without a
formal lock document update reviewed by Ryan.

> All of the following were reviewed by Claude and approved by Ryan.

1. **Inventory balances are transaction-derived only.** No balance may be
   manually set without a Physical Count Correction transaction.

2. **Jobs become source of truth after creation.** Once a job exists, all
   operational and financial truth for that job lives in the jobs module.

3. **Approved estimate snapshots are immutable.** Enforced at the database level
   via trigger. Not application-level enforcement only.

4. **Permissions are server-authoritative.** Client-side hiding is UX only.
   The server always validates. No local permission state is trusted.

5. **Audit logging cannot be bypassed.** No user, role, or system — including
   the Dev Console — may skip audit logging.

6. **Dev Console actions are always logged.** No exceptions.

7. **No duplicate source-of-truth systems.** Each piece of data has exactly one
   owner. Other modules read it; only the owner writes it.

8. **No direct database edits outside controlled tools.** All edits go through
   the application UI or Dev Console, never raw Supabase table editor in
   production.

9. **Cost at time of transaction is always stored.** `unit_cost_at_time` is
   written at checkout. It is never back-calculated from current pricing.

10. **Change orders are financial records, not documents.** They have their own
    table, approval workflow, and budget impact tracking.

11. **Per-line-item transaction destinations are supported from day one.**
    `destination_type` and `destination_id` live on `transaction_items`,
    not only on the transaction header.

12. **Physical locations and transaction destinations are distinct concepts.**
    Bins (A111 format) are physical storage. Jobs, vehicles, scrap — those are
    destinations. They must not be merged into one "locations" model.

13. **Archive over delete.** All record types are archived, not permanently
    deleted, unless a Developer explicitly overrides with confirmation and
    audit entry.

14. **Snapshot immutability is database-enforced.** A Supabase trigger blocks
    UPDATE and DELETE on `estimate_snapshots` after `locked = TRUE`.

15. **Physical movement approval and accounting approval are never merged.**
    `transaction_items.status` carries physical inventory movement approval
    only. Job-cost and accounting approval is a separate mechanism. One field
    must never carry both meanings.

16. **Only approved transaction rows affect inventory balances.** `pending`
    and `rejected` rows remain in the transaction log for history but never
    affect `quantity_on_hand`. Balance ordering uses `occurred_at` with
    `ledger_sequence` as the deterministic tie-breaker — never UUID order.

17. **"Update the HANDOFF.md" means log everything and present the full file.**
    When Ryan asks for a handoff update, the model logs everything from the
    session (decisions, code, file/folder changes, anything), adds it as a new
    numbered entry, and presents the ENTIRE HANDOFF.md file back — not just the
    new entry. The full file every time is what keeps all parties aligned.

18. **Responsive UI is a foundational build requirement.** The Northgate HQ web
    application must be built mobile/tablet-responsive from the first screen.
    Responsive design is not a Phase 4 add-on and is not deferred until after
    desktop UI is stable. Every UI component, layout, and module must be designed
    with phone and tablet viewports in mind from the moment it is first built.
    A desktop-only implementation that plans to "add responsiveness later" is a
    constitutional violation and triggers a mandatory Claude review before
    proceeding. *Note: This rule governs basic responsive layout. It is distinct
    from the user-customizable layout presets described in Section 27 (Phase 4),
    which are an enhancement on top of this baseline.*

19. **The coordination documents are the versioned source of truth and must
    stay consistent.** `ARCHITECTURE.md` and `HANDOFF.md` are canonical; the
    build is only as trustworthy as they are.
    (a) **Append-only.** HANDOFF entries are sequentially numbered and
    append-only. A past entry is never deleted, renumbered, or rewritten —
    mistakes and wrong turns stay in the record; corrections are logged as a new
    entry that references the entry being corrected.
    (b) **One format.** Every entry uses the identical structure defined in
    Section 34. No addendum blocks, no parallel or guessed numbering, no ad-hoc
    formats. One checkpoint = one entry.
    (c) **Stable filenames.** The canonical files are named exactly
    `ARCHITECTURE.md` and `HANDOFF.md` and are never renamed, suffixed, or
    version-stamped in the filename (the version lives *inside* the document).
    The canonical file is overwritten in place. A working or review copy must
    never be given a filename that could be mistaken for the canonical file
    (e.g. `ARCHITECTURE_v2_6_FOR_CLAUDE.md`); mislabeled copies are the documented
    cause of the Entry 022 drift.
    Violations trigger a mandatory documentation reconciliation before further
    code work.

20. **The coordination documents are never edited or repaired silently.** No
    model may modify, reformat, re-encode, or repair `ARCHITECTURE.md` or
    `HANDOFF.md` on its own initiative or "behind the scenes" — not even a
    correct, well-intentioned fix. This is separate from, and does not block, the
    sanctioned append of a new correctly formatted HANDOFF entry (Rule 19,
    Section 34): routine logging remains the normal path and needs no special
    clearance. Every change *beyond* that clean append — encoding / line-ending /
    BOM / mojibake repairs, structural or formatting fixes, a logged correction to
    a prior entry (Rule 19a), or any edit to ARCHITECTURE — must follow this
    protocol, in order:
    (a) **Ryan first.** The need for the edit is surfaced to Ryan before anything
    is changed. Ryan is never bypassed and must never discover a
    coordination-document change after the fact.
    (b) **A model is in the loop.** At minimum the proposed edit is brought to
    Claude or ChatGPT. It is never applied unilaterally by the model that noticed
    the problem.
    (c) **Cross-clearance between the two models.** A coordination-document fix
    proposed by Claude must be cleared by ChatGPT; one proposed by ChatGPT must be
    cleared by Claude. The proposing model never self-approves the edit. Ryan
    retains final authority and is the one who applies and commits the change.
    A silent or unilateral repair — however minor or technically correct — is
    itself a documentation-drift event and a constitutional violation, and
    triggers the mandatory reconciliation in Rule 19.

---

## 25. Label and QR Printing

The Inventory module includes a Label Template Designer for physical storage
labels and placards.

Initial sheet support:

- Avery 5164 for unit, shelf, and bay placards
- Avery 8160 for individual bin labels

Template geometry is data-driven. Avery sheet dimensions, label dimensions,
gutters, margins, row counts, and column counts are stored as template data
rather than hard-coded into print logic.

Designer capabilities:

- per-field include / exclude toggles
- optional QR code per template
- per-field styling: color, alignment, bold, underline, and opacity
- live preview
- print individual labels
- print by unit, shelf, bay, or bin
- saved and named reusable templates

QR content uses the Section 10 payload format.

Print output uses print-to-PDF via `react-pdf` with exact sheet positioning.

### label_templates table (locked v2.14 - Entry 056)

```sql
label_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avery_template TEXT NOT NULL,
  scope_level TEXT CHECK (scope_level IN ('unit', 'shelf', 'bay', 'bin')),
  include_qr BOOLEAN NOT NULL DEFAULT true,
  layout JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
)
```

`scope_level = NULL` means the template may be used for any location level.

---

## 26. Mobile and Desktop Behavior

One system for desktop and mobile. The Northgate HQ web application is the single
primary product. There is no separate mobile app in the initial build.

> **Ryan's Decision (v2.2, elevated to Constitutional Rule 18 in v2.3):** The
> Northgate HQ web UI must be built **responsive from the start** — usable on
> phone and tablet screens, not desktop-only. On smaller screens the layout
> adapts (columns stack, navigation collapses, controls become touch-friendly)
> while talking to the same Supabase source of truth. This is a foundational
> build requirement, not a later add-on. Retrofitting responsiveness onto a
> desktop-only UI is costly rework and is exactly what the "design before build"
> principle exists to prevent. Because the HQ UI has not been built yet,
> responsiveness is to be designed in from the first screen. **See Constitutional
> Rule 18.**

> **Note on scope:** The responsive baseline (the app simply works and is readable
> on small screens) is foundational and is **separate from** the user-customizable
> desktop/mobile layout presets in Section 27, Phase 4. Do not defer basic
> responsiveness to Phase 4.

### Future Phase — React Native Companion App (reserved, not now)

> **Ryan's Decision (v2.2):** A native mobile **companion app** is a planned future
> build, scheduled after core HQ functionality is stable. It is a separate
> front-end (React Native, distributed via the Apple App Store and Google Play),
> purpose-built for field-inventory workflows — QR scanning for tool/material
> check-in/out, quick stock and vehicle-loadout lookups, on-site job-usage logging,
> and push notifications (e.g. low-stock alerts).

Key architectural points for the companion app:

- It is **another front-end, not another back-end.** It reads from and writes to
  the same Supabase project (the single source of truth). No duplicate data, no
  separate database, no sync layer between two databases.
- All permission and access rules remain **server-authoritative** (Constitutional
  Rule 4). The companion app is subject to the same Supabase RLS / permission checks
  as the web app. A second client must never become a path around permissions.
- It is **not a wrapper of the full HQ.** It implements only the field-facing subset
  of features that make sense on a phone in the field. The web HQ remains the
  command center for desk work (dashboards, accounting, PO management, Dev Console).
- Build effort is primarily front-end, because Supabase already provides the API the
  companion app consumes.

This is a reserved future phase under the Scope Control Rule (Section 28): the clean
path is preserved now (single Supabase source of truth, server-authoritative
permissions), but the companion app is not built until core HQ is stable.

Buttons and actions must clearly explain what they do. Avoid vague +/- interactions.

Preferred examples:

- Add to Cart
- Return to Inventory
- Transfer to Vehicle Stock
- Assign to Job

---

## 27. UI Customization Philosophy

Phased approach — do not delay core build.

- Phase 1: module toggles, permissions, dashboard access
- Phase 2: dashboard card ordering and visibility
- Phase 3: table column customization, form field ordering, default filters
- Phase 4: desktop / mobile layout presets
- Phase 5: visual layout builder

No browser-based code editing in early versions.

---

## 28. Scope Control Rule

Build extension points before future systems.

Do not prematurely build future modules.

**Guiding principle:**

> Build what is needed now. Preserve clean paths for what comes later.

---

## 29. First Build Order

> **Updated to reflect work already completed.**

**Foundation (complete):**

- Database schema (Phase 1 SQL written and deployed)
- Auth wiring (Clerk + user_permissions)
- App shell (Layout, routing, permission-gated nav)
- Dashboard
- Materials catalog (read + edit)

**Current phase — Inventory:**

1. Schema additions from Section 23 and locked table updates
2. Storage location structure (unit → shelf → bay → bin)
3. QR generation and web QR scanner (Section 10)
4. Inventory balance cache
5. Cart and checkout system (with per-line-item destinations)
6. Inventory transactions
7. Grand Master read-only view (Supabase VIEW)
8. Accounting export
9. Label printing — Label Template Designer (Section 25)
10. Van stock template extension points

Inventory must be built to later integrate with:

- Jobs
- Service Calls
- Vehicles
- Estimating
- Accounting
- Reports
- Documents
- Dev Console

---

## 30. AI Development Roles

One GitHub repository. One Supabase schema. One Architecture Lock Document.
One implementation roadmap.

### Codex / ChatGPT — Implementation Partner

Best for: "How do we build this?" / "Why is this failing?" / "Convert this to code."

Responsibilities: code generation, debugging, React implementation, Supabase
integration, SQL migrations, transaction logic, phased implementation,
enforcing this lock document during builds.

### Claude — Architecture Reviewer and Drift Detector

Best for: "Will this become fragile?" / "What are we missing?" / "Is this
drifting from the design?"

Responsibilities: architecture critique, module boundary review, schema
assumption review, scalability concerns, permission model review,
implementation drift detection.

---

### Cross-Model Communication Rules

**Both models must proactively recommend sync updates to the other model,**
even when a change does not directly affect that model's role. If Claude
identifies a schema change, it must flag that Codex needs to be updated. If
Codex implements something that changes behavior Claude reviewed, it must flag
that Claude should be informed. Neither model operates in isolation.

When handing off between models, the outgoing model should summarize:

- what changed
- what was decided
- what the other model needs to know before continuing

This is not optional. Unshared context is how drift starts.

---

### Keeping Ryan on Track

**It is the responsibility of both models to keep Ryan on track, even when
Ryan pushes back.**

If Ryan attempts to change something that conflicts with a locked architectural
decision, the model must:

1. Clearly identify what is being changed
2. Explain why it conflicts with the lock document
3. Strongly suggest discussing the change with the other model before
   implementing it
4. Document the override in the lock document if Ryan proceeds anyway

Ryan retains final authority. But "Ryan said so" is not sufficient reason to
silently accept a decision that violates the architecture. The model's job
is to make sure Ryan makes the decision with full awareness of the consequences.

A model that simply agrees because Ryan seems certain is failing its role.

---

### Honesty Requirements

**Both models must be analytically honest at all times.**

Neither model should validate a decision simply because Ryan expressed
confidence in it, or because agreement feels more helpful in the moment.

If something is:

- **difficult** — say so, with specifics
- **expensive** — say so, with an estimate of cost or time
- **risky** — say so, with the specific failure mode
- **impossible** in the current architecture — say so, clearly
- **a good idea** — say so, but only when it genuinely is

"This looks great" with no analysis is not a useful response. It wastes
Ryan's time and erodes trust in the models over the life of the project.

Honest disagreement is more valuable than comfortable agreement.

---

### Shared Efficiency Goal

Both models share one goal: **help Ryan deliver a stable, scalable, and
maintainable application as efficiently as possible.**

To achieve this:

- **Do not repeat work the other model has already done.** If Claude has
  reviewed an architectural decision, Codex should not re-litigate it during
  implementation unless a genuine conflict is discovered.

- **Learn from each other's outputs.** When Ryan brings context from one
  model into the other, treat that context as legitimate shared history. Do
  not dismiss it because it came from a different system.

- **Flag redundancy.** If Ryan asks one model to do something the other model
  already resolved, say so. Duplicate work is wasted budget and time.

- **Be concise when the answer is clear.** Long responses that could be short
  ones cost Ryan time. Match depth to complexity.

- **Be thorough when the stakes are high.** A rushed architectural review that
  misses a fragility costs more than the time saved by shortening it.

The models are not competing. They are collaborating on the same outcome
under the same document with the same authority hierarchy.

---

### Mid-Build Review Trigger

Codex may make routine implementation decisions inline.

**Pause and run through Claude before implementing if the decision affects:**

- database schema or table relationships
- module boundaries or responsibilities
- permissions model
- audit logging or snapshot behavior
- source-of-truth rules
- financial or budget logic
- inventory transaction logic
- cross-module communication

Routine decisions that stay with Codex: UI styling, component cleanup, local
state, bug fixes, layout, straightforward CRUD, non-architectural refactors.

---

### When Claude Must Be Involved (Escalation Protocol)

**Core principle:** Claude is required when an architectural decision is being
*made* or a locked rule is *touched* — not when a settled decision is being
*implemented*. Building the "how" of something already locked is Codex's lane;
deciding or changing the "what" requires Claude. This expands the Mid-Build
Review Trigger above into a decision-ready rule.

**Codex MUST route to Claude before proceeding if any one of these is true:**

1. Any change to ARCHITECTURE.md — a new or edited constitutional rule, section,
   or locked decision. Claude maintains the lock document.
2. A new architectural decision not already covered by the lock document — any
   design fork with a tradeoff (deciding how it works, not implementing how it
   is already defined): new workflows, approval/status concepts, scoping rules,
   destination semantics, etc.
3. Anything that touches a **locked invariant**: the inventory ledger / balances
   (transaction-derived rule, transaction types, any write to `transaction_items`
   or `inventory_balances`); permissions (new flags, enforcement, role defaults,
   any gate); audit logging; approval/status meaning (`transaction_items.status`,
   completeness, job-cost); cost snapshots; per-line destinations;
   source-of-truth; the no-direct-DB-edit rule.
4. Schema changes — new tables, columns, or migrations that establish or change
   structure. Lock before build; retrofits are the expensive failure mode.
5. A new write path or RPC that moves inventory, money, or permissions.
   (Read-only surfaces following an already-approved pattern do not count.)
6. Build-sequence / ordering questions, or anything expensive to retrofit if
   built in the wrong order.
7. Anything that conflicts with, contradicts, or is not covered by the lock
   document or a prior HANDOFF decision.
8. Any constitutional-rule violation flag (e.g., Rule 18 responsive UI, Rule 19
   documentation / format / filenames, Rule 20 silent/unilateral doc repair).
9. Starting any deferred major feature: Express Checkout / Manager Override,
   developer override, the division-scoped read rule, Financials / job-cost, or
   the React Native companion app.
10. Documentation drift — ARCHITECTURE and HANDOFF out of sync, version
    mismatch, or any break in the append-only / format / filename rules.
11. Anything that touches or repairs live production data or history.

**Codex may proceed without Claude (logging a HANDOFF entry) only when ALL hold:**

- It implements a decision already locked in ARCHITECTURE/HANDOFF (the "what" is
  settled; Codex builds the "how").
- It does not change schema, permissions, the ledger, audit, or any
  constitutional rule.
- It is a read-only surface within an already-approved scope, or a bug fix,
  UX/styling polish, or refactor that leaves locked invariants untouched.
- Any test/seed quantities go through the sanctioned mechanism
  (`physical_count_correction`), never direct `inventory_balances` edits.

**Tie-breaker:** if a trigger is even arguably hit — especially the invariant
list (#3) or schema (#4) — route to Claude. An unnecessary review is cheap; a
missed one on a locked invariant means an expensive retrofit. When genuinely
unsure, recommend Claude review rather than guessing.

**Required routing verdict:** every Codex work summary ends with exactly one of:

- `No Claude review needed — within locked decisions (ARCHITECTURE v__, HANDOFF Entry __).`
- `Claude review required before proceeding — [trigger].`

This is the standing routing instruction Ryan gives Codex, so "if Codex says
bring it to Claude, bring it to Claude" is a reliable rule rather than a guess.

---

### Architecture Alignment Checks

Before each new module or major build phase, confirm:

- table names still match this document
- relationships still match this document
- permissions are not being bypassed
- audit rules are preserved
- no duplicate source-of-truth was created
- no module has absorbed another module's responsibility

---

### Authority Hierarchy

1. Ryan
2. Architecture Lock Document
3. Locked database schema
4. Current codebase
5. AI recommendations

AI recommendations are advisory, not authoritative.

Ryan may override any AI recommendation. When he does, the overriding
decision must be logged in the lock document so both models operate from
the same updated truth.

---

## 32. Cumulative Handoff Document

### Purpose

Context loss between sessions is the single biggest operational risk in a
multi-model, multi-session development workflow. The lock document defines
the architecture. The handoff document captures the live state of the build —
what has been done, what was decided, and what comes next.

Any model, in any new chat session, must be able to read the handoff document
and resume work without requiring Ryan to re-explain the project history.

### Location

The handoff document lives in the GitHub repository at:

```
/HANDOFF.md
```

It is a single cumulative file, not a new file per session.

### Update Triggers

Both models must update HANDOFF.md at each of the following checkpoints:

- completion of any schema migration
- completion of any module or major feature
- any architecture alignment check
- any mid-build review trigger event
- any locked architectural decision that was debated or overridden
- the end of any session where meaningful progress was made

The model that completes the work writes the update. The update is appended,
never overwriting prior entries. The file grows forward chronologically.

### What "Update the HANDOFF.md" Means (Ryan's Standing Instruction)

> When Ryan asks for the HANDOFF.md to be updated, this is the complete,
> non-optional definition of what is expected:

1. **Log everything that happened in the session** — decisions made, code
   written, files or folders created/moved/deleted, migrations run, reviews
   completed, problems hit, anything of substance. Not just the headline.

2. **Add it as a new dated, numbered entry** — appended to the existing log,
   never overwriting prior entries, with the entry number incremented from
   the last one.

3. **Present the FULL HANDOFF.md file back to Ryan** — the entire document,
   not just the new entry. Ryan pastes the whole file into the repo and into
   the other model's chat to keep everyone aligned.

Presenting only the new entry is insufficient. The full file is required every
time so Ryan always has a single complete document that proves where the
project stands and confirms everyone is picking up from the same place.



```
---
Date:        [YYYY-MM-DD]
Updated by:  [Claude | Codex]
Phase:       [e.g. Phase 2 — Inventory]
Session type:[e.g. Architecture Review | Implementation | Schema Migration]

## What Was Completed
- [bullet list of completed items]

## Decisions Made This Session
- [decision]: [rationale] — [who approved: Ryan | lock document | AI recommendation]

## Schema Changes
- [table or column added/changed and why]

## What Codex Needs to Know
- [specific context relevant to implementation]

## What Claude Needs to Know
- [specific context relevant to architecture review]

## Next Steps (in order)
1. [immediate next action]
2. [following action]
3. [following action]

## Open Questions / Concerns
- [anything unresolved that either model should flag]

## Architecture Drift Warnings
- [anything observed during this session that risks drifting from the lock document]
---
```

### Rules

**Entries are append-only.** Prior entries are never edited or deleted. They
are the permanent record of how the project evolved.

**Both models read the full document before starting work in a new session.**
This is not optional. Starting a session without reading HANDOFF.md risks
duplicating work, reversing decisions, or missing context.

**Ryan should paste HANDOFF.md into any new session** where either model needs
to resume work. This is the fastest way to restore full context without
re-explaining the project history.

**If a decision in HANDOFF.md conflicts with the lock document,** the model
must flag it immediately and ask Ryan to resolve it before proceeding. The
lock document takes precedence. HANDOFF.md reflects what happened — it does
not override what was locked.

**Architecture drift warnings must be carried forward** until they are resolved.
A drift warning from Session 3 that is never addressed is still a drift warning
in Session 10. It stays visible until it is closed with a documented resolution.

### Relationship to the Lock Document

```
Architecture Lock Document   — what the system is designed to be
HANDOFF.md                   — what the system is as of right now
```

The lock document is stable. HANDOFF.md is living.

When a decision made during implementation changes something architectural,
it triggers a lock document update. The HANDOFF.md entry should note:

```
Lock document updated: [section] changed to reflect [decision]
```

This keeps both documents synchronized and ensures neither drifts from the other.

---

## 33. Final Guiding Principle

Northgate HQ should prioritize:

- operational clarity
- auditability
- scalability
- maintainability
- modularity
- accountability
- realistic field workflows

The system should reflect how Northgate actually operates, not how generic
software assumes construction companies operate.

---

## 34. Documentation Standard (locked — see Rule 19)

The coordination documents are the source of truth. This section defines how
they are kept consistent so the build never goes foggy again.

### 34a. Canonical files and filenames
- Exactly two canonical coordination files: `ARCHITECTURE.md` (this document)
  and `HANDOFF.md`.
- Filenames are immutable. Never rename, suffix, date-stamp, or version-stamp
  them. The version number lives inside the document (the line under the title
  for ARCHITECTURE; the entry sequence for HANDOFF).
- Working/review copies sent between Ryan, Claude, and Codex must keep the
  canonical name or be clearly non-canonical in a way that cannot be confused
  with the source of truth. Do not produce files like
  `ARCHITECTURE_v2_x_FOR_CLAUDE.md` or `HANDOFF_THROUGH_ENTRY_0xx.md` as the
  thing that gets committed.

### 34b. File-handling protocol (Ryan's workflow)
- The current canonical copy lives in the `Current Docs` folder.
- When a new version is produced, the prior canonical copy is moved to the
  `Outdated` folder, then the canonical file in `Current Docs` is overwritten
  in place (same filename). The repo copy is updated the same way.
- Because the filename never changes, overwrite-in-place is safe and the sync
  workflow stays unambiguous.

### 34c. Append-only entry rule
- HANDOFF entries are append-only and sequentially numbered with no gaps.
- Never delete, renumber, or rewrite a past entry. If something logged earlier
  was wrong, add a new entry that states the correction and references the prior
  entry number. The record of what happened — including mistakes — is preserved
  intentionally.
- One checkpoint produces exactly one entry. Do not consolidate multiple
  checkpoints into an addendum block or split one into parallel numbering.

### 34d. Entry format (the single template)
Every HANDOFF entry uses this exact structure. The header block is mandatory;
body sections are included when they apply, always in this order; omit a section
only if it is genuinely empty.

```
## Entry NNN[ — optional short title]

**Date:** YYYY-MM-DD
**Updated by:** <Claude | Codex | Ryan>
**Phase:** <phase / milestone>
**Session type:** <implementation | review | decision | alignment>

### Context
### What Was Completed   (implementation)  — or —
### Review Findings       (review)          — or —
### Decisions Made This Session (locked)    (decision)
### Schema Changes
### Code / File Changes
### Lock Document Changes
### What Codex Needs to Know
### What Claude Needs to Know
### Next Steps (in order)
### Open Questions / Concerns
### Architecture Drift Warnings

---
```

The same template is mirrored at the top of `HANDOFF.md` so it is visible where
entries are written. If the two ever disagree, this section governs.

---

## 35. Standard Codex Operating Instructions (locked v2.16 — Entry 081)

This section defines the reusable operating doctrine for future Codex prompts.
It exists to reduce prompt length, reduce repeated coordination cost, and keep
Codex work aligned with this lock document.

These instructions do not loosen any architectural rule. They summarize how
Codex must classify routine work, when it may proceed, what scope is protected,
what verification is required, and what routing verdict must be emitted.

### 35a. Standard Start Procedure

At the start of every Codex task in this repo, Codex must:

1. Pull from `origin/main`.
2. Confirm local `main` matches `origin/main`.
3. Confirm the working tree is clean before changes.
4. Confirm `docs/ARCHITECTURE.md` version and relevant locked sections.
5. Confirm `HANDOFF.md` is gapless through the latest entry.
6. Inspect the existing implementation before coding.
7. Classify the task into one of the buckets in Section 35b.

If any start-procedure check fails, Codex must stop and report the blocker
instead of proceeding silently.

### 35b. Task Classification Buckets

Codex must classify each task before implementation.

**Bucket 1 — Safe UI/CSS Task**

Examples:

- visual polish;
- copy changes;
- responsive layout fixes;
- print CSS;
- button labels;
- client-side display improvements;
- styling that does not change data access, permissions, or behavior.

Codex may proceed without Claude when the task is limited to UI/CSS behavior and
does not touch any protected scope in Section 35c.

**Bucket 2 — Existing-Flow Binding Task**

Examples:

- adding a new entry point into an existing approved workflow;
- passing context into an existing UI flow;
- narrowing already-authorized rows client-side;
- routing from a scan page into an already-built cart or count screen.

Positive confirmation gate:

Before Codex self-classifies a task as Bucket 2, Codex must confirm that the
existing flow accepts the new entry point's context without modifying the
approved flow, backend path, schema, RPC, permission model, transaction engine,
ledger behavior, or balance behavior.

If this cannot be confirmed, the task is not Bucket 2. Ambiguous cases default
to Bucket 3.

**Bucket 3 — Architecture-Sensitive Task**

Any task that touches or arguably touches protected scope in Section 35c is
Architecture-sensitive.

Codex must route Bucket 3 work to Claude before implementation unless the exact
decision has already been locked in this document and Codex is only implementing
the already-approved shape without changing protected behavior.

### 35c. Standard Protected-Scope Rules

The following areas are protected scope. Codex must not change them unless the
change is already locked or has been routed through Claude under Section 30:

- Supabase schema;
- migrations;
- RLS policies;
- grants;
- permissions;
- backend/RPC behavior;
- Clerk/auth/login behavior;
- inventory balance mutation logic;
- ledger behavior;
- `inventory_transactions`;
- `transaction_items`;
- checkout/finalization behavior;
- Count Intake write path;
- `physical_count_correction` RPC behavior;
- bin item retirement behavior;
- QR payload format;
- scan route structure;
- transaction history permissions;
- destination semantics;
- Accounting Export data authorization;
- Financials/job-cost behavior;
- Return-to-Inventory behavior;
- buyout behavior;
- vehicle-bin stock behavior;
- Express Checkout behavior;
- Manager Override behavior;
- cross-location transfer behavior, including the Section 10a / v2.15 lock that
  scan pages do not initiate location-to-location movement or surface Transfer
  Location;
- multi-bin batch action behavior, including the Section 10a / v2.15 lock that
  multi-bin batch cart actions from hierarchy levels are reserved.

Protected scope includes direct changes and indirect changes. A client-side
shortcut that changes the practical behavior of a protected workflow is still a
protected-scope change.

### 35d. Standard UI/Client-Side Rule

UI/client-side changes are allowed only when they operate on data and authority
the user already has through the approved server-authoritative paths.

Client-side filtering of already-loaded authorized rows is permitted.

Fetching a broader set and filtering down client-side to simulate row-level
access control is prohibited. That is an RLS bypass pattern and must not be used.

Client-side state may carry workflow context, such as a scanned bin ID, only
when the receiving flow already validates permissions and behavior through the
approved server path.

### 35e. Standard Verification Procedure

For every implementation task, Codex must verify:

1. `npm run build` passes when app code changed.
2. `git diff --check` passes.
3. Changed files are limited to the expected scope.
4. No migration files were added unless explicitly authorized.
5. No Supabase/RLS/grant/permission/backend behavior changed unless explicitly
   authorized.
6. No direct `inventory_balances` write path was added.
7. No protected-scope behavior in Section 35c changed unless explicitly
   authorized.
8. If authenticated browser verification is unavailable, Codex must say so and
   must not claim it.

For documentation-only tasks, `npm run build` may be skipped, but Codex must
state clearly that it was skipped because no app-code files changed.

### 35f. Standard HANDOFF Requirement

Every meaningful completed task must append exactly one new HANDOFF entry unless
Ryan explicitly says the task is exploratory only and no project state changed.

The HANDOFF entry must:

- use the required Entry Format Standard from Section 34;
- be appended only;
- increment the previous entry number by one;
- state task classification when relevant;
- list files changed;
- state verification results;
- state whether Claude review was needed;
- state whether any protected scope was touched;
- carry forward or close architecture drift warnings honestly.

### 35g. Standard Routing Verdict

Every Codex final summary for project work must end with one routing verdict:

- `No Claude review needed — within locked decisions (ARCHITECTURE v__, HANDOFF Entry __).`
- `No Claude review needed — Rule 20 cross-cleared adoption applied (ARCHITECTURE v__, HANDOFF Entry __).`
- `Claude review required before proceeding — [trigger].`

The verdict must use the current architecture version and the current latest
HANDOFF entry after the task is logged.

### 35h. Standard Short Footer for Future Codex Prompts

Future Codex prompts may use this short footer instead of repeating the full
operating instructions:

```
Use ARCHITECTURE.md Section 35 Standard Codex Operating Instructions.
Classify the task before coding.
Stay out of protected scope unless explicitly authorized and routed.
For Bucket 2, confirm the existing flow accepts the new context without
modification before proceeding.
Verify with the Section 35e checklist.
Append HANDOFF using Section 34/35f.
End with the required Section 35g routing verdict.
```

---

## 36. Tool Catalogue (locked v2.18 — Entry 084)

This section locks the foundation for logging company tools.

The locked feature term is **Tool Catalogue**, not Tool Inventory. This phase is
a catalogue/logging surface only. It is not a tool tracking, checkout, custody,
transfer, vehicle-storage, QR-label, or history-ledger system.

Because Tool Catalogue introduces a new Supabase table and RLS in a future
implementation, it is Architecture-sensitive under Section 35. This section
approves the shape; implementation must still follow the verification and
inspection requirements below.

### 36a. Schema Foundation

Single table: `public.tools`. All records are division-scoped via a
`division text not null` field, matching the existing app convention
(`user_permissions.division`, `items.division`). No FK to a divisions table;
UUID-based division normalization is reserved for a future
architecture-cleared milestone.

The first implementation migration must create `public.tools` with this locked
foundation:

- `id uuid primary key default gen_random_uuid()`
- `division text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `archived_at timestamptz null`
- `archived_by text null`
- `archive_reason text null`
- `tool_number text null`
- `name text not null`
- `category text null`
- `brand text null`
- `model text null`
- `serial_number text null`
- `description text null`
- `condition text null check (condition is null or condition in ('good', 'fair', 'poor', 'damaged', 'unknown'))`
- `status text not null default 'active' check (status in ('active', 'inactive', 'retired', 'missing'))`
- `home_location text null`
- `current_location text null`
- `assigned_to text null`
- `purchase_date date null`
- `notes text null`

Condition values are `good`, `fair`, `poor`, `damaged`, `unknown`, or null.
Status values are `active`, `inactive`, `retired`, and `missing`.

Both use CHECK constraints on a text column, not a Postgres enum type, so
values can be extended without a type migration.

The first implementation migration must not add `purchase_price`, `vendor`, or
attachment/photo storage. Those fields are deferred until future architecture
clearance.

The first implementation migration must add these indexes:

- `tools_tool_number_unique` as a partial unique index on `tool_number` where
  `tool_number is not null`.
- `tools_serial_number_unique` as a partial unique index on `serial_number`
  where `serial_number is not null`.

Before writing the implementation migration, Codex must inspect the live repo
migrations and confirm the existing `updated_at` trigger function name. The
Tool Catalogue implementation must reuse the established project pattern for
`updated_at`; Codex must not invent a parallel trigger function name.

### 36b. RLS And Permissions

RLS must be enabled on `public.tools`.

Read access is locked to own-division rows or users with
`can_view_all_divisions`, using the existing text-division convention:
`user_permissions.division` compared to `tools.division`.

Write/create/edit/archive access is locked to `can_manage_inventory` within the
user's authorized text-division scope.

Hard delete is never allowed through the application.

No new permission flags are introduced in this phase. Do not add
`can_manage_tools`, `can_checkout_tools`, or any other tool-specific permission
flag without future architecture clearance.

`can_view_financials` is not a gate on Tool Catalogue fields, including
`purchase_date`.

Future implementation must inspect and match the existing user profile/RLS
patterns, Clerk auth helper/function pattern, and text-division conventions
before writing the migration. The expected conventions are
`auth.jwt() ->> 'sub'`, `user_permissions.clerk_user_id`,
`effective_permissions_for_user(...)`, `can_view_all_divisions`, and
`can_manage_inventory`.

### 36c. Permitted First UI

The first Tool Catalogue UI may include only:

- a Tool Catalogue section/page;
- search;
- filters for category, status, and condition;
- table/list view;
- add tool form;
- edit tool form;
- archive action using soft archive only;
- empty state;
- optional table/card view toggle if it reuses existing UI patterns.

The locked section title is:

`Tool Catalogue`

The locked helper note is:

`Catalogue-only foundation. Tool checkout, assignments, QR labels, vehicle storage, and tracking history are reserved for future milestones.`

### 36d. Deferred And Reserved Features

The following features are reserved and require future architecture clearance:

- tool checkout/check-in;
- tool assignment history;
- tool custody chain;
- tool QR labels and scan pages;
- tool transfers;
- vehicle-bin tool storage;
- employee-linked tool assignments;
- job/project-linked tool assignments;
- tool maintenance/inspection/calibration logs;
- tool repair history;
- purchase accounting/depreciation;
- attachments/photos/receipts;
- import/export as canonical accounting data;
- tool-specific permission flags such as `can_manage_tools` or
  `can_checkout_tools`;
- tool transaction/history ledger;
- tool audit table;
- divisions table and UUID-based division normalization — cross-cutting schema
  change affecting `user_permissions`, inventory items, and all future tables;
  reserved for a dedicated architecture-cleared milestone before introduction.

Plain text placeholders `home_location`, `current_location`, and `assigned_to`
are permitted in the foundation table only as catalogue notes. They do not
create custody, transfer, checkout, employee assignment, vehicle/bin storage, or
tracking-history behavior.

### 36e. Implementation Sequence

Future Tool Catalogue implementation must be completed in two steps:

1. Migration first.
2. UI second.

The migration step must confirm the existing `updated_at` trigger function,
user profile/RLS patterns, Clerk auth function, and text-division conventions
before writing SQL.

The UI step must consume the approved Tool Catalogue schema and must not add
checkout, assignment history, QR labels, vehicle/bin linkage, job linkage,
tracking history, audit table, tool-specific permission flags, purchase
accounting, attachments, or canonical accounting import/export behavior.

---

## 37. Job Material Workflow — Demand, Issue, Buyout, Return (locked v2.19 — Entry 094)

### 37.0 Scope and core principle

Defines how a Job is built from inventory. A **demand layer** (what a job needs) sits ABOVE the ledger and never affects balances. A **movement layer** (issuing stock to a job, returning unused material) reuses the already-locked transaction types (Section 12) and the existing Inventory Cart / Checkout engine (Section 11). No new balance-derivation logic and no reservation concept are introduced.

### 37.1 Layer separation (locked)

* **Demand layer — Job Material List.** A new table `job_materials` records the materials a job needs (requested quantities). It is a planning artifact: it never writes `inventory_balances`, never creates a transaction, and may include materials not currently in stock (those become buyout candidates). One row = one job material line.
* **Movement layer — existing ledger.** Issuing stock for a job is an **Assign to Job** transaction (Section 12) executed through the existing Inventory Cart / Checkout flow (Section 11) with `destination_type = 'job'`. Returning unused material is a **Return from Job** transaction (Section 12; inbound; `destination_type = NULL`; job cost reversed), per the Section 11 return-to-inventory lock. No new transaction type is introduced.
* **The link is computational, not structural.** How much of a job material line is satisfied is DERIVED from the ledger (sum of Assign to Job minus Return from Job for that job + item). No stored fulfillment counter — a stored counter would be a second source of truth (Rule 1 / Section 3).

### 37.2 Allocation semantics (locked): movement, not reservation

Issuing stock to a job is an actual **Assign to Job** movement that decrements the bin balance at issue time — NOT a soft reservation. Issuing stock to a job MUST go through the existing Inventory Cart / Checkout engine (Section 11). No parallel write path for job stock movement is permitted. No reserved/available balance distinction is introduced.

A true reservation concept (earmarking on-hand stock without moving it; preventing cross-job double-allocation) is **reserved as a future architecture-cleared concept** and must not be built in the 5K series.

Canonical term for the act: **"Issue to Job"** (also acceptable: "Pull to Job"). The term **"Allocation" is reserved** for the future reservation concept and must not be used for movement in code, UI, or documentation.

### 37.3 Buyout (locked): derived, demand-side

Buyout = the portion of a job's material demand not satisfiable from issued stock. It is a DERIVED calculation (requested − net issued, per line) plus a per-job **buyout status** (`complete` when every line's remaining need is zero or procured, else `incomplete`). Buyout performs no inventory movement and writes no ledger row.

An optional buyout / purchase-list export is display/export only and must NOT auto-post to Accounting/Financials (Section 21) without separate architecture clearance.

### 37.4 Return-to-Inventory (locked shape; build gated to milestone 5K.5)

Returning unused job material reuses the **Return from Job** transaction type (inbound; `destination_type = NULL`; lands in a bin; reverses job cost). It requires a NEW inbound RPC that follows the existing checkout RPC pattern: SECURITY DEFINER, server-gated on `can_inventory_transactions`, JWT-subject authoritative (`auth.jwt() ->> 'sub'`), writes approved `transaction_items`, updates balance only via the existing trigger, NEVER writes `inventory_balances` directly, audited per Section 19.

Cost-reversal basis (locked in 5K.5, not now): a return reverses job cost and re-enters stock at the material's ORIGINAL issue unit cost (the `unit_cost_at_time` of the Assign-to-Job row it reverses) so a pull-then-return nets the job to zero and inventory valuation stays consistent (Rule 9). The partial-return basis (weighted-average over the job+item issues vs specific-lot) is locked in 5K.5.

### 37.5 Job totes / bin labels (reserved slice)

Labeling totes/bins for a job reuses the Label/QR system (Section 25); a job-tote label references a `job_id`. No new ledger or balance behavior. Built as a minor slice after the Jobs foundation exists; reserved here.

### 37.6 Schema (reserved; built in gated slices, none applied at 5K.1)

* **Prerequisite:** the `jobs` table (Section 5) must exist before any 5K implementation slice. The Jobs foundation is Architecture-sensitive (Bucket 3, Section 35) and requires its own Claude review before Codex implementation.
* `job_materials`: `id`, `job_id` (FK `jobs`), `item_id` (FK catalog items), `requested_quantity` numeric, `division` text, `note` text, `created_by` text, `created_at` timestamptz, soft-archive per Section 18. No balance or ledger columns. No stored fulfillment counter (derived from ledger).
* No new transaction types. No reservation columns.

### 37.7 Permissions / RLS (reserved; locked per slice)

* Division-scoped per Section 17a (own-division / cross-division / self-read tiers).
* Job Material List writes are governed by Section 39 and are gated on `can_manage_jobs`, not `can_manage_inventory`. No new flag is introduced.
* Stock issue reuses `can_inventory_transactions` (it is an inventory transaction).
* Return-from-Job RPC gated on `can_inventory_transactions` (consistent with Section 11 cart-open pattern).
* No RLS bypass (Section 35d).

### 37.8 Protected scope and routing

This domain is Section 35c protected (Bucket 3 — Architecture-sensitive). All 5K implementation slices require Claude review of the specific slice before Codex implementation, EXCEPT where this section already locks the exact shape and Codex is implementing that shape without changing any protected behavior.

### 37.9 Milestone sequence (locked)

1. **5K.1** — This architecture lock (docs-only; no code; no schema; no RPC; no UI writes).
2. **Jobs foundation (prerequisite)** — Minimal `jobs` table/workspace. Bucket 3; requires its own Claude review before Codex. Must exist before any 5K implementation.
3. **5K.2** — Job Material List (demand table `job_materials` + UI; no ledger writes).
4. **5K.3** — Issue to Job (bind the existing Cart / Checkout flow to a job material context; fulfillment derived from the ledger; no parallel write path).
5. **5K.4** — Buyout remaining + status (+ optional export; no auto-post to Financials).
6. **5K.5** — Return-to-Inventory (new inbound Return-from-Job RPC; cost-reversal basis locked at this milestone).

---

## 38. Jobs Foundation (locked v2.20 — Entry 095)

### 38.0 Scope and core principle

Jobs Foundation creates the minimal canonical Job record required before any
Job Material Workflow implementation from Section 37. It establishes the
`jobs` table, division scoping, base permissions, soft-archive behavior, and
first Jobs workspace UI scope only.

This section does not implement job materials, inventory movement, buyout,
return-to-inventory, job cost, financials, scheduling, assignments, documents,
or any other job management feature beyond the foundation record.

### 38.1 Table foundation (locked)

The first Jobs Foundation implementation migration must create `public.jobs`
with this locked foundation:

- `id uuid primary key default gen_random_uuid()`
- `division text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `archived_at timestamptz null`
- `archived_by text null`
- `archive_reason text null`
- `job_number text null`
- `name text not null`
- `status text not null default 'active'`
- `description text null`
- `notes text null`
- `address_line1 text null`
- `address_line2 text null`
- `city text null`
- `state text null`
- `postal_code text null`
- `job_type text not null default 'job'`
- `service_call_number text null`
- `created_by text null`

`division text not null` follows the existing text-division convention used by
`user_permissions.division`, `items.division`, and the Tool Catalogue lock in
Section 36. No divisions table or UUID-based division normalization is
introduced by this section.

`job_type` and `service_call_number` are included from day one per Section 5b.

### 38.2 Status and job type constraints (locked)

`jobs.status` is a CHECK-constrained text column with these values:

- `active`
- `on_hold`
- `complete`
- `cancelled`

`archived` is not a status value. Archival is represented only by
`archived_at`, `archived_by`, and `archive_reason` per the soft-archive pattern
in Section 18.

`jobs.job_type` is a CHECK-constrained text column with these values:

- `job`
- `service_call`

### 38.3 Index and updated_at trigger (locked)

The first Jobs Foundation implementation migration must add:

- `jobs_job_number_unique` as a partial unique index on `job_number` where
  `job_number is not null`.
- `set_jobs_updated_at` trigger using the existing
  `touch_user_permissions_updated_at()` function.

Before writing the implementation migration, Codex must inspect the live repo
migrations and confirm the existing `touch_user_permissions_updated_at()`
pattern is still present. Codex must not invent a parallel updated-at trigger
function.

### 38.4 RLS and permissions (locked)

RLS must be enabled on `public.jobs`.

Read access is locked to own-division rows or users with
`can_view_all_divisions`, following the Section 17a division-scoped read
pattern and the existing text-division convention.

Create access is gated on `can_create_jobs`.

Edit/archive access is gated on `can_manage_jobs`.

No new permission flags are introduced by this foundation. `can_create_jobs`
and `can_manage_jobs` are already canonical per Section 17; implementation must
preflight-confirm that both flags exist in the live schema before writing the
Jobs Foundation migration.

Hard delete is never allowed through the application. The Jobs Foundation must
not add a DELETE policy.

### 38.5 Permitted first UI (locked)

The first Jobs workspace UI may include only:

- Jobs workspace/page;
- Jobs list/table;
- search/filter;
- create job form;
- edit job form;
- archive job action using soft archive only;
- job detail/read view;
- empty state;
- status badge/display;
- job type display.

The locked helper copy for the first Jobs UI is:

`Jobs foundation. Material workflow (job material list, issue to job, buyout, and return-to-inventory) and job management features (phases, assignments, documents, and financials) are reserved for future milestones.`

### 38.6 Reserved and not allowed in Jobs Foundation

The following are reserved and must not be built in the Jobs Foundation slice:

- customer/client CRM fields;
- budget/accounting/cost fields;
- `job_materials`;
- Job Material List;
- Issue to Job;
- inventory transactions;
- Buyout / purchase list;
- Return-to-Inventory;
- Job tote / QR labels;
- Job phases / schedule;
- Employee job assignments;
- Document/photo attachments;
- Estimates/contracts;
- Financial exports.

Jobs Foundation creates the prerequisite Job record only. It does not authorize
any job material, ledger, checkout, balance, QR, assignment, document, budget,
financial, or estimate workflow.

### 38.7 Implementation gate and sequencing

After this Section 38 lock is adopted, Codex may implement Jobs Foundation
migration and UI within the locked decisions, provided preflight confirms
`can_create_jobs` and `can_manage_jobs` exist in the live schema.

Implementation must remain limited to the foundation table, locked RLS,
soft-archive behavior, and permitted first UI scope above. Anything outside
this section is Bucket 3 / Architecture-sensitive and requires Claude review
before Codex implementation.

---

## 39. Job Material List (locked v2.21 — Entry 097)

### 39.0 Scope and core principle

Job Material List implements the Section 37 demand layer for a Job. It is
planning/demand only: it records what material a job needs before any movement
or fulfillment work happens.

Job Material List must never:

- write `inventory_balances`;
- create ledger transactions;
- reserve stock;
- store a fulfillment counter;
- create or imply issued, remaining, reserved, allocated, buyout, or purchased
  quantities.

Fulfillment remains derived later from ledger activity. The demand layer stores
requested material need only; the movement layer remains the existing approved
inventory transaction system from Section 37.

### 39.1 Table foundation (locked)

The first Job Material List implementation migration must create
`public.job_materials` with this locked foundation:

- `id uuid primary key default gen_random_uuid()`
- `job_id uuid not null references public.jobs(id)`
- `division text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `archived_at timestamptz null`
- `archived_by text null`
- `archive_reason text null`
- `item_id` referencing the existing catalog `items` table
- `requested_quantity numeric not null check (requested_quantity > 0)`
- `note text null`
- `material_name_snapshot text null`
- `material_code_snapshot text null`
- `created_by text null`

Before writing the implementation migration, Codex must inspect the live repo
migrations and confirm the exact primary key column and type for the existing
catalog `items` table. Codex must not assume the `items` key shape when writing
the `item_id` foreign key.

`division text not null` follows the existing text-division convention used by
`user_permissions.division`, `items.division`, Tool Catalogue Section 36, and
Jobs Foundation Section 38.

`requested_quantity` is planning-only demand. It is not issued quantity,
fulfilled quantity, remaining quantity, reserved quantity, allocated quantity,
buyout quantity, purchased quantity, or any other fulfillment counter.

`material_name_snapshot` and `material_code_snapshot` are display-only snapshots
for readability/history. They are not a second catalog source of truth and must
not replace the `item_id` catalog relationship.

### 39.2 Explicitly excluded fields

The first Job Material List implementation must not add:

- `issued_quantity`
- `fulfilled_quantity`
- `remaining_quantity`
- `reserved_quantity`
- `allocated_quantity`
- `buyout_quantity`
- `purchased_quantity`
- `procurement_status`
- `purchase_order_id`
- `cost`
- `vendor`
- `checkout_transaction_id`
- `return_transaction_id`
- `line_number`
- `unit_of_measure`
- `source_note`

No fulfillment, procurement, cost, vendor, transaction-reference, reservation,
buyout, or return columns are authorized in this slice.

### 39.3 RLS and permissions (locked)

RLS must be enabled on `public.job_materials`.

Read access is locked to own-division rows or users with
`can_view_all_divisions`, following the Section 17a division-scoped read
pattern and the existing text-division convention.

Write access for insert, edit, and archive is gated on `can_manage_jobs`.

Do not gate Job Material List writes on `can_manage_inventory`. This is the
Jobs workspace demand layer, not inventory movement.

No new permission flags are introduced by this section.

Hard delete is never allowed through the application. The Job Material List
implementation must not add a DELETE policy.

### 39.4 Permitted first UI (locked)

The first Job Material List UI may include only:

- a Job Material List surface inside the Jobs workspace on the job detail view;
- add material line from existing catalog items only;
- edit requested quantity;
- edit note;
- soft archive/remove material line;
- search/filter material lines;
- empty state;
- loading state;
- error state;
- display-only requested quantity count/sum.

The Job Material List UI must not live in the Inventory workspace and must not
create a new top-level workspace.

The UI must not use fulfillment, issued, remaining, buyout, reserved, allocated,
purchased, procurement, checkout, return, or cost language for this slice.

An "Issue to Job" affordance is now defined in Section 40 and may be wired only
through the locked navigation/prefill behavior described there. This section
does not add any direct runtime write behavior.

### 39.5 Locked helper copy

The locked helper copy is:

`Job Material List is planning only. It records what the job needs; it does not reserve stock, issue inventory, create transactions, or update balances. Buyout and Return-to-Inventory are reserved for future milestones.`

### 39.6 Reserved behavior and protected scope

This section does not authorize:

- Buyout;
- Return-to-Inventory;
- cart/checkout behavior changes;
- inventory transaction changes;
- ledger changes;
- direct balance writes;
- QR/scan behavior;
- Accounting Export behavior;
- Financials/job-cost behavior;
- procurement or purchase order behavior;
- fulfillment counters;
- reservations or allocation;
- new permission flags.

Issue to Job is locked in Section 40. Buyout and Return-to-Inventory remain
reserved for milestones 5K.4 and 5K.5 respectively.

### 39.7 Implementation gate and sequencing

After this Section 39 lock is adopted, Codex may implement the Job Material List
migration and UI within the locked decisions, provided preflight confirms the
catalog `items` table primary key column and type before writing the
`job_materials.item_id` foreign key.

Implementation must remain limited to the planning/demand table, locked RLS,
soft-archive behavior, and permitted first UI scope above. Anything outside
this section is Bucket 3 / Architecture-sensitive and requires Claude review
before Codex implementation.

---

## 40. Issue to Job (locked v2.22 — Entry 102)

### 40.0 Purpose

Issue to Job implements the Section 37 movement layer for a job-specific
checkout handoff. It moves stock out of inventory through the existing
Cart / Checkout engine.

This is not a reservation. It does not create a parallel write path, does not
directly write `inventory_balances`, does not introduce new transaction types,
and does not write fulfillment counters to `job_materials`.

### 40.1 Existing capability finding

Section 11 already locks `destination_type` and `destination_id` at the
`transaction_items` line level. `destination_type = 'job'` is already an
approved destination type, and the existing checkout RPC/schema are expected to
support Assign-to-Job movement without schema changes.

HANDOFF Entry 021 recorded that job/service-call destination pickers were
intentionally not added earlier. Therefore 5K.3 is a UI gap, not a schema/RPC
gap.

### 40.2 Required Codex preflight

Before any implementation, Codex must confirm:

- the live `transaction_items.destination_type` CHECK constraint includes
  `'job'`;
- `transaction_items.destination_id` is `TEXT`;
- the existing pattern for writing UUID-like destinations into
  `destination_id`.

If the live constraint does not include `'job'`, Codex must stop and report a
Claude-review blocker.

### 40.3 Implementation scope

The only authorized UI work in this slice is:

- add Job as a third destination option in the existing Cart / Checkout
  destination-selection UI, alongside user and vehicle;
- add a division-scoped job picker using existing `jobs_read` access;
- add an `Issue to Job` action on Job Material List lines;
- make the `Issue to Job` action navigation/prefill only;
- hand off to the existing Cart / Checkout flow with job + item context;
- avoid direct RPC calls from the Job Material List action;
- avoid direct transaction writes from the Job Material List action.

### 40.4 Requested quantity behavior

`requested_quantity` may prefill cart quantity as a suggestion only.

It must not be enforced as a ceiling.
It must not be enforced as a floor.
The user may change the actual checkout quantity.

### 40.5 Job Material List relationship

Users may issue material to a job even if that material is not present on the
Job Material List.

Job Material List remains planning/demand only and is not a structural gate on
physical inventory movement.

This milestone writes nothing to `job_materials` and does not calculate or
display issued, fulfilled, or remaining quantities.

### 40.6 Permissions

No new permission flags are introduced.

Checkout remains gated by existing `can_inventory_transactions`.
Job picker reads use existing `jobs_read` RLS.
Job Material List line action reads use existing `job_materials_read` RLS.
No permission changes are introduced.

### 40.7 Locked labels/copy

Canonical action label:

`Issue to Job`

Helper copy for checkout job destination:

`Issue to Job moves stock out of inventory through checkout. This is not a reservation.`

### 40.8 Explicitly reserved

Do not include:

- Buyout remaining/status;
- purchase list/export;
- Return-to-Inventory;
- Return-from-Job RPC;
- reservation/allocation behavior;
- stored fulfillment quantity;
- stored issued quantity;
- stored remaining quantity;
- `job_materials` fulfillment columns;
- new transaction types;
- parallel transaction write path;
- direct `inventory_balances` writes;
- accounting/job-cost expansion;
- job tote / QR labels;
- customer/client CRM;
- job phases/schedule;
- employee assignments;
- documents/photos;
- estimates/contracts linkage.

### 40.9 Implementation gate and sequencing

After this Section 40 lock is adopted, Codex may implement Issue to Job as a
Bucket 2 existing-flow binding only if preflight confirms the live
`transaction_items.destination_type` CHECK constraint includes `'job'` and
`transaction_items.destination_id` is `TEXT`.

Implementation must remain limited to UI navigation/prefill binding into the
existing Cart / Checkout flow. No schema, RPC, permission, or runtime write
changes are authorized by this section.

---

## 41. Buyout Planning (locked v2.23 — Entry 106)

### 41.0 Purpose

Buyout List is a PM's standalone procurement checklist for a job. It captures
long-lead items, quoted materials, and anything worth shopping before the job
starts.

It is not a comprehensive material tracking system. Foreman as-needed orders
happen outside the app for now. Job budget and cost tracking are separate
concerns.

Buyout List is not derived from `job_materials`. Buyout List is its own table:
`job_buyout_lines`. There is no FK to `job_materials`. Any relationship to Job
Material List is informational only and reserved for a future architecture
decision.

On-hand inventory is a read-time convenience signal only. Buyout Planning does
not allocate, reserve, move, or post accounting entries for inventory.

### 41.1 New table

`public.job_buyout_lines`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `job_id uuid not null references public.jobs(id)`
- `division text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `archived_at timestamptz null`
- `archived_by text null`
- `archive_reason text null`
- `item_id <confirmed type> null references existing catalog items table`
- `item_description text null`
- `quantity_needed numeric not null default 1 check (quantity_needed > 0)`
- `quantity_ordered numeric null check (quantity_ordered is null or quantity_ordered >= 0)`
- `status text not null default 'pending' check status in ('pending','ordered','received','cancelled')`
- `vendor_note text null`
- `lead_time_note text null`
- `note text null`
- `created_by text null`

### 41.2 Schema decisions

- `item_id` is nullable.
- `item_description` supports non-catalog / free-text lines.
- Either `item_id` or `item_description` should be present via UI validation,
  not a DB constraint.
- `quantity_ordered` is nullable:
  - null = not yet ordered
  - 0 = ordered, quantity TBD
- `status` is CHECK-constrained text, not a Postgres enum.
- No cost, price, PO number, or vendor ID columns.
- `vendor_note` and `lead_time_note` are plain text only.
- No FK to `job_materials`.
- Soft archive only.
- No DELETE policy.

### 41.3 In Stock read-time signal

`In Stock` reads from `inventory_balances` at display time for catalog item
lines.

The signal is division-scoped using existing inventory visibility conventions.
It is blank for free-text lines.

The value is never stored on `job_buyout_lines`. It never allocates, reserves,
or moves material.

### 41.4 Permissions

- Read: own division or `can_view_all_divisions`.
- Write insert/edit/archive: `can_manage_jobs`.
- No new permission flags.
- No hard delete.

### 41.5 UI location

- Jobs workspace.
- Job detail view.
- Buyout List section/tab alongside Job Material List.
- Not Inventory workspace.
- No inventory movement UI from this screen.
- No cart/checkout UI from this screen.
- No reservation/allocation UI.
- No accounting UI.

### 41.6 UI allowed

- Add buyout line using catalog item picker or free-text description.
- Edit `quantity_needed`, `quantity_ordered`, `status`, `vendor_note`,
  `lead_time_note`, and `note`.
- Soft archive/remove buyout line.
- Status badge values: `pending`, `ordered`, `received`, `cancelled`.
- In Stock read-time column.
- Per-job summary such as "3 of 7 lines ordered".
- Print to PDF.
- CSV export.
- Empty, loading, and error states.

### 41.7 Locked helper copy

`Buyout List is a planning tool for the PM. Add items that need to be quoted or ordered. The In Stock column shows current inventory levels — it does not reserve material. To pull stock for this job, use the Inventory module.`

### 41.8 Print/export

Approved for 5K.4:

- simple print-to-PDF
- CSV export

Export columns:

- Item / Description
- Qty Needed
- Qty Ordered
- Status
- In Stock
- Lead Time
- Vendor
- Note

Export must not include:

- cost
- price
- PO number
- accounting codes
- fields outside the approved column list

### 41.9 Explicitly reserved

- structured cost/price/PO number/vendor ID
- accounting / Financials integration
- purchase order creation
- inventory movement
- cart/checkout changes
- reservation/allocation behavior
- link/FK to `job_materials`
- Return-to-Inventory
- Return-from-Job RPC
- new transaction types
- direct `inventory_balances` writes
- job tote / QR labels
- customer/client CRM
- job phases/schedule
- employee assignments
- documents/photos
- estimates/contracts linkage

### 41.10 Implementation gate and sequencing

After this Section 41 lock is adopted, Codex may implement Buyout Planning only
as a Bucket 3 / Architecture-sensitive feature within the locked decisions.
This section does not authorize any schema, RPC, permission, or runtime write
changes by itself.

---

## 42. Workspace Detail Sub-Navigation Pattern (locked v2.24 — Entry 108)

### 42.0 Purpose

The Jobs detail screen is the first application of a reusable workspace detail
pattern: a persistent selected-record header, a horizontal sub-nav, and one
focused content area.

This pattern is intended for detail screens that need multiple scoped views
without adding a left sidebar inside the record detail surface.

### 42.1 Locked structure

- Persistent selected-record header at the top of the detail view.
- Horizontal sub-navigation directly under the header.
- Single content panel below the sub-nav.
- No sidebar for the detail sub-navigation.
- The Jobs directory/list screen remains unchanged.
- Mobile responsiveness is required under Constitutional Rule 18.

### 42.2 Jobs tab set

The Jobs detail sub-nav is locked to these tabs, in this exact order:

1. Overview
2. Details
3. Materials
4. Buyout
5. Transactions
6. Financials
7. Documents
8. Schedule

Active tabs:

- Overview
- Details
- Materials
- Buyout

Disabled / Coming Soon tabs:

- Transactions
- Financials
- Documents
- Schedule

The disabled tabs use the existing 5J shell Coming Soon placeholder pattern.
They are present as locked navigation targets, but they do not expose workflow
behavior yet.

### 42.3 Tab content

- Overview: lightweight read-only summary for the selected job. It is a new
  summary surface, not a renamed version of the old stacked card.
- Details: the existing job edit form.
- Materials: the existing Job Material List surface.
- Buyout: the existing Buyout List surface.
- Transactions, Financials, Documents, Schedule: Coming Soon placeholders only.

### 42.4 Behavior

- The selected job remains visible in the persistent header while switching
  tabs.
- The sub-nav changes content without changing the selected job context.
- The job list/directory does not gain sub-navigation.
- `ENABLE_JOB_DETAIL_ISSUE_TO_JOB_ACTION` remains false/hidden.
- The Issue to Job shortcut stays out of this lock.

### 42.5 Explicitly reserved

- No sidebar navigation inside the job detail surface.
- No schema changes.
- No Supabase migration changes.
- No RPC changes.
- No permission model changes.
- No runtime behavior changes.
- No new backend writes.
- No Job detail implementation changes yet.

### 42.6 Implementation gate

After this Section 42 lock is adopted, Codex may implement the workspace detail
sub-navigation pattern only within the locked decisions above. This section
does not authorize any schema, RPC, permission, or runtime write changes by
itself.

---

## 43. Job Transactions Log (locked v2.25 — Entry 110)

### 43.0 Purpose

Transactions is the read-only Jobs detail tab that shows material coded to the
selected job through Inventory Checkout.

It is intentionally small and separate from Financials. Financials remains
unlocked and deferred to a dedicated future session.

### 43.1 Read model

Add a new read-only SQL view:

- `public.job_transaction_log`

The view reads existing ledger data from:

- `transaction_items`
- `inventory_transactions`

The view is filtered to:

- `destination_type = 'job'`

The selected job is matched by:

- `destination_id = jobs.id::text`

The view is source-location-agnostic, so future Vehicle Inventory transactions
using the same ledger and `destination_type = 'job'` will appear automatically.

Inbound Return-from-Job rows are not solved now and will require a future delta
when 5K.5 is reviewed.

### 43.2 Display shape

The Transactions tab table should support these display labels:

- date / occurred_at
- item / material
- quantity
- source location / bin
- transaction type
- performed by
- notes / reference

Exact column names must be confirmed by Codex preflight against the live or
current schema before implementation.

### 43.3 No cost/value

- No cost/value column in the view.
- No unit cost display.
- No financial actuals.
- Cost/value remains reserved for Financials.

### 43.4 UI scope

- Activate the Transactions tab in the Jobs detail sub-nav.
- Show a read-only table/log.
- No edit buttons.
- No delete buttons.
- No return buttons.
- No print/export in this milestone.
- No accounting/financial display.

### 43.5 Helper copy

`This is a read-only log of material coded to this job through Inventory Checkout.`

### 43.6 Permissions / RLS

- No new permission flags.
- Read access inherits the existing `transaction_items` / `inventory_transactions`
  RLS.
- If the project requires `security_invoker` or another established pattern for
  views over RLS-protected tables, Codex should use the minimal correct pattern
  that matches the repo convention.

### 43.7 Explicitly reserved

- Return-to-Inventory
- financial actuals from inventory
- accounting integration
- PO creation
- invoices
- job cost posting
- revenue recognition
- payroll/labor actuals
- committed costs
- change orders
- documents/photos
- schedule/phases
- employee assignments
- new inventory movement pathways
- transaction edits/deletes
- cost/value display
- print/export in this milestone

### 43.8 Implementation gate

After this Section 43 lock is adopted, Codex may implement Job Transactions
Log only within the locked decisions above. This section does not authorize any
schema, RPC, permission, or runtime write changes by itself.

---

## 44. Job Financials / Budget Foundation (locked v2.26 — Entry 115)

### 44.0 Purpose

Financials v1 is Budget Foundation only.

It tracks budgeted cost lines for a job and answers: "What did we budget for
this job by category/cost code?"

It does not answer actual spend, billing, profit, inventory value, committed
costs, approved change orders, or accounting outcomes.

It is not accounting.
It is not job-cost actuals.
It is not invoice / PO / change-order integration.
It is standalone from Job Transactions Log and Buyout List in v1.

### 44.1 Read / write model

Add a new table:

`public.job_budget_lines`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `job_id uuid not null references public.jobs(id)`
- `division text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `archived_at timestamptz null`
- `archived_by text null`
- `archive_reason text null`
- `category text not null check (category in ('material','labor','subcontractor','equipment','permit','other'))`
- `cost_code text null`
- `description text not null`
- `budget_amount numeric not null default 0 check (budget_amount >= 0)`
- `sort_order numeric not null default 0`
- `note text null`
- `created_by text null`

### 44.1a Budget line ordering delta

- Add `sort_order` to support manual and drag/drop reordering.
- One-time backfill assigns sequential `sort_order` values per `job_id` based
  on `created_at`.
- No grouping field yet.
- No `cost_report_group` yet.
- Ordering updates use the existing `job_budget_lines_update` policy.
- Reorder permission remains `can_approve_budget`.
- Database source of truth for ordering is `sort_order`.
- No RLS change.

### 44.2 Explicitly excluded from schema

Do not include:

- `status`
- `actual_amount`
- `committed_amount`
- `issued_value`
- `contract_value`
- `revenue`
- `profit`
- `margin`
- `po_number`
- `invoice_id`
- `change_order_id`
- accounting fields
- transaction references
- buyout references

### 44.3 Schema decisions

- `category` is required and CHECK-constrained to `material`, `labor`,
  `subcontractor`, `equipment`, `permit`, and `other`.
- `cost_code` is free-text in v1.
- No formal cost code table in v1.
- Formal cost code table is reserved until the full Northgate cost code
  convention is documented.
- `description` is required.
- `budget_amount` allows zero.
- Blank budget input in UI must not silently become zero.
- No status column.
- Soft archive only.
- No DELETE policy.

### 44.4 Permission model

Use the existing canonical Section 17 permissions:

- Read / tab visibility / viewing budget lines: `can_view_financials`
- Write / add/edit/archive budget lines: `can_approve_budget`
- Do not use `can_manage_jobs`.
- Do not create new permission flags.
- Financials tab must be hidden completely from users without
  `can_view_financials`.
- Users with `can_view_financials` but without `can_approve_budget` may view
  Financials read-only.
- Add/edit/archive controls must be hidden from users without
  `can_approve_budget`.

### 44.5 UI scope

Location:

- Jobs workspace
- selected job
- Financials tab from Section 42

Financials tab becomes active only for users with `can_view_financials`.

UI should include:

- locked helper copy
- Total Budget summary
- Budget by Category summary
- Budget line count
- budget lines table
- add budget line form/control
- edit budget line form/control
- soft archive/remove line
- category selector
- cost code free-text
- description
- budget amount
- note

### 44.6 Locked helper copy

`Financials v1 is a budget planning tool. It tracks budgeted cost lines for this job only. It does not calculate actual cost, profit, revenue, inventory value, purchase orders, invoices, change orders, payroll, or accounting entries.`

### 44.7 Numeric input UX

- Budget amount input may be temporarily blank while focused/typing.
- App must not force `0` back into the field while the user is editing.
- Validate on save/submit.
- Final blank value blocks save with validation.
- Final negative value blocks save with validation.
- Explicit `0` is allowed and saved as zero.

### 44.8 Print / export

- Deferred in v1.
- No print-to-PDF.
- No CSV export.
- Budget export may be added later as a display-only follow-on after the model
  is tested.

### 44.9 Reserved

Do not include:

- actual cost
- committed cost
- issued inventory value
- unit cost display
- transaction cost values
- buyout cost import/linkage
- purchase orders
- invoices
- change orders
- contract value
- revenue
- profit/margin
- payroll/labor actuals
- accounting export
- accounting post
- financial integrations
- new inventory movement pathways
- transaction edits/deletes
- Return-to-Inventory
- documents/photos
- schedule/phases
- assignments
- formal cost code table
- print/export

### 44.10 Implementation gate

This section locks the Budget Foundation model only.

It does not authorize any implementation, migration, runtime, RPC, or UI
changes by itself.

---

## 45. Jobs Module Completion Roadmap (locked v2.27 — Entry 118)

### 45.0 Purpose

Ryan wants to finish Jobs before Vehicle Inventory, so this roadmap locks the
next Jobs-module sequence after Financials v1 live verification.

### 45.1 Locked sequence

1. Formatting / readability cleanup + Developer formatting tuner
2. Financials budget line ordering
3. Job Documents v1
4. Job Schedule v1
5. Job Export later, after Documents and Schedule are live

### 45.2 Formatting Tuner

- Bucket 1 / no-lock safe UI only
- Developer-gated by `can_access_developer`
- localStorage + CSS variables only
- no Supabase writes
- no schema
- no cross-device sync
- no team/division theme persistence
- no admin-configured themes for other users
- future architecture review required if persistence moves beyond browser
  localStorage

### 45.3 Job Export boundary

- Not locked in v2.27
- Section 48 reserved
- Do not build yet
- Future hard boundaries already confirmed:
  - browser print-to-PDF only
  - section-selectable
  - permission-aware per section
  - documents never bundled into a full job PDF
  - document index/list only
  - no database writes

---

## 46. Job Documents v1 (locked v2.27 — Entry 118)

### 46.0 Purpose

This is the first implementation of the already-locked Section 20 generic
documents design.

Job is the first owner type to go live. The other Section 20 owner types are
declared in schema only for now and are not yet RLS-permitted.

### 46.1 Schema lock

Use `public.documents`, not a bespoke `job_documents` table.

Fields:

- `id uuid primary key default gen_random_uuid()`
- `division text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `archived_at timestamptz null`
- `archived_by text null`
- `archive_reason text null`
- `owner_type text not null check (owner_type in ('job','estimate','vehicle','tool','employee','change_order','report','snapshot'))`
- `owner_id uuid not null`
- `storage_path text not null`
- `file_name text not null`
- `document_type text null`
- `description text null`
- `file_size_bytes bigint null`
- `mime_type text null`
- `created_by text null`

Trigger:

- `set_documents_updated_at`
- use existing `touch_user_permissions_updated_at()` if confirmed in
  implementation preflight

### 46.2 RLS / permissions

- Enable RLS
- `documents_read`
  - archived_at is null
  - owner_type = `job`
  - own division OR `can_view_all_divisions`
- `documents_insert`
  - owner_type = `job`
  - own division
  - `can_manage_jobs`
- `documents_update`
  - owner_type = `job`
  - own division
  - `can_manage_jobs`
- No DELETE policy
- No hard delete
- No new permission flag
- Not `can_view_financials`

### 46.3 Storage

- Supabase Storage is required per Section 20
- Codex must preflight the actual bucket name / configuration before
  implementation
- Do not assume the bucket name

### 46.4 UI scope

- Documents tab becomes active
- Upload file
- List documents for selected job
- Open/download individual document
- Archive document
- No hard delete
- No export bundling
- Enforce or default-suggest Section 20 naming convention:
  `[Job_Name] [YYYY-MM-DD] [HHMM] [Document_Type] [Description]`

### 46.5 Locked helper copy

`Documents attach to this job. They are stored securely and can be downloaded individually. Deleting a document only archives it — it is not permanently removed.`

### 46.6 Explicitly reserved

- No bundled full-job PDF
- No database writes outside the documents table and storage object handling
- No hard delete
- No permission flag expansion
- No accounting integration

### 46.7 Implementation gate

This section locks Job Documents v1 only.

It does not authorize any implementation, migration, runtime, RPC, or UI
changes by itself.

---

## 47. Job Schedule v1 (locked v2.27 — Entry 118)

### 47.0 Purpose

Job Schedule v1 is a flat milestone/task list only.

It does not model dependencies, calendar events, assignments, reminders, or
recurring work.

### 47.1 Schema lock

Use `public.job_schedule_items`.

Fields:

- `id uuid primary key default gen_random_uuid()`
- `job_id uuid not null references public.jobs(id)`
- `division text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `archived_at timestamptz null`
- `archived_by text null`
- `archive_reason text null`
- `title text not null`
- `description text null`
- `target_date date null`
- `status text not null default 'pending' check (status in ('pending','in_progress','complete','delayed'))`
- `sort_order numeric not null default 0`
- `note text null`
- `created_by text null`

Trigger:

- `set_job_schedule_items_updated_at`
- use existing `touch_user_permissions_updated_at()` if confirmed in
  implementation preflight

### 47.2 RLS / permissions

- Enable RLS
- Read: division-scoped, own division OR `can_view_all_divisions`
- Insert/update/archive: `can_manage_jobs`, own division
- No DELETE policy
- No hard delete
- No new permission flag

**Archive transition requires two coordinated policies (locked after live
bugfix, Entries 124–125):** a soft-archive is itself a row UPDATE (setting
`archived_at`/`archived_by`/`archive_reason`), and in Postgres RLS, an UPDATE is
evaluated against **both** the UPDATE policy's `USING`/`WITH CHECK` clauses **and**
the SELECT policy governing whether the target row is visible to the transaction at
all. If the SELECT policy excludes rows once a condition changes (or excludes rows
mid-transition), the UPDATE can fail even when the UPDATE policy itself is
permissive. For `job_schedule_items`:
- The UPDATE policy must not require `archived_at IS NULL` in its `USING` clause —
  that would make the archive transition (which sets `archived_at` to a non-null
  value) reject itself.
- The SELECT policy must allow a same-division `can_manage_jobs` user to read the
  row through the archive transition, not only while `archived_at IS NULL`.
- The **active Schedule list UI** continues to filter `archived_at IS NULL`
  client-side/query-side — this RLS fix does not change what appears in the normal
  list. It only ensures the archive *action itself* can complete.
- No hard delete was introduced. No new permission flag was introduced. The fix
  stays entirely inside the existing soft-archive model (Section 18) and the
  existing `can_manage_jobs` gate.

**Live migrations implementing this fix:**
- `supabase/migrations/202607080001_job_schedule_items_archive_rls_bugfix.sql`
  (UPDATE policy correction)
- `supabase/migrations/202607090001_job_schedule_items_archive_select_rls_fix.sql`
  (SELECT policy correction — required in addition to the UPDATE fix, not instead
  of it)

Both were manually applied to live Supabase and confirmed working by Ryan's live
browser testing (Entries 124–125). **General principle for future RLS work on any
table with soft-archive:** when an archive/soft-delete transition fails at the RLS
layer, check the SELECT policy's interaction with the UPDATE, not only the UPDATE
policy in isolation — this is now a known failure shape for this project, not
unique to Schedule.

### 47.3 UI scope

- Schedule tab becomes active
- Flat milestone/task list only
- Add/edit/archive schedule item
- Title, description, target date, status, sort order, note
- No calendar integration
- No Google Calendar integration
- No dependencies
- No employee assignments
- No reminders/notifications
- No recurring events

### 47.4 Locked helper copy

`Schedule tracks key milestones and tasks for this job. It does not sync with a calendar or manage dependencies between items.`

### 47.5 Explicitly reserved

- Calendar sync
- Dependencies
- Employee assignments
- Reminders / notifications
- Recurring events
- Any broader project-management engine

### 47.6 Implementation gate

This section locks Job Schedule v1 only.

It does not authorize any implementation, migration, runtime, RPC, or UI
changes by itself.

---

## 48. Silas (AI Assistant) (locked v2.28 — Entry 127)

### 48.0 Purpose and reserved-slot origin

Silas fills the "Future AI Assistant" slot reserved in the original workspace
list (Section 4) since the project's first architecture pass, predating Jobs
and every other module built since. Silas is a **permission-aware interface
layer**, not a new system with its own authority. Everything it can see, it
sees because the requesting user could already see it. Everything it can do,
it does through **existing** write paths (Cart/Checkout, Job Budget Lines, Job
Materials, Documents, etc.) — never a new or parallel write mechanism. This is
the same "reuse, don't fork" principle governing the 5K-series milestones
(Section 37, Section 40), applied at the UI/agent layer.

### 48.1 Dual UI presence

1. **Dedicated Silas workspace** — full chat history, past conversations,
   detailed exchanges.
2. **Floating chat bubble** — available from any screen, for quick questions
   without leaving current context.

Both surfaces share one backend and one conversation history — two entry
points into one system, not two systems.

### 48.2 Capability categories

1. **Read/inform** — answer questions about data the user can see, with an
   optional quick-link button navigating to the relevant screen.
2. **Suggest/act** — propose a write action (e.g., create a transaction from a
   receipt photo), requiring explicit user approval before anything is
   written. No silent writes, ever.

### 48.3 Three response options for suggested writes

- **Approve** — the write executes through the existing engine immediately,
  from the chat interface. No detour to another screen.
- **Deny** — the suggestion is discarded. Nothing is written.
- **Other (specify)** — the user replies in chat with a correction instead of
  approving or denying. Silas incorporates the correction and presents a
  revised suggested action; the same three options apply to the revision.
  This can repeat until the user approves or denies.

There is deliberately no separate "review before approve" screen in v1 — the
"Other (specify)" loop replaces that need conversationally. Every path
terminates in the same existing write path a human would use manually. Silas
never has its own insert/update capability that bypasses any existing engine.

### 48.4 Receipt-to-Document attachment

When a receipt-derived transaction is approved, the receipt image is uploaded
through the existing Documents write path (Section 46: `owner_type = 'job'`,
`owner_id = job.id`), not discarded after data extraction. The same
`can_manage_jobs` gate that governs the transaction's job context also governs
this upload — no new permission logic is needed.

### 48.5 Permission model

Silas's capability is **strictly bounded by the requesting user's own
permissions** — not a separate Silas permission tier. If a user without
`can_view_financials` asks Silas about a job's budget, Silas must not answer,
for the same reason the Financials tab itself is hidden from that user
(Section 44). Silas is not a permission-elevation path. No new permission flag
is introduced for Silas's data capability — it inherits whatever the user
already has.

### 48.6 Schema lock

```sql
create table public.silas_conversations (
  id                uuid          primary key default gen_random_uuid(),
  division          text          not null,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),
  archived_at       timestamptz   null,
  archived_by       text          null,
  archive_reason    text          null,
  user_id           text          not null,
  title             text          null
);

create table public.silas_messages (
  id                uuid          primary key default gen_random_uuid(),
  conversation_id   uuid          not null references public.silas_conversations(id),
  division          text          not null,
  created_at        timestamptz   not null default now(),
  role              text          not null check (role in ('user', 'assistant')),
  content           text          not null,
  suggested_action  jsonb         null,
  action_status     text          null check (
                                    action_status is null or action_status in (
                                      'pending', 'approved', 'declined', 'revised'
                                    )
                                  ),
  approved_at       timestamptz   null,
  approved_by       text          null
);

create table public.silas_settings (
  id                uuid          primary key default gen_random_uuid(),
  silas_enabled     boolean       not null default true,
  updated_at        timestamptz   not null default now(),
  updated_by        text          null
);
```

`suggested_action` is a proposal record for display/prefill only — **never
itself a write path.** The actual write, on approval, always executes through
the existing RPC/insert flow for that action type. `silas_settings` is a
single-row table by convention (Codex to enforce exactly one row exists at
implementation time) — a Developer-controlled global kill switch, not a
general-purpose feature-flag system.

### 48.7 RLS / permissions

- `silas_conversations` / `silas_messages`: **per-user**, not division-scoped
  — chat history is personal, a deliberate deviation from the Section 17a
  division-scoped pattern. Read/write restricted to `user_id = auth.jwt() ->>
  'sub'` (via the parent conversation for messages). `can_view_all_divisions`
  does **not** grant cross-user visibility into Silas conversations.
- `silas_settings`: read open to any authenticated user (a single boolean, not
  sensitive); write restricted to `can_access_developer`.
- No DELETE policy on any Silas table (Section 18 — soft-archive at the
  conversation level only; `silas_settings` has no delete/insert path beyond
  migration seeding).
- No new permission flag beyond reusing `can_access_developer` for the kill
  switch write policy.

### 48.8 The critical boundary — Silas never writes directly

Silas's backend function may **read** from any table the requesting user has
RLS access to. It may **never** perform an `INSERT`/`UPDATE` against
`job_materials`, `job_budget_lines`, `transaction_items`, `documents`, or any
other business-data table directly. Approved actions always route through the
existing RPC or UI flow for that action type. This is why Section 19 audit
logging requires no changes — a Silas-approved transaction is indistinguishable
at the write layer from one a human completed manually.

**Silas must authenticate to Supabase using the requesting user's own JWT, not
a service-role key**, so existing RLS governs what Silas can see. This is the
single highest-stakes implementation preflight item for this section.

### 48.9 Developer kill switch — server-enforced, not UI-hidden

Per Section 17's non-negotiable rule ("a hidden button is UX convenience only,
the server still validates"), `silas_settings.silas_enabled = false` must be
checked at two points:
1. **Frontend:** hides the Silas workspace and floating chat bubble — normal
   UX convenience.
2. **Backend (hard stop):** the Netlify function proxying to the Claude API
   must itself check `silas_enabled` before any Claude API call or user-scoped
   read, and refuse if disabled. This is the actual kill switch.

### 48.10 UI scope and locked helper copy

Dedicated workspace: conversation list, chat view, suggested-action cards with
Approve / Deny / Other (specify). Floating bubble: same backend/history,
condensed UI, not rendered when disabled. Dev Console gains a single "Silas
Enabled" toggle (`can_access_developer`), taking effect immediately for all
users with no deploy required.

Locked helper copy (first use / empty state):
`Silas can answer questions about anything you have access to and can help with tasks like logging receipts. Silas never makes changes without your approval, and can only do what you're already permitted to do.`

Locked helper copy (disabled state):
`Silas is currently unavailable. Contact a Developer if you believe this is unexpected.`

### 48.11 Explicitly reserved

- Any Silas capability exceeding the requesting user's own permissions.
- Any write path bypassing an existing RPC/insert flow.
- Cross-user visibility into Silas conversations (including for
  `can_view_all_divisions` or Developer roles).
- Proactive/unprompted Silas actions — everything is user-initiated.
- Multi-step autonomous task chains without per-step approval.
- Voice input/output.
- Silas modifying its own permissions, prompts, or configuration through chat.
- A general-purpose feature-flag/settings system — `silas_settings` is scoped
  to Silas only.
- Job Export (moved to reserved Section 49 — was reserved as 48; Silas took
  48 since it was ready and Export explicitly is not).

### 48.12 Implementation gate

This section locks Silas's architecture only. It does not authorize
implementation, migration, runtime, or UI changes by itself. Implementation
requires a separate Codex prompt, gated on Ryan's decision to proceed after
this docs-only update is committed (HANDOFF Entry 127).

---

## 50. Northgate UI System (locked v2.30 — Entry 139)

### Overview

This section locks the approved cross-application visual and navigation
standard for Northgate HQ v2, based on Ryan's approved reference mockup
(HANDOFF Entry 139). It establishes the reusable application shell, layout
hierarchy, and visual language that all modules will converge on. It is a
**presentation and interaction-system lock**, not a code implementation
authorization, and does not modify any existing schema, permission, RPC,
business-logic, or authentication behavior.

### 50.1 Relationship to Section 42 (explicit reconciliation)

Section 42 (Workspace Detail Sub-Navigation Pattern, locked v2.24) remains
**fully in force, unchanged**. Its "no sidebar for job sub-nav" rule governs
the surface *inside* a selected record's detail view — the persistent record
header and horizontal detail tabs (Overview, Details, Materials, Buyout,
Transactions, Financials, Documents, Schedule) are not replaced or
supplemented by a sidebar at any point.

The primary and secondary sidebars locked in this section operate one layer
above that — at the **workspace/module level**, for navigating between
records, views, and filtered lists (e.g., "My Jobs," "Active Jobs," "On
Hold"). Once a record is selected and its detail surface is showing, Section
42's horizontal-tabs-only rule applies exactly as before. These are two
distinct layers of the same shell and do not conflict.

### 50.2 Global application header

A persistent top header, present on every authenticated screen, containing:

- Northgate branding on the left
- Top-level module navigation: Dashboard, Inventory, Jobs, Estimates,
  Employees, Vehicles, Silas, and Developer (when authorized)
- Notification/account area on the right
- A compact profile/account menu (account settings, sign-out) — replacing any
  large standalone Clerk settings block from earlier rough concepts

Top-level navigation is permission-aware per existing rules (50.7). A module
appearing in the reference image does not, by itself, authorize its exposure
to a user lacking the relevant permission.

### 50.3 Primary sidebar

A persistent or collapsible left sidebar for stable workspace navigation.
Contents depend on the active workspace and must map to existing approved
routes/features/permissions only — this lock does not invent new
functionality, routes, or data surfaces. Examples: My Jobs, My Estimates, My
Vehicle, My Information, My Customization; or, within a module such as
Inventory, the existing approved Inventory sections.

### 50.4 Optional secondary sidebar

An optional collapsible sidebar for filters, saved views, status groups, or
hierarchy navigation (e.g., Active Jobs / On Hold / Completed / Recently
Viewed) within a given workspace. Must have one consistent meaning per
workspace; must not be added merely to fill space; must never replace the
Section 42 horizontal detail tabs (see 50.1).

### 50.5 Main workspace structure

Consistent hierarchy across modules: workspace/list heading → search/filter/
primary-action controls → data table or operational surface → selected-record
header where applicable → Section 42 horizontal detail tabs → summary cards
where useful → detailed content below. Intent: one operational platform, not
disconnected feature pages.

### 50.6 Tables, density, and summary cards

Data-dense tables are the default for multi-record comparison — not
oversized cards. Required table qualities: clear column hierarchy, readable
row spacing, subtle separators, hover/selected-row states, responsive
overflow, and mobile card conversion only where a table cannot remain usable.

**Protected columns:** financial or otherwise permission-gated columns must
be omitted entirely for users lacking the relevant permission, never shown
blank or masked. This is a UI restatement of the existing `can_view_financials`
rule (Section 17) and any other existing canonical flag governing a given
column — no new permission flag is introduced by this section.

Summary cards are reserved for genuinely high-value metrics (estimate, budget
used, remaining budget, margin, inventory counts, active jobs, exceptions),
kept compact and secondary to the operational workflow.

### 50.7 Permission-aware rendering (restated, not new)

The shell and every module surface remain server-authoritative per the
existing non-negotiable rule (Section 17): client-side hiding is UX
convenience only. This visual standard must not create any route, button,
tab, sidebar item, table column, action menu, or mobile shortcut that exposes
protected behavior without the existing server-side authorization already in
place. No new permission flags, RPCs, or authorization logic are introduced
by this section — the UI shell consumes existing `effective_permissions_for_user()`
output exactly as current modules already do.

### 50.8 Color and styling

White main surfaces; very light gray application background; charcoal/
near-black primary text; muted gray secondary text; Northgate red as the
primary brand and active-state accent, including a red left border/underline
and light red/pink background tint for selected navigation or records (bright
green must not be used as the general active-navigation color); green
reserved for healthy/successful/positive status; amber for warnings/
approaching limits; red for branding, errors, negative exceptions, overdue
conditions, and losses; restrained shadows; thin borders/separators; rounded
corners used consistently, not excessively.

### 50.9 Spacing and hierarchy

Consistent page/card/panel padding; predictable heading levels; compact but
touch-usable controls; strong alignment across table columns, cards,
toolbars, and tabs. The reference image sets the target density and polish
level.

### 50.10 Responsive behavior (Constitutional Rule 18 compliance)

Desktop: both sidebars may be visible; either may collapse; workspace expands
to fill freed space. Tablet: secondary sidebar collapses first; primary nav
may reduce to icons/drawer; horizontal tabs may scroll. Mobile: sidebars
become drawers/sheets; workspace takes full width; controls remain
touch-friendly; record tabs scroll horizontally or use an approved compact
alternative; tables retain controlled horizontal scroll or convert to
readable cards. Per Constitutional Rule 18, this responsive behavior is
designed into Phase 1 from the start — not retrofitted later.

### 50.11 Design-system intent

Future implementation should establish reusable presentation primitives
(naming illustrative, not a required file layout): AppShell, TopNavigation,
PrimarySidebar, SecondarySidebar, WorkspaceHeader, RecordHeader, TabBar,
SummaryCard, DataTable, Toolbar, StatusBadge, EmptyState, ResponsiveDrawer.
This section locks the reusable pattern, not a specific React structure.

### 50.12 Phased rollout (locked sequence)

**Phase 1:** Reusable application shell and design tokens; Inventory module
conversion as the first real implementation; all existing Inventory
functionality preserved exactly.

**Phase 2:** Jobs and the selected-job workspace, reusing the locked Section
42 horizontal detail-tab pattern unchanged.

**Phase 3:** Estimates, Employees, Vehicles, Developer, Silas, and remaining
modules.

No risky all-at-once rewrite. Each phase preserves existing functionality,
permissions, and business rules exactly as already locked elsewhere in this
document.

### 50.13 Explicitly out of scope for this lock

This section authorizes a presentation/interaction standard only. It does
**not** authorize: database schema changes, migrations, new permission flags,
permission widening, new RPCs, direct database writes, changes to inventory
ledger behavior, changes to checkout behavior, changes to Jobs financial
logic, changes to authentication, changes to granular permission override
behavior (Section 17b), starting any deferred feature, or inventing new
routes/modules not already approved elsewhere in this document.

### 50.14 Implementation gate

This section locks the visual/navigation architecture only. It does not
itself authorize React, CSS, Supabase, or any runtime implementation.
Phase 1 implementation (application shell + Inventory conversion) requires a
separate Codex prompt, gated on Ryan's decision to proceed after this
docs-only update is committed (HANDOFF Entry 139).

---
