-- Keep authorization, stock locks, ledger writes and function grants unchanged.
DO $migration$
DECLARE
  definition text;
  needle text;
BEGIN
  definition := replace(pg_get_functiondef('public.finalize_inventory_cart(uuid,text,text,text,jsonb)'::regprocedure), E'\r', '');
  needle := $old$    IF p_destination_type = 'unknown'
      AND (p_note IS NULL OR length(trim(p_note)) = 0) THEN
      RAISE EXCEPTION 'note is required for unknown destination';
    END IF;$old$;
  IF strpos(definition, needle) = 0 THEN RAISE EXCEPTION 'Unexpected checkout note precondition'; END IF;
  definition := replace(definition, needle, '');
  needle := $old$COALESCE(NULLIF(trim(line_item ->> 'note'), ''), NULLIF(trim(p_note), ''))$old$;
  IF strpos(definition, needle) = 0 THEN RAISE EXCEPTION 'Unexpected line note expression'; END IF;
  definition := replace(definition, needle, $new$NULLIF(trim(line_item ->> 'note'), '')$new$);
  needle := $old$SELECT ci.id, p_destination_type, NULLIF(trim(p_destination_id), ''), NULLIF(trim(p_note), '')$old$;
  IF strpos(definition, needle) = 0 THEN RAISE EXCEPTION 'Unexpected implicit line expression'; END IF;
  definition := replace(definition, needle, $new$SELECT ci.id, p_destination_type, NULLIF(trim(p_destination_id), ''), NULLIF(trim(ci.note), '')$new$);
  needle := $old$(d.destination_type = 'unknown' AND (d.note IS NULL OR length(trim(d.note)) = 0))$old$;
  IF strpos(definition, needle) = 0 THEN RAISE EXCEPTION 'Unexpected line note validation'; END IF;
  definition := replace(definition, needle, $new$(NULLIF(trim(d.note), '') IS NULL AND NULLIF(trim(p_note), '') IS NULL)$new$);
  definition := replace(definition, $old$COALESCE(NULLIF(trim(p_note), ''), 'Cart checkout')$old$, $new$NULLIF(trim(p_note), '')$new$);
  definition := replace(definition, 'one or more line destinations are invalid', 'Every line needs a valid destination and either a line note or a cart note');
  definition := replace(definition, 'trim(p_note)', $new$btrim(p_note, E' \t\n\r')$new$);
  definition := replace(definition, 'trim(d.note)', $new$btrim(d.note, E' \t\n\r')$new$);
  definition := replace(definition, 'trim(ci.note)', $new$btrim(ci.note, E' \t\n\r')$new$);
  definition := replace(definition, $old$trim(line_item ->> 'note')$old$, $new$btrim(line_item ->> 'note', E' \t\n\r')$new$);
  EXECUTE definition;

  definition := pg_get_functiondef('public.read_inventory_transaction_history(integer,text,text)'::regprocedure);
  needle := $old$COALESCE(NULLIF(ti.note, ''), NULLIF(tx.notes, '')) AS note$old$;
  IF strpos(definition, needle) = 0 THEN RAISE EXCEPTION 'Unexpected history note expression'; END IF;
  definition := replace(definition, needle, $new$NULLIF(concat_ws(E'\n',
      CASE WHEN NULLIF(ti.note, '') IS NOT NULL THEN 'Line: ' || ti.note END,
      CASE WHEN NULLIF(tx.notes, '') IS NOT NULL THEN 'Cart: ' || tx.notes END
    ), '') AS note$new$);
  EXECUTE definition;
END;
$migration$;

-- Route the legacy signature through the same note-coverage validation.
CREATE OR REPLACE FUNCTION public.finalize_inventory_cart(
  p_cart_id uuid, p_destination_type text,
  p_destination_id text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS TABLE(transaction_id uuid, cart_id uuid, transaction_item_count integer,
  status text, checked_out_at timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path TO public, pg_temp
AS $function$
  SELECT * FROM public.finalize_inventory_cart(p_cart_id, p_destination_type,
    p_destination_id, p_note, NULL::jsonb);
$function$;
