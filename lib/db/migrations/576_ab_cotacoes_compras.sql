-- 576_ab_cotacoes_compras.sql
-- Cotação do A&B ligada à ordem de compra e ao fornecedor escolhido.

CREATE TABLE IF NOT EXISTS ab_cotacoes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  origem text NOT NULL DEFAULT 'planejamento' CHECK (origem IN ('planejamento','manual')),
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','respondida','adjudicada','cancelada')),
  observacao text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_cotacoes_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT ab_cotacoes_periodo_uq CHECK (data_fim >= data_inicio)
);

CREATE TABLE IF NOT EXISTS ab_cotacao_itens (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cotacao_id text NOT NULL,
  insumo_id text NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  insumo_nome text NOT NULL,
  quantidade numeric(15,4) NOT NULL CHECK (quantidade > 0),
  unidade text NOT NULL CHECK (unidade IN ('g','ml','un')),
  ordem integer NOT NULL DEFAULT 0,
  CONSTRAINT ab_cotacao_itens_tenant_id_uq UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, cotacao_id) REFERENCES ab_cotacoes(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ab_cotacao_fornecedores (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cotacao_id text NOT NULL,
  fornecedor_id text NOT NULL REFERENCES fornecedores(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'convidado' CHECK (status IN ('convidado','respondido','selecionado','descartado')),
  valor_total numeric(15,2),
  prazo_entrega_dias integer,
  condicoes_pagamento text,
  observacao text,
  respondido_em timestamptz,
  CONSTRAINT ab_cotacao_fornecedores_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT ab_cotacao_fornecedores_cotacao_fornecedor_uq UNIQUE (tenant_id, cotacao_id, fornecedor_id),
  FOREIGN KEY (tenant_id, cotacao_id) REFERENCES ab_cotacoes(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE ab_ordens_compra
  ADD COLUMN IF NOT EXISTS cotacao_id text,
  ADD COLUMN IF NOT EXISTS fornecedor_id text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ab_ordens_compra_cotacao_fk') THEN
    ALTER TABLE ab_ordens_compra
      ADD CONSTRAINT ab_ordens_compra_cotacao_fk
      FOREIGN KEY (tenant_id, cotacao_id) REFERENCES ab_cotacoes(tenant_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ab_ordens_compra_fornecedor_fk') THEN
    ALTER TABLE ab_ordens_compra
      ADD CONSTRAINT ab_ordens_compra_fornecedor_fk
      FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ab_cotacoes_tenant_status_idx ON ab_cotacoes(tenant_id, status, data_inicio DESC);
CREATE INDEX IF NOT EXISTS ab_cotacao_itens_cotacao_idx ON ab_cotacao_itens(tenant_id, cotacao_id, ordem);
CREATE INDEX IF NOT EXISTS ab_cotacao_fornecedores_cotacao_idx ON ab_cotacao_fornecedores(tenant_id, cotacao_id);

ALTER TABLE ab_cotacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_cotacoes_tenant_isolation ON ab_cotacoes;
CREATE POLICY ab_cotacoes_tenant_isolation ON ab_cotacoes
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE ab_cotacao_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_cotacao_itens_tenant_isolation ON ab_cotacao_itens;
CREATE POLICY ab_cotacao_itens_tenant_isolation ON ab_cotacao_itens
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE ab_cotacao_fornecedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_cotacao_fornecedores_tenant_isolation ON ab_cotacao_fornecedores;
CREATE POLICY ab_cotacao_fornecedores_tenant_isolation ON ab_cotacao_fornecedores
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vendorai_app_login') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ab_cotacoes TO vendorai_app_login';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ab_cotacao_itens TO vendorai_app_login';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ab_cotacao_fornecedores TO vendorai_app_login';
  END IF;
END $$;
