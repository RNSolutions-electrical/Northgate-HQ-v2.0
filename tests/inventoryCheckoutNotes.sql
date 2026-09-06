-- Execute inside BEGIN/ROLLBACK. Uses small quantities from existing stock,
-- but retains no users, carts, movements, balance changes, or audit records.
INSERT INTO public.user_permissions(clerk_user_id, role, division, is_active)
VALUES ('__checkout_notes_test', 'Developer', 'Admin', true);
SELECT set_config('request.jwt.claims', '{"sub":"__checkout_notes_test","role":"authenticated"}', true);
DO $test$
DECLARE
  sources uuid[];
  c uuid;
  ids uuid[];
  destinations jsonb;
  kind text;
  tx uuid;
  line_notes text[];
  header_note text;
  attempt integer;
  history_note text;
BEGIN
  SELECT array_agg(id) INTO sources FROM (
    SELECT bi.id FROM public.bin_items bi
    JOIN public.inventory_balances ib ON ib.bin_item_id=bi.id
    JOIN public.items i ON i.id=bi.item_id
    WHERE ib.quantity >= 1 AND bi.archived_at IS NULL AND i.is_active AND NOT i.is_archived
    ORDER BY bi.id LIMIT 2
  ) s;
  IF array_length(sources,1) <> 2 THEN RAISE EXCEPTION 'Need two stocked bins for rollback test'; END IF;
  SELECT cart_id INTO c FROM public.open_inventory_cart('__checkout_notes_test');
  PERFORM public.add_inventory_cart_item(c,sources[1],0.01);
  PERFORM public.add_inventory_cart_item(c,sources[2],0.01);
  SELECT array_agg(id ORDER BY id) INTO ids FROM public.inventory_cart_items WHERE cart_id=c;

  FOREACH kind IN ARRAY ARRAY['job','service_call','vehicle','vendor_return','scrap','unknown'] LOOP
    destinations := jsonb_build_array(
      jsonb_build_object('cart_item_id',ids[1],'destination_type',kind,'destination_id',gen_random_uuid(),'note','Line one'),
      jsonb_build_object('cart_item_id',ids[2],'destination_type',kind,'destination_id',gen_random_uuid(),'note','  '));
    BEGIN
      PERFORM public.finalize_inventory_cart(c,kind,NULL,E' \t\n ',destinations);
      RAISE EXCEPTION 'Accepted missing coverage for %',kind;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'Every line needs a valid destination and either a line note or a cart note' THEN RAISE; END IF;
    END;
  END LOOP;

  -- All-line only, all-cart only, both, and a partially noted cart.
  FOR attempt IN 1..4 LOOP
    IF attempt > 1 THEN
      SELECT cart_id INTO c FROM public.open_inventory_cart('__checkout_notes_test');
      PERFORM public.add_inventory_cart_item(c,sources[1],0.01);
      PERFORM public.add_inventory_cart_item(c,sources[2],0.01);
      SELECT array_agg(id ORDER BY id) INTO ids FROM public.inventory_cart_items WHERE cart_id=c;
    END IF;
    header_note := CASE WHEN attempt=1 THEN NULL ELSE 'Cart context '||attempt END;
    line_notes := CASE WHEN attempt=2 THEN ARRAY[NULL::text,NULL::text]
      WHEN attempt=4 THEN ARRAY['Line one',NULL::text] ELSE ARRAY['Line one','Line two'] END;
    destinations := jsonb_build_array(
      jsonb_build_object('cart_item_id',ids[1],'destination_type','unknown','note',line_notes[1]),
      jsonb_build_object('cart_item_id',ids[2],'destination_type','scrap','note',line_notes[2]));
    SELECT transaction_id INTO tx FROM public.finalize_inventory_cart(c,'unknown',NULL,header_note,destinations);
    IF (SELECT notes FROM public.inventory_transactions WHERE id=tx) IS DISTINCT FROM header_note THEN
      RAISE EXCEPTION 'Cart note not preserved'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.inventory_cart_items ci JOIN public.transaction_items ti ON ti.transaction_id=tx AND ti.bin_item_id=ci.bin_item_id
      WHERE ci.cart_id=c AND (ti.note IS DISTINCT FROM CASE WHEN ci.id=ids[1] THEN line_notes[1] ELSE line_notes[2] END)
    ) THEN RAISE EXCEPTION 'Line note overwritten'; END IF;
    SELECT note INTO history_note FROM public.read_inventory_transaction_history(100,NULL,NULL)
      WHERE transaction_id=tx AND bin_item_id=(SELECT bin_item_id FROM public.inventory_cart_items WHERE id=ids[1]);
    IF header_note IS NOT NULL AND strpos(history_note,'Cart: '||header_note)=0 THEN RAISE EXCEPTION 'Missing cart history note'; END IF;
    IF line_notes[1] IS NOT NULL AND strpos(history_note,'Line: '||line_notes[1])=0 THEN RAISE EXCEPTION 'Missing line history note'; END IF;
  END LOOP;
  IF strpos(pg_get_functiondef('public.finalize_inventory_cart(uuid,text,text,text)'::regprocedure),
    'p_destination_id, p_note, NULL::jsonb)')=0 THEN RAISE EXCEPTION 'Legacy wrapper does not delegate'; END IF;
END;
$test$;
