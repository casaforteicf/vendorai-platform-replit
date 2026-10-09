CREATE TABLE IF NOT EXISTS arqdor_market_demandas (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  criada_por_user_id text,
  origem text NOT NULL DEFAULT 'manual',
  origem_id text,
  projeto_id text,
  obra_id text,
  orcamento_id text,
  orcamento_item_id text,
  render_id text,
  atividade_id text,
  etapa_id text,
  titulo text NOT NULL,
  descricao text,
  categoria text,
  subcategoria text,
  sistema text,
  produto_servico text,
  quantidade numeric(16,4),
  unidade text,
  especificacoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  anexos jsonb NOT NULL DEFAULT '[]'::jsonb,
  imagens jsonb NOT NULL DEFAULT '[]'::jsonb,
  localizacao_publica jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_necessidade timestamp,
  prazo_resposta timestamp,
  visibilidade text NOT NULL DEFAULT 'privada',
  status text NOT NULL DEFAULT 'rascunho',
  ocultar_comprador integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  publicada_em timestamp,
  encerrada_em timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT arqdor_market_demandas_origem_chk CHECK (origem IN ('manual','pre_projeto','projeto','render','orcamento','orcamento_item','obra','atividade','etapa')),
  CONSTRAINT arqdor_market_demandas_visibilidade_chk CHECK (visibilidade IN ('privada','parceiros','regional','aberta')),
  CONSTRAINT arqdor_market_demandas_status_chk CHECK (status IN ('rascunho','publicada','encerrada','cancelada','adjudicada')),
  CONSTRAINT arqdor_market_demandas_ocultar_chk CHECK (ocultar_comprador IN (0,1))
);

CREATE INDEX IF NOT EXISTS arqdor_market_demandas_tenant_status_idx
  ON arqdor_market_demandas (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS arqdor_market_demandas_categoria_status_idx
  ON arqdor_market_demandas (categoria, status, created_at DESC);
CREATE INDEX IF NOT EXISTS arqdor_market_demandas_origem_idx
  ON arqdor_market_demandas (origem, origem_id);

CREATE TABLE IF NOT EXISTS arqdor_market_convites (
  id text PRIMARY KEY,
  demanda_id text NOT NULL REFERENCES arqdor_market_demandas(id) ON DELETE CASCADE,
  fornecedor_tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'convidado',
  convidado_em timestamp NOT NULL DEFAULT now(),
  visualizado_em timestamp,
  respondido_em timestamp,
  recusado_em timestamp,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT arqdor_market_convites_status_chk CHECK (status IN ('convidado','visualizado','respondido','recusado'))
);
CREATE UNIQUE INDEX IF NOT EXISTS arqdor_market_convites_demanda_fornecedor_uidx
  ON arqdor_market_convites (demanda_id, fornecedor_tenant_id);
CREATE INDEX IF NOT EXISTS arqdor_market_convites_fornecedor_status_idx
  ON arqdor_market_convites (fornecedor_tenant_id, status);

CREATE TABLE IF NOT EXISTS arqdor_market_propostas (
  id text PRIMARY KEY,
  demanda_id text NOT NULL REFERENCES arqdor_market_demandas(id) ON DELETE CASCADE,
  fornecedor_tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'rascunho',
  moeda text NOT NULL DEFAULT 'BRL',
  valor_produtos numeric(16,2),
  frete numeric(16,2),
  desconto numeric(16,2),
  impostos numeric(16,2),
  valor_total numeric(16,2),
  prazo_entrega_dias integer,
  validade_ate timestamp,
  condicao_pagamento text,
  observacoes text,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  anexos jsonb NOT NULL DEFAULT '[]'::jsonb,
  cotacao_proposta_id text,
  enviada_em timestamp,
  selecionada_em timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT arqdor_market_propostas_status_chk CHECK (status IN ('rascunho','enviada','em_analise','selecionada','recusada','cancelada'))
);
CREATE INDEX IF NOT EXISTS arqdor_market_propostas_demanda_fornecedor_idx
  ON arqdor_market_propostas (demanda_id, fornecedor_tenant_id);
CREATE INDEX IF NOT EXISTS arqdor_market_propostas_demanda_status_idx
  ON arqdor_market_propostas (demanda_id, status);
