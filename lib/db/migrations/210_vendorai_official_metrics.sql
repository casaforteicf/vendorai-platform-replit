-- VendorAI — Camada Oficial de Métricas
-- Migration 206 — histórica, auditável e sem métricas inventadas

CREATE TABLE IF NOT EXISTS process_stage_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline text NOT NULL,
  process_type text NOT NULL,
  process_id text NOT NULL,
  cycle_id text NOT NULL,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  deal_id text REFERENCES deals(id) ON DELETE SET NULL,
  work_card_id text REFERENCES work_cards(id) ON DELETE SET NULL,
  from_stage text,
  to_stage text NOT NULL,
  entered_at timestamp NOT NULL DEFAULT now(),
  exited_at timestamp,
  duration_seconds integer,
  responsible_id text REFERENCES users(id) ON DELETE SET NULL,
  origin text NOT NULL DEFAULT 'system',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_process_stage_events_tenant_pipeline
  ON process_stage_events(tenant_id, pipeline, entered_at DESC);
CREATE INDEX IF NOT EXISTS ix_process_stage_events_process
  ON process_stage_events(tenant_id, process_type, process_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS ix_process_stage_events_stage
  ON process_stage_events(tenant_id, pipeline, to_stage, entered_at DESC);
CREATE INDEX IF NOT EXISTS ix_process_stage_events_responsible
  ON process_stage_events(tenant_id, responsible_id, entered_at DESC);

CREATE TABLE IF NOT EXISTS business_goals (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  label text NOT NULL,
  period_type text NOT NULL DEFAULT 'monthly',
  target_value numeric(18,4) NOT NULL,
  unit text NOT NULL DEFAULT 'count',
  starts_at timestamp NOT NULL,
  ends_at timestamp NOT NULL,
  responsible_id text REFERENCES users(id) ON DELETE SET NULL,
  team_key text,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT business_goals_period_check CHECK (ends_at > starts_at),
  CONSTRAINT business_goals_target_check CHECK (target_value >= 0)
);

CREATE INDEX IF NOT EXISTS ix_business_goals_tenant_period
  ON business_goals(tenant_id, metric_key, starts_at, ends_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_business_goals_scope
  ON business_goals(tenant_id, metric_key, starts_at, ends_at, COALESCE(responsible_id, ''), COALESCE(team_key, ''))
  WHERE active = true;

CREATE TABLE IF NOT EXISTS process_stage_policies (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline text NOT NULL,
  stage_key text NOT NULL,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  sla_minutes integer,
  criticality text NOT NULL DEFAULT 'normal',
  terminal boolean NOT NULL DEFAULT false,
  visible_on_dashboard boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT process_stage_policies_sla_check CHECK (sla_minutes IS NULL OR sla_minutes > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_process_stage_policies_stage
  ON process_stage_policies(tenant_id, pipeline, stage_key);
CREATE INDEX IF NOT EXISTS ix_process_stage_policies_order
  ON process_stage_policies(tenant_id, pipeline, position);

CREATE TABLE IF NOT EXISTS customer_feedback (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  deal_id text REFERENCES deals(id) ON DELETE SET NULL,
  work_card_id text REFERENCES work_cards(id) ON DELETE SET NULL,
  feedback_type text NOT NULL,
  score numeric(6,2),
  scale_min numeric(6,2),
  scale_max numeric(6,2),
  answer text,
  comment text,
  channel text,
  responded_at timestamp NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT customer_feedback_scale_check CHECK (
    score IS NULL OR scale_min IS NULL OR scale_max IS NULL OR
    (scale_max > scale_min AND score >= scale_min AND score <= scale_max)
  )
);

CREATE INDEX IF NOT EXISTS ix_customer_feedback_tenant_type
  ON customer_feedback(tenant_id, feedback_type, responded_at DESC);
CREATE INDEX IF NOT EXISTS ix_customer_feedback_lead
  ON customer_feedback(lead_id, responded_at DESC);

ALTER TABLE process_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_stage_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_feedback ENABLE ROW LEVEL SECURITY;

-- Registra qualquer mudança de etapa comercial usando a data real da transição.
CREATE OR REPLACE FUNCTION vendorai_log_deal_stage_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_event process_stage_events%ROWTYPE;
  effective_origin text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.etapa IS NULL THEN RETURN NEW; END IF;
    INSERT INTO process_stage_events (
      tenant_id, pipeline, process_type, process_id, cycle_id, lead_id, deal_id,
      from_stage, to_stage, entered_at, responsible_id, origin, metadata
    ) VALUES (
      NEW.tenant_id, 'comercial', 'deal', NEW.id, NEW.id, NEW.lead_id, NEW.id,
      NULL, NEW.etapa, COALESCE(NEW.created_at, now()), NEW.assigned_to, 'system', '{}'::jsonb
    );
    RETURN NEW;
  END IF;

  IF NEW.etapa IS DISTINCT FROM OLD.etapa THEN
    SELECT * INTO last_event
    FROM process_stage_events
    WHERE tenant_id = NEW.tenant_id
      AND process_type = 'deal'
      AND process_id = NEW.id
      AND exited_at IS NULL
    ORDER BY entered_at DESC
    LIMIT 1;

    IF last_event.id IS NOT NULL THEN
      UPDATE process_stage_events
      SET exited_at = now(),
          duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - last_event.entered_at))::integer)
      WHERE id = last_event.id;
    END IF;

    effective_origin := COALESCE(NULLIF(current_setting('vendorai.stage_origin', true), ''), 'system');
    INSERT INTO process_stage_events (
      tenant_id, pipeline, process_type, process_id, cycle_id, lead_id, deal_id,
      from_stage, to_stage, entered_at, responsible_id, origin, metadata
    ) VALUES (
      NEW.tenant_id, 'comercial', 'deal', NEW.id, NEW.id, NEW.lead_id, NEW.id,
      OLD.etapa, NEW.etapa, now(), NEW.assigned_to, effective_origin, '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendorai_log_deal_stage_event_insert ON deals;
CREATE TRIGGER trg_vendorai_log_deal_stage_event_insert
AFTER INSERT ON deals
FOR EACH ROW EXECUTE FUNCTION vendorai_log_deal_stage_event();

DROP TRIGGER IF EXISTS trg_vendorai_log_deal_stage_event_update ON deals;
CREATE TRIGGER trg_vendorai_log_deal_stage_event_update
AFTER UPDATE OF etapa ON deals
FOR EACH ROW EXECUTE FUNCTION vendorai_log_deal_stage_event();

-- Execução e suporte usam work_cards e alimentam o mesmo histórico oficial.
CREATE OR REPLACE FUNCTION vendorai_log_work_card_stage_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_event process_stage_events%ROWTYPE;
  effective_origin text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO process_stage_events (
      tenant_id, pipeline, process_type, process_id, cycle_id, lead_id, deal_id, work_card_id,
      from_stage, to_stage, entered_at, responsible_id, origin, metadata
    ) VALUES (
      NEW.tenant_id, NEW.pipeline, 'work_card', NEW.id,
      COALESCE(NEW.parent_card_id, NEW.id), NEW.lead_id, NEW.deal_id, NEW.id,
      NULL, NEW.etapa, COALESCE(NEW.created_at, now()), NEW.responsavel_id, 'system',
      jsonb_build_object('tipo', NEW.tipo, 'codigo', NEW.codigo)
    );
    RETURN NEW;
  END IF;

  IF NEW.etapa IS DISTINCT FROM OLD.etapa THEN
    SELECT * INTO last_event
    FROM process_stage_events
    WHERE tenant_id = NEW.tenant_id
      AND process_type = 'work_card'
      AND process_id = NEW.id
      AND exited_at IS NULL
    ORDER BY entered_at DESC
    LIMIT 1;

    IF last_event.id IS NOT NULL THEN
      UPDATE process_stage_events
      SET exited_at = now(),
          duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - last_event.entered_at))::integer)
      WHERE id = last_event.id;
    END IF;

    effective_origin := COALESCE(NULLIF(current_setting('vendorai.stage_origin', true), ''), 'system');
    INSERT INTO process_stage_events (
      tenant_id, pipeline, process_type, process_id, cycle_id, lead_id, deal_id, work_card_id,
      from_stage, to_stage, entered_at, responsible_id, origin, metadata
    ) VALUES (
      NEW.tenant_id, NEW.pipeline, 'work_card', NEW.id,
      COALESCE(NEW.parent_card_id, NEW.id), NEW.lead_id, NEW.deal_id, NEW.id,
      OLD.etapa, NEW.etapa, now(), NEW.responsavel_id, effective_origin,
      jsonb_build_object('tipo', NEW.tipo, 'codigo', NEW.codigo)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendorai_log_work_card_stage_event_insert ON work_cards;
CREATE TRIGGER trg_vendorai_log_work_card_stage_event_insert
AFTER INSERT ON work_cards
FOR EACH ROW EXECUTE FUNCTION vendorai_log_work_card_stage_event();

DROP TRIGGER IF EXISTS trg_vendorai_log_work_card_stage_event_update ON work_cards;
CREATE TRIGGER trg_vendorai_log_work_card_stage_event_update
AFTER UPDATE OF etapa ON work_cards
FOR EACH ROW EXECUTE FUNCTION vendorai_log_work_card_stage_event();

-- Backfill: cria o estado atual para processos existentes sem fabricar duração passada.
INSERT INTO process_stage_events (
  tenant_id, pipeline, process_type, process_id, cycle_id, lead_id, deal_id,
  from_stage, to_stage, entered_at, responsible_id, origin, metadata
)
SELECT d.tenant_id, 'comercial', 'deal', d.id, d.id, d.lead_id, d.id,
       NULL, d.etapa, COALESCE(d.created_at, now()), d.assigned_to, 'backfill_current_state',
       jsonb_build_object('historical_duration_available', false)
FROM deals d
WHERE NOT EXISTS (
  SELECT 1 FROM process_stage_events e
  WHERE e.tenant_id = d.tenant_id AND e.process_type = 'deal' AND e.process_id = d.id
);

INSERT INTO process_stage_events (
  tenant_id, pipeline, process_type, process_id, cycle_id, lead_id, deal_id, work_card_id,
  from_stage, to_stage, entered_at, responsible_id, origin, metadata
)
SELECT wc.tenant_id, wc.pipeline, 'work_card', wc.id, COALESCE(wc.parent_card_id, wc.id),
       wc.lead_id, wc.deal_id, wc.id, NULL, wc.etapa, COALESCE(wc.created_at, now()),
       wc.responsavel_id, 'backfill_current_state',
       jsonb_build_object('historical_duration_available', false, 'tipo', wc.tipo, 'codigo', wc.codigo)
FROM work_cards wc
WHERE NOT EXISTS (
  SELECT 1 FROM process_stage_events e
  WHERE e.tenant_id = wc.tenant_id AND e.process_type = 'work_card' AND e.process_id = wc.id
);

-- Políticas padrão para execução e suporte. Comercial continua herdando a configuração
-- do tenant e pode ser sincronizado pela API sem alterar a tabela legada pipeline_stages.
INSERT INTO process_stage_policies (tenant_id, pipeline, stage_key, label, position, sla_minutes, terminal)
SELECT t.id, v.pipeline, v.stage_key, v.label, v.position, v.sla_minutes, v.terminal
FROM tenants t
CROSS JOIN (VALUES
  ('execucao','pedido_confirmado','Pedido confirmado',0,1440,false),
  ('execucao','liberacao_financeira','Liberação financeira',1,2880,false),
  ('execucao','liberacao_medidas','Liberação de medidas',2,4320,false),
  ('execucao','projeto','Projeto',3,7200,false),
  ('execucao','producao_a_iniciar','Produção a iniciar',4,2880,false),
  ('execucao','producao_em_andamento','Produção em andamento',5,NULL,false),
  ('execucao','producao_finalizada','Produção finalizada',6,1440,false),
  ('execucao','aguardando_liberacao','Aguardando liberação',7,NULL,false),
  ('execucao','liberado','Liberado',8,1440,false),
  ('execucao','agenda_entrega','Agenda entrega',9,2880,false),
  ('execucao','em_transporte','Em transporte',10,1440,false),
  ('execucao','instalacao_a_iniciar','Instalação a iniciar',11,1440,false),
  ('execucao','instalacao_em_andamento','Instalação em andamento',12,NULL,false),
  ('execucao','instalacao_finalizada','Instalação finalizada',13,1440,false),
  ('execucao','entrega_obra','Entrega da obra',14,1440,false),
  ('execucao','pos_venda','Pós-venda',15,10080,false),
  ('execucao','concluido','Concluído',16,NULL,true),
  ('suporte','chamado_cliente','Chamado cliente',0,120,false),
  ('suporte','agendamento_assistencia','Agendamento assistência',1,1440,false),
  ('suporte','execucao_assistencia','Execução assistência',2,2880,false),
  ('suporte','relatorio_assistencia','Relatório assistência',3,1440,false),
  ('suporte','feedback_cliente','Feedback cliente',4,2880,false),
  ('suporte','fechamento_assistencia','Fechamento assistência',5,1440,true)
) AS v(pipeline, stage_key, label, position, sla_minutes, terminal)
ON CONFLICT (tenant_id, pipeline, stage_key) DO NOTHING;

-- Restrict browser execution when these trigger functions are first created.
DO $vendi_hardening$
DECLARE
  signature text;
  target regprocedure;
  browser_role text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.vendorai_log_deal_stage_event()', 'public.vendorai_log_work_card_stage_event()']
  LOOP
    target := to_regprocedure(signature);
    IF target IS NULL THEN
      RAISE EXCEPTION 'Required trigger function missing: %', signature;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', target);
    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF to_regrole(browser_role) IS NOT NULL THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', target, browser_role);
      END IF;
    END LOOP;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO vendorai_app', target);
  END LOOP;
END
$vendi_hardening$;
