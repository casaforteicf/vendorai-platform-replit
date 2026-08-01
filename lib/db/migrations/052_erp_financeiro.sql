CREATE TYPE erp_titulo_tipo AS ENUM ('receber', 'pagar');
CREATE TYPE erp_titulo_status AS ENUM ('pendente', 'pago', 'vencido', 'cancelado');
CREATE TYPE erp_categoria AS ENUM ('receita', 'custo', 'despesa', 'imposto', 'investimento');
CREATE TYPE erp_documento_tipo AS ENUM ('nfe', 'nfse', 'boleto');
CREATE TYPE erp_documento_status AS ENUM ('rascunho', 'processando', 'autorizado', 'rejeitado', 'cancelado');

CREATE TABLE erp_titulos (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo erp_titulo_tipo NOT NULL, categoria erp_categoria NOT NULL, descricao text NOT NULL,
  pessoa text, documento text, valor_original numeric(14,2) NOT NULL, juros numeric(14,2) NOT NULL DEFAULT 0,
  multa numeric(14,2) NOT NULL DEFAULT 0, desconto numeric(14,2) NOT NULL DEFAULT 0,
  valor_pago numeric(14,2) NOT NULL DEFAULT 0, vencimento timestamptz NOT NULL, pago_em timestamptz,
  status erp_titulo_status NOT NULL DEFAULT 'pendente', conta_bancaria text, origem_tipo text, origem_id text,
  observacoes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX erp_titulos_origem_unique ON erp_titulos(tenant_id, origem_tipo, origem_id);
CREATE INDEX erp_titulos_tenant_vencimento ON erp_titulos(tenant_id, vencimento);
CREATE INDEX erp_titulos_tenant_status ON erp_titulos(tenant_id, status);

CREATE TABLE erp_pagamentos (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo_id text NOT NULL REFERENCES erp_titulos(id) ON DELETE CASCADE, valor numeric(14,2) NOT NULL,
  juros numeric(14,2) NOT NULL DEFAULT 0, multa numeric(14,2) NOT NULL DEFAULT 0,
  desconto numeric(14,2) NOT NULL DEFAULT 0, forma text, conta_bancaria text, conciliacao_id text,
  pago_em timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX erp_pagamentos_titulo ON erp_pagamentos(titulo_id, pago_em);

CREATE TABLE erp_documentos_fiscais (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo erp_documento_tipo NOT NULL, status erp_documento_status NOT NULL DEFAULT 'rascunho',
  titulo_id text REFERENCES erp_titulos(id) ON DELETE SET NULL, numero text, chave text, provedor text,
  provedor_id text, destinatario text NOT NULL, documento_destinatario text, valor numeric(14,2) NOT NULL,
  url text, erro text, emitido_em timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX erp_documentos_tenant_status ON erp_documentos_fiscais(tenant_id, status);

