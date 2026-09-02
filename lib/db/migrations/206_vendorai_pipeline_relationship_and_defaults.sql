-- VendorAI — complemento da arquitetura de pipelines
-- Migration 206 — aditiva/idempotente

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS relationship_stage text;

-- As etapas técnicas existentes continuam com as mesmas chaves para preservar
-- automações legadas; apenas o rótulo padrão passa a refletir a jornada aprovada.
UPDATE pipeline_stages
SET label = 'Fechamento', updated_at = now()
WHERE key = 'conferencia_estoque'
  AND label IN ('Conf. Estoque', 'Conferência de estoque', 'Conferencia de estoque');

UPDATE pipeline_stages
SET label = 'Pedido', updated_at = now()
WHERE key = 'ganho'
  AND label = 'Ganho';

-- Contrato é uma etapa organizacional entre Fechamento e Pedido. Não substitui
-- as automações de fechamento que continuam disparando somente em `ganho`.
INSERT INTO pipeline_stages (
  id, tenant_id, key, label, color, bg, ordem, is_system, sla_minutos, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  t.id,
  'contrato',
  'Contrato',
  'text-sky-600',
  'bg-sky-100',
  6,
  false,
  NULL,
  now(),
  now()
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM pipeline_stages ps
  WHERE ps.tenant_id = t.id AND ps.key = 'contrato'
);

-- Normaliza o contexto de relacionamento sem alterar a etapa comercial legada.
UPDATE deals
SET relationship_stage = CASE
  WHEN etapa = 'em_aquecimento' AND aquecimento_tipo = 'cliente' THEN 'aquecimento_cliente'
  WHEN etapa = 'em_aquecimento' THEN 'aquecimento_lead'
  WHEN etapa = 'parceiro' THEN 'parceiro_identificado'
  ELSE relationship_stage
END
WHERE relationship_stage IS NULL
  AND etapa IN ('em_aquecimento', 'parceiro');

CREATE INDEX IF NOT EXISTS ix_deals_tenant_relationship_stage
  ON deals(tenant_id, relationship_stage, updated_at DESC);
