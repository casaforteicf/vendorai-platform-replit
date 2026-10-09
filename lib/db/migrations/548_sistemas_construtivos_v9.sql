CREATE TABLE IF NOT EXISTS sistemas_construtivos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chave text NOT NULL,
  nome text NOT NULL,
  descricao text,
  escopos_aplicacao text[] NOT NULL DEFAULT '{}',
  parametros_padrao jsonb,
  memorial jsonb,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sistemas_construtivos_tenant_chave_idx ON sistemas_construtivos(tenant_id, chave);
CREATE INDEX IF NOT EXISTS sistemas_construtivos_tenant_ativo_idx ON sistemas_construtivos(tenant_id, ativo);

CREATE TABLE IF NOT EXISTS sistema_variantes (
  id text PRIMARY KEY,
  sistema_id text NOT NULL REFERENCES sistemas_construtivos(id) ON DELETE CASCADE,
  codigo text,
  nome text NOT NULL,
  parametros jsonb,
  criterios_aplicacao jsonb,
  memorial jsonb,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sistema_composicao_regras (
  id text PRIMARY KEY,
  sistema_id text NOT NULL REFERENCES sistemas_construtivos(id) ON DELETE CASCADE,
  variante_id text REFERENCES sistema_variantes(id) ON DELETE CASCADE,
  slot_key text NOT NULL,
  etapa_key text,
  acao text NOT NULL DEFAULT 'manter',
  composicao_id text,
  composicao_substituida_id text,
  obrigatoria boolean NOT NULL DEFAULT false,
  parametros jsonb,
  condicao jsonb,
  observacoes text,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sistema_composicao_regras_sistema_slot_idx ON sistema_composicao_regras(sistema_id, slot_key);

CREATE TABLE IF NOT EXISTS sistema_interfaces (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chave text NOT NULL,
  nome text NOT NULL,
  sistema_origem text,
  destino_tipo text,
  composicao_id text,
  parametros jsonb,
  memorial jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);