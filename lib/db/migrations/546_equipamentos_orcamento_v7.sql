CREATE TABLE IF NOT EXISTS equipamentos_recursos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  categoria text,
  origem text NOT NULL DEFAULT 'locado',
  unidade_cobranca text NOT NULL DEFAULT 'dia',
  valor_unitario numeric(15,4) NOT NULL DEFAULT 0,
  mobilizacao numeric(15,4) NOT NULL DEFAULT 0,
  desmobilizacao numeric(15,4) NOT NULL DEFAULT 0,
  transporte numeric(15,4) NOT NULL DEFAULT 0,
  operador_incluso boolean NOT NULL DEFAULT false,
  combustivel_incluso boolean NOT NULL DEFAULT false,
  custo_operador_hora numeric(15,4) NOT NULL DEFAULT 0,
  custo_combustivel_hora numeric(15,4) NOT NULL DEFAULT 0,
  custo_manutencao_hora numeric(15,4) NOT NULL DEFAULT 0,
  depreciacao_hora numeric(15,4) NOT NULL DEFAULT 0,
  capacidade text,
  especificacao_tecnica jsonb,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipamentos_recursos_tenant_ativo_idx
  ON equipamentos_recursos(tenant_id, ativo);

CREATE TABLE IF NOT EXISTS equipamentos_coberturas (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  escopo_tipo text NOT NULL,
  slot_key text NOT NULL DEFAULT 'principal',
  composicao_id text REFERENCES composicoes(id) ON DELETE CASCADE,
  orcamento_etapa_id text REFERENCES obra_orcamento_etapas(id) ON DELETE CASCADE,
  orcamento_item_id text REFERENCES obra_orcamento_itens(id) ON DELETE CASCADE,
  equipamento_id text NOT NULL REFERENCES equipamentos_recursos(id) ON DELETE RESTRICT,
  quantidade numeric(15,4) NOT NULL DEFAULT 1,
  unidade_cobranca text NOT NULL,
  valor_unitario numeric(15,4) NOT NULL DEFAULT 0,
  mobilizacao numeric(15,4) NOT NULL DEFAULT 0,
  desmobilizacao numeric(15,4) NOT NULL DEFAULT 0,
  transporte numeric(15,4) NOT NULL DEFAULT 0,
  horas_operacao numeric(15,4),
  custo_total numeric(15,4) NOT NULL DEFAULT 0,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  criado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipamentos_coberturas_tenant_escopo_idx
  ON equipamentos_coberturas(tenant_id, escopo_tipo);
CREATE INDEX IF NOT EXISTS equipamentos_coberturas_composicao_idx
  ON equipamentos_coberturas(composicao_id);
CREATE INDEX IF NOT EXISTS equipamentos_coberturas_etapa_idx
  ON equipamentos_coberturas(orcamento_etapa_id);
CREATE INDEX IF NOT EXISTS equipamentos_coberturas_item_idx
  ON equipamentos_coberturas(orcamento_item_id);
