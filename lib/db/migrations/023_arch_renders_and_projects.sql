-- Arch Render Studio: arqdor_workspace_projects + arch_ai_renders + arch_project_configs
CREATE TABLE IF NOT EXISTS arqdor_workspace_projects (
  id           TEXT      NOT NULL,
  tenant_id    TEXT      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  context_blob JSONB     NOT NULL DEFAULT '{}',
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_arqdor_workspace_projects_tenant ON arqdor_workspace_projects (tenant_id);

CREATE TABLE IF NOT EXISTS arch_ai_renders (
  id                       TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                TEXT        NOT NULL,
  lead_id                  TEXT,
  project_id               TEXT,
  parent_render_id         TEXT,
  mode                     VARCHAR(20) NOT NULL DEFAULT 'criar',
  ambiente                 TEXT        NOT NULL,
  estilo                   TEXT,
  iluminacao               TEXT,
  angulo                   TEXT,
  mask_zones               JSONB,
  mask_file_url            TEXT,
  original_image_url       TEXT,
  result_image_url         TEXT,
  segmentation_confidence  JSONB,
  composited               BOOLEAN     DEFAULT FALSE,
  version_tag              VARCHAR(30),
  status                   VARCHAR(30) DEFAULT 'processando',
  erro_msg                 TEXT,
  prompt                   TEXT,
  motor                    VARCHAR(50),
  retentativas             VARCHAR(5)  DEFAULT '0',
  created_at               TIMESTAMP   NOT NULL DEFAULT NOW(),
  concluido_em             TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_arch_ai_renders_tenant ON arch_ai_renders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_ai_renders_status ON arch_ai_renders (status);

CREATE TABLE IF NOT EXISTS arch_project_configs (
  id               TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id        TEXT        NOT NULL,
  lead_id          TEXT,
  nome_config      TEXT        NOT NULL,
  mode             VARCHAR(20) NOT NULL DEFAULT 'preservar',
  estilo           TEXT,
  iluminacao       TEXT,
  angulo_padrao    TEXT,
  paleta_materiais JSONB,
  created_at       TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arch_project_configs_tenant ON arch_project_configs (tenant_id);
