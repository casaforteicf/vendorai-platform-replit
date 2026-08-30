-- Logística reversa rastreável dos pedidos Praça.ai, operada no Vendor.ai.
CREATE TABLE IF NOT EXISTS praca_devolucoes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  motivo_codigo text NOT NULL,
  motivo_descricao text NOT NULL,
  modelo_logistico text NOT NULL CHECK (modelo_logistico IN ('direto','redespacho')),
  status text NOT NULL DEFAULT 'solicitada' CHECK (status IN (
    'solicitada','agendada','coletada_cliente','em_rota_redespacho',
    'recebida_redespacho','em_rota_vendedor','recebida_vendedor',
    'divergencia','cancelada'
  )),
  data_servico date NOT NULL,
  endereco_coleta jsonb NOT NULL,
  endereco_destino jsonb NOT NULL,
  ponto_redespacho_id text REFERENCES praca_pontos_redespacho(id) ON DELETE RESTRICT,
  entregador_coleta_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entregador_destino_id text REFERENCES users(id) ON DELETE RESTRICT,
  sequencia_coleta integer CHECK (sequencia_coleta IS NULL OR sequencia_coleta > 0),
  sequencia_destino integer CHECK (sequencia_destino IS NULL OR sequencia_destino > 0),
  qr_code text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24),'hex'),
  solicitada_por text,
  recebida_por text,
  condicao_recebimento text,
  evidencia_recebimento jsonb NOT NULL DEFAULT '{}'::jsonb,
  solicitada_em timestamptz NOT NULL DEFAULT now(),
  agendada_em timestamptz,
  coletada_em timestamptz,
  recebida_em timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,idempotency_key),
  UNIQUE (pedido_id)
);

CREATE TABLE IF NOT EXISTS praca_devolucao_eventos (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  devolucao_id text NOT NULL REFERENCES praca_devolucoes(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  status_anterior text,
  status_novo text NOT NULL,
  ator_tipo text NOT NULL CHECK (ator_tipo IN ('cliente','tenant','entregador','sistema')),
  ator_id text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  motivo text,
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS praca_devolucoes_operacao_idx
  ON praca_devolucoes (tenant_id,status,data_servico);
CREATE INDEX IF NOT EXISTS praca_devolucao_eventos_idx
  ON praca_devolucao_eventos (devolucao_id,ocorrido_em,id);

CREATE OR REPLACE FUNCTION prevent_praca_devolucao_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'praca_devolucao_eventos is append-only'; END;
$$;
DROP TRIGGER IF EXISTS praca_devolucao_eventos_immutable ON praca_devolucao_eventos;
CREATE TRIGGER praca_devolucao_eventos_immutable
BEFORE UPDATE OR DELETE ON praca_devolucao_eventos
FOR EACH ROW EXECUTE FUNCTION prevent_praca_devolucao_event_mutation();

ALTER TABLE praca_devolucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_devolucao_eventos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY praca_devolucoes_tenant ON praca_devolucoes FOR ALL
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin')
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY praca_devolucao_eventos_select ON praca_devolucao_eventos FOR SELECT
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY praca_devolucao_eventos_insert ON praca_devolucao_eventos FOR INSERT
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
