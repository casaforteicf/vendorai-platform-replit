-- Ondas de coleta e rotas rastreáveis do Praça.ai.
-- Nenhum horário, endereço ou coordenada é presumido: tenants não configurados são ignorados pelo agendador.

CREATE TABLE IF NOT EXISTS praca_logistica_config (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE RESTRICT,
  timezone text NOT NULL,
  horario_corte time NOT NULL,
  horario_despacho time NOT NULL,
  dias_semana smallint[] NOT NULL CHECK (cardinality(dias_semana) > 0),
  endereco_coleta jsonb NOT NULL,
  max_paradas_por_rota integer NOT NULL CHECK (max_paradas_por_rota BETWEEN 1 AND 200),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (horario_despacho >= horario_corte)
);

CREATE TABLE IF NOT EXISTS praca_ondas_coleta (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  data_servico date NOT NULL,
  corte_em timestamptz NOT NULL,
  despacho_em timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'planejando'
    CHECK (status IN ('planejando','despachada','parcial','sem_pedidos','bloqueada','cancelada')),
  pedidos_planejados integer NOT NULL DEFAULT 0 CHECK (pedidos_planejados >= 0),
  pedidos_pendentes integer NOT NULL DEFAULT 0 CHECK (pedidos_pendentes >= 0),
  motivo_bloqueio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, data_servico)
);

CREATE TABLE IF NOT EXISTS praca_rotas_entrega (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  onda_id text NOT NULL REFERENCES praca_ondas_coleta(id) ON DELETE RESTRICT,
  entregador_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  numero integer NOT NULL CHECK (numero > 0),
  status text NOT NULL DEFAULT 'planejada'
    CHECK (status IN ('planejada','aceita','coletando','em_rota','concluida','parcial','cancelada')),
  total_paradas integer NOT NULL DEFAULT 0 CHECK (total_paradas >= 0),
  iniciada_em timestamptz,
  concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (onda_id, numero),
  UNIQUE (onda_id, entregador_id)
);

CREATE TABLE IF NOT EXISTS praca_rota_paradas (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  rota_id text NOT NULL REFERENCES praca_rotas_entrega(id) ON DELETE RESTRICT,
  pedido_id text REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('coleta','entrega')),
  sequencia integer NOT NULL CHECK (sequencia > 0),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','chegou','concluida','falhou','ignorada')),
  endereco_snapshot jsonb NOT NULL,
  contato_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  motivo_falha_codigo text,
  motivo_falha_descricao text,
  ocorreu_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rota_id, sequencia),
  UNIQUE (rota_id, pedido_id, tipo)
);

CREATE TABLE IF NOT EXISTS praca_rota_parada_volumes (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  parada_id text NOT NULL REFERENCES praca_rota_paradas(id) ON DELETE RESTRICT,
  volume_id text NOT NULL REFERENCES praca_pedido_volumes(id) ON DELETE RESTRICT,
  PRIMARY KEY (parada_id, volume_id)
);

CREATE TABLE IF NOT EXISTS praca_logistica_pendencias (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  onda_id text REFERENCES praca_ondas_coleta(id) ON DELETE RESTRICT,
  pedido_id text REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  codigo text NOT NULL,
  descricao text NOT NULL,
  resolvida boolean NOT NULL DEFAULT false,
  resolvida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, onda_id, pedido_id, codigo)
);

CREATE INDEX IF NOT EXISTS praca_ondas_tenant_data_idx ON praca_ondas_coleta (tenant_id, data_servico DESC);
CREATE INDEX IF NOT EXISTS praca_rotas_onda_idx ON praca_rotas_entrega (onda_id, numero);
CREATE INDEX IF NOT EXISTS praca_paradas_rota_idx ON praca_rota_paradas (rota_id, sequencia);
CREATE INDEX IF NOT EXISTS praca_pendencias_abertas_idx ON praca_logistica_pendencias (tenant_id, created_at DESC) WHERE NOT resolvida;

ALTER TABLE praca_logistica_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_ondas_coleta ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_rotas_entrega ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_rota_paradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_rota_parada_volumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_logistica_pendencias ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'praca_logistica_config','praca_ondas_coleta','praca_rotas_entrega',
    'praca_rota_paradas','praca_rota_parada_volumes','praca_logistica_pendencias'
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
