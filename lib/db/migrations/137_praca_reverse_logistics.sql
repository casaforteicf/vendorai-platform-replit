-- Devolução e logística reversa rastreável do Praça.ai, operadas no Vendor.ai.
CREATE TABLE IF NOT EXISTS praca_devolucoes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'solicitada' CHECK (status IN (
    'solicitada','aprovada','rejeitada','coleta_agendada','coletada','em_transito',
    'no_redespacho','recebida_vendedor','em_inspecao','aprovada_estorno',
    'recusada_estorno','concluida','falha_coleta','falha_transporte','cancelada'
  )),
  motivo text NOT NULL,
  modelo_logistico text NOT NULL CHECK (modelo_logistico IN ('direto','redespacho')),
  ponto_redespacho_id text REFERENCES praca_pontos_redespacho(id) ON DELETE RESTRICT,
  data_coleta date NOT NULL,
  endereco_cliente_snapshot jsonb NOT NULL,
  endereco_retorno_snapshot jsonb NOT NULL,
  resultado_inspecao text CHECK (resultado_inspecao IN ('integral','parcial','recusada')),
  observacao_inspecao text,
  solicitado_por text,
  aprovado_por text,
  inspecionado_por text,
  solicitada_em timestamptz NOT NULL DEFAULT now(),
  aprovada_em timestamptz,
  coletada_em timestamptz,
  recebida_em timestamptz,
  inspecionada_em timestamptz,
  concluida_em timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pedido_id),
  CHECK (modelo_logistico='direto' OR ponto_redespacho_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS praca_devolucao_trechos (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  devolucao_id text NOT NULL REFERENCES praca_devolucoes(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  ordem integer NOT NULL CHECK (ordem > 0),
  tipo text NOT NULL CHECK (tipo IN ('cliente_vendedor','cliente_redespacho','redespacho_vendedor')),
  entregador_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'planejado' CHECK (status IN (
    'planejado','aceito','em_coleta','em_transito','aguardando_transferencia',
    'concluido','falhou','cancelado'
  )),
  origem_snapshot jsonb NOT NULL,
  destino_snapshot jsonb NOT NULL,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (devolucao_id,ordem)
);

CREATE TABLE IF NOT EXISTS praca_devolucao_volumes (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  devolucao_id text NOT NULL REFERENCES praca_devolucoes(id) ON DELETE RESTRICT,
  volume_id text NOT NULL REFERENCES praca_pedido_volumes(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'aguardando_coleta' CHECK (status IN (
    'aguardando_coleta','coletado','em_transito','no_redespacho',
    'recebido_vendedor','inspecionado','divergencia'
  )),
  custodia_tipo text NOT NULL DEFAULT 'cliente' CHECK (custodia_tipo IN ('cliente','entregador','redespacho','tenant')),
  custodia_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (devolucao_id,volume_id)
);

CREATE TABLE IF NOT EXISTS praca_devolucao_eventos (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  devolucao_id text NOT NULL REFERENCES praca_devolucoes(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  volume_id text REFERENCES praca_pedido_volumes(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  status_anterior text,
  status_novo text NOT NULL,
  ator_tipo text NOT NULL,
  ator_id text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  descricao text,
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS praca_devolucoes_status_idx ON praca_devolucoes (tenant_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS praca_devolucao_trechos_entregador_idx ON praca_devolucao_trechos (tenant_id,entregador_id,status);
CREATE INDEX IF NOT EXISTS praca_devolucao_eventos_idx ON praca_devolucao_eventos (devolucao_id,ocorrido_em,id);

CREATE OR REPLACE FUNCTION prevent_praca_devolucao_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'praca_devolucao_eventos is append-only'; END;
$$;
DROP TRIGGER IF EXISTS praca_devolucao_eventos_immutable ON praca_devolucao_eventos;
CREATE TRIGGER praca_devolucao_eventos_immutable
BEFORE UPDATE OR DELETE ON praca_devolucao_eventos
FOR EACH ROW EXECUTE FUNCTION prevent_praca_devolucao_event_mutation();

ALTER TABLE praca_devolucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_devolucao_trechos ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_devolucao_volumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_devolucao_eventos ENABLE ROW LEVEL SECURITY;
DO $policies$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['praca_devolucoes','praca_devolucao_trechos','praca_devolucao_volumes'] LOOP
    BEGIN EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'') WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'')',t||'_tenant',t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $policies$;
DO $$ BEGIN CREATE POLICY praca_devolucao_eventos_select ON praca_devolucao_eventos FOR SELECT
USING (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY praca_devolucao_eventos_insert ON praca_devolucao_eventos FOR INSERT
WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
