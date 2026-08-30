-- Fila compartilhada de perguntas de produtos Praça.ai -> Vendor.ai.
CREATE TABLE IF NOT EXISTS praca_produto_perguntas (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES produtos_catalogo(id) ON DELETE CASCADE,
  cliente_id text,
  cliente_nome text,
  pergunta text NOT NULL,
  resposta text,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'respondida', 'arquivada')),
  respondida_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS praca_produto_perguntas_tenant_status_idx
  ON praca_produto_perguntas (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS praca_produto_perguntas_product_idx
  ON praca_produto_perguntas (product_id, created_at DESC);

ALTER TABLE praca_produto_perguntas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY praca_produto_perguntas_public_insert
  ON praca_produto_perguntas FOR INSERT
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY praca_produto_perguntas_tenant_select
  ON praca_produto_perguntas FOR SELECT
  USING (
    tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY praca_produto_perguntas_tenant_update
  ON praca_produto_perguntas FOR UPDATE
  USING (
    tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin'
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
