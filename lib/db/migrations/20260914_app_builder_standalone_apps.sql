-- VendorAI App Builder — fundação multi-vertical e multi-tenant.
-- Esta migration cria somente o núcleo estrutural: templates/versionamento,
-- instâncias por tenant e registries reutilizáveis. Nenhum app vertical é criado aqui.

CREATE TABLE IF NOT EXISTS app_verticals (
  id text PRIMARY KEY,
  key text NOT NULL,
  name text NOT NULL,
  family_key text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_verticals_status_check
    CHECK (status IN ('active', 'inactive', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_verticals_key_uidx
  ON app_verticals (key);
CREATE INDEX IF NOT EXISTS app_verticals_family_idx
  ON app_verticals (family_key);
CREATE INDEX IF NOT EXISTS app_verticals_status_idx
  ON app_verticals (status);

CREATE TABLE IF NOT EXISTS app_templates (
  id text PRIMARY KEY,
  vertical_id text NOT NULL REFERENCES app_verticals(id) ON DELETE RESTRICT,
  parent_template_id text REFERENCES app_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_templates_status_check
    CHECK (status IN ('draft', 'active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_templates_vertical_slug_uidx
  ON app_templates (vertical_id, slug);
CREATE INDEX IF NOT EXISTS app_templates_vertical_status_idx
  ON app_templates (vertical_id, status);
CREATE INDEX IF NOT EXISTS app_templates_parent_idx
  ON app_templates (parent_template_id);

CREATE TABLE IF NOT EXISTS app_template_versions (
  id text PRIMARY KEY,
  template_id text NOT NULL REFERENCES app_templates(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_log text,
  published_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_template_versions_version_check CHECK (version > 0),
  CONSTRAINT app_template_versions_status_check
    CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_template_versions_template_version_uidx
  ON app_template_versions (template_id, version);
CREATE INDEX IF NOT EXISTS app_template_versions_status_idx
  ON app_template_versions (status);

CREATE TABLE IF NOT EXISTS app_instances (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id text NOT NULL REFERENCES app_templates(id) ON DELETE RESTRICT,
  template_version_id text NOT NULL REFERENCES app_template_versions(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  navigation jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  white_label jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_instances_status_check
    CHECK (status IN ('draft', 'preview', 'published', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_instances_tenant_slug_uidx
  ON app_instances (tenant_id, slug);
CREATE INDEX IF NOT EXISTS app_instances_tenant_status_idx
  ON app_instances (tenant_id, status);
CREATE INDEX IF NOT EXISTS app_instances_template_idx
  ON app_instances (template_id);

CREATE TABLE IF NOT EXISTS app_instance_versions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_instance_id text NOT NULL REFERENCES app_instances(id) ON DELETE CASCADE,
  template_version_id text REFERENCES app_template_versions(id) ON DELETE SET NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_instance_versions_version_check CHECK (version > 0),
  CONSTRAINT app_instance_versions_status_check
    CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_instance_versions_instance_version_uidx
  ON app_instance_versions (app_instance_id, version);
CREATE INDEX IF NOT EXISTS app_instance_versions_tenant_status_idx
  ON app_instance_versions (tenant_id, status);

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
