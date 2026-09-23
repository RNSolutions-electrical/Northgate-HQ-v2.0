-- Restore authenticated self-read. RLS user_permissions_self_select restricts
-- rows to the JWT subject; no write privileges are granted here.
GRANT SELECT ON TABLE public.user_permissions TO authenticated;
