-- Northgate HQ v2.0 - Phase 1 Inventory Schema
-- Source: docs/INVENTORY_SCHEMA.md v2.3
-- Notes:
--   - No pg_cron is used. Cart cleanup is exposed through void_expired_carts().
--   - All user_id columns are TEXT for Clerk user IDs.
--   - Existing Phase 1 columns are preserved; this migration is additive.
--   - Before running against live data, verify the Supabase backup is current.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Phase 1 foundation tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cost_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  category   TEXT,
  division   TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS material_categories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broad_category TEXT NOT NULL,
  sub_category   TEXT,
  sub_category_2 TEXT,
  sub_category_3 TEXT,
  sub_category_4 TEXT,
  field_name     TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_code        TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  broad_category       TEXT,
  sub_category         TEXT,
  sub_category_2       TEXT,
  sub_category_3       TEXT,
  sub_category_4       TEXT,
  size                 TEXT,
  length               TEXT,
  manufacturer         TEXT,
  manufacturer_sub     TEXT,
  unit_of_measure      TEXT,
  division             TEXT,
  price_per_unit       NUMERIC NOT NULL DEFAULT 0,
  lot_price            NUMERIC,
  lot_size             NUMERIC,
  labor_rate_hrs       NUMERIC NOT NULL DEFAULT 0,
  default_min_qty      NUMERIC NOT NULL DEFAULT 0,
  description          TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  default_cost_code_id UUID REFERENCES cost_codes(id),
  is_archived          BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS storage_units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_code   TEXT NOT NULL UNIQUE,
  name        TEXT,
  description TEXT,
  qr_code     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shelves (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id    UUID NOT NULL REFERENCES storage_units(id),
  shelf_code TEXT NOT NULL,
  label      TEXT,
  position   INT NOT NULL DEFAULT 0,
  qr_code    TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, shelf_code)
);

CREATE TABLE IF NOT EXISTS bays (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shelf_id   UUID NOT NULL REFERENCES shelves(id),
  bay_code   TEXT NOT NULL,
  label      TEXT,
  position   INT NOT NULL DEFAULT 0,
  qr_code    TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shelf_id, bay_code)
);

CREATE TABLE IF NOT EXISTS bins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bay_id     UUID NOT NULL REFERENCES bays(id),
  bin_code   TEXT NOT NULL,
  label      TEXT,
  position   INT NOT NULL DEFAULT 0,
  qr_code    TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bay_id, bin_code)
);

CREATE TABLE IF NOT EXISTS bin_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bin_id       UUID NOT NULL REFERENCES bins(id),
  item_id      UUID NOT NULL REFERENCES items(id),
  min_quantity NUMERIC NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bin_id, item_id)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_code   TEXT UNIQUE,
  name           TEXT,
  make           TEXT,
  model          TEXT,
  year           INT,
  vin            TEXT,
  license_plate  TEXT,
  division       TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  classification TEXT CHECK (classification IN ('Residential', 'Commercial', 'Service', 'Other')),
  description    TEXT
);

CREATE TABLE IF NOT EXISTS change_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT,
  user_name   TEXT,
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  before_data JSONB,
  after_data  JSONB,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type  TEXT NOT NULL,
  user_id           TEXT,
  performed_by_name TEXT,
  source_vehicle_id UUID REFERENCES vehicles(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Additive corrections for existing Phase 1 tables
-- ---------------------------------------------------------------------------

ALTER TABLE change_logs
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT,
  ALTER COLUMN record_id TYPE TEXT USING record_id::TEXT;

ALTER TABLE change_logs DROP CONSTRAINT IF EXISTS change_logs_action_check;
ALTER TABLE change_logs ADD CONSTRAINT change_logs_action_check
  CHECK (action IN (
    'create', 'update', 'delete', 'restore',
    'import', 'permission_change', 'physical_count_correction'
  ));

ALTER TABLE inventory_transactions
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

ALTER TABLE bin_items
  ADD COLUMN IF NOT EXISTS min_quantity NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS default_cost_code_id UUID REFERENCES cost_codes(id),
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS transaction_type TEXT,
  ADD COLUMN IF NOT EXISTS performed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS source_vehicle_id UUID REFERENCES vehicles(id);

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS classification TEXT CHECK (classification IN ('Residential', 'Commercial', 'Service', 'Other')),
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Ensure the locked header field is required after any older partial draft is corrected.
ALTER TABLE inventory_transactions
  ALTER COLUMN transaction_type SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Inventory extension tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS transaction_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    UUID NOT NULL REFERENCES inventory_transactions(id),
  bin_item_id       UUID NOT NULL REFERENCES bin_items(id),
  item_id           UUID NOT NULL REFERENCES items(id),
  quantity          NUMERIC NOT NULL,
  target_quantity   NUMERIC DEFAULT NULL,
  unit_cost_at_time NUMERIC NOT NULL DEFAULT 0,
  transaction_type  TEXT NOT NULL,
  destination_type  TEXT CHECK (destination_type IN (
                      'job', 'service_call', 'vehicle', 'user',
                      'office', 'vendor_return', 'scrap', 'unknown'
                    )),
  destination_id    TEXT,
  cost_code_id      UUID REFERENCES cost_codes(id),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_balances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bin_item_id  UUID NOT NULL UNIQUE REFERENCES bin_items(id),
  quantity     NUMERIC NOT NULL DEFAULT 0,
  last_rebuilt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_carts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  user_name         TEXT NOT NULL,
  active_vehicle_id UUID REFERENCES vehicles(id),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'checked_out', 'voided')),
  expires_at        TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_cart_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id          UUID NOT NULL REFERENCES inventory_carts(id),
  bin_item_id      UUID NOT NULL REFERENCES bin_items(id),
  item_id          UUID NOT NULL REFERENCES items(id),
  quantity         NUMERIC NOT NULL,
  destination_type TEXT CHECK (destination_type IN (
                     'job', 'service_call', 'vehicle', 'user',
                     'office', 'vendor_return', 'scrap', 'unknown'
                   )),
  destination_id   TEXT,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicle_bins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  bin_code   TEXT NOT NULL,
  label      TEXT,
  position   INT NOT NULL DEFAULT 0,
  qr_code    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vehicle_id, bin_code)
);

CREATE TABLE IF NOT EXISTS vehicle_bin_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_bin_id UUID NOT NULL REFERENCES vehicle_bins(id),
  item_id        UUID NOT NULL REFERENCES items(id),
  quantity       NUMERIC NOT NULL DEFAULT 0,
  min_quantity   NUMERIC NOT NULL DEFAULT 0,
  max_quantity   NUMERIC,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vehicle_bin_id, item_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT,
  notification_type TEXT,
  title             TEXT,
  message           TEXT,
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- RLS policy for this phase: disabled on new inventory tables
-- ---------------------------------------------------------------------------

ALTER TABLE cost_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_carts DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_cart_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_bins DISABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_bin_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_items_material_code ON items(material_code);
CREATE INDEX IF NOT EXISTS idx_items_categories ON items(broad_category, sub_category, sub_category_2, sub_category_3);
CREATE INDEX IF NOT EXISTS idx_shelves_unit ON shelves(unit_id);
CREATE INDEX IF NOT EXISTS idx_bays_shelf ON bays(shelf_id);
CREATE INDEX IF NOT EXISTS idx_bins_bay ON bins(bay_id);
CREATE INDEX IF NOT EXISTS idx_bin_items_bin ON bin_items(bin_id);
CREATE INDEX IF NOT EXISTS idx_bin_items_item ON bin_items(item_id);
CREATE INDEX IF NOT EXISTS idx_change_logs_table_record ON change_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_change_logs_user_id ON change_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_user_id ON inventory_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_created_at ON inventory_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_txn_items_transaction ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_txn_items_bin_item ON transaction_items(bin_item_id);
CREATE INDEX IF NOT EXISTS idx_txn_items_item ON transaction_items(item_id);
CREATE INDEX IF NOT EXISTS idx_txn_items_destination ON transaction_items(destination_type, destination_id);
CREATE INDEX IF NOT EXISTS idx_txn_items_status ON transaction_items(status);
CREATE INDEX IF NOT EXISTS idx_inv_bal_bin_item ON inventory_balances(bin_item_id);
CREATE INDEX IF NOT EXISTS idx_carts_user_id ON inventory_carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_status ON inventory_carts(status);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON inventory_cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_bin_item ON inventory_cart_items(bin_item_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_bins_vehicle ON vehicle_bins(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_veh_bin_items_vbin ON vehicle_bin_items(vehicle_bin_id);

-- ---------------------------------------------------------------------------
-- Inventory balance trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_inventory_balance()
RETURNS TRIGGER AS $$
DECLARE
  target_bin_item_id      UUID;
  new_balance             NUMERIC;
  latest_correction_at    TIMESTAMPTZ;
  latest_target_quantity  NUMERIC;
BEGIN
  target_bin_item_id := COALESCE(NEW.bin_item_id, OLD.bin_item_id);

  SELECT ti.created_at, ti.target_quantity
  INTO latest_correction_at, latest_target_quantity
  FROM transaction_items ti
  WHERE ti.bin_item_id = target_bin_item_id
    AND ti.transaction_type = 'physical_count_correction'
    AND ti.target_quantity IS NOT NULL
  ORDER BY ti.created_at DESC, ti.id DESC
  LIMIT 1;

  IF latest_correction_at IS NOT NULL THEN
    SELECT latest_target_quantity + COALESCE(SUM(
      CASE
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
    WHERE bin_item_id = target_bin_item_id
      AND transaction_type <> 'physical_count_correction'
      AND created_at > latest_correction_at;
  ELSE
    SELECT COALESCE(SUM(
      CASE
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
    WHERE bin_item_id = target_bin_item_id
      AND transaction_type <> 'physical_count_correction';
  END IF;

  INSERT INTO inventory_balances (bin_item_id, quantity, last_rebuilt)
  VALUES (target_bin_item_id, new_balance, NOW())
  ON CONFLICT (bin_item_id) DO UPDATE
    SET quantity = EXCLUDED.quantity,
        last_rebuilt = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_inventory_balance ON transaction_items;
CREATE TRIGGER trg_update_inventory_balance
AFTER INSERT OR UPDATE OR DELETE ON transaction_items
FOR EACH ROW EXECUTE FUNCTION update_inventory_balance();

-- ---------------------------------------------------------------------------
-- Physical count correction audit trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_physical_count_correction()
RETURNS TRIGGER AS $$
DECLARE
  prev_balance NUMERIC;
BEGIN
  IF NEW.transaction_type = 'physical_count_correction' THEN
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
        'bin_item_id', NEW.bin_item_id,
        'prev_balance', COALESCE(prev_balance, 0)
      ),
      jsonb_build_object(
        'bin_item_id', NEW.bin_item_id,
        'target_quantity', NEW.target_quantity,
        'note', NEW.note
      ),
      COALESCE(NEW.note, 'Physical count correction'),
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_physical_count ON transaction_items;
CREATE TRIGGER trg_audit_physical_count
AFTER INSERT ON transaction_items
FOR EACH ROW EXECUTE FUNCTION audit_physical_count_correction();

-- ---------------------------------------------------------------------------
-- Cart auto-void function. Callable from Dev Console or app cleanup.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Estimate snapshot immutability trigger
-- The trigger is attached when estimate_snapshots exists. The function is
-- present now so the same migration is safe before or after estimating tables.
-- ---------------------------------------------------------------------------

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

DO $$
BEGIN
  IF to_regclass('public.estimate_snapshots') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_protect_estimate_snapshot ON estimate_snapshots;
    CREATE TRIGGER trg_protect_estimate_snapshot
    BEFORE UPDATE OR DELETE ON estimate_snapshots
    FOR EACH ROW EXECUTE FUNCTION block_snapshot_mutation();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grand Master Inventory View
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW grand_master_inventory_view AS
SELECT
  i.material_code,
  i.name AS item_name,
  i.broad_category,
  i.sub_category,
  i.sub_category_2,
  i.sub_category_3,
  i.size,
  i.unit_of_measure,
  i.division,
  i.price_per_unit,
  i.labor_rate_hrs,
  su.unit_code AS storage_unit,
  sh.shelf_code,
  b.bay_code,
  bn.bin_code,
  bi.min_quantity,
  COALESCE(ib.quantity, 0) AS quantity_on_hand,
  COALESCE(ib.quantity, 0) * i.price_per_unit AS total_value,
  CASE
    WHEN bi.min_quantity > 0
     AND COALESCE(ib.quantity, 0) <= bi.min_quantity
    THEN TRUE ELSE FALSE
  END AS below_minimum,
  ib.last_rebuilt AS balance_as_of
FROM bin_items bi
JOIN items i ON i.id = bi.item_id
JOIN bins bn ON bn.id = bi.bin_id
JOIN bays b ON b.id = bn.bay_id
JOIN shelves sh ON sh.id = b.shelf_id
JOIN storage_units su ON su.id = sh.unit_id
LEFT JOIN inventory_balances ib ON ib.bin_item_id = bi.id
WHERE i.is_active = TRUE
  AND i.is_archived = FALSE
ORDER BY i.broad_category, i.sub_category, i.name;

COMMIT;
