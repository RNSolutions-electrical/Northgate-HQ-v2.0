BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Phase 1 Inventory migration generated from docs/INVENTORY_SCHEMA.md v2.3.
-- Do not run until Ryan/ChatGPT final review is complete.

-- ---------------------------------------------------------------------------
-- Core catalog and reference tables
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

ALTER TABLE cost_codes DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS vendors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vendors DISABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_name_unique_lower
ON vendors (LOWER(name));

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
  labor_rate_hrs       NUMERIC,
  default_min_qty      NUMERIC,
  description          TEXT,
  default_cost_code_id UUID REFERENCES cost_codes(id),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  is_archived          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ
);

ALTER TABLE items DISABLE ROW LEVEL SECURITY;

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS default_cost_code_id UUID REFERENCES cost_codes(id);

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS storage_units (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_code  TEXT NOT NULL UNIQUE,
  name       TEXT,
  division   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE storage_units DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS shelves (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id    UUID NOT NULL REFERENCES storage_units(id),
  shelf_code TEXT NOT NULL,
  label      TEXT,
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, shelf_code)
);

ALTER TABLE shelves DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS bays (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shelf_id   UUID NOT NULL REFERENCES shelves(id),
  bay_code   TEXT NOT NULL,
  label      TEXT,
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shelf_id, bay_code)
);

ALTER TABLE bays DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS bins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bay_id     UUID NOT NULL REFERENCES bays(id),
  bin_code   TEXT NOT NULL,
  label      TEXT,
  position   INT NOT NULL DEFAULT 0,
  qr_code    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bay_id, bin_code)
);

ALTER TABLE bins DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS bin_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bin_id       UUID NOT NULL REFERENCES bins(id),
  item_id      UUID NOT NULL REFERENCES items(id),
  min_quantity NUMERIC NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bin_id, item_id)
);

ALTER TABLE bin_items DISABLE ROW LEVEL SECURITY;

ALTER TABLE bin_items
  ADD COLUMN IF NOT EXISTS min_quantity NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bin_items_bin ON bin_items(bin_id);
CREATE INDEX IF NOT EXISTS idx_bin_items_item ON bin_items(item_id);

-- ---------------------------------------------------------------------------
-- Existing Phase 1 table corrections
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS change_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT,
  user_name   TEXT,
  table_name  TEXT NOT NULL,
  record_id   TEXT,
  action      TEXT NOT NULL,
  before_data JSONB,
  after_data  JSONB,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE change_logs DISABLE ROW LEVEL SECURITY;

ALTER TABLE change_logs
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

ALTER TABLE change_logs DROP CONSTRAINT IF EXISTS change_logs_action_check;

ALTER TABLE change_logs ADD CONSTRAINT change_logs_action_check
  CHECK (action IN (
    'create', 'update', 'delete', 'restore',
    'import', 'permission_change', 'physical_count_correction'
  ));

CREATE TABLE IF NOT EXISTS vehicles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_number TEXT UNIQUE,
  name           TEXT,
  classification TEXT CHECK (classification IN ('Residential', 'Commercial', 'Service', 'Other')),
  description    TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vehicles DISABLE ROW LEVEL SECURITY;

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS classification TEXT
  CHECK (classification IN ('Residential', 'Commercial', 'Service', 'Other'));

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS description TEXT;

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type  TEXT NOT NULL,
  user_id           TEXT,
  performed_by_name TEXT,
  source_vehicle_id UUID REFERENCES vehicles(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventory_transactions DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_transactions'
      AND column_name = 'performed_by_user_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_transactions'
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE inventory_transactions
      RENAME COLUMN performed_by_user_id TO user_id;
  END IF;
END;
$$;

ALTER TABLE inventory_transactions
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS transaction_type TEXT,
  ADD COLUMN IF NOT EXISTS performed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS source_vehicle_id UUID REFERENCES vehicles(id);

ALTER TABLE inventory_transactions DROP COLUMN IF EXISTS status;

-- ---------------------------------------------------------------------------
-- Inventory transaction and balance tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS transaction_items (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_sequence   BIGINT  GENERATED ALWAYS AS IDENTITY,
  transaction_id    UUID    NOT NULL REFERENCES inventory_transactions(id),
  bin_item_id       UUID    NOT NULL REFERENCES bin_items(id),
  item_id           UUID    NOT NULL REFERENCES items(id),
  quantity          NUMERIC NOT NULL,
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
  occurred_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transaction_items_approved_requires_occurred_at
    CHECK (
      status <> 'approved'
      OR occurred_at IS NOT NULL
    )
);

ALTER TABLE transaction_items DISABLE ROW LEVEL SECURITY;

ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS ledger_sequence BIGINT GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN IF NOT EXISTS target_quantity NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS unit_cost_at_time NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS destination_type TEXT CHECK (destination_type IN (
    'job', 'service_call', 'vehicle', 'user',
    'office', 'vendor_return', 'scrap', 'unknown'
  )),
  ADD COLUMN IF NOT EXISTS destination_id TEXT,
  ADD COLUMN IF NOT EXISTS cost_code_id UUID REFERENCES cost_codes(id),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transaction_items_approved_requires_occurred_at'
      AND conrelid = 'transaction_items'::regclass
  ) THEN
    ALTER TABLE transaction_items
      ADD CONSTRAINT transaction_items_approved_requires_occurred_at
      CHECK (
        status <> 'approved'
        OR occurred_at IS NOT NULL
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_txn_items_transaction  ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_txn_items_bin_item     ON transaction_items(bin_item_id);
CREATE INDEX IF NOT EXISTS idx_txn_items_item         ON transaction_items(item_id);
CREATE INDEX IF NOT EXISTS idx_txn_items_destination  ON transaction_items(destination_type, destination_id);
CREATE INDEX IF NOT EXISTS idx_txn_items_status       ON transaction_items(status);
CREATE INDEX IF NOT EXISTS idx_txn_items_bin_status_ledger
  ON transaction_items(bin_item_id, status, ledger_sequence);
CREATE INDEX IF NOT EXISTS idx_txn_items_bin_status_occurred_ledger
  ON transaction_items(bin_item_id, status, occurred_at, ledger_sequence);

CREATE TABLE IF NOT EXISTS inventory_balances (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  bin_item_id  UUID    NOT NULL UNIQUE REFERENCES bin_items(id),
  quantity     NUMERIC NOT NULL DEFAULT 0,
  last_rebuilt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventory_balances DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_inv_bal_bin_item ON inventory_balances(bin_item_id);

CREATE TABLE IF NOT EXISTS inventory_carts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  user_name         TEXT NOT NULL,
  active_vehicle_id UUID REFERENCES vehicles(id),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'checked_out', 'voided')),
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventory_carts DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_carts_user_id ON inventory_carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_status  ON inventory_carts(status);

CREATE TABLE IF NOT EXISTS inventory_cart_items (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id          UUID    NOT NULL REFERENCES inventory_carts(id),
  bin_item_id      UUID    NOT NULL REFERENCES bin_items(id),
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

-- ---------------------------------------------------------------------------
-- Vehicle stock tables
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Notifications and reserved utility tables
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Triggers and utility functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_inventory_balance()
RETURNS TRIGGER AS $$
DECLARE
  target_bin_item_id UUID;
  target_bin_item_ids UUID[];
  raw_target_bin_item_ids UUID[];
  new_balance NUMERIC;
  latest_correction_sequence BIGINT;
  latest_correction_occurred_at TIMESTAMPTZ;
  latest_target_quantity NUMERIC;
BEGIN
  /*
    Build a sorted, deduplicated list of affected bin_item_ids.

    Sorting matters because advisory transaction locks are held until COMMIT.
    If an UPDATE changes bin_item_id, two bins may need to be rebuilt.
    Locking them in deterministic order prevents opposite-direction updates
    from deadlocking.
  */
  IF TG_OP = 'INSERT' THEN
    raw_target_bin_item_ids := ARRAY[NEW.bin_item_id];
  ELSIF TG_OP = 'DELETE' THEN
    raw_target_bin_item_ids := ARRAY[OLD.bin_item_id];
  ELSE
    raw_target_bin_item_ids := ARRAY[OLD.bin_item_id, NEW.bin_item_id];
  END IF;

  SELECT ARRAY_AGG(DISTINCT affected_bin_item_id ORDER BY affected_bin_item_id)
  INTO target_bin_item_ids
  FROM UNNEST(raw_target_bin_item_ids) AS affected_bin_item_id
  WHERE affected_bin_item_id IS NOT NULL;

  IF target_bin_item_ids IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOREACH target_bin_item_id IN ARRAY target_bin_item_ids LOOP
    /*
      Serialize balance recomputes per bin item.

      This prevents two concurrent approved movements for the same bin_item_id
      from each recomputing without seeing the other's uncommitted row.
    */
    PERFORM pg_advisory_xact_lock(hashtext(target_bin_item_id::text));

    latest_correction_sequence := NULL;
    latest_correction_occurred_at := NULL;
    latest_target_quantity := NULL;
    new_balance := 0;

    SELECT ti.ledger_sequence, ti.occurred_at, ti.target_quantity
    INTO latest_correction_sequence, latest_correction_occurred_at, latest_target_quantity
    FROM transaction_items ti
    WHERE ti.bin_item_id = target_bin_item_id
      AND ti.status = 'approved'
      AND ti.transaction_type = 'physical_count_correction'
      AND ti.target_quantity IS NOT NULL
    ORDER BY ti.occurred_at DESC, ti.ledger_sequence DESC
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
        AND (
          ti.occurred_at > latest_correction_occurred_at
          OR (
            ti.occurred_at = latest_correction_occurred_at
            AND ti.ledger_sequence > latest_correction_sequence
          )
        );
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
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_inventory_balance ON transaction_items;

CREATE TRIGGER trg_update_inventory_balance
AFTER INSERT OR UPDATE OR DELETE ON transaction_items
FOR EACH ROW EXECUTE FUNCTION update_inventory_balance();

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
        'bin_item_id',  NEW.bin_item_id,
        'prev_balance', COALESCE(prev_balance, 0)
      ),
      jsonb_build_object(
        'bin_item_id',      NEW.bin_item_id,
        'target_quantity',  NEW.target_quantity,
        'note',             NEW.note
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

CREATE OR REPLACE FUNCTION block_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.locked = TRUE THEN
    RAISE EXCEPTION
      'Approved estimate snapshots are immutable and cannot be modified.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
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
-- Grand Master Inventory view
-- ---------------------------------------------------------------------------

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

COMMIT;
