-- VendorAI — Pipeline operacional, entregas parciais e assistência
-- Migration 205 — aditiva e idempotente

DO $$
BEGIN
  ALTER TYPE activity_tipo ADD VALUE IF NOT EXISTS 'assistencia';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN CREATE TYPE entrega_modo AS ENUM ('agendada', 'assincrona'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE entrega_status AS ENUM ('aguardando', 'agendada', 'em_transito', 'entregue', 'cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE entrega_periodo AS ENUM ('manha', 'tarde'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE entrega_feedback_status AS ENUM ('aguardando_resposta', 'aguardando_motivo', 'positivo', 'negativo'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS entregas (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  proposta_id text REFERENCES propostas(id) ON DELETE SET NULL,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  assigned_to text REFERENCES users(id) ON DELETE SET NULL,
  modo entrega_modo NOT NULL DEFAULT 'assincrona',
  status entrega_status NOT NULL DEFAULT 'aguardando',
  periodo entrega_periodo,
  lote_numero integer,
  data_liberacao_prevista timestamp,
  data_liberacao_efetiva timestamp,
  data_prevista timestamp,
  data_entregue timestamp,
  agendamento_id text REFERENCES agendamentos(id) ON DELETE SET NULL,
  endereco_entrega text,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacoes text,
  feedback_status entrega_feedback_status,
  feedback_motivo text,
  avaliacao_solicitada boolean NOT NULL DEFAULT false,
  feedback_respondido_em timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE entregas
  ADD COLUMN IF NOT EXISTS lote_numero integer,
  ADD COLUMN IF NOT EXISTS data_liberacao_prevista timestamp,
  ADD COLUMN IF NOT EXISTS data_liberacao_efetiva timestamp;

CREATE TABLE IF NOT EXISTS work_cards (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  pipeline text NOT NULL DEFAULT 'execucao',
  tipo text NOT NULL DEFAULT 'pedido',
  etapa text NOT NULL DEFAULT 'pedido_confirmado',
  titulo text NOT NULL,
  descricao text,
  prioridade text NOT NULL DEFAULT 'normal',
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  deal_id text REFERENCES deals(id) ON DELETE SET NULL,
  proposta_id text REFERENCES propostas(id) ON DELETE SET NULL,
  entrega_id text REFERENCES entregas(id) ON DELETE SET NULL,
  parent_card_id text,
  responsavel_id text REFERENCES users(id) ON DELETE SET NULL,
  data_inicio_prevista timestamp,
  data_inicio_efetiva timestamp,
  data_fim_prevista timestamp,
  data_fim_efetiva timestamp,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_card_attachments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_card_id text NOT NULL REFERENCES work_cards(id) ON DELETE CASCADE,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  criado_por text REFERENCES users(id) ON DELETE SET NULL,
  origem text NOT NULL DEFAULT 'app',
  nome text NOT NULL,
  url text NOT NULL,
  mime_type text,
  tamanho integer,
  descricao text,
  transcricao text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_work_cards_tenant_codigo
  ON work_cards(tenant_id, codigo);
CREATE UNIQUE INDEX IF NOT EXISTS ux_work_cards_entrega
  ON work_cards(entrega_id)
  WHERE entrega_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_work_cards_pedido_deal
  ON work_cards(tenant_id, deal_id, tipo)
  WHERE deal_id IS NOT NULL AND tipo = 'pedido';
CREATE INDEX IF NOT EXISTS ix_work_cards_tenant_pipeline_etapa
  ON work_cards(tenant_id, pipeline, etapa, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_work_cards_tenant_responsavel
  ON work_cards(tenant_id, responsavel_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_work_cards_lead
  ON work_cards(lead_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_work_cards_deal
  ON work_cards(deal_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_work_card_attachments_card
  ON work_card_attachments(work_card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_entregas_deal_lote
  ON entregas(tenant_id, deal_id, lote_numero);

-- Mantém os novos objetos isolados da camada pública. A API autenticada usa
-- a conexão de backend e aplica tenant/responsável em todas as rotas.
ALTER TABLE work_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_card_attachments ENABLE ROW LEVEL SECURITY;

-- Todo negócio que vira venda gera exatamente um card-pai de execução.
-- O trigger cobre PATCH, fechamento por proposta, automações e qualquer outro
-- caminho que altere deals.etapa para 'ganho'.
CREATE OR REPLACE FUNCTION vendorai_create_order_work_card_on_won()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  generated_id text;
  generated_code text;
BEGIN
  IF NEW.etapa = 'ganho' AND OLD.etapa IS DISTINCT FROM 'ganho' THEN
    generated_id := gen_random_uuid()::text;
    generated_code := 'PED-' || upper(substr(replace(NEW.id, '-', ''), 1, 8));

    INSERT INTO work_cards (
      id, tenant_id, codigo, pipeline, tipo, etapa, titulo, prioridade,
      lead_id, deal_id, responsavel_id, metadata, created_at, updated_at
    ) VALUES (
      generated_id,
      NEW.tenant_id,
      generated_code,
      'execucao',
      'pedido',
      'pedido_confirmado',
      'Pedido • ' || NEW.titulo,
      'normal',
      NEW.lead_id,
      NEW.id,
      NEW.assigned_to,
      jsonb_build_object('origem', 'deal_ganho', 'valor', NEW.valor),
      now(),
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendorai_create_order_work_card_on_won ON deals;
CREATE TRIGGER trg_vendorai_create_order_work_card_on_won
AFTER UPDATE OF etapa ON deals
FOR EACH ROW
EXECUTE FUNCTION vendorai_create_order_work_card_on_won();

-- Backfill seguro dos negócios já ganhos: cria somente o card-pai ausente.
INSERT INTO work_cards (
  id, tenant_id, codigo, pipeline, tipo, etapa, titulo, prioridade,
  lead_id, deal_id, responsavel_id, metadata, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  d.tenant_id,
  'PED-' || upper(substr(replace(d.id, '-', ''), 1, 8)),
  'execucao',
  'pedido',
  CASE WHEN d.etapa = 'entregue' THEN 'concluido' ELSE 'pedido_confirmado' END,
  'Pedido • ' || d.titulo,
  'normal',
  d.lead_id,
  d.id,
  d.assigned_to,
  jsonb_build_object('origem', 'backfill_deal', 'valor', d.valor),
  COALESCE(d.won_at, d.created_at, now()),
  now()
FROM deals d
WHERE d.etapa IN ('ganho', 'em_execucao', 'entregue')
  AND NOT EXISTS (
    SELECT 1 FROM work_cards wc
    WHERE wc.tenant_id = d.tenant_id
      AND wc.deal_id = d.id
      AND wc.tipo = 'pedido'
  );


-- Restrict browser execution when these trigger functions are first created.
DO $vendi_hardening$
DECLARE
  signature text;
  target regprocedure;
  browser_role text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.vendorai_create_order_work_card_on_won()']
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
