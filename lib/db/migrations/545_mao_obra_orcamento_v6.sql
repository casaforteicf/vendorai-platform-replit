CREATE TABLE IF NOT EXISTS mao_obra_recursos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  funcao text,
  modalidade text NOT NULL DEFAULT 'funcionario_hora',
  unidade_custo text NOT NULL DEFAULT 'h',
  custo_base numeric(15,4) NOT NULL DEFAULT 0,
  salario_mensal numeric(15,4),
  encargos_percentual numeric(7,3) NOT NULL DEFAULT 0,
  beneficios_mensais numeric(15,4) NOT NULL DEFAULT 0,
  outros_custos_mensais numeric(15,4) NOT NULL DEFAULT 0,
  horas_mensais numeric(10,2),
  custo_hora_calculado numeric(15,4),
  produtividade numeric(15,4),
  unidade_produtividade text,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mao_obra_recursos_tenant_ativo_idx
  ON mao_obra_recursos(tenant_id, ativo);

CREATE TABLE IF NOT EXISTS mao_obra_equipes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  produtividade numeric(15,4),
  unidade_produtividade text,
  horas_dia numeric(5,2) NOT NULL DEFAULT 8,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mao_obra_equipe_membros (
  id text PRIMARY KEY,
  equipe_id text NOT NULL REFERENCES mao_obra_equipes(id) ON DELETE CASCADE,
  recurso_id text NOT NULL REFERENCES mao_obra_recursos(id) ON DELETE RESTRICT,
  quantidade numeric(10,3) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS mao_obra_coberturas (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  escopo_tipo text NOT NULL,
  composicao_id text REFERENCES composicoes(id) ON DELETE CASCADE,
  orcamento_etapa_id text REFERENCES obra_orcamento_etapas(id) ON DELETE CASCADE,
  orcamento_item_id text REFERENCES obra_orcamento_itens(id) ON DELETE CASCADE,
  modalidade text NOT NULL,
  recurso_id text REFERENCES mao_obra_recursos(id) ON DELETE SET NULL,
  equipe_id text REFERENCES mao_obra_equipes(id) ON DELETE SET NULL,
  quantidade numeric(15,4) NOT NULL DEFAULT 1,
  unidade text NOT NULL DEFAULT 'h',
  custo_unitario numeric(15,4) NOT NULL DEFAULT 0,
  custo_total numeric(15,4) NOT NULL DEFAULT 0,
  inclui_mao_obra_composicoes_filhas boolean NOT NULL DEFAULT false,
  atividades_incluidas jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  criado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mao_obra_coberturas_tenant_escopo_idx
  ON mao_obra_coberturas(tenant_id, escopo_tipo);
CREATE INDEX IF NOT EXISTS mao_obra_coberturas_composicao_idx
  ON mao_obra_coberturas(composicao_id);
CREATE INDEX IF NOT EXISTS mao_obra_coberturas_etapa_idx
  ON mao_obra_coberturas(orcamento_etapa_id);
CREATE INDEX IF NOT EXISTS mao_obra_coberturas_item_idx
  ON mao_obra_coberturas(orcamento_item_id);
