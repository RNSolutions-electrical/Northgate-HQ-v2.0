-- Panel Directory uses audited, permission-checking RPCs only. This explicit
-- deny policy documents and preserves that boundary for RLS inspection.
CREATE POLICY panel_directories_no_direct_access ON public.panel_directories
FOR ALL TO authenticated
USING (FALSE)
WITH CHECK (FALSE);
