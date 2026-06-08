BEGIN;

CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'User'
    CHECK (role IN (
      'Developer',
      'Administrator',
      'Project Manager',
      'Estimator',
      'Field Supervisor',
      'User'
    )),
  division TEXT CHECK (division IN ('Electrical', 'Construction', 'Admin')),
  permission_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_clerk_user_id
  ON user_permissions(clerk_user_id);

CREATE OR REPLACE FUNCTION touch_user_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_user_permissions_updated_at ON user_permissions;
CREATE TRIGGER trg_touch_user_permissions_updated_at
BEFORE UPDATE ON user_permissions
FOR EACH ROW
EXECUTE FUNCTION touch_user_permissions_updated_at();

CREATE OR REPLACE FUNCTION get_or_create_user_permissions(
  p_clerk_user_id TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS TABLE (
  clerk_user_id TEXT,
  display_name TEXT,
  email TEXT,
  role TEXT,
  division TEXT,
  permission_overrides JSONB,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_clerk_user_id IS NULL OR length(trim(p_clerk_user_id)) = 0 THEN
    RAISE EXCEPTION 'clerk_user_id is required';
  END IF;

  INSERT INTO user_permissions (clerk_user_id, display_name, email, role, division, permission_overrides, is_active)
  VALUES (p_clerk_user_id, p_display_name, p_email, 'User', NULL, '{}'::jsonb, TRUE)
  ON CONFLICT (clerk_user_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, user_permissions.display_name),
        email = COALESCE(EXCLUDED.email, user_permissions.email),
        updated_at = NOW();

  RETURN QUERY
  SELECT up.clerk_user_id,
         up.display_name,
         up.email,
         up.role,
         up.division,
         up.permission_overrides,
         up.is_active
  FROM user_permissions up
  WHERE up.clerk_user_id = p_clerk_user_id
    AND up.is_active = TRUE;
END;
$$;

REVOKE ALL ON FUNCTION get_or_create_user_permissions(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_or_create_user_permissions(TEXT, TEXT, TEXT) TO anon, authenticated;

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_permissions_self_select ON user_permissions;
CREATE POLICY user_permissions_self_select
ON user_permissions
FOR SELECT
USING (clerk_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS user_permissions_no_client_insert ON user_permissions;
CREATE POLICY user_permissions_no_client_insert
ON user_permissions
FOR INSERT
WITH CHECK (false);

DROP POLICY IF EXISTS user_permissions_no_client_update ON user_permissions;
CREATE POLICY user_permissions_no_client_update
ON user_permissions
FOR UPDATE
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS user_permissions_no_client_delete ON user_permissions;
CREATE POLICY user_permissions_no_client_delete
ON user_permissions
FOR DELETE
USING (false);

COMMIT;
