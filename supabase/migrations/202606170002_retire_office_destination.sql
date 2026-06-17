DO $$
DECLARE
  old_def TEXT;
  new_def TEXT;
BEGIN
  old_def := pg_get_functiondef('public.set_inventory_count_quantity(uuid,numeric,text)'::regprocedure);
  new_def := replace(
    old_def,
    $needle$    'physical_count_correction',
    'office',
    NULL,$needle$,
    $replacement$    'physical_count_correction',
    NULL,
    NULL,$replacement$
  );

  IF new_def = old_def THEN
    RAISE EXCEPTION 'Expected set_inventory_count_quantity office destination literal was not found';
  END IF;

  IF new_def ILIKE '%''office''%' THEN
    RAISE EXCEPTION 'Unexpected office literal remains in set_inventory_count_quantity';
  END IF;

  EXECUTE new_def;
END $$;

DO $$
DECLARE
  old_def TEXT;
  new_def TEXT;
BEGIN
  old_def := pg_get_functiondef('public.finalize_inventory_cart(uuid,text,text,text)'::regprocedure);
  new_def := replace(
    old_def,
    $needle$    'job', 'service_call', 'vehicle', 'user', 'office', 'vendor_return', 'scrap', 'unknown'
$needle$,
    $replacement$    'job', 'service_call', 'vehicle', 'user', 'vendor_return', 'scrap', 'unknown'
$replacement$
  );

  IF new_def = old_def THEN
    RAISE EXCEPTION 'Expected finalize_inventory_cart 4-arg office validator literal was not found';
  END IF;

  IF new_def ILIKE '%''office''%' THEN
    RAISE EXCEPTION 'Unexpected office literal remains in finalize_inventory_cart 4-arg';
  END IF;

  EXECUTE new_def;
END $$;

DO $$
DECLARE
  old_def TEXT;
  new_def TEXT;
BEGIN
  old_def := pg_get_functiondef('public.finalize_inventory_cart(uuid,text,text,text,jsonb)'::regprocedure);
  new_def := replace(
    old_def,
    $needle$    'job', 'service_call', 'vehicle', 'user', 'office', 'vendor_return', 'scrap', 'unknown'
$needle$,
    $replacement$    'job', 'service_call', 'vehicle', 'user', 'vendor_return', 'scrap', 'unknown'
$replacement$
  );
  new_def := replace(
    new_def,
    $needle$     OR d.destination_type NOT IN ('job', 'service_call', 'vehicle', 'user', 'office', 'vendor_return', 'scrap', 'unknown')
$needle$,
    $replacement$     OR d.destination_type NOT IN ('job', 'service_call', 'vehicle', 'user', 'vendor_return', 'scrap', 'unknown')
$replacement$
  );

  IF new_def = old_def THEN
    RAISE EXCEPTION 'Expected finalize_inventory_cart 5-arg office validator literals were not found';
  END IF;

  IF new_def ILIKE '%''office''%' THEN
    RAISE EXCEPTION 'Unexpected office literal remains in finalize_inventory_cart 5-arg';
  END IF;

  EXECUTE new_def;
END $$;

DO $$
DECLARE
  old_def TEXT;
  new_def TEXT;
BEGIN
  old_def := pg_get_functiondef('public.read_inventory_transaction_history(integer,text,text)'::regprocedure);
  new_def := replace(
    old_def,
    $needle$      WHEN ti.destination_type IS NULL THEN NULL
      WHEN ti.destination_type = 'office' THEN 'Office'
$needle$,
    $replacement$      WHEN ti.destination_type IS NULL THEN
        CASE ti.transaction_type
          WHEN 'physical_count_correction' THEN 'Count correction'
          WHEN 'add_stock' THEN 'Add stock'
          WHEN 'return_from_job' THEN 'Return to inventory'
          ELSE 'Non-movement'
        END
$replacement$
  );

  IF new_def = old_def THEN
    RAISE EXCEPTION 'Expected read_inventory_transaction_history office label mapping was not found';
  END IF;

  IF new_def ILIKE '%''office''%' THEN
    RAISE EXCEPTION 'Unexpected office literal remains in read_inventory_transaction_history';
  END IF;

  EXECUTE new_def;
END $$;

BEGIN;

DO $$
DECLARE
  unexpected_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO unexpected_count
  FROM public.transaction_items ti
  JOIN public.inventory_transactions it ON it.id = ti.transaction_id
  WHERE ti.destination_type = 'office'
    AND NOT (
      it.transaction_type = 'physical_count_correction'
      OR ti.id IN (
        '7debe811-2c0b-4325-b903-939b88b4e90f',
        '0ff9c7cb-5b88-4d8b-9c53-e7bae787a961',
        'fc0d1ab4-174b-48df-9d5e-9071644a604a'
      )
    );

  IF unexpected_count > 0 THEN
    RAISE EXCEPTION 'ABORT: % unexpected office row(s). Route to Claude.', unexpected_count;
  END IF;
END $$;

UPDATE public.transaction_items
SET destination_type = 'unknown',
    note = COALESCE(note, '') || ' (retired office destination v2.11)'
WHERE id IN (
  '7debe811-2c0b-4325-b903-939b88b4e90f',
  '0ff9c7cb-5b88-4d8b-9c53-e7bae787a961',
  'fc0d1ab4-174b-48df-9d5e-9071644a604a'
)
  AND destination_type = 'office';

UPDATE public.transaction_items ti
SET destination_type = NULL
FROM public.inventory_transactions it
WHERE it.id = ti.transaction_id
  AND ti.destination_type = 'office'
  AND it.transaction_type = 'physical_count_correction';

DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO remaining_count
  FROM public.transaction_items
  WHERE destination_type = 'office';

  IF remaining_count > 0 THEN
    RAISE EXCEPTION 'ABORT: % office row(s) remain.', remaining_count;
  END IF;
END $$;

COMMIT;

BEGIN;

DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO remaining_count
  FROM public.transaction_items
  WHERE destination_type = 'office';

  IF remaining_count > 0 THEN
    RAISE EXCEPTION 'REFUSE: % office row(s) remain.', remaining_count;
  END IF;
END $$;

ALTER TABLE public.transaction_items
DROP CONSTRAINT transaction_items_destination_type_check;

ALTER TABLE public.transaction_items
ADD CONSTRAINT transaction_items_destination_type_check
CHECK (
  destination_type IN (
    'job',
    'service_call',
    'vehicle',
    'user',
    'vendor_return',
    'scrap',
    'unknown'
  )
);

COMMIT;
