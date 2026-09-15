-- Read-only capture of production ledger triggers, 2026-09-15.
CREATE OR REPLACE FUNCTION public.audit_physical_count_correction()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.update_inventory_balance()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;
