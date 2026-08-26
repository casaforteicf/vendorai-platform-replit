-- Exceções logísticas: rastreio público seguro, conversas, reentregas e outbox WhatsApp.
ALTER TABLE praca_pedidos
  ADD COLUMN IF NOT EXISTS tracking_token text
  DEFAULT encode(gen_random_bytes(32), 'hex');
UPDATE praca_pedidos SET tracking_token=encode(gen_random_bytes(32), 'hex') WHERE tracking_token IS NULL;
ALTER TABLE praca_pedidos ALTER COLUMN tracking_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS praca_pedidos_tracking_token_uidx ON praca_pedidos (tracking_token);

CREATE TABLE IF NOT EXISTS praca_entrega_interacoes (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  rota_id text REFERENCES praca_rotas_entrega(id) ON DELETE RESTRICT,
  remetente_tipo text NOT NULL CHECK (remetente_tipo IN ('cliente','entregador','operador','sistema')),
  remetente_id text,
  canal text NOT NULL CHECK (canal IN ('portal','app_entregador','vendorai','whatsapp')),
  mensagem text NOT NULL CHECK (length(mensagem) BETWEEN 1 AND 4000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS praca_reentregas (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  parada_falha_id text NOT NULL REFERENCES praca_rota_paradas(id) ON DELETE RESTRICT,
  data_servico date NOT NULL,
  status text NOT NULL DEFAULT 'solicitada'
    CHECK (status IN ('solicitada','incluida_em_onda','concluida','cancelada')),
  motivo text NOT NULL,
  solicitada_por text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pedido_id, parada_falha_id, data_servico)
);

CREATE TABLE IF NOT EXISTS praca_entrega_notificacoes (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  interacao_id bigint REFERENCES praca_entrega_interacoes(id) ON DELETE RESTRICT,
  destinatario_whatsapp text NOT NULL,
  template text NOT NULL CHECK (template IN ('falha_entrega','mensagem_entregador','reentrega_agendada')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','processando','enviada','falhou')),
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  erro text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS praca_interacoes_pedido_idx ON praca_entrega_interacoes (pedido_id,created_at,id);
CREATE INDEX IF NOT EXISTS praca_reentregas_tenant_data_idx ON praca_reentregas (tenant_id,data_servico,status);
CREATE INDEX IF NOT EXISTS praca_notificacoes_fila_idx
  ON praca_entrega_notificacoes (proxima_tentativa_em,id)
  WHERE status IN ('pendente','falhou');

ALTER TABLE praca_entrega_interacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_reentregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_entrega_notificacoes ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'praca_entrega_interacoes','praca_reentregas','praca_entrega_notificacoes'
  ] LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''') OR current_setting(''app.platform_role'', true) = ''super_admin'') WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''') OR current_setting(''app.platform_role'', true) = ''super_admin'')',
        table_name || '_tenant', table_name
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $policies$;

CREATE OR REPLACE FUNCTION prevent_praca_interaction_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'delivery interactions are append-only';
END;
$$;
DROP TRIGGER IF EXISTS praca_interacoes_no_mutation ON praca_entrega_interacoes;
CREATE TRIGGER praca_interacoes_no_mutation
BEFORE UPDATE OR DELETE ON praca_entrega_interacoes
FOR EACH ROW EXECUTE FUNCTION prevent_praca_interaction_delete();
