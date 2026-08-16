DROP POLICY IF EXISTS developer_notes_developer_select ON public.developer_notes;
CREATE POLICY developer_notes_developer_select
ON public.developer_notes
FOR SELECT
TO authenticated
USING (
  (SELECT public.current_user_has_developer_access())
);

DROP POLICY IF EXISTS developer_notes_developer_insert ON public.developer_notes;
CREATE POLICY developer_notes_developer_insert
ON public.developer_notes
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.current_user_has_developer_access())
  AND created_by = ((SELECT auth.jwt()) ->> 'sub')
);

DROP POLICY IF EXISTS developer_notes_developer_update ON public.developer_notes;
CREATE POLICY developer_notes_developer_update
ON public.developer_notes
FOR UPDATE
TO authenticated
USING (
  (SELECT public.current_user_has_developer_access())
)
WITH CHECK (
  (SELECT public.current_user_has_developer_access())
);

