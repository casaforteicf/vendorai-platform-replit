ALTER TABLE erp_titulos ADD COLUMN IF NOT EXISTS provedor_cobranca text;
ALTER TABLE erp_titulos ADD COLUMN IF NOT EXISTS provedor_cobranca_id text;
ALTER TABLE erp_titulos ADD COLUMN IF NOT EXISTS url_cobranca text;
CREATE UNIQUE INDEX IF NOT EXISTS erp_titulos_cobranca_unique ON erp_titulos(tenant_id, provedor_cobranca, provedor_cobranca_id);

CREATE TABLE erp_contas_bancarias (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome text NOT NULL, banco text, agencia text, conta text, saldo_inicial numeric(14,2) NOT NULL DEFAULT 0,
  ativa boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX erp_contas_bancarias_tenant ON erp_contas_bancarias(tenant_id);

CREATE TABLE erp_extratos_bancarios (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conta_id text REFERENCES erp_contas_bancarias(id) ON DELETE CASCADE, data timestamptz NOT NULL,
  descricao text NOT NULL, documento text, valor numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','conciliado','ignorado')),
  pagamento_id text REFERENCES erp_pagamentos(id) ON DELETE SET NULL, hash_importacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX erp_extrato_hash_unique ON erp_extratos_bancarios(tenant_id, hash_importacao) WHERE hash_importacao IS NOT NULL;

CREATE TABLE estoque_lotes (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inventory_item_id text NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  lote text NOT NULL, validade date, localizacao text, quantidade numeric(15,4) NOT NULL DEFAULT 0,
  custo_unitario numeric(14,4) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX estoque_lotes_unique ON estoque_lotes(tenant_id, inventory_item_id, lote, localizacao);

CREATE TABLE compra_recebimentos (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pedido_id text NOT NULL REFERENCES varejo_pedidos_compra(id) ON DELETE CASCADE,
  numero_documento text, recebido_em timestamptz NOT NULL DEFAULT now(), responsavel_id text REFERENCES users(id) ON DELETE SET NULL,
  observacoes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compra_recebimentos_pedido ON compra_recebimentos(tenant_id, pedido_id);

CREATE TABLE compra_recebimento_itens (
  id text PRIMARY KEY, recebimento_id text NOT NULL REFERENCES compra_recebimentos(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pedido_item_id text NOT NULL REFERENCES varejo_pedidos_compra_itens(id) ON DELETE CASCADE,
  quantidade numeric(15,4) NOT NULL, lote text, validade date, localizacao text, custo_unitario numeric(14,4),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE compra_cotacoes (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo text NOT NULL, status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_analise','aprovada','cancelada')),
  prazo_resposta date, fornecedor_vencedor_id text REFERENCES varejo_fornecedores(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE compra_cotacao_propostas (
  id text PRIMARY KEY, cotacao_id text NOT NULL REFERENCES compra_cotacoes(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fornecedor_id text NOT NULL REFERENCES varejo_fornecedores(id) ON DELETE CASCADE,
  valor_total numeric(14,2) NOT NULL, prazo_dias integer, condicao_pagamento text, observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(cotacao_id, fornecedor_id)
);

CREATE TABLE erp_sequencias_fiscais (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo erp_documento_tipo NOT NULL, serie text NOT NULL DEFAULT '1', proximo_numero integer NOT NULL DEFAULT 1,
  ambiente text NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao','producao')),
  UNIQUE(tenant_id, tipo, serie)
);

CREATE TABLE erp_integracao_eventos (
  id text PRIMARY KEY, tenant_id text REFERENCES tenants(id) ON DELETE CASCADE,
  provedor text NOT NULL, evento_id text NOT NULL, tipo text NOT NULL, payload jsonb,
  processado_em timestamptz NOT NULL DEFAULT now(), UNIQUE(provedor, evento_id)
);

CREATE TABLE erp_auditoria (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id text REFERENCES users(id) ON DELETE SET NULL, modulo text NOT NULL, acao text NOT NULL,
  entidade text NOT NULL, entidade_id text, antes jsonb, depois jsonb, ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX erp_auditoria_tenant_data ON erp_auditoria(tenant_id, created_at DESC);

ALTER TABLE erp_contas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_extratos_bancarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_recebimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_recebimento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_cotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_cotacao_propostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_integracao_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_sequencias_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_auditoria ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['erp_contas_bancarias','erp_extratos_bancarios','estoque_lotes','compra_recebimentos','compra_recebimento_itens','compra_cotacoes','compra_cotacao_propostas','erp_sequencias_fiscais','erp_integracao_eventos','erp_auditoria'] LOOP
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))', t);
  END LOOP;
END $$;
