CREATE TABLE IF NOT EXISTS obra_cotacoes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  orcamento_id text NOT NULL REFERENCES obra_orcamentos(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho',
  data_necessidade date,
  prazo_resposta date,
  observacoes text,
  criado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_cotacoes_tenant_orcamento_idx ON obra_cotacoes(tenant_id, orcamento_id);

CREATE TABLE IF NOT EXISTS obra_cotacao_itens (
  id text PRIMARY KEY,
  cotacao_id text NOT NULL REFERENCES obra_cotacoes(id) ON DELETE CASCADE,
  orcamento_item_id text REFERENCES obra_orcamento_itens(id) ON DELETE SET NULL,
  orcamento_etapa_id text REFERENCES obra_orcamento_etapas(id) ON DELETE SET NULL,
  insumo_id text REFERENCES insumos(id) ON DELETE SET NULL,
  nome text NOT NULL,
  codigo text,
  especificacao text,
  marca_preferencial text,
  modelo_preferencial text,
  quantidade_tecnica numeric(15,4) NOT NULL,
  unidade_tecnica text NOT NULL,
  quantidade_compra numeric(15,4),
  unidade_compra text,
  quantidade_minima_compra numeric(15,4),
  multiplo_compra numeric(15,4),
  fator_compra_para_consumo numeric(15,6),
  permite_equivalente boolean NOT NULL DEFAULT false,
  cobertura_status text NOT NULL DEFAULT 'nao_cotado',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_cotacao_itens_cotacao_idx ON obra_cotacao_itens(cotacao_id);
CREATE INDEX IF NOT EXISTS obra_cotacao_itens_insumo_idx ON obra_cotacao_itens(insumo_id);

CREATE TABLE IF NOT EXISTS obra_cotacao_propostas (
  id text PRIMARY KEY,
  cotacao_id text NOT NULL REFERENCES obra_cotacoes(id) ON DELETE CASCADE,
  fornecedor_id text REFERENCES fornecedores(id) ON DELETE SET NULL,
  fornecedor_nome_snapshot text NOT NULL,
  numero_proposta text,
  data_proposta date,
  validade_ate date,
  prazo_entrega_dias integer,
  condicao_pagamento text,
  frete_valor numeric(15,4) NOT NULL DEFAULT 0,
  impostos_valor numeric(15,4) NOT NULL DEFAULT 0,
  desconto_valor numeric(15,4) NOT NULL DEFAULT 0,
  valor_total_informado numeric(15,4),
  origem_formato text NOT NULL DEFAULT 'manual',
  arquivo_nome text,
  arquivo_url text,
  extracao_confianca numeric(5,2),
  status text NOT NULL DEFAULT 'importada',
  observacoes text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_cotacao_propostas_cotacao_fornecedor_idx ON obra_cotacao_propostas(cotacao_id, fornecedor_id);

CREATE TABLE IF NOT EXISTS obra_cotacao_proposta_itens (
  id text PRIMARY KEY,
  proposta_id text NOT NULL REFERENCES obra_cotacao_propostas(id) ON DELETE CASCADE,
  cotacao_item_id text REFERENCES obra_cotacao_itens(id) ON DELETE SET NULL,
  linha_origem integer,
  codigo_fornecedor text,
  descricao_fornecedor text NOT NULL,
  marca text,
  modelo text,
  especificacao text,
  quantidade_ofertada numeric(15,4) NOT NULL,
  unidade_fornecedor text NOT NULL,
  embalagem_quantidade numeric(15,4),
  quantidade_minima_compra numeric(15,4),
  multiplo_compra numeric(15,4),
  permite_fracionar boolean NOT NULL DEFAULT false,
  preco_unitario_fornecedor numeric(15,4) NOT NULL,
  preco_unitario_normalizado numeric(15,6),
  quantidade_compra_normalizada numeric(15,4),
  valor_total_linha numeric(15,4) NOT NULL,
  imposto_linha numeric(15,4) NOT NULL DEFAULT 0,
  frete_rateado numeric(15,4) NOT NULL DEFAULT 0,
  prazo_entrega_dias integer,
  cobertura_status text NOT NULL DEFAULT 'ambigua',
  reconciliacao_confianca numeric(5,2),
  selecionado boolean NOT NULL DEFAULT false,
  motivo_selecao text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_cotacao_proposta_itens_proposta_idx ON obra_cotacao_proposta_itens(proposta_id);
CREATE INDEX IF NOT EXISTS obra_cotacao_proposta_itens_cotacao_item_idx ON obra_cotacao_proposta_itens(cotacao_item_id);

CREATE TABLE IF NOT EXISTS obra_cotacao_selecoes (
  id text PRIMARY KEY,
  cotacao_item_id text NOT NULL REFERENCES obra_cotacao_itens(id) ON DELETE CASCADE,
  proposta_item_id text NOT NULL REFERENCES obra_cotacao_proposta_itens(id) ON DELETE CASCADE,
  quantidade_selecionada numeric(15,4) NOT NULL,
  custo_selecionado numeric(15,4) NOT NULL,
  principal boolean NOT NULL DEFAULT true,
  criado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_cotacao_selecoes_item_idx ON obra_cotacao_selecoes(cotacao_item_id);