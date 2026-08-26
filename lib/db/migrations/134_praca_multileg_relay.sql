-- Entregas multi-trecho com ponto de redespacho e dupla confirmação de custódia.
CREATE TABLE IF NOT EXISTS praca_pontos_redespacho (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  nome text NOT NULL,
  endereco jsonb NOT NULL,
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  ativo boolean NOT NULL DEFAULT true,
  horario_operacao jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,nome)
);

ALTER TABLE praca_pedidos ADD COLUMN IF NOT EXISTS modelo_logistico text NOT NULL DEFAULT 'direto';
ALTER TABLE praca_pedidos ADD COLUMN IF NOT EXISTS ponto_redespacho_id text REFERENCES praca_pontos_redespacho(id) ON DELETE RESTRICT;
DO $$ BEGIN
  ALTER TABLE praca_pedidos ADD CONSTRAINT praca_pedidos_modelo_logistico_chk
  CHECK (modelo_logistico IN ('direto','redespacho'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE praca_pedidos ADD CONSTRAINT praca_pedidos_redespacho_chk
  CHECK (modelo_logistico='direto' OR ponto_redespacho_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS praca_trechos_logisticos (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  onda_id text REFERENCES praca_ondas_coleta(id) ON DELETE RESTRICT,
  rota_id text REFERENCES praca_rotas_entrega(id) ON DELETE RESTRICT,
  ordem integer NOT NULL CHECK (ordem > 0),
  tipo text NOT NULL CHECK (tipo IN ('direto','coleta_redespacho','ultima_milha')),
  origem_tipo text NOT NULL CHECK (origem_tipo IN ('vendedor','redespacho')),
  destino_tipo text NOT NULL CHECK (destino_tipo IN ('cliente','redespacho')),
  origem_snapshot jsonb NOT NULL,
  destino_snapshot jsonb NOT NULL,
  entregador_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'planejado'
    CHECK (status IN ('planejado','aceito','em_execucao','aguardando_transferencia','concluido','falhou','cancelado')),
  valor_frete_centavos bigint NOT NULL DEFAULT 0 CHECK (valor_frete_centavos >= 0),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pedido_id,ordem)
);

ALTER TABLE praca_rota_paradas ADD COLUMN IF NOT EXISTS trecho_id text REFERENCES praca_trechos_logisticos(id) ON DELETE RESTRICT;
ALTER TABLE praca_rotas_entrega ADD COLUMN IF NOT EXISTS modalidade text NOT NULL DEFAULT 'direta';
ALTER TABLE praca_rotas_entrega DROP CONSTRAINT IF EXISTS praca_rotas_entrega_status_check;
ALTER TABLE praca_rotas_entrega ADD CONSTRAINT praca_rotas_entrega_status_check
  CHECK (status IN ('planejada','aguardando_transferencia','aceita','coletando','em_rota','concluida','parcial','cancelada'));
ALTER TABLE praca_rotas_entrega DROP CONSTRAINT IF EXISTS praca_rotas_entrega_modalidade_check;
ALTER TABLE praca_rotas_entrega ADD CONSTRAINT praca_rotas_entrega_modalidade_check
  CHECK (modalidade IN ('direta','coleta_redespacho','ultima_milha'));

ALTER TABLE praca_rota_paradas DROP CONSTRAINT IF EXISTS praca_rota_paradas_tipo_check;
ALTER TABLE praca_rota_paradas ADD CONSTRAINT praca_rota_paradas_tipo_check
  CHECK (tipo IN ('coleta','entrega','redespacho_saida','redespacho_recebimento'));

CREATE TABLE IF NOT EXISTS praca_transferencias_custodia (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  pedido_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  volume_id text NOT NULL REFERENCES praca_pedido_volumes(id) ON DELETE RESTRICT,
  ponto_redespacho_id text NOT NULL REFERENCES praca_pontos_redespacho(id) ON DELETE RESTRICT,
  trecho_origem_id text NOT NULL REFERENCES praca_trechos_logisticos(id) ON DELETE RESTRICT,
  trecho_destino_id text NOT NULL REFERENCES praca_trechos_logisticos(id) ON DELETE RESTRICT,
  entregador_saida_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entregador_entrada_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'aguardando_saida'
    CHECK (status IN ('aguardando_saida','aguardando_recebimento','concluida','divergencia','cancelada')),
  saida_confirmada_em timestamptz,
  saida_latitude numeric(9,6),
  saida_longitude numeric(9,6),
  entrada_confirmada_em timestamptz,
  entrada_latitude numeric(9,6),
  entrada_longitude numeric(9,6),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (volume_id,trecho_origem_id,trecho_destino_id),
  CHECK (trecho_origem_id<>trecho_destino_id),
  CHECK (entregador_saida_id<>entregador_entrada_id)
);

ALTER TABLE praca_pedido_volumes ADD COLUMN IF NOT EXISTS custodia_tipo text NOT NULL DEFAULT 'tenant';
ALTER TABLE praca_pedido_volumes ADD COLUMN IF NOT EXISTS custodia_id text;
ALTER TABLE praca_pedido_volumes ADD COLUMN IF NOT EXISTS trecho_atual_id text REFERENCES praca_trechos_logisticos(id) ON DELETE RESTRICT;
DO $$ BEGIN
  ALTER TABLE praca_pedido_volumes ADD CONSTRAINT praca_volume_custodia_tipo_chk
  CHECK (custodia_tipo IN ('tenant','entregador','redespacho','cliente'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS praca_trechos_pedido_idx ON praca_trechos_logisticos (pedido_id,ordem);
CREATE INDEX IF NOT EXISTS praca_transferencias_destino_idx ON praca_transferencias_custodia (entregador_entrada_id,status);
CREATE INDEX IF NOT EXISTS praca_transferencias_volume_idx ON praca_transferencias_custodia (volume_id,created_at DESC);

ALTER TABLE praca_pontos_redespacho ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_trechos_logisticos ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_transferencias_custodia ENABLE ROW LEVEL SECURITY;
DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['praca_pontos_redespacho','praca_trechos_logisticos','praca_transferencias_custodia'] LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'') WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'')',
        table_name||'_tenant',table_name);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $policies$;
