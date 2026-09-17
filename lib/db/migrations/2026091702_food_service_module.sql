-- Bucket "food_service" (Bloco 4, proposta de agrupamento de verticais):
-- Restaurante, Pizzaria, Hamburgueria, Padaria, Confeitaria/Doceria,
-- Cafeteria, Marmitaria, Food truck, Delivery de comida.

CREATE TABLE IF NOT EXISTS food_cardapio_itens (
  id                 text PRIMARY KEY,
  tenant_id          text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome               varchar(255) NOT NULL,
  descricao          text,
  categoria          varchar(40) NOT NULL DEFAULT 'outro',
  preco              numeric(10,2) NOT NULL,
  tempo_preparo_min  integer,
  foto_url           text,
  disponivel         boolean NOT NULL DEFAULT true,
  created_at         timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_cardapio_itens_tenant_idx ON food_cardapio_itens (tenant_id);

CREATE TABLE IF NOT EXISTS food_pedidos (
  id                 text PRIMARY KEY,
  tenant_id          text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id         text REFERENCES leads(id) ON DELETE SET NULL,
  cliente_nome       varchar(255),
  cliente_telefone   varchar(20),
  tipo               varchar(20) NOT NULL DEFAULT 'mesa',
  mesa_numero        varchar(20),
  endereco_entrega   text,
  status             varchar(20) NOT NULL DEFAULT 'recebido',
  valor_total        numeric(10,2) NOT NULL DEFAULT 0,
  forma_pagamento    varchar(30),
  observacoes        text,
  created_at         timestamp NOT NULL DEFAULT now(),
  updated_at         timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_pedidos_tenant_idx ON food_pedidos (tenant_id);
CREATE INDEX IF NOT EXISTS food_pedidos_status_idx ON food_pedidos (tenant_id, status);

CREATE TABLE IF NOT EXISTS food_pedido_itens (
  id                 text PRIMARY KEY,
  pedido_id          text NOT NULL REFERENCES food_pedidos(id) ON DELETE CASCADE,
  cardapio_item_id   text REFERENCES food_cardapio_itens(id) ON DELETE SET NULL,
  nome_item          text NOT NULL,
  preco_unitario     numeric(10,2) NOT NULL,
  quantidade         integer NOT NULL DEFAULT 1,
  observacoes        text,
  created_at         timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_pedido_itens_pedido_idx ON food_pedido_itens (pedido_id);
