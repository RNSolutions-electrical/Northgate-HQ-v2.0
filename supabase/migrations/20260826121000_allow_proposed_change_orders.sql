ALTER TABLE public.change_orders
  DROP CONSTRAINT change_orders_status_check;

ALTER TABLE public.change_orders
  ADD CONSTRAINT change_orders_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'proposed'::text, 'approved'::text, 'rejected'::text, 'voided'::text]));
