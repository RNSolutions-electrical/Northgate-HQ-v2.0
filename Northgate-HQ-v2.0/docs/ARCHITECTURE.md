# Northgate HQ v2 — Architecture Lock Document
### Version 2.1 — Updated after Claude architectural review
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
    ARCHITECTURE.md          ← Architecture Lock Document v2.1
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

## 14. Pending Job Cost Review

Inventory costs assigned to jobs create `pending` cost entries.

Job cost entries have a `status` field:

```
status TEXT CHECK (status IN ('pending', 'approved', 'rejected'))
```

Job budget screens display:

- approved costs
- pending costs (visually distinct)
- projected totals

Accounting and authorized users may approve or reject pending costs.

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
```

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

One system for desktop and mobile. No separate mobile app initially.

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

### Required Format for Each Entry

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
