-- App Builder: permitir construção de apps antes de existir tenant.
-- O app pode nascer como prospect/internal e depois ser vinculado a um tenant real.

ALTER TABLE app_instances
  ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE app_instance_versions
  ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE app_instances
  ADD COLUMN IF NOT EXISTS owner_type text NOT NULL DEFAULT 'tenant',
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS owner_company text,
  ADD COLUMN IF NOT EXISTS linked_tenant_at timestamp;

UPDATE app_instances
SET owner_type = 'tenant',
    linked_tenant_at = COALESCE(linked_tenant_at, created_at)
WHERE tenant_id IS NOT NULL;

ALTER TABLE app_instances
  DROP CONSTRAINT IF EXISTS app_instances_owner_type_check;
ALTER TABLE app_instances
  ADD CONSTRAINT app_instances_owner_type_check
  CHECK (owner_type IN ('tenant', 'prospect', 'internal'));

ALTER TABLE app_instances
  DROP CONSTRAINT IF EXISTS app_instances_owner_scope_check;
ALTER TABLE app_instances
  ADD CONSTRAINT app_instances_owner_scope_check
  CHECK (
    (owner_type = 'tenant' AND tenant_id IS NOT NULL)
    OR
    (owner_type IN ('prospect', 'internal') AND owner_name IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS app_instances_owner_type_idx
  ON app_instances(owner_type, status);

CREATE INDEX IF NOT EXISTS app_instances_owner_email_idx
  ON app_instances(owner_email)
  WHERE owner_email IS NOT NULL;

-- Standalone apps podem ser editados e versionados, mas não publicados enquanto
-- não forem vinculados a um tenant. Isso evita runtime/usuários sem escopo real.
CREATE OR REPLACE FUNCTION prevent_unscoped_app_publish()
RETURNS trigger AS $$
DECLARE
  scoped_tenant text;
BEGIN
  IF NEW.status = 'published' THEN
    SELECT tenant_id INTO scoped_tenant
      FROM app_instances
      WHERE id = NEW.app_instance_id;

    IF scoped_tenant IS NULL THEN
      RAISE EXCEPTION 'APP_TENANT_REQUIRED_FOR_PUBLISH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_instance_version_requires_tenant ON app_instance_versions;
CREATE TRIGGER app_instance_version_requires_tenant
BEFORE INSERT OR UPDATE OF status ON app_instance_versions
FOR EACH ROW EXECUTE FUNCTION prevent_unscoped_app_publish();
