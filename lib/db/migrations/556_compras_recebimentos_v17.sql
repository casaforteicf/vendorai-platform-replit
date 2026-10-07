CREATE TABLE IF NOT EXISTS obra_pedidos_compra (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  cotacao_id text REFERENCES obra_cotacoes(id) ON DELETE SET NULL,
  proposta_id text REFERENCES obra_cotacao_propostas(id) ON DELETE SET NULL,
  fornecedor_id text REFERENCES fornecedores(id) ON DELETE SET NULL,
  fornecedor_nome_snapshot text NOT NULL,
  numero_pedido text,
  status text NOT NULL DEFAULT 'rascunho',
  data_pedido date,
  data_necessidade date,
  data_prevista_entrega date,
  prazo_fornecedor_dias integer NOT NULL DEFAULT 0,
  buffer_logistico_dias integer NOT NULL DEFAULT 0,
  data_limite_compra date,
  condicao_pagamento text,
  frete_valor numeric(15,4) NOT NULL DEFAULT 0,
  impostos_valor numeric(15,4) NOT NULL DEFAULT 0,
  desconto_valor numeric(15,4) NOT NULL DEFAULT 0,
  valor_itens numeric(15,4) NOT NULL DEFAULT 0,
  valor_total numeric(15,4) NOT NULL DEFAULT 0,
  observacoes text,
  criado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  aprovado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  aprovado_em timestamptz,
  enviado_em timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_pedidos_compra_tenant_obra_idx ON obra_pedidos_compra(tenant_id, obra_id);
CREATE INDEX IF NOT EXISTS obra_pedidos_compra_fornecedor_status_idx ON obra_pedidos_compra(fornecedor_id, status);

CREATE TABLE IF NOT EXISTS obra_pedido_compra_itens (
  id text PRIMARY KEY,
  pedido_id text NOT NULL REFERENCES obra_pedidos_compra(id) ON DELETE CASCADE,
  proposta_item_id text REFERENCES obra_cotacao_proposta_itens(id) ON DELETE SET NULL,
  selecao_id text REFERENCES obra_cotacao_selecoes(id) ON DELETE SET NULL,
  insumo_id text REFERENCES insumos(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  codigo_fornecedor text,
  marca text,
  modelo text,
  quantidade_pedida numeric(15,4) NOT NULL,
  unidade_compra text NOT NULL,
  preco_unitario numeric(15,6) NOT NULL,
  valor_total numeric(15,4) NOT NULL,
  quantidade_recebida numeric(15,4) NOT NULL DEFAULT 0,
  quantidade_aprovada numeric(15,4) NOT NULL DEFAULT 0,
  quantidade_rejeitada numeric(15,4) NOT NULL DEFAULT 0,
  saldo_receber numeric(15,4) NOT NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_pedido_compra_itens_pedido_idx ON obra_pedido_compra_itens(pedido_id);
CREATE INDEX IF NOT EXISTS obra_pedido_compra_itens_insumo_idx ON obra_pedido_compra_itens(insumo_id);

CREATE TABLE IF NOT EXISTS obra_pedido_recebimentos (
  id text PRIMARY KEY,
  pedido_id text NOT NULL REFERENCES obra_pedidos_compra(id) ON DELETE CASCADE,
  data_recebimento timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'inspecao',
  documento_numero text,
  documento_url text,
  transportadora text,
  responsavel_id text REFERENCES users(id) ON DELETE SET NULL,
  observacoes text,
  fotos jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_pedido_recebimentos_pedido_data_idx ON obra_pedido_recebimentos(pedido_id, data_recebimento);

CREATE TABLE IF NOT EXISTS obra_pedido_recebimento_itens (
  id text PRIMARY KEY,
  recebimento_id text NOT NULL REFERENCES obra_pedido_recebimentos(id) ON DELETE CASCADE,
  pedido_item_id text NOT NULL REFERENCES obra_pedido_compra_itens(id) ON DELETE CASCADE,
  quantidade_recebida numeric(15,4) NOT NULL,
  quantidade_aprovada numeric(15,4) NOT NULL DEFAULT 0,
  quantidade_rejeitada numeric(15,4) NOT NULL DEFAULT 0,
  motivo_rejeicao text,
  lote text,
  validade date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_pedido_devolucoes (
  id text PRIMARY KEY,
  pedido_id text NOT NULL REFERENCES obra_pedidos_compra(id) ON DELETE CASCADE,
  pedido_item_id text NOT NULL REFERENCES obra_pedido_compra_itens(id) ON DELETE CASCADE,
  recebimento_item_id text REFERENCES obra_pedido_recebimento_itens(id) ON DELETE SET NULL,
  quantidade numeric(15,4) NOT NULL,
  motivo text NOT NULL,
  status text NOT NULL DEFAULT 'solicitada',
  responsavel_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz
);