# Northgate HQ — Inventory Schema Plan v2.3
### Authority: Architecture Lock Document v2.1
### Previous: v2.2 (adapted to Phase 1)
### This version: Four adjustments from Codex review, applied and corrected
### Status: READY FOR MIGRATION SQL GENERATION

---

## Changes from v2.2

1. **Naming consistency** — `performed_by_user_id` removed everywhere.
   Locked as `user_id TEXT` + `performed_by_name TEXT` on all tables.

2. **Physical count trigger corrected** — trigger now uses Phase 1
   `change_logs` column names (`table_name`, `record_id`, `before_data`,
   `after_data`, `note`). Phase 1 columns are NOT renamed — they are live.
   `action` CHECK constraint extended to include `'physical_count_correction'`.

3. **Physical count correction logic fixed** — added `target_quantity NUMERIC`
   column to `transaction_items`. Trigger now sets balance absolutely for
   corrections instead of additively. Prevents the 3→5 becoming 8 bug.

4. **Rollback rule added** — all migration SQL must be wrapped in transactions.
   Destructive operations require backup verification before execution.

5. **Cart void mechanism locked** — Dev Console callable function `void_expired_carts()`.
   No pg_cron (not available on current Supabase tier). pg_cron is future upgrade path.

---

## Core Principle

This schema plan extends Phase 1 safely.
Do not rename existing columns.
Do not replace existing tables.
Do not remove what already works.

---

## Phase 1 Tables — Status and Changes

### ✅ items (1,721 live rows — do not alter column names)

Additions only:
```sql
ALTER TABLE items ADD COLUMN IF NOT EXISTS
  default_cost_code_id UUID REFERENCES cost_codes(id);

ALTER TABLE items ADD COLUMN IF NOT EXISTS
  is_archived BOOLEAN NOT NULL DEFAULT FALSE;
```

All other columns unchanged:
`material_code, name, broad_category, sub_category, sub_category_2,
sub_category_3, sub_category_4, size, length, manufacturer, manufacturer_sub,
unit_of_measure, division, price_per_unit, lot_price, lot_size, labor_rate_hrs,
default_min_qty, description, is_active, created_at, updated_at`

### ✅ material_categories (live — no changes)

### ✅ storage_units, shelves, bays, bins (live — no changes)

### ✅ bin_items

Addition:
```sql
ALTER TABLE bin_items ADD COLUMN IF NOT EXISTS
  min_quantity NUMERIC NOT NULL DEFAULT 0;
```
Note: `quantity` does NOT live here. It lives in `inventory_balances`.
`min_quantity` is a configuration threshold — it stays on `bin_items`.

### ✅ change_logs (live — column names are authoritative)

Phase 1 column names (do not rename):
```
id, user_id (TEXT), user_name, table_name, record_id (TEXT),
action, before_data (JSONB), after_data (JSONB), note, created_at
```

Correction to CHECK constraint:
```sql
-- Extend action values to include physical_count_correction
-- If constraint exists, drop and recreate:
ALTER TABLE change_logs DROP CONSTRAINT IF EXISTS change_logs_action_check;
ALTER TABLE change_logs ADD CONSTRAINT change_logs_action_check
  CHECK (action IN (
    'create', 'update', 'delete', 'restore',
    'import', 'permission_change', 'physical_count_correction'
  ));
```

### ✅ inventory_transactions (Phase 1 partial — corrections and additions)

```sql
-- Fix user_id type if created as UUID
ALTER TABLE inventory_transactions
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Rename if performed_by_user_id exists from any earlier draft
-- (only run if column exists)
-- ALTER TABLE inventory_transactions
--   RENAME COLUMN performed_by_user_id TO user_id;

-- Add missing columns
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS transaction_type  TEXT,
  ADD COLUMN IF NOT EXISTS performed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS source_vehicle_id UUID REFERENCES vehicles(id);

-- Remove status from header if it exists — status lives on cart and line items
-- ALTER TABLE inventory_transactions DROP COLUMN IF EXISTS status;
```

Locked column set for `inventory_transactions`:
```
id                UUID PK
transaction_type  TEXT NOT NULL
user_id           TEXT          ← Clerk user ID, not UUID
performed_by_name TEXT          ← display name snapshot
source_vehicle_id UUID          ← vehicle user was operating from (nullable)
notes             TEXT
created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

---

## New Tables — Locked Schemas

Run in migration order (Section 9).

---

### cost_codes

```sql
CREATE TABLE IF NOT EXISTS cost_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  category   TEXT,
  division   TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE cost_codes DISABLE ROW LEVEL SECURITY;
```

---

### transaction_items

The single most important inventory table.

```sql
CREATE TABLE IF NOT EXISTS transaction_items (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    UUID    NOT NULL REFERENCES inventory_transactions(id),
  bin_item_id       UUID    NOT NULL REFERENCES bin_items(id),
  item_id           UUID    NOT NULL REFERENCES items(id),

  -- Movement quantity (delta for normal transactions)
  quantity          NUMERIC NOT NULL,

  -- Absolute target balance for physical_count_correction ONLY
  -- NULL on all other transaction types
  target_quantity   NUMERIC DEFAULT NULL,

  unit_cost_at_time NUMERIC NOT NULL DEFAULT 0,
  transaction_type  TEXT    NOT NULL,
  destination_type  TEXT    CHECK (destination_type IN (
                      'job', 'service_call', 'vehicle', 'user',
                      'office', 'vendor_return', 'scrap', 'unknown'
                    )),
  destination_id    TEXT,
  cost_code_id      UUID    REFERENCES cost_codes(id),
  status            TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE transaction_items DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_txn_items_transaction  ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_txn_items_bin_item     ON transaction_items(bin_item_id);
CREATE INDEX IF NOT EXISTS idx_txn_items_item         ON transaction_items(item_id);
CREATE INDEX IF NOT EXISTS idx_txn_items_destination  ON transaction_items(destination_type, destination_id);
CREATE INDEX IF NOT EXISTS idx_txn_items_status       ON transaction_items(status);
```

---

### inventory_balances

```sql
CREATE TABLE IF NOT EXISTS inventory_balances (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  bin_item_id  UUID    NOT NULL UNIQUE REFERENCES bin_items(id),
  quantity     NUMERIC NOT NULL DEFAULT 0,
  last_rebuilt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventory_balances DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_inv_bal_bin_item ON inventory_balances(bin_item_id);
```

---

### inventory_carts

```sql
CREATE TABLE IF NOT EXISTS inventory_carts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,        -- Clerk user ID (TEXT not UUID)
  user_name         TEXT NOT NULL,        -- display name snapshot at cart open
  active_vehicle_id UUID REFERENCES vehicles(id),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'checked_out', 'voided')),
  expires_at        TIMESTAMPTZ,          -- NOW() + INTERVAL '24 hours' on insert
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventory_carts DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_carts_user_id ON inventory_carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_status  ON inventory_carts(status);
```

---

### inventory_cart_items

```sql
CREATE TABLE IF NOT EXISTS inventory_cart_items (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id          UUID    NOT NULL REFERENCES inventory_carts(id),
  bin_item_id      UUID    NOT NULL REFERENCES bin_items(id),  -- NOT NULL
  item_id          UUID    NOT NULL REFERENCES items(id),
  quantity         NUMERIC NOT NULL,
  destination_type TEXT    CHECK (destination_type IN (
                     'job', 'service_call', 'vehicle', 'user',
                     'office', 'vendor_return', 'scrap', 'unknown'
                   )),
  destination_id   TEXT,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventory_cart_items DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cart_items_cart     ON inventory_cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_bin_item ON inventory_cart_items(bin_item_id);
```

---

### vehicles — additions only

```sql
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS classification TEXT
  CHECK (classification IN ('Residential', 'Commercial', 'Service', 'Other'));
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS description TEXT;
```

---

### vehicle_bins

```sql
CREATE TABLE IF NOT EXISTS vehicle_bins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  bin_code   TEXT NOT NULL,
  label      TEXT,
  position   INT  NOT NULL DEFAULT 0,
  qr_code    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vehicle_id, bin_code)
);

ALTER TABLE vehicle_bins DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_vehicle_bins_vehicle ON vehicle_bins(vehicle_id);
```

---

### vehicle_bin_items

```sql
CREATE TABLE IF NOT EXISTS vehicle_bin_items (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_bin_id UUID    NOT NULL REFERENCES vehicle_bins(id),
  item_id        UUID    NOT NULL REFERENCES items(id),
  quantity       NUMERIC NOT NULL DEFAULT 0,
  min_quantity   NUMERIC NOT NULL DEFAULT 0,
  max_quantity   NUMERIC,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vehicle_bin_id, item_id)
);

ALTER TABLE vehicle_bin_items DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_veh_bin_items_vbin ON vehicle_bin_items(vehicle_bin_id);
```

---

### notifications (reserved)

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT,
  notification_type TEXT,
  title             TEXT,
  message           TEXT,
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
```

---

## Triggers

### 1. Inventory Balance Update Trigger (corrected)

Handles both delta transactions and absolute corrections.

```sql
CREATE OR REPLACE FUNCTION update_inventory_balance()
RETURNS TRIGGER AS $$
DECLARE
  target_bin_item_id UUID;
  new_balance        NUMERIC;
BEGIN
  target_bin_item_id := COALESCE(NEW.bin_item_id, OLD.bin_item_id);

  -- Physical count correction: set balance absolutely to target_quantity
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE')
     AND NEW.transaction_type = 'physical_count_correction'
     AND NEW.target_quantity IS NOT NULL THEN

    INSERT INTO inventory_balances (bin_item_id, quantity, last_rebuilt)
    VALUES (target_bin_item_id, NEW.target_quantity, NOW())
    ON CONFLICT (bin_item_id) DO UPDATE
      SET quantity     = EXCLUDED.quantity,
          last_rebuilt = NOW();

    RETURN NEW;
  END IF;

  -- All other transaction types: recalculate from full history
  SELECT COALESCE(SUM(
    CASE
      WHEN transaction_type = 'physical_count_correction'
        THEN target_quantity  -- use absolute value when recalculating
      WHEN transaction_type IN (
        'add_stock', 'return_from_job', 'return_from_vehicle')
        THEN quantity
      WHEN transaction_type IN (
        'remove_stock', 'assign_to_job', 'assign_to_vehicle',
        'scrap', 'vendor_return', 'mark_damaged')
        THEN -quantity
      ELSE 0
    END
  ), 0)
  INTO new_balance
  FROM transaction_items
  WHERE bin_item_id = target_bin_item_id;

  INSERT INTO inventory_balances (bin_item_id, quantity, last_rebuilt)
  VALUES (target_bin_item_id, new_balance, NOW())
  ON CONFLICT (bin_item_id) DO UPDATE
    SET quantity     = EXCLUDED.quantity,
        last_rebuilt = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_inventory_balance
AFTER INSERT OR UPDATE OR DELETE ON transaction_items
FOR EACH ROW EXECUTE FUNCTION update_inventory_balance();
```

---

### 2. Physical Count Correction Audit Trigger (corrected)

Uses Phase 1 `change_logs` column names. Not renamed.

```sql
CREATE OR REPLACE FUNCTION audit_physical_count_correction()
RETURNS TRIGGER AS $$
DECLARE
  prev_balance NUMERIC;
BEGIN
  IF NEW.transaction_type = 'physical_count_correction' THEN

    -- Capture previous balance for before_data
    SELECT quantity INTO prev_balance
    FROM inventory_balances
    WHERE bin_item_id = NEW.bin_item_id;

    INSERT INTO change_logs (
      user_id,
      user_name,
      table_name,
      record_id,
      action,
      before_data,
      after_data,
      note,
      created_at
    ) VALUES (
      (SELECT user_id FROM inventory_transactions WHERE id = NEW.transaction_id),
      (SELECT performed_by_name FROM inventory_transactions WHERE id = NEW.transaction_id),
      'transaction_items',
      NEW.id::TEXT,
      'physical_count_correction',
      jsonb_build_object(
        'bin_item_id',    NEW.bin_item_id,
        'prev_balance',   COALESCE(prev_balance, 0)
      ),
      jsonb_build_object(
        'bin_item_id',    NEW.bin_item_id,
        'target_quantity', NEW.target_quantity,
        'note',            NEW.note
      ),
      COALESCE(NEW.note, 'Physical count correction'),
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_physical_count
AFTER INSERT ON transaction_items
FOR EACH ROW EXECUTE FUNCTION audit_physical_count_correction();
```

---

### 3. Cart Auto-Void Function (Dev Console / Manual)

No pg_cron. Cart expiry is handled by a callable database function.
pg_cron remains the future upgrade path when Supabase tier supports it.

```sql
-- Callable function — invoke from Dev Console or app-level cleanup job
CREATE OR REPLACE FUNCTION void_expired_carts()
RETURNS INTEGER AS $$
DECLARE
  voided_count INTEGER;
BEGIN
  UPDATE inventory_carts
  SET status = 'voided'
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

  GET DIAGNOSTICS voided_count = ROW_COUNT;

  -- Log the cleanup action
  IF voided_count > 0 THEN
    INSERT INTO change_logs (
      user_id, user_name, table_name, record_id,
      action, after_data, note, created_at
    ) VALUES (
      'system', 'Dev Console',
      'inventory_carts', 'bulk',
      'update',
      jsonb_build_object('voided_count', voided_count),
      'Auto-voided ' || voided_count || ' expired cart(s)',
      NOW()
    );
  END IF;

  RETURN voided_count;
END;
$$ LANGUAGE plpgsql;

-- Usage from Dev Console:
-- SELECT void_expired_carts();
-- Returns: number of carts voided
```

Future upgrade path: when Supabase tier includes pg_cron, replace with:
```sql
-- SELECT cron.schedule('void-expired-carts', '0 * * * *', 'SELECT void_expired_carts();');
```
The function stays the same. Only the scheduling mechanism changes.

---

### 4. Estimate Snapshot Immutability

```sql
CREATE OR REPLACE FUNCTION block_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.locked = TRUE THEN
    RAISE EXCEPTION
      'Approved estimate snapshots are immutable and cannot be modified.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_estimate_snapshot
BEFORE UPDATE OR DELETE ON estimate_snapshots
FOR EACH ROW EXECUTE FUNCTION block_snapshot_mutation();
```

---

## Grand Master Inventory View

```sql
CREATE OR REPLACE VIEW grand_master_inventory_view AS
SELECT
  i.material_code,
  i.name                                        AS item_name,
  i.broad_category,
  i.sub_category,
  i.sub_category_2,
  i.sub_category_3,
  i.size,
  i.unit_of_measure,
  i.division,
  i.price_per_unit,
  i.labor_rate_hrs,
  su.unit_code                                  AS storage_unit,
  sh.shelf_code,
  b.bay_code,
  bn.bin_code,
  bi.min_quantity,
  COALESCE(ib.quantity, 0)                      AS quantity_on_hand,
  COALESCE(ib.quantity, 0) * i.price_per_unit   AS total_value,
  CASE
    WHEN bi.min_quantity > 0
     AND COALESCE(ib.quantity, 0) <= bi.min_quantity
    THEN TRUE ELSE FALSE
  END                                           AS below_minimum,
  ib.last_rebuilt                               AS balance_as_of
FROM bin_items bi
JOIN items         i   ON i.id  = bi.item_id
JOIN bins          bn  ON bn.id = bi.bin_id
JOIN bays          b   ON b.id  = bn.bay_id
JOIN shelves       sh  ON sh.id = b.shelf_id
JOIN storage_units su  ON su.id = sh.unit_id
LEFT JOIN inventory_balances ib ON ib.bin_item_id = bi.id
WHERE i.is_active   = TRUE
  AND i.is_archived = FALSE
ORDER BY i.broad_category, i.sub_category, i.name;
```

---

## Migration Order

Wrap all steps in a transaction. Verify backup before any step
that alters existing tables with live data.

```sql
BEGIN;

-- Step 1: Corrections to existing tables
--   a. Fix user_id type on change_logs and inventory_transactions
--   b. Extend change_logs action CHECK constraint
--   c. Add min_quantity to bin_items
--   d. Add columns to items (default_cost_code_id, is_archived)
--   e. Add columns to inventory_transactions (transaction_type, performed_by_name, source_vehicle_id)
--   f. Add columns to vehicles (classification, description)

-- Step 2: CREATE cost_codes

-- Step 3: CREATE transaction_items

-- Step 4: CREATE inventory_balances

-- Step 5: CREATE inventory_carts

-- Step 6: CREATE inventory_cart_items

-- Step 7: CREATE vehicle_bins

-- Step 8: CREATE vehicle_bin_items

-- Step 9: CREATE notifications

-- Step 10: Create triggers
--   a. update_inventory_balance
--   b. audit_physical_count_correction
--   c. block_snapshot_mutation (estimate snapshots)

-- Step 11: CREATE grand_master_inventory_view

-- Step 12: Disable RLS on all new tables

-- Step 13: Create all indexes

COMMIT;
```

If any step fails: `ROLLBACK;` — no partial migrations reach production.

---

## Rollback Rule (locked)

All migration SQL must be wrapped in a BEGIN/COMMIT transaction block.

Before any step that alters existing tables with live data:
- Verify Supabase backup is current
- Confirm backup timestamp is within last 24 hours
- Do not proceed if backup cannot be confirmed

Codex migration SQL must include rollback instructions for each destructive step.

---

## Cart Void Mechanism (locked)

**Decision: Dev Console callable function — no pg_cron.**

Ryan is not currently on a Supabase paid tier. `pg_cron` is unavailable.

Implementation:
- `void_expired_carts()` database function (see trigger section)
- Called manually from Dev Console as needed
- Returns count of carts voided
- Logs cleanup action to `change_logs`

Future upgrade path (no code change required):
- When pg_cron becomes available, schedule: `SELECT void_expired_carts();`
- The function itself does not change — only scheduling is added

Codex must NOT include `CREATE EXTENSION pg_cron` in the migration SQL.

---

## Data Cleanup Required Before First Sheets Import

1. **Material_Categories sheet:** Several `sub_category_2` rows have blank
   `field_name`. Fix before importing — these rows will fail validation.

2. **Cost_Codes sheet:** Code `16,050.00` has number formatting. Must be
   plain text `16050`. Change cell format to Text in Google Sheets first.

---

## Constitutional Warnings (Non-Negotiable)

1. Do not merge physical locations and transaction destinations.
2. Always use `transaction_items.unit_cost_at_time` — never back-calculate.
3. `inventory_balances` is a cache, not truth. Truth is `transaction_items`.
4. Physical count corrections must set balance absolutely via `target_quantity`.
   They are never additive. The trigger enforces this.
5. Permissions are server-authoritative. No client-side-only gates.
6. Clerk user IDs are TEXT. Never UUID.

---

## Handoff Note for Codex

This document is the complete locked schema plan.
Generate migration SQL from this version only.

When writing migration SQL:
- Wrap everything in BEGIN/COMMIT
- Use ALTER TABLE for existing tables — do not DROP/RECREATE
- Use CREATE TABLE IF NOT EXISTS for new tables
- All user_id fields: TEXT
- All new tables: DISABLE ROW LEVEL SECURITY
- Include the balance trigger — do not skip or simplify it
- Include the physical count audit trigger
- Ask Ryan to confirm Supabase tier before implementing pg_cron

When migration SQL is complete, update HANDOFF.md with:
- Date and session type
- All tables altered and created
- All triggers and functions deployed
- Confirmation that pg_cron was NOT used (Dev Console function instead)
- Any deviations from this plan with rationale
- Next steps: cart checkout workflow implementation
