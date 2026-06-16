# Northgate HQ v2 — Architecture Lock Document
### Version 2.9 — Constitutional Rule 20: coordination documents are never edited or repaired silently — any change beyond a clean append must be surfaced to Ryan first, brought to a model, and cross-cleared between Claude and ChatGPT; normal append-only HANDOFF logging is exempt (Entry 031). Prior: v2.8 — Section 30 escalation protocol "When Claude Must Be Involved": decision-ready routing rule (MUST-involve triggers, proceed-without conditions, tie-breaker) plus a required per-summary routing verdict from Codex (Entry 028). Prior: v2.7 — Constitutional Rule 19 (coordination documents are the versioned source of truth: append-only sequential entries, one identical entry format, canonical filenames never renamed) and Section 34 Documentation Standard (Entry 022). Prior: v2.6 — Section 14d Express Checkout / Manager Override (new transaction-completeness concept), Section 17 new permission flags (`can_express_checkout`, `can_approve_express_checkout`, `can_defer_completion`), Section 22 reason-gated developer override (Entry 017). Prior: v2.5 — Section 11 cart-open controls (server-side permission gate + server-derived vehicle snapshot) and Section 16 vehicle stock-carrying flag + user→vehicle assignment model (Entry 016). Prior: v2.4 — Section 29 updated to reflect completed build state (Entry 014). v2.3 — Constitutional Rule 18 added: Responsive UI is a Foundational Requirement (Entry 011). v2.2 — Responsive build requirement + React Native companion app future phase. v2.1 — Updated after Claude architectural review.
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
    ARCHITECTURE.md          ← Architecture Lock Document v2.9
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
- office inventory
- returned to vendor
- scrap / waste
- unknown / missing (requires a note)

> Physical bins and transaction destinations are not the same concept and must
> not be merged into a single "locations" model. They serve different purposes
> and are stored in different tables.

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
                    ('job','service_call','vehicle','user','office',
                     'vendor_return','scrap','unknown'))
destination_id    TEXT  -- FK target depends on destination_type
unit_cost_at_time NUMERIC NOT NULL DEFAULT 0
```

Default checkout: entire cart assigned to one destination.

Advanced checkout: split cart by line item.

Vehicle destination = stocking the vehicle (not job coding).

Material transported on a vehicle for a job = coded to the job, not the vehicle.

Unknown / missing requires a mandatory note.

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
- Admin users see all divisions and financial data

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

> **Non-Negotiable Rule:** Permissions are server-authoritative. The UI may
> hide buttons based on permission state, but all permission enforcement happens
> at the API / database level. No local state, no client-side-only permission
> gates. A hidden button is UX convenience only — the server still validates.

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

Authorized users may:

- select Avery templates
- choose displayed fields
- include / exclude QR codes
- preview formatting
- print individual labels
- print by unit, shelf, bay, or bin

Specific Avery template IDs to be added when confirmed.

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
3. QR generation
4. Inventory balance cache
5. Cart and checkout system (with per-line-item destinations)
6. Inventory transactions
7. Grand Master read-only view (Supabase VIEW)
8. Accounting export
9. Label printing
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
