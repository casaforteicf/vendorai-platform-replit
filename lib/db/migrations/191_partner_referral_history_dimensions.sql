-- Histórico consolidado de performance de parceiros/afiliados.
-- Normaliza período, campanha e cidade/região sem criar uma segunda fonte de verdade.
--
-- Esta migration roda antes de 2026091002_partner_attribution_checkout.sql pela
-- ordenação lexicográfica do runner. Portanto garante aqui, de forma idempotente,
-- as colunas de atribuição do Praça.AI exigidas pela view abaixo. A migration
-- posterior mantém os mesmos ADD COLUMN IF NOT EXISTS e continua segura.

ALTER TABLE praca_pedidos
  ADD COLUMN IF NOT EXISTS partner_id text REFERENCES partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cupom_codigo text,
  ADD COLUMN IF NOT EXISTS desconto_cupom_percentual numeric(5,2),
  ADD COLUMN IF NOT EXISTS origem_atribuicao text,
  ADD COLUMN IF NOT EXISTS attribution_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE VIEW partner_referral_history AS
SELECT
  e.partner_id,
  'click'::text AS event_type,
  e.created_at AS event_at,
  NULL::text AS tenant_id,
  e.coupon_code,
  COALESCE(NULLIF(e.utm_campaign, ''), NULLIF(e.source, '')) AS campaign,
  NULL::text AS city,
  NULL::text AS region,
  0::numeric AS commission_amount,
  false AS commission_paid
FROM partner_referral_events e
WHERE e.event_type = 'click'

UNION ALL

SELECT
  l.indicado_por AS partner_id,
  'lead'::text AS event_type,
  l.created_at AS event_at,
  l.tenant_id,
  NULLIF(COALESCE(l.metadata->>'cupomCodigo', l.metadata->>'couponCode'), '') AS coupon_code,
  NULLIF(COALESCE(l.ad_campaign_id, l.metadata->>'utm_campaign', l.metadata->>'campaign'), '') AS campaign,
  NULLIF(COALESCE(l.metadata->>'cidade', l.metadata->>'city', l.metadata->>'municipio'), '') AS city,
  NULLIF(COALESCE(l.metadata->>'estado', l.metadata->>'state', l.metadata->>'uf', l.metadata->>'regiao', l.metadata->>'region'), '') AS region,
  0::numeric AS commission_amount,
  false AS commission_paid
FROM leads l
WHERE l.indicado_por IS NOT NULL
  AND l.excluido_em IS NULL

UNION ALL

SELECT
  o.partner_id,
  CASE
    WHEN o.status IN ('pago','em_separacao','pronto_coleta','coleta_agendada','coletado','em_rota','entregue','devolucao_solicitada','devolvido')
      THEN 'sale'::text
    ELSE 'order'::text
  END AS event_type,
  o.created_at AS event_at,
  o.tenant_id,
  o.cupom_codigo AS coupon_code,
  NULLIF(COALESCE(o.attribution_metadata->>'utm_campaign', o.attribution_metadata->>'campaign'), '') AS campaign,
  NULLIF(COALESCE(o.attribution_metadata->>'cidade', o.attribution_metadata->>'city', o.attribution_metadata->>'municipio'), '') AS city,
  NULLIF(COALESCE(o.attribution_metadata->>'estado', o.attribution_metadata->>'state', o.attribution_metadata->>'uf', o.attribution_metadata->>'regiao', o.attribution_metadata->>'region'), '') AS region,
  0::numeric AS commission_amount,
  false AS commission_paid
FROM praca_pedidos o
WHERE o.partner_id IS NOT NULL
  AND o.status <> 'cancelado'

UNION ALL

SELECT
  c.partner_id,
  'commission'::text AS event_type,
  c.created_at AS event_at,
  c.tenant_id,
  NULL::text AS coupon_code,
  NULL::text AS campaign,
  NULL::text AS city,
  NULL::text AS region,
  COALESCE(c.valor, 0)::numeric AS commission_amount,
  (c.status = 'pago') AS commission_paid
FROM partner_commissions c
WHERE c.partner_id IS NOT NULL;

COMMENT ON VIEW partner_referral_history IS
  'Fonte consolidada para filtros históricos de parceiros por período, campanha e localização.';

CREATE INDEX IF NOT EXISTS partner_referral_events_campaign_created_idx
  ON partner_referral_events (utm_campaign, created_at DESC)
  WHERE utm_campaign IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_partner_created_idx
  ON leads (indicado_por, created_at DESC)
  WHERE indicado_por IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_ad_campaign_created_idx
  ON leads (ad_campaign_id, created_at DESC)
  WHERE ad_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS praca_pedidos_partner_created_idx
  ON praca_pedidos (partner_id, created_at DESC)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS partner_commissions_partner_created_idx
  ON partner_commissions (partner_id, created_at DESC)
  WHERE partner_id IS NOT NULL;
