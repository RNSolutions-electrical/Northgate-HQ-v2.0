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
  - `ledger_sequence` added to `transaction_items` for deterministic balance rebuild order
  - `inventory_balances` must only reflect approved `transaction_items`
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
   physical_count_correction using `target_quantity`. Only
   `status = 'approved'` transaction items affect quantity on hand; pending and
   rejected rows are ignored by balance calculations.

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

## Entry 002

**Date:** 2026-05-29
**Updated by:** ChatGPT
**Phase:** Migration Review — Inventory Balance Finalization
**Session type:** Cross-model implementation review / fresh-session handoff

---

### Current Active Repository

The correct working repository is:

`RNSolutions-electrical/Northgate-HQ-v2.0`

Do **not** use `RNSolutions-electrical/Northgate-Estimator-V2.0` for this build. That was a repo-name confusion during the previous session.

GitHub access is confirmed for the correct repo. ChatGPT successfully read `HANDOFF.md` from `RNSolutions-electrical/Northgate-HQ-v2.0`.

---

### Current Project Phase

The project has moved past architecture brainstorming and into final migration review.

The active task is finalizing the Phase 1 Inventory SQL migration generated from:

`docs/INVENTORY_SCHEMA.md` v2.3

The migration has not yet been approved to run in Supabase.

---

### Migration Review Status

Codex generated the first full Phase 1 Inventory migration.

ChatGPT reviewed it and found the original `update_inventory_balance()` trigger mishandled physical count corrections because it summed all `physical_count_correction.target_quantity` values instead of treating the latest approved correction as a new baseline.

Codex then revised the migration/source schema.

Claude also flagged two important concerns:

1. UUID ordering is not chronological and should not be used as a ledger-order tie breaker.
2. `pending` and `rejected` transaction rows should not affect official inventory balances.

These concerns were accepted.

---

### Locked Migration Adjustments Since Initial v2.3

The following changes are now expected in the migration before final review:

1. `transaction_items` must include:

```sql
ledger_sequence BIGINT GENERATED ALWAYS AS IDENTITY
```

2. The following index must exist:

```sql
CREATE INDEX IF NOT EXISTS idx_txn_items_bin_status_ledger
ON transaction_items(bin_item_id, status, ledger_sequence);
```

3. `update_inventory_balance()` must calculate official balances using only:

```sql
transaction_items.status = 'approved'
```

4. `pending` and `rejected` transaction items remain in the transaction log but must not affect `inventory_balances.quantity`.

5. A `physical_count_correction` becomes the new balance baseline only when that row is `status = 'approved'`.

6. Latest physical count correction is selected by:

```sql
ORDER BY ledger_sequence DESC
```

7. The cart checkout/finalization workflow must explicitly mark inventory-moving rows as `approved` when physical inventory movement is finalized. Otherwise, rows remain logged but do not affect `quantity_on_hand`.

---

### Revised Balance Trigger Under Review

The following trigger version has been reviewed by ChatGPT and is considered conceptually correct pending Claude's final architecture review:

```sql
CREATE OR REPLACE FUNCTION update_inventory_balance()
RETURNS TRIGGER AS $$
DECLARE
  target_bin_item_id UUID;
  new_balance NUMERIC;
  latest_correction_sequence BIGINT;
  latest_target_quantity NUMERIC;
BEGIN
  target_bin_item_id := COALESCE(NEW.bin_item_id, OLD.bin_item_id);

  SELECT ti.ledger_sequence, ti.target_quantity
  INTO latest_correction_sequence, latest_target_quantity
  FROM transaction_items ti
  WHERE ti.bin_item_id = target_bin_item_id
    AND ti.status = 'approved'
    AND ti.transaction_type = 'physical_count_correction'
    AND ti.target_quantity IS NOT NULL
  ORDER BY ti.ledger_sequence DESC
  LIMIT 1;

  IF latest_correction_sequence IS NOT NULL THEN
    SELECT latest_target_quantity + COALESCE(SUM(
      CASE
        WHEN ti.transaction_type IN (
          'add_stock',
          'return_from_job',
          'return_from_vehicle'
        ) THEN ti.quantity
        WHEN ti.transaction_type IN (
          'remove_stock',
          'assign_to_job',
          'assign_to_vehicle',
          'scrap',
          'vendor_return',
          'mark_damaged'
        ) THEN -ti.quantity
        ELSE 0
      END
    ), 0)
    INTO new_balance
    FROM transaction_items ti
    WHERE ti.bin_item_id = target_bin_item_id
      AND ti.status = 'approved'
      AND ti.transaction_type <> 'physical_count_correction'
      AND ti.ledger_sequence > latest_correction_sequence;
  ELSE
    SELECT COALESCE(SUM(
      CASE
        WHEN ti.transaction_type IN (
          'add_stock',
          'return_from_job',
          'return_from_vehicle'
        ) THEN ti.quantity
        WHEN ti.transaction_type IN (
          'remove_stock',
          'assign_to_job',
          'assign_to_vehicle',
          'scrap',
          'vendor_return',
          'mark_damaged'
        ) THEN -ti.quantity
        ELSE 0
      END
    ), 0)
    INTO new_balance
    FROM transaction_items ti
    WHERE ti.bin_item_id = target_bin_item_id
      AND ti.status = 'approved'
      AND ti.transaction_type <> 'physical_count_correction';
  END IF;

  INSERT INTO inventory_balances (bin_item_id, quantity, last_rebuilt)
  VALUES (target_bin_item_id, new_balance, NOW())
  ON CONFLICT (bin_item_id) DO UPDATE
    SET quantity = EXCLUDED.quantity,
        last_rebuilt = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

---

### Required Next Claude Review

Claude should review the revised migration behavior for architecture alignment, specifically:

1. Does official `inventory_balances` using only `status = 'approved'` align with the lock document?
2. Is `ledger_sequence BIGINT GENERATED ALWAYS AS IDENTITY` the correct ledger ordering mechanism for `transaction_items`?
3. Should checkout/finalization mark physical inventory movement rows as `approved` immediately?
4. Does separating transaction log status from job-cost approval need to be added to the Architecture Lock Document or Inventory Schema Plan?

---

### Important Architectural Concern For Next Session

There is now a likely distinction between:

- inventory movement approval/status
- job-cost/accounting approval/status

Current migration uses a single `transaction_items.status` field.

Potential issue:

If inventory movement is physically finalized but job-cost approval is still pending, one status may not be enough long-term.

Current working assumption:

- `transaction_items.status = 'approved'` means the inventory movement is official and affects on-hand balance.
- Job-cost/accounting approval may need a separate future field/table/status so physical inventory movement and accounting review are not incorrectly tied together.

This should be reviewed before building the cart checkout workflow.

---

### Updated Next Steps

1. Start a fresh ChatGPT and Claude session.
2. Both models should read `HANDOFF.md` first.
3. Claude should review the revised `ledger_sequence` / `approved-only` balance behavior.
4. If approved, Codex should update/create the migration file under `/supabase/migrations`.
5. Ryan should run the migration in the new Supabase project only after final approval.
6. Update `HANDOFF.md` again after the migration is committed or run.

---

### Open Questions / Concerns

1. Whether `transaction_items.status` is enough, or whether separate statuses are needed for:
   - physical inventory movement approval
   - job-cost/accounting approval
2. Whether the Architecture Lock Document should be updated to explicitly distinguish those two statuses before cart checkout is built.

---

### Architecture Drift Warnings

- Do not let pending or rejected transaction rows affect `inventory_balances`.
- Do not use UUID order for ledger sequencing.
- Do not merge physical movement approval with accounting/job-cost approval without explicit architectural decision.
- Do not run the migration until Claude completes final review of the revised balance behavior.

---
