-- CRM Free / CRM Pro commercial plans + automatic bridge from ai_usage_logs
-- into the universal Vendor usage ledger.

-- Keep historical plans for FK compatibility. Re-activate only the commercial
-- offers we now expose: CRM Free, CRM Pro and Growth.
INSERT INTO plans (
  id, slug, name, implantation_price_cents, monthly_price_cents,
  monthly_price_annual_cents, ai_quota_usd, max_users,
  extra_user_price_cents, places_api_limit, is_active, created_at, updated_at
)
VALUES
  (gen_random_uuid()::text, 'crm-free', 'Vendor CRM Free', 0, 0, NULL, 0, 1, NULL, 100, true, now(), now()),
  (gen_random_uuid()::text, 'crm-pro', 'Vendor CRM Pro', 0, 4990, NULL, 0, 5, NULL, 500, true, now(), now())
ON CONFLICT (slug) DO UPDATE SET
  name=EXCLUDED.name,
  implantation_price_cents=EXCLUDED.implantation_price_cents,
  monthly_price_cents=EXCLUDED.monthly_price_cents,
  max_users=EXCLUDED.max_users,
  extra_user_price_cents=NULL,
  is_active=true,
  updated_at=now();

UPDATE plans
SET is_active = (slug IN ('crm-free','crm-pro','growth')),
    updated_at = now()
WHERE slug NOT IN ('crm-free','crm-pro','growth') OR is_active = false;

UPDATE plans
SET name='Growth', monthly_price_cents=149000, max_users=NULL,
    extra_user_price_cents=NULL, is_active=true, updated_at=now()
WHERE slug='growth';

-- Free and Pro use the same complete CRM technical base. The commercial
-- difference is primarily user count and franchise, not an artificial feature cut.
WITH target_plans AS (
  SELECT id, slug FROM plans WHERE slug IN ('crm-free','crm-pro')
), desired(module_key) AS (
  VALUES
    ('crm_core'),
    ('dashboard'),
    ('leads'),
    ('deals'),
    ('pipeline'),
    ('activities'),
    ('contacts'),
    ('scheduler'),
    ('catalog_basic'),
    ('reports_basic')
)
INSERT INTO plan_modules (id, plan_id, module_key, created_at)
SELECT gen_random_uuid()::text, p.id, d.module_key, now()
FROM target_plans p CROSS JOIN desired d
WHERE NOT EXISTS (
  SELECT 1 FROM plan_modules pm WHERE pm.plan_id=p.id AND pm.module_key=d.module_key
);

-- Map existing AI gateway features to commercial usage metrics. This keeps the
-- current ai_usage_logs intact while every new AI call also appears in the
-- universal ledger. Failures are audited with zero Vendor Credits and do not
-- consume customer quota.
CREATE OR REPLACE FUNCTION vendor_sync_ai_usage_to_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  metric text;
  credits numeric(16,4) := 0;
  qty numeric(14,4) := 1;
BEGIN
  metric := CASE NEW.feature::text
    WHEN 'content_generator' THEN 'content_generation'
    WHEN 'image_generator' THEN 'image_generation'
    WHEN 'site_generator' THEN 'site_generation'
    WHEN 'proposal_generator' THEN 'proposal_generation'
    WHEN 'auto_quote' THEN 'proposal_generation'
    WHEN 'intelligence_analysis' THEN 'intelligence_analysis'
    WHEN 'churn_retention' THEN 'intelligence_analysis'
    WHEN 'audio_transcription' THEN 'audio_transcription_minute'
    WHEN 'document_extraction' THEN 'document_processing'
    WHEN 'media_interpretation' THEN 'media_interpretation'
    WHEN 'embedding' THEN 'knowledge_page'
    WHEN 'web_search' THEN 'intelligence_analysis'
    WHEN 'agent_sdr' THEN 'ai_agent_interaction'
    WHEN 'agent_closer' THEN 'ai_agent_interaction'
    WHEN 'agent_followup' THEN 'ai_agent_interaction'
    WHEN 'agent_reactivation' THEN 'ai_agent_interaction'
    WHEN 'agent_scheduler' THEN 'ai_agent_interaction'
    WHEN 'agent_service' THEN 'ai_agent_interaction'
    WHEN 'agent_onboarding' THEN 'ai_agent_interaction'
    WHEN 'agent_relacionamento' THEN 'ai_agent_interaction'
    WHEN 'briefing_generator' THEN 'crm_ai_assist'
    WHEN 'spin_briefing' THEN 'crm_ai_assist'
    ELSE 'crm_ai_assist'
  END;

  SELECT CASE WHEN NEW.success THEN vendor_credits_per_unit * qty ELSE 0 END
    INTO credits
  FROM vendor_usage_metrics
  WHERE metric_key=metric;

  INSERT INTO vendor_usage_ledger (
    tenant_id, metric_key, feature_key, source_system, source_record_id,
    request_id, quantity, vendor_credits, provider, model,
    input_tokens, output_tokens, provider_cost_usd, total_cost_usd,
    success, customer_billable, charged_to_quota, failure_reason,
    metadata, occurred_at, created_at
  ) VALUES (
    NEW.tenant_id, metric, NEW.feature::text, 'ai_usage_logs', NEW.id,
    NEW.request_id, qty, COALESCE(credits,0), NEW.provider::text, NEW.model,
    NEW.input_tokens, NEW.output_tokens, COALESCE(NEW.cost_estimate_usd,0), COALESCE(NEW.cost_estimate_usd,0),
    NEW.success, NEW.success AND NOT NEW.used_byok, NEW.success,
    NEW.error_message,
    jsonb_build_object('used_byok', NEW.used_byok, 'bridge_version', 1),
    NEW.created_at, now()
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_sync_ai_usage ON ai_usage_logs;
CREATE TRIGGER trg_vendor_sync_ai_usage
AFTER INSERT ON ai_usage_logs
FOR EACH ROW EXECUTE FUNCTION vendor_sync_ai_usage_to_ledger();

-- Backfill recent AI usage without charging failed calls. The source unique
-- index makes this rerunnable.
INSERT INTO vendor_usage_ledger (
  tenant_id, metric_key, feature_key, source_system, source_record_id,
  request_id, quantity, vendor_credits, provider, model,
  input_tokens, output_tokens, provider_cost_usd, total_cost_usd,
  success, customer_billable, charged_to_quota, failure_reason,
  metadata, occurred_at, created_at
)
SELECT
  a.tenant_id,
  CASE a.feature::text
    WHEN 'content_generator' THEN 'content_generation'
    WHEN 'image_generator' THEN 'image_generation'
    WHEN 'site_generator' THEN 'site_generation'
    WHEN 'proposal_generator' THEN 'proposal_generation'
    WHEN 'auto_quote' THEN 'proposal_generation'
    WHEN 'intelligence_analysis' THEN 'intelligence_analysis'
    WHEN 'churn_retention' THEN 'intelligence_analysis'
    WHEN 'audio_transcription' THEN 'audio_transcription_minute'
    WHEN 'document_extraction' THEN 'document_processing'
    WHEN 'media_interpretation' THEN 'media_interpretation'
    WHEN 'embedding' THEN 'knowledge_page'
    WHEN 'web_search' THEN 'intelligence_analysis'
    WHEN 'agent_sdr' THEN 'ai_agent_interaction'
    WHEN 'agent_closer' THEN 'ai_agent_interaction'
    WHEN 'agent_followup' THEN 'ai_agent_interaction'
    WHEN 'agent_reactivation' THEN 'ai_agent_interaction'
    WHEN 'agent_scheduler' THEN 'ai_agent_interaction'
    WHEN 'agent_service' THEN 'ai_agent_interaction'
    WHEN 'agent_onboarding' THEN 'ai_agent_interaction'
    WHEN 'agent_relacionamento' THEN 'ai_agent_interaction'
    ELSE 'crm_ai_assist'
  END AS metric_key,
  a.feature::text,
  'ai_usage_logs', a.id, a.request_id, 1,
  CASE WHEN a.success THEN COALESCE(m.vendor_credits_per_unit,0) ELSE 0 END,
  a.provider::text, a.model, a.input_tokens, a.output_tokens,
  COALESCE(a.cost_estimate_usd,0), COALESCE(a.cost_estimate_usd,0),
  a.success, a.success AND NOT a.used_byok, a.success, a.error_message,
  jsonb_build_object('used_byok', a.used_byok, 'backfill', true),
  a.created_at, now()
FROM ai_usage_logs a
JOIN vendor_usage_metrics m ON m.metric_key = CASE a.feature::text
    WHEN 'content_generator' THEN 'content_generation'
    WHEN 'image_generator' THEN 'image_generation'
    WHEN 'site_generator' THEN 'site_generation'
    WHEN 'proposal_generator' THEN 'proposal_generation'
    WHEN 'auto_quote' THEN 'proposal_generation'
    WHEN 'intelligence_analysis' THEN 'intelligence_analysis'
    WHEN 'churn_retention' THEN 'intelligence_analysis'
    WHEN 'audio_transcription' THEN 'audio_transcription_minute'
    WHEN 'document_extraction' THEN 'document_processing'
    WHEN 'media_interpretation' THEN 'media_interpretation'
    WHEN 'embedding' THEN 'knowledge_page'
    WHEN 'web_search' THEN 'intelligence_analysis'
    WHEN 'agent_sdr' THEN 'ai_agent_interaction'
    WHEN 'agent_closer' THEN 'ai_agent_interaction'
    WHEN 'agent_followup' THEN 'ai_agent_interaction'
    WHEN 'agent_reactivation' THEN 'ai_agent_interaction'
    WHEN 'agent_scheduler' THEN 'ai_agent_interaction'
    WHEN 'agent_service' THEN 'ai_agent_interaction'
    WHEN 'agent_onboarding' THEN 'ai_agent_interaction'
    WHEN 'agent_relacionamento' THEN 'ai_agent_interaction'
    ELSE 'crm_ai_assist'
  END
WHERE a.created_at >= now() - interval '90 days'
ON CONFLICT DO NOTHING;
