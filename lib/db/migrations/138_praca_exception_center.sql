-- Central executiva de exceções e SLA do Praça.ai no Vendor.ai.
CREATE TABLE IF NOT EXISTS praca_exception_config (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE RESTRICT,
  pedido_parado_minutos integer NOT NULL DEFAULT 120 CHECK (pedido_parado_minutos BETWEEN 5 AND 10080),
  rota_parada_minutos integer NOT NULL DEFAULT 30 CHECK (rota_parada_minutos BETWEEN 5 AND 1440),
  estorno_pendente_minutos integer NOT NULL DEFAULT 60 CHECK (estorno_pendente_minutos BETWEEN 5 AND 10080),
  devolucao_atrasada_horas integer NOT NULL DEFAULT 24 CHECK (devolucao_atrasada_horas BETWEEN 1 AND 720),
  notificacao_falha_minutos integer NOT NULL DEFAULT 15 CHECK (notificacao_falha_minutos BETWEEN 5 AND 1440),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS praca_exception_incidents (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  incident_type text NOT NULL CHECK (incident_type IN (
    'pagamento_atrasado','pagamento_falhou','chargeback','split_bloqueado',
    'pedido_parado','rota_parada','falha_entrega','custodia_divergente',
    'devolucao_atrasada','estorno_pendente','notificacao_falhou'
  )),
  entity_type text NOT NULL CHECK (entity_type IN (
    'pedido','pagamento','rota','transferencia','devolucao','estorno','notificacao'
  )),
  entity_id text NOT NULL,
  pedido_id text REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  severity text NOT NULL CHECK (severity IN ('baixa','media','alta','critica')),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','reconhecido','resolvido','ignorado')),
  title text NOT NULL,
  description text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_to text REFERENCES users(id) ON DELETE SET NULL,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS praca_exception_open_unique
  ON praca_exception_incidents (tenant_id,incident_type,entity_type,entity_id)
  WHERE status IN ('aberto','reconhecido');
CREATE INDEX IF NOT EXISTS praca_exception_queue_idx
  ON praca_exception_incidents (tenant_id,status,severity,due_at,last_detected_at DESC);
CREATE INDEX IF NOT EXISTS praca_exception_order_idx
  ON praca_exception_incidents (pedido_id,last_detected_at DESC) WHERE pedido_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS praca_exception_events (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  incident_id text NOT NULL REFERENCES praca_exception_incidents(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('detectado','redetectado','atribuido','reconhecido','resolvido','reaberto','ignorado','comentario')),
  actor_id text,
  previous_status text,
  new_status text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS praca_exception_events_incident_idx
  ON praca_exception_events (incident_id,created_at,id);

CREATE OR REPLACE FUNCTION prevent_praca_exception_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'praca_exception_events is append-only'; END;
$$;
DROP TRIGGER IF EXISTS praca_exception_events_immutable ON praca_exception_events;
CREATE TRIGGER praca_exception_events_immutable
BEFORE UPDATE OR DELETE ON praca_exception_events
FOR EACH ROW EXECUTE FUNCTION prevent_praca_exception_event_mutation();

ALTER TABLE praca_exception_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_exception_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_exception_events ENABLE ROW LEVEL SECURITY;
DO $policies$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['praca_exception_config','praca_exception_incidents'] LOOP
    BEGIN EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'') WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'')',
      t||'_tenant',t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $policies$;
DO $$ BEGIN
  CREATE POLICY praca_exception_events_select ON praca_exception_events FOR SELECT
  USING (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY praca_exception_events_insert ON praca_exception_events FOR INSERT
  WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
