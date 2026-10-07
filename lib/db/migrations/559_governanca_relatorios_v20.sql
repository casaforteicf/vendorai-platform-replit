CREATE TABLE IF NOT EXISTS obra_relatorios_salvos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  obra_id text REFERENCES obras(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  colunas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ordenacao jsonb NOT NULL DEFAULT '[]'::jsonb,
  compartilhado boolean NOT NULL DEFAULT false,
  criado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_relatorios_salvos_tenant_tipo_idx ON obra_relatorios_salvos(tenant_id,tipo);
CREATE INDEX IF NOT EXISTS obra_relatorios_salvos_obra_idx ON obra_relatorios_salvos(obra_id);

CREATE TABLE IF NOT EXISTS obra_auditoria_eventos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  obra_id text REFERENCES obras(id) ON DELETE CASCADE,
  usuario_id text REFERENCES users(id) ON DELETE SET NULL,
  modulo text NOT NULL,
  acao text NOT NULL,
  entidade text NOT NULL,
  entidade_id text,
  resumo text,
  antes jsonb,
  depois jsonb,
  metadata jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_auditoria_eventos_obra_data_idx ON obra_auditoria_eventos(obra_id,created_at);
CREATE INDEX IF NOT EXISTS obra_auditoria_eventos_entidade_idx ON obra_auditoria_eventos(entidade,entidade_id);
CREATE INDEX IF NOT EXISTS obra_auditoria_eventos_modulo_idx ON obra_auditoria_eventos(modulo);

CREATE TABLE IF NOT EXISTS obra_permissoes_operacionais (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chave text NOT NULL,
  nome text NOT NULL,
  descricao text,
  roles_permitidas jsonb NOT NULL DEFAULT '[]'::jsonb,
  funcoes_permitidas jsonb NOT NULL DEFAULT '[]'::jsonb,
  usuarios_permitidos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS obra_permissoes_operacionais_tenant_chave_uq
  ON obra_permissoes_operacionais(tenant_id,chave);