REVOKE EXECUTE ON FUNCTION public.read_developer_permission_console() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_permission_override_long_term(UUID, TEXT) FROM anon;

GRANT EXECUTE ON FUNCTION public.read_developer_permission_console() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_permission_override_long_term(UUID, TEXT) TO authenticated;
