# Northgate HQ v2.0 — Handoff Log
### Repository: RNSolutions-electrical/Northgate-HQ-v2.0
### Rule: Append only. Never edit prior entries. Entries are permanent record.

---

## Entry 001

**Date:** 2026-05-29
**Updated by:** Claude
**Phase:** Pre-build — Architecture Lock and Schema Planning
**Session type:** Architecture Review + Schema Planning

---

### Current Project State

v2.0 is a clean-slate rebuild of Northgate HQ on a locked architecture.
v1 (`Northgate-HQ`) remains intact as a working backup — do not touch it.

All infrastructure is new and separate from v1.

---

### Infrastructure

| Resource | Location |
|---|---|
| GitHub | `RNSolutions-electrical/Northgate-HQ-v2.0` |
| Supabase | New project — same naming scheme as repo |
| Netlify | New deployment — v1 remains live separately |
| Clerk | Shared with v1 — same publishable key |
| Google Sheets | `Northgate HQ — Master Data Workbook` (ID: `1mD_d0tyZy1wEuJtxIkTyRhL9cy-s1PchH6-3OOL7L94`) |

---

### Documents in This Repo

| File | Purpose |
|---|---|
| `HANDOFF.md` | This file — cumulative session log |
| `docs/ARCHITECTURE.md` | Architecture Lock Document v2.1 — authoritative |
| `docs/INVENTORY_SCHEMA.md` | Inventory Schema Plan v2.3 — ready for SQL |

---

### What Has Been Decided (Full Summary)

**AI Roles**
- Claude = architecture reviewer and drift detector
- Codex = implementation driver and debugger
- Architecture Lock Document = source of truth
- Ryan = final authority

Mid-build trigger: pause and bring to Claude if any decision affects schema,
relationships, module boundaries, permissions, audit logging, snapshots,
source-of-truth rules, financial logic, inventory logic, or cross-module
communication.

**Primary entity naming**
- Jobs (not Projects). Table is `jobs`. Nav item is "Jobs."
- Project Management is a feature set within a Job, not a separate entity.

**Core architectural rules (non-negotiable)**
1. Inventory balances are transaction-derived only
2. Jobs become source of truth after creation
3. Approved estimate snapshots are immutable (database-enforced trigger)
4. Permissions are server-authoritative — no client-side-only gates
5. Audit logging cannot be bypassed by any user or system
6. Dev Console actions are always logged
7. No duplicate source-of-truth systems
8. No direct database edits outside controlled tools
9. Cost at time of transaction always stored in `unit_cost_at_time`
10. Change orders are financial records, not documents
11. Per-line-item transaction destinations from day one
12. Physical locations and transaction destinations are distinct concepts
13. Archive over delete
14. Snapshot immutability is database-enforced

**Cost structure order (locked)**
Material markup → Overhead → Profit (independent percentages, sequential)

**Permissions**
Roles: Developer, Administrator, Project Manager, Estimator,
Field Supervisor, User (Field Tech)
Permission flags: see Architecture Lock Document Section 17

**Google Sheets**
Master Data Workbook is the bulk data entry interface.
App UI handles one-off edits for authorized users (can_edit_catalog).
Supabase is the live source of truth — Sheets is not.

**Data in the Google Sheet (as of this entry)**
- Materials: hundreds of live rows with full cascade
  (broad_category → sub_category → sub_category_2 → sub_category_3 → size)
- Employees: real team data entered
- Vehicles: E-101 (2019 Chevrolet Express 2500)
- Cost Codes: Northgate Division 16 electrical codes
- Assemblies: E-REC-001 entered
- Inventory Levels: bins A111, C211–C224 with real stock data

**Known data cleanup needed in the Sheet before first import:**
1. Material_Categories: several sub_category_2 rows have blank field_name — fix before syncing
2. Cost_Codes: code `16,050.00` has number formatting — must be plain text `16050`

---

### What Was Completed in Pre-Build

- Architecture Lock Document v2.1 written and finalized
- AI Development Roles document finalized
- Inventory Schema Plan reviewed across three versions (v1 → v2.1 → v2.2 → v2.3)
- All schema conflicts with Phase 1 resolved:
  - `material_code` kept as canonical key
  - 4-level cascade kept as text columns (not normalized)
  - Phase 1 table names kept (bins, bays, shelves — not renamed)
  - `vehicle_bins` restored
  - `min_quantity` added to `bin_items`
  - Clerk user IDs locked as TEXT throughout
  - `target_quantity` added to `transaction_items` for physical count corrections
  - `change_logs` column names locked to Phase 1 names
  - `void_expired_carts()` function replaces pg_cron (not on free tier)
- Repository named: `Northgate-HQ-v2.0`
- New Supabase project to be created (same naming scheme)

---

### What Codex Needs to Know

1. **This is not greenfield.** The architecture was designed around existing
   live data (1,721 material rows, real employees, real bin codes). Every
   schema decision respects that. Do not invent cleaner column names.

2. **The schema plan is v2.3 — use that version only.**
   Earlier drafts (v1, v2.1, v2.2) have been superseded. Do not reference them.

3. **All user_id fields are TEXT.** Clerk IDs are strings, not UUIDs. This
   applies to inventory_transactions, inventory_carts, change_logs, and any
   future table that stores a user reference.

4. **No pg_cron.** Ryan is on the Supabase free tier. Cart void uses
   `void_expired_carts()` callable function instead. Do not include
   `CREATE EXTENSION pg_cron` anywhere in the migration.

5. **Wrap all migration SQL in BEGIN/COMMIT.** Verify Supabase backup is
   current before running any step that alters existing tables with live data.

6. **The balance trigger is mandatory.** Do not skip or simplify it.
   It handles both delta transactions and absolute corrections for
   physical_count_correction using `target_quantity`.

7. **`bin_item_id` is NOT NULL** on both `transaction_items` and
   `inventory_cart_items`. Items must always come from a known bin.

---

### What Claude Needs to Know

1. v2.0 is building on a fresh Supabase project. Phase 1 schema from the
   previous repo is NOT being carried over — the migration SQL being written
   by Codex creates everything from scratch in the new project.

2. The Google Sheets workbook already has real operational data entered.
   Any schema decision that changes column names or structures now carries
   a migration cost against that data.

3. `sub_category_3` is already active in the sheet. `sub_category_4` is
   reserved but not yet populated.

4. The cumulative handoff document (this file) is the context bridge between
   sessions. Read it before starting any review.

---

### Next Steps (in order)

1. Codex generates migration SQL from `docs/INVENTORY_SCHEMA.md` (v2.3)
2. Ryan creates new Supabase project and runs migration SQL
3. Codex sets up v2.0 repo structure and base React + Vite app
4. Codex wires Clerk auth and Supabase client
5. Codex builds inventory cart checkout workflow
6. Claude does architecture alignment check before cart system build
7. Update this HANDOFF.md after each step

---

### Open Questions / Concerns

- None currently blocking. Schema is locked and ready for SQL generation.

---

### Architecture Drift Warnings

- None active at this time.

---

---
Date:        2026-05-29
Updated by:  Codex
Phase:       Phase 1 - Inventory
Session type:Schema Migration

## What Was Completed
- Read HANDOFF.md first, then reviewed the architecture lock and Inventory Schema Plan v2.3.
- Created the Phase 1 Inventory SQL migration at `supabase/migrations/20260529131500_phase1_inventory_v23.sql`.
- Generated the migration with `BEGIN` / `COMMIT` transaction wrapping.
- Included the inventory balance trigger, physical count correction audit trigger, snapshot immutability trigger function, `void_expired_carts()` callable function, and `grand_master_inventory_view`.
- Confirmed `pg_cron` was not used; cart cleanup is exposed through the Dev Console callable function.

## Decisions Made This Session
- Used `docs/ARCHITECTURE.md` as the architecture lock source because `docs/ARCHITECTURE_LOCK.md` does not exist in this repository, and both HANDOFF.md and ARCHITECTURE.md identify `docs/ARCHITECTURE.md` as the authoritative Architecture Lock Document v2.1 - lock document.
- Made the migration fresh-project-safe by creating missing Phase 1 inventory foundation tables with locked Phase 1 column names before applying v2.3 additions - lock document and handoff.
- Attached the estimate snapshot trigger conditionally when `estimate_snapshots` exists, while always creating the trigger function, to avoid inventing an estimates schema inside the inventory migration - AI recommendation aligned to lock document.

## Schema Changes
- Created or preserved: `cost_codes`, `material_categories`, `items`, `storage_units`, `shelves`, `bays`, `bins`, `bin_items`, `vehicles`, `change_logs`, `inventory_transactions`, `transaction_items`, `inventory_balances`, `inventory_carts`, `inventory_cart_items`, `vehicle_bins`, `vehicle_bin_items`, and `notifications`.
- Added Phase 1 v2.3 inventory columns: `items.default_cost_code_id`, `items.is_archived`, `bin_items.min_quantity`, `vehicles.classification`, `vehicles.description`, `inventory_transactions.transaction_type`, `inventory_transactions.performed_by_name`, and `inventory_transactions.source_vehicle_id`.
- Enforced Clerk user IDs as `TEXT` on `change_logs.user_id`, `inventory_transactions.user_id`, `inventory_carts.user_id`, and `notifications.user_id`.
- Extended `change_logs_action_check` to include `physical_count_correction`.
- Disabled RLS on new Phase 1 inventory extension tables for this phase.

## What Codex Needs to Know
- The migration does not rename existing Phase 1 columns, does not remove existing tables, and does not use `pg_cron`.
- `void_expired_carts()` is the locked cart cleanup path for the current Supabase tier.
- `bin_item_id` is `NOT NULL` on both `transaction_items` and `inventory_cart_items`.

## What Claude Needs to Know
- One path mismatch was found: Ryan requested `docs/ARCHITECTURE_LOCK.md`, but the repo stores the architecture lock at `docs/ARCHITECTURE.md`.
- The snapshot immutability trigger is included as a function and conditional trigger attachment because this inventory migration does not define the full estimates schema.

## Next Steps (in order)
1. Ryan creates the new Supabase project and verifies the backup state before running schema changes.
2. Run `supabase/migrations/20260529131500_phase1_inventory_v23.sql` in the v2.0 Supabase project.
3. Begin cart checkout workflow implementation after the migration is applied.

## Open Questions / Concerns
- Confirm whether `estimate_snapshots` already exists before this migration is run. If it does not, the snapshot protection function is present, but the trigger will need to attach when the estimates schema is created.

## Architecture Drift Warnings
- None active. The `ARCHITECTURE_LOCK.md` filename mismatch should be cleaned up later by either renaming the file or updating prompts/docs to consistently reference `docs/ARCHITECTURE.md`.
---

---
Date:        2026-05-29
Updated by:  Codex
Phase:       Phase 1 - Inventory
Session type:Schema Migration Update

## What Was Completed
- Updated `update_inventory_balance()` in `supabase/migrations/20260529131500_phase1_inventory_v23.sql`.
- Rebuild logic now finds the latest `physical_count_correction` for a `bin_item_id`, starts from that `target_quantity`, and applies only later normal delta transactions.
- If no physical count correction exists, rebuild logic sums all normal delta transactions.

## Decisions Made This Session
- Removed the prior shortcut that immediately set balance to a new physical count without considering later transactions during rebuild-style recalculation - Ryan request.

## Schema Changes
- No table or column changes.
- Function logic changed for `update_inventory_balance()`.

## What Codex Needs to Know
- Physical count correction is now a reset point in balance rebuild logic, not a value summed alongside other corrections.
- Later transactions are determined by `transaction_items.created_at > latest_correction.created_at`.

## What Claude Needs to Know
- Inventory balance rebuild semantics were tightened to support multiple physical count corrections over time.

## Next Steps (in order)
1. Run the updated migration in the v2.0 Supabase project after backup verification.
2. Validate physical count correction scenarios during cart/transaction workflow implementation.
3. Begin cart checkout workflow implementation after the migration is applied.

## Open Questions / Concerns
- None currently blocking.

## Architecture Drift Warnings
- None active.
---
