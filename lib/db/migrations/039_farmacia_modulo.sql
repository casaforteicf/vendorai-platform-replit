-- Módulo Farmácia — 2º dos 6 segmentos operacionais pendentes.
DO $$ BEGIN
  CREATE TYPE farmacia_categoria_produto AS ENUM (
    'medicamento_generico', 'medicamento_referencia', 'medicamento_similar',
    'perfumaria', 'higiene_pessoal', 'dermocosmeticos', 'infantil',
    'ortopedicos', 'suplementos', 'outros'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE farmacia_pedido_status AS ENUM (
    'aguardando_confirmacao', 'aguardando_receita', 'confirmado',
    'em_separacao', 'saiu_para_entrega', 'entregue', 'cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE farmacia_pedido_origem AS ENUM ('whatsapp', 'app', 'balcao');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS farmacia_produtos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  erp_id text,
  nome text NOT NULL,
  principio_ativo text,
  descricao text,
  categoria farmacia_categoria_produto,
  exige_receita boolean NOT NULL DEFAULT false,
  unidade text NOT NULL DEFAULT 'un',
  preco_venda numeric(12,2) NOT NULL,
  preco_promocional numeric(12,2),
  estoque integer NOT NULL DEFAULT 0,
  imagem_url text,
  ativo boolean NOT NULL DEFAULT true,
  destaque_whatsapp boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS farmacia_pedidos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  origem farmacia_pedido_origem NOT NULL DEFAULT 'whatsapp',
  status farmacia_pedido_status NOT NULL DEFAULT 'aguardando_confirmacao',
  endereco_entrega text,
  tem_item_controlado boolean NOT NULL DEFAULT false,
  receita_url text,
  observacoes text,
  valor_total numeric(12,2) NOT NULL DEFAULT 0,
  erp_pedido_id text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS farmacia_pedido_itens (
  id text PRIMARY KEY,
  pedido_id text NOT NULL REFERENCES farmacia_pedidos(id) ON DELETE CASCADE,
  produto_id text,
  nome_produto text NOT NULL,
  exige_receita boolean NOT NULL DEFAULT false,
  quantidade numeric(10,3) NOT NULL,
  preco_unitario numeric(12,2) NOT NULL,
  subtotal numeric(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_farmacia_produtos_tenant ON farmacia_produtos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_farmacia_pedidos_tenant ON farmacia_pedidos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_farmacia_pedidos_status ON farmacia_pedidos(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_farmacia_pedido_itens_pedido ON farmacia_pedido_itens(pedido_id);
