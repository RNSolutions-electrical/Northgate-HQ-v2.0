CREATE TABLE public.silas_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  user_id TEXT NOT NULL,
  title TEXT
);

CREATE TABLE public.silas_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.silas_conversations(id),
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  suggested_action JSONB,
  action_status TEXT CHECK (
    action_status IS NULL
    OR action_status IN ('pending', 'approved', 'declined', 'revised')
  ),
  approved_at TIMESTAMPTZ,
  approved_by TEXT
);

CREATE TABLE public.silas_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  silas_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE UNIQUE INDEX silas_settings_single_row_idx
ON public.silas_settings ((TRUE));

INSERT INTO public.silas_settings (id, silas_enabled, updated_by)
VALUES ('11111111-1111-1111-1111-111111111111', TRUE, 'migration_seed')
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER set_silas_conversations_updated_at
BEFORE UPDATE ON public.silas_conversations
FOR EACH ROW
EXECUTE FUNCTION touch_user_permissions_updated_at();

CREATE TRIGGER set_silas_settings_updated_at
BEFORE UPDATE ON public.silas_settings
FOR EACH ROW
EXECUTE FUNCTION touch_user_permissions_updated_at();

ALTER TABLE public.silas_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silas_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silas_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY silas_conversations_read
ON public.silas_conversations
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND user_id = auth.jwt() ->> 'sub'
);

CREATE POLICY silas_conversations_insert
ON public.silas_conversations
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.jwt() ->> 'sub'
);

CREATE POLICY silas_conversations_update
ON public.silas_conversations
FOR UPDATE
TO authenticated
USING (
  user_id = auth.jwt() ->> 'sub'
)
WITH CHECK (
  user_id = auth.jwt() ->> 'sub'
);

CREATE POLICY silas_messages_read
ON public.silas_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.silas_conversations sc
    WHERE sc.id = silas_messages.conversation_id
      AND sc.archived_at IS NULL
      AND sc.user_id = auth.jwt() ->> 'sub'
  )
);

CREATE POLICY silas_messages_insert
ON public.silas_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.silas_conversations sc
    WHERE sc.id = silas_messages.conversation_id
      AND sc.archived_at IS NULL
      AND sc.user_id = auth.jwt() ->> 'sub'
  )
);

CREATE POLICY silas_messages_update
ON public.silas_messages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.silas_conversations sc
    WHERE sc.id = silas_messages.conversation_id
      AND sc.archived_at IS NULL
      AND sc.user_id = auth.jwt() ->> 'sub'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.silas_conversations sc
    WHERE sc.id = silas_messages.conversation_id
      AND sc.archived_at IS NULL
      AND sc.user_id = auth.jwt() ->> 'sub'
  )
);

CREATE POLICY silas_settings_read
ON public.silas_settings
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY silas_settings_write
ON public.silas_settings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_access_developer'
      )::boolean, FALSE) IS TRUE
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_access_developer'
      )::boolean, FALSE) IS TRUE
  )
);

REVOKE ALL ON public.silas_conversations FROM anon, authenticated;
REVOKE ALL ON public.silas_messages FROM anon, authenticated;
REVOKE ALL ON public.silas_settings FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.silas_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.silas_messages TO authenticated;
GRANT SELECT, UPDATE ON public.silas_settings TO authenticated;
