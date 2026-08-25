CREATE OR REPLACE FUNCTION public.validate_approved_change_order_allocations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  allocation_total NUMERIC;
BEGIN
  IF NEW.status = 'approved' THEN
    SELECT COALESCE(SUM(amount), 0)
      INTO allocation_total
      FROM public.change_order_allocations
     WHERE change_order_id = NEW.id;

    IF allocation_total <> COALESCE(NEW.price_amount, 0) THEN
      RAISE EXCEPTION 'approved change-order allocations must equal the approved price';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_approved_change_order_allocations ON public.change_orders;
CREATE TRIGGER validate_approved_change_order_allocations
BEFORE UPDATE OF status, price_amount ON public.change_orders
FOR EACH ROW EXECUTE FUNCTION public.validate_approved_change_order_allocations();

REVOKE ALL ON FUNCTION public.validate_approved_change_order_allocations() FROM PUBLIC, anon, authenticated;
