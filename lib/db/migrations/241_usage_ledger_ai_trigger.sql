-- Mirror legacy ai_usage_logs into the universal usage ledger.
-- These rows are cost/audit rows only: they never debit customer-visible quota.
-- Business-unit debit events (image, video, prospect, render, site...) are emitted
-- separately when the final useful result is delivered.

-- Attribute technical AI cost to the closest commercial product whenever the
-- feature has a stable business owner. Ambiguous shared features remain NULL.
CREATE OR REPLACE FUNCTION commercial_key_for_ai_feature(p_feature text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_feature
    WHEN 'content_generator' THEN 'vendor.content_studio'
    WHEN 'image_generator' THEN 'vendor.creative_studio'
    WHEN 'proposal_generator' THEN 'vendor.proposals_catalog'
    WHEN 'auto_quote' THEN 'vendor.proposals_catalog'
    WHEN 'site_generator' THEN 'vendor.sites_autopilot'
    WHEN 'briefing_generator' THEN 'vendor.content_planner'
    WHEN 'spin_briefing' THEN 'vendor.content_planner'
    WHEN 'intelligence_analysis' THEN 'vendor.revenue_scout'
    WHEN 'churn_retention' THEN 'vendor.revenue_scout'
    WHEN 'document_extraction' THEN 'vendor.management'
    WHEN 'media_interpretation' THEN 'vendor.knowledge'
    WHEN 'embedding' THEN 'vendor.knowledge'
    WHEN 'agent_sdr' THEN 'vendor.ai_team'
    WHEN 'agent_closer' THEN 'vendor.ai_team'
    WHEN 'agent_followup' THEN 'vendor.ai_team'
    WHEN 'agent_reactivation' THEN 'vendor.ai_team'
    WHEN 'agent_scheduler' THEN 'vendor.ai_team'
    WHEN 'agent_service' THEN 'vendor.ai_team'
    WHEN 'agent_onboarding' THEN 'vendor.ai_team'
    WHEN 'agent_relacionamento' THEN 'vendor.ai_team'
    WHEN 'agent_financeiro' THEN 'vendor.ai_team'
    WHEN 'agent_cobranca' THEN 'vendor.ai_team'
    WHEN 'agent_recepcao' THEN 'vendor.ai_team'
    WHEN 'agent_expansao_conta' THEN 'vendor.ai_team'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION mirror_ai_usage_to_usage_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO usage_ledger (
    tenant_id,
    commercial_key,
    metric_key,
    quantity,
    vendor_credits,
    billing_status,
    billable,
    success,
    provider,
    model,
    input_tokens,
    output_tokens,
    external_api_cost_usd,
    total_cost_usd,
    source,
    source_event_id,
    request_id,
    metadata,
    created_at
  ) VALUES (
    NEW.tenant_id,
    commercial_key_for_ai_feature(NEW.feature::text),
    'ai_assist',
    1,
    0,
    'non_billable',
    false,
    NEW.success,
    NEW.provider::text,
    NEW.model,
    NEW.input_tokens,
    NEW.output_tokens,
    NEW.cost_estimate_usd,
    NEW.cost_estimate_usd,
    'ai_usage_logs',
    NEW.id,
    NEW.request_id,
    jsonb_build_object(
      'feature', NEW.feature::text,
      'usedByok', NEW.used_byok,
      'costOnly', true
    ),
    NEW.created_at
  )
  ON CONFLICT (source, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_ai_usage_to_usage_ledger ON ai_usage_logs;
CREATE TRIGGER trg_mirror_ai_usage_to_usage_ledger
AFTER INSERT ON ai_usage_logs
FOR EACH ROW
EXECUTE FUNCTION mirror_ai_usage_to_usage_ledger();

-- Backfill existing history once, idempotently.
INSERT INTO usage_ledger (
  tenant_id,
  commercial_key,
  metric_key,
  quantity,
  vendor_credits,
  billing_status,
  billable,
  success,
  provider,
  model,
  input_tokens,
  output_tokens,
  external_api_cost_usd,
  total_cost_usd,
  source,
  source_event_id,
  request_id,
  metadata,
  created_at
)
SELECT
  l.tenant_id,
  commercial_key_for_ai_feature(l.feature::text),
  'ai_assist',
  1,
  0,
  'non_billable',
  false,
  l.success,
  l.provider::text,
  l.model,
  l.input_tokens,
  l.output_tokens,
  l.cost_estimate_usd,
  l.cost_estimate_usd,
  'ai_usage_logs',
  l.id,
  l.request_id,
  jsonb_build_object('feature', l.feature::text, 'usedByok', l.used_byok, 'costOnly', true),
  l.created_at
FROM ai_usage_logs l
ON CONFLICT (source, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING;
