-- Avaliações verificadas e automação pós-entrega do Praça.ai.
CREATE TABLE IF NOT EXISTS praca_avaliacao_solicitacoes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  product_id text NOT NULL REFERENCES produtos_catalogo(id) ON DELETE CASCADE,
  cliente_id text,
  cliente_nome text,
  cliente_email text,
  cliente_whatsapp text,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'agendada'
    CHECK (status IN ('agendada','enviada','lembrada','concluida','cancelada')),
  solicitar_em timestamptz NOT NULL DEFAULT (now() + interval '2 days'),
  enviada_em timestamptz,
  lembrada_em timestamptz,
  concluida_em timestamptz,
  canais jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_id, product_id)
);

CREATE TABLE IF NOT EXISTS praca_produto_avaliacoes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES produtos_catalogo(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  solicitacao_id text NOT NULL UNIQUE
    REFERENCES praca_avaliacao_solicitacoes(id) ON DELETE RESTRICT,
  cliente_id text,
  cliente_nome text,
  nota integer NOT NULL CHECK (nota BETWEEN 1 AND 10),
  comentario text,
  fotos jsonb NOT NULL DEFAULT '[]'::jsonb,
  compra_verificada boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'publicada'
    CHECK (status IN ('pendente','publicada','oculta','rejeitada')),
  resposta_loja text,
  respondida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS praca_avaliacoes_produto_idx
  ON praca_produto_avaliacoes (product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS praca_avaliacoes_tenant_idx
  ON praca_produto_avaliacoes (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS praca_avaliacao_solicitacoes_fila_idx
  ON praca_avaliacao_solicitacoes (status, solicitar_em);

ALTER TABLE praca_avaliacao_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_produto_avaliacoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY praca_avaliacoes_public_select
  ON praca_produto_avaliacoes FOR SELECT
  USING (
    status = 'publicada'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY praca_avaliacoes_public_insert
  ON praca_produto_avaliacoes FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY praca_solicitacoes_tenant
  ON praca_avaliacao_solicitacoes FOR ALL
  USING (
    tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
