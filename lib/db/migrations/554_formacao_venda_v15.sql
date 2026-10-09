CREATE TABLE IF NOT EXISTS orcamento_formacao_venda (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  orcamento_id text NOT NULL REFERENCES obra_orcamentos(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Formação de venda',
  metodo_margem text NOT NULL DEFAULT 'margem_sobre_venda',
  margem_percentual numeric(9,4) NOT NULL DEFAULT 0,
  preco_venda_manual numeric(15,4),
  arredondamento numeric(15,4),
  observacoes text,
  versao integer NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  criado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orc_formacao_tenant_orcamento_idx
  ON orcamento_formacao_venda(tenant_id, orcamento_id);

CREATE TABLE IF NOT EXISTS orcamento_formacao_componentes (
  id text PRIMARY KEY,
  formacao_id text NOT NULL REFERENCES orcamento_formacao_venda(id) ON DELETE CASCADE,
  escopo text NOT NULL DEFAULT 'orcamento',
  etapa_id text REFERENCES obra_orcamento_etapas(id) ON DELETE CASCADE,
  item_id text REFERENCES obra_orcamento_itens(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  nome text NOT NULL,
  modo text NOT NULL DEFAULT 'percentual',
  base_calculo text NOT NULL DEFAULT 'custo_direto',
  percentual numeric(9,4),
  valor_fixo numeric(15,4),
  inclui_na_venda boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  observacoes text,
  metadata jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orc_formacao_componentes_formacao_escopo_idx
  ON orcamento_formacao_componentes(formacao_id, escopo);

CREATE TABLE IF NOT EXISTS orcamento_formacao_snapshots (
  id text PRIMARY KEY,
  formacao_id text NOT NULL REFERENCES orcamento_formacao_venda(id) ON DELETE CASCADE,
  custo_direto numeric(15,4) NOT NULL,
  custos_indiretos numeric(15,4) NOT NULL,
  impostos numeric(15,4) NOT NULL,
  comissao numeric(15,4) NOT NULL,
  risco numeric(15,4) NOT NULL,
  margem_valor numeric(15,4) NOT NULL,
  preco_venda numeric(15,4) NOT NULL,
  markup_efetivo numeric(12,6),
  margem_efetiva_percentual numeric(9,4),
  memoria_calculo jsonb NOT NULL,
  criado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orc_formacao_snapshots_formacao_created_idx
  ON orcamento_formacao_snapshots(formacao_id, created_at);