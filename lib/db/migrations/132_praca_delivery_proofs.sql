-- Provas e falhas de entrega vinculadas à parada, ao pedido e ao volume.
-- A foto permanece no storage privado; esta tabela guarda somente a referência auditável.
CREATE TABLE IF NOT EXISTS praca_entrega_provas (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  rota_id text NOT NULL REFERENCES praca_rotas_entrega(id) ON DELETE RESTRICT,
  parada_id text NOT NULL REFERENCES praca_rota_paradas(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  volume_id text NOT NULL REFERENCES praca_pedido_volumes(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('documento','pessoa')),
  foto_url text NOT NULL CHECK (length(foto_url) BETWEEN 1 AND 2048),
  recebedor_nome text,
  documento_final text,
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  entregador_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (volume_id)
);

CREATE TABLE IF NOT EXISTS praca_entrega_falhas (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  rota_id text NOT NULL REFERENCES praca_rotas_entrega(id) ON DELETE RESTRICT,
  parada_id text NOT NULL REFERENCES praca_rota_paradas(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  volume_id text NOT NULL REFERENCES praca_pedido_volumes(id) ON DELETE RESTRICT,
  motivo_codigo text NOT NULL,
  descricao text NOT NULL,
  foto_url text,
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  entregador_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS praca_provas_pedido_idx ON praca_entrega_provas (pedido_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS praca_falhas_pedido_idx ON praca_entrega_falhas (pedido_id, ocorrido_em DESC);

ALTER TABLE praca_entrega_provas ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_entrega_falhas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY praca_entrega_provas_tenant ON praca_entrega_provas FOR ALL
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin')
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY praca_entrega_falhas_tenant ON praca_entrega_falhas FOR ALL
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin')
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')
    OR current_setting('app.platform_role', true) = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION prevent_praca_delivery_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'delivery proof/failure records are append-only';
END;
$$;

DROP TRIGGER IF EXISTS praca_entrega_provas_immutable ON praca_entrega_provas;
CREATE TRIGGER praca_entrega_provas_immutable
BEFORE UPDATE OR DELETE ON praca_entrega_provas
FOR EACH ROW EXECUTE FUNCTION prevent_praca_delivery_audit_mutation();

DROP TRIGGER IF EXISTS praca_entrega_falhas_immutable ON praca_entrega_falhas;
CREATE TRIGGER praca_entrega_falhas_immutable
BEFORE UPDATE OR DELETE ON praca_entrega_falhas
FOR EACH ROW EXECUTE FUNCTION prevent_praca_delivery_audit_mutation();
