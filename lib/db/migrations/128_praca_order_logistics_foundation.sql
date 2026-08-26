-- Fundação transacional do ciclo de pedidos Praça.ai -> Vendor.ai.
-- Valores monetários são armazenados em centavos para evitar arredondamento.
CREATE TABLE IF NOT EXISTS praca_pedidos (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  id_externo text,
  idempotency_key text NOT NULL,
  canal text NOT NULL DEFAULT 'praca_ai',
  status text NOT NULL DEFAULT 'recebido'
    CHECK (status IN (
      'recebido','pagamento_pendente','pago','em_separacao','pronto_coleta',
      'coleta_agendada','coletado','em_rota','entregue','falha_entrega',
      'cancelado','devolucao_solicitada','devolvido'
    )),
  moeda char(3) NOT NULL DEFAULT 'BRL',
  subtotal_centavos bigint NOT NULL CHECK (subtotal_centavos >= 0),
  frete_centavos bigint NOT NULL DEFAULT 0 CHECK (frete_centavos >= 0),
  desconto_centavos bigint NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0),
  total_centavos bigint NOT NULL CHECK (total_centavos >= 0),
  cliente_id text,
  cliente_nome text NOT NULL,
  cliente_email text,
  cliente_whatsapp text,
  endereco_entrega jsonb NOT NULL,
  observacoes text,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE NULLS NOT DISTINCT (tenant_id, id_externo)
);

CREATE TABLE IF NOT EXISTS praca_pedido_itens (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  produto_id text NOT NULL REFERENCES produtos_catalogo(id) ON DELETE RESTRICT,
  sku text,
  nome_snapshot text NOT NULL,
  quantidade numeric(14,3) NOT NULL CHECK (quantidade > 0),
  unidade text NOT NULL,
  valor_unitario_centavos bigint NOT NULL CHECK (valor_unitario_centavos >= 0),
  total_centavos bigint NOT NULL CHECK (total_centavos >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS praca_pedido_volumes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  numero integer NOT NULL CHECK (numero > 0),
  qr_code text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'criado'
    CHECK (status IN (
      'criado','etiquetado','pronto_coleta','coletado','em_rota',
      'entregue','falha_entrega','devolvido','cancelado'
    )),
  peso_gramas integer CHECK (peso_gramas IS NULL OR peso_gramas > 0),
  dimensoes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pedido_id, numero)
);

CREATE TABLE IF NOT EXISTS praca_pedido_volume_itens (
  volume_id text NOT NULL REFERENCES praca_pedido_volumes(id) ON DELETE RESTRICT,
  item_id text NOT NULL REFERENCES praca_pedido_itens(id) ON DELETE RESTRICT,
  quantidade numeric(14,3) NOT NULL CHECK (quantidade > 0),
  PRIMARY KEY (volume_id, item_id)
);

CREATE TABLE IF NOT EXISTS praca_pedido_eventos (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  volume_id text REFERENCES praca_pedido_volumes(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  status_anterior text,
  status_novo text,
  ator_tipo text NOT NULL CHECK (ator_tipo IN ('cliente','tenant','entregador','sistema','integracao')),
  ator_id text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  motivo_codigo text,
  descricao text,
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  recebido_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS praca_pedidos_tenant_status_idx
  ON praca_pedidos (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS praca_pedido_itens_pedido_idx
  ON praca_pedido_itens (pedido_id);
CREATE INDEX IF NOT EXISTS praca_volumes_pedido_idx
  ON praca_pedido_volumes (pedido_id, numero);
CREATE INDEX IF NOT EXISTS praca_eventos_pedido_idx
  ON praca_pedido_eventos (pedido_id, ocorrido_em, id);
CREATE INDEX IF NOT EXISTS praca_eventos_volume_idx
  ON praca_pedido_eventos (volume_id, ocorrido_em, id) WHERE volume_id IS NOT NULL;

-- A trilha de custódia é append-only: correções geram um novo evento.
CREATE OR REPLACE FUNCTION prevent_praca_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'praca_pedido_eventos is append-only';
END;
$$;
DROP TRIGGER IF EXISTS praca_pedido_eventos_immutable ON praca_pedido_eventos;
CREATE TRIGGER praca_pedido_eventos_immutable
BEFORE UPDATE OR DELETE ON praca_pedido_eventos
FOR EACH ROW EXECUTE FUNCTION prevent_praca_event_mutation();

ALTER TABLE praca_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_pedido_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_pedido_volumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_pedido_eventos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY praca_pedidos_tenant ON praca_pedidos FOR ALL
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin')
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY praca_itens_tenant ON praca_pedido_itens FOR ALL
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin')
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY praca_volumes_tenant ON praca_pedido_volumes FOR ALL
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin')
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY praca_eventos_tenant ON praca_pedido_eventos FOR SELECT
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY praca_eventos_insert ON praca_pedido_eventos FOR INSERT
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
