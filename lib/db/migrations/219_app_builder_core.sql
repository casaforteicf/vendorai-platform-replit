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

CREATE TABLE IF NOT EXISTS app_component_registry (
  id text PRIMARY KEY,
  key text NOT NULL,
  name text NOT NULL,
  category text,
  config_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_props jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_component_registry_status_check
    CHECK (status IN ('active', 'deprecated', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_component_registry_key_uidx
  ON app_component_registry (key);
CREATE INDEX IF NOT EXISTS app_component_registry_category_idx
  ON app_component_registry (category);

CREATE TABLE IF NOT EXISTS app_feature_registry (
  id text PRIMARY KEY,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  config_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_feature_registry_status_check
    CHECK (status IN ('active', 'deprecated', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_feature_registry_key_uidx
  ON app_feature_registry (key);
CREATE INDEX IF NOT EXISTS app_feature_registry_category_idx
  ON app_feature_registry (category);

CREATE TABLE IF NOT EXISTS app_action_registry (
  id text PRIMARY KEY,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_level text NOT NULL DEFAULT 'low',
  status text NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_action_registry_risk_check
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT app_action_registry_status_check
    CHECK (status IN ('active', 'deprecated', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_action_registry_key_uidx
  ON app_action_registry (key);
CREATE INDEX IF NOT EXISTS app_action_registry_category_idx
  ON app_action_registry (category);
CREATE INDEX IF NOT EXISTS app_action_registry_risk_idx
  ON app_action_registry (risk_level);

CREATE TABLE IF NOT EXISTS app_workflow_registry (
  id text PRIMARY KEY,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  trigger_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_workflow_registry_status_check
    CHECK (status IN ('active', 'deprecated', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_workflow_registry_key_uidx
  ON app_workflow_registry (key);

CREATE TABLE IF NOT EXISTS app_ai_policies (
  id text PRIMARY KEY,
  vertical_id text REFERENCES app_verticals(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  risk_level text NOT NULL DEFAULT 'medium',
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_ai_policies_risk_check
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT app_ai_policies_status_check
    CHECK (status IN ('active', 'deprecated', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_ai_policies_vertical_key_uidx
  ON app_ai_policies (vertical_id, key);
CREATE INDEX IF NOT EXISTS app_ai_policies_risk_idx
  ON app_ai_policies (risk_level);

-- As tabelas globais (verticals/templates/registries) são administradas pelo SuperAdmin.
-- Instâncias e suas versões são dados de tenant e reutilizam o contexto RLS oficial.
ALTER TABLE app_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_instance_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_tenant_access ON app_instances;
DROP POLICY IF EXISTS vendorai_tenant_guard ON app_instances;
CREATE POLICY vendorai_tenant_access ON app_instances
  AS PERMISSIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());
CREATE POLICY vendorai_tenant_guard ON app_instances
  AS RESTRICTIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

DROP POLICY IF EXISTS vendorai_tenant_access ON app_instance_versions;
DROP POLICY IF EXISTS vendorai_tenant_guard ON app_instance_versions;
CREATE POLICY vendorai_tenant_access ON app_instance_versions
  AS PERMISSIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());
CREATE POLICY vendorai_tenant_guard ON app_instance_versions
  AS RESTRICTIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON app_instances, app_instance_versions TO vendorai_app;
GRANT SELECT ON
  app_verticals,
  app_templates,
  app_template_versions,
  app_component_registry,
  app_feature_registry,
  app_action_registry,
  app_workflow_registry,
  app_ai_policies
TO vendorai_app;

COMMENT ON TABLE app_verticals IS 'Verticais/famílias disponíveis para templates do App Builder.';
COMMENT ON TABLE app_templates IS 'Templates globais e herdáveis administrados pelo SuperAdmin.';
COMMENT ON TABLE app_template_versions IS 'Snapshots versionados e imutáveis de templates publicados.';
COMMENT ON TABLE app_instances IS 'Instâncias white-label de apps pertencentes a tenants.';
COMMENT ON TABLE app_instance_versions IS 'Snapshots versionados das customizações de uma instância de app.';
COMMENT ON TABLE app_component_registry IS 'Catálogo de componentes schema-driven disponíveis ao App Builder.';
COMMENT ON TABLE app_feature_registry IS 'Catálogo de funcionalidades reutilizáveis e ativáveis por template.';
COMMENT ON TABLE app_action_registry IS 'Catálogo de ações executáveis por componentes e páginas.';
COMMENT ON TABLE app_workflow_registry IS 'Catálogo de contratos para integração com workflows VendorAI.';
COMMENT ON TABLE app_ai_policies IS 'Políticas e guardrails de IA globais ou específicos por vertical.';

-- Standalone-app extensions must run after app_instances/version tables exist.
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
