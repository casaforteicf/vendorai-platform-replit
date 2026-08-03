-- Solicitação de Compra — universal, qualquer vertical (não travado em
-- varejo). Fornecedor genérico separado do varejo_fornecedores (que é
-- específico do módulo de confecção).

CREATE TABLE IF NOT EXISTS fornecedores (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  contato text,
  telefone text,
  email text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fornecedores_tenant_idx ON fornecedores(tenant_id);

CREATE TABLE IF NOT EXISTS solicitacoes_compra (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto_id text REFERENCES produtos_catalogo(id) ON DELETE SET NULL,
  produto_nome text NOT NULL,
  quantidade integer NOT NULL DEFAULT 1,
  fornecedor_id text REFERENCES fornecedores(id) ON DELETE SET NULL,
  fornecedor_nome text NOT NULL,
  fornecedor_contato text,
  fornecedor_telefone text,
  fornecedor_email text,
  ultimo_valor_pago numeric(12,2),
  cotacao_atual numeric(12,2),
  prazo_entrega_dias integer,
  condicao_pagamento text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','reprovado','enviado')),
  aprovado_por text,
  aprovado_em timestamp,
  enviar_pedido_automatico boolean NOT NULL DEFAULT false,
  enviado_em timestamp,
  observacoes text,
  criado_por_nome text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS solicitacoes_compra_tenant_idx ON solicitacoes_compra(tenant_id);
CREATE INDEX IF NOT EXISTS solicitacoes_compra_status_idx ON solicitacoes_compra(tenant_id, status);
