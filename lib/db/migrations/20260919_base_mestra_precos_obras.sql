-- Base Mestre de Insumos e Preços para Construção
-- Regras:
-- 1) uma tabela padrão por tenant alimenta o custo corrente dos insumos;
-- 2) alterações mantêm histórico;
-- 3) orçamentos rascunho podem ser recalculados;
-- 4) enviados recebem aviso de preço desatualizado;
-- 5) aprovados/contratados preservam snapshot.

CREATE TABLE IF NOT EXISTS tabelas_precos_obras (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  regiao TEXT,
  fornecedor TEXT,
  fonte TEXT NOT NULL DEFAULT 'manual',
  vigencia_inicio DATE,
  vigencia_fim DATE,
  is_padrao BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tabelas_precos_obras_tenant_idx
  ON tabelas_precos_obras (tenant_id);

CREATE INDEX IF NOT EXISTS tabelas_precos_obras_padrao_idx
  ON tabelas_precos_obras (tenant_id, is_padrao)
  WHERE ativo = TRUE;

CREATE TABLE IF NOT EXISTS tabela_precos_obras_itens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tabela_preco_id TEXT NOT NULL REFERENCES tabelas_precos_obras(id) ON DELETE CASCADE,
  insumo_id TEXT NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  preco_base NUMERIC(15,4) NOT NULL,
  frete_unitario NUMERIC(15,4) NOT NULL DEFAULT 0,
  impostos_percentual NUMERIC(7,4) NOT NULL DEFAULT 0,
  desconto_percentual NUMERIC(7,4) NOT NULL DEFAULT 0,
  preco_final NUMERIC(15,4) NOT NULL,
  fornecedor TEXT,
  marca TEXT,
  regiao TEXT,
  data_cotacao DATE,
  validade DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tabela_precos_obras_itens_tabela_insumo_uniq UNIQUE (tabela_preco_id, insumo_id)
);

CREATE INDEX IF NOT EXISTS tabela_precos_obras_itens_insumo_idx
  ON tabela_precos_obras_itens (insumo_id);

CREATE TABLE IF NOT EXISTS insumo_preco_historico (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  insumo_id TEXT NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  tabela_preco_id TEXT REFERENCES tabelas_precos_obras(id) ON DELETE SET NULL,
  preco_anterior NUMERIC(15,4),
  preco_novo NUMERIC(15,4) NOT NULL,
  origem TEXT NOT NULL DEFAULT 'tabela_precos',
  fornecedor TEXT,
  regiao TEXT,
  alterado_por_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS insumo_preco_historico_lookup_idx
  ON insumo_preco_historico (tenant_id, insumo_id, created_at DESC);

ALTER TABLE obra_orcamentos
  ADD COLUMN IF NOT EXISTS tabela_preco_id TEXT REFERENCES tabelas_precos_obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS precos_desatualizados BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS precos_atualizados_em TIMESTAMPTZ;

ALTER TABLE obra_orcamento_itens
  ADD COLUMN IF NOT EXISTS insumo_id TEXT REFERENCES insumos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS composicao_id TEXT REFERENCES composicoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem_preco TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS preco_atualizado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS obra_orcamento_itens_insumo_idx
  ON obra_orcamento_itens (insumo_id);

CREATE INDEX IF NOT EXISTS obra_orcamento_itens_composicao_idx
  ON obra_orcamento_itens (composicao_id);

CREATE INDEX IF NOT EXISTS obra_orcamentos_tabela_preco_idx
  ON obra_orcamentos (tabela_preco_id);
