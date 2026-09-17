-- VendorAI Usage Ledger mirroring — 2026-09-17
-- Observe-only integration of existing production activity into the new
-- commercial usage ledger. This migration measures; it does not block usage.

-- A delivered result can only be mirrored once from a source record.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_usage_ledger_source_result_uidx
  ON vendor_usage_ledger(source_table, source_id, feature_key)
  WHERE source_id IS NOT NULL;

-- Backfill the current plan assignment as commercial entitlement without
-- changing any tenant navigation/module switch.
INSERT INTO vendor_tenant_entitlements (
  tenant_id, product_key, source, source_reference, status, starts_at, metadata
)
SELECT
  t.id,
  CASE p.slug WHEN 'growth' THEN 'growth' ELSE 'crm_free' END,
  'legacy',
  p.id,
  'active',
  now(),
  jsonb_build_object('planSlug', p.slug, 'migration', '241')
FROM tenants t
JOIN plans p ON p.id = t.plan_id
WHERE p.slug IN ('growth', 'start')
  AND NOT EXISTS (
    SELECT 1 FROM vendor_tenant_entitlements e
    WHERE e.tenant_id = t.id
      AND e.product_key = CASE p.slug WHEN 'growth' THEN 'growth' ELSE 'crm_free' END
      AND e.status = 'active'
  );

-- Active/trial Growth subscriptions are also mirrored as entitlement. This is
-- only an entitlement snapshot; billing remains in the existing subscription flow.
INSERT INTO vendor_tenant_entitlements (
  tenant_id, product_key, source, source_reference, status, starts_at, ends_at, metadata
)
SELECT
  s.tenant_id,
  'growth',
  'subscription',
  s.id,
  'active',
  s.data_inicio,
  NULL,
  jsonb_build_object('subscriptionStatus', s.status, 'billingPhase', s.billing_phase, 'migration', '241')
FROM subscriptions s
WHERE s.plano = 'growth'
  AND s.status IN ('trial', 'ativa')
  AND NOT EXISTS (
    SELECT 1 FROM vendor_tenant_entitlements e
    WHERE e.tenant_id=s.tenant_id AND e.product_key='growth'
      AND e.source='subscription' AND e.source_reference=s.id AND e.status='active'
  );

CREATE OR REPLACE FUNCTION vendor_usage_fx_rate_brl()
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF((SELECT setting_value #>> '{}' FROM vendor_commercial_settings WHERE setting_key='usd_brl_reference_rate'), '')::numeric,
    5.00::numeric
  );
$$;

INSERT INTO vendor_commercial_settings(setting_key, setting_value)
VALUES ('usd_brl_reference_rate', '5.00'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- Map technical AI calls into customer-understandable units. Some technical
-- operations (embedding, web_search, transcription) deliberately remain only
-- in ai_usage_logs until a reliable business unit such as page/minute/article
-- is available from its authoritative result table.
CREATE OR REPLACE FUNCTION vendor_mirror_ai_usage_log()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  mapped_feature text;
  mapped_product text;
  credit_weight numeric := 0;
  customer_billable boolean := false;
  fx numeric := vendor_usage_fx_rate_brl();
BEGIN
  mapped_feature := CASE NEW.feature::text
    WHEN 'agent_sdr' THEN 'agent_interaction'
    WHEN 'agent_closer' THEN 'agent_interaction'
    WHEN 'agent_followup' THEN 'agent_interaction'
    WHEN 'agent_reactivation' THEN 'agent_interaction'
    WHEN 'agent_scheduler' THEN 'agent_interaction'
    WHEN 'agent_service' THEN 'agent_interaction'
    WHEN 'agent_onboarding' THEN 'agent_interaction'
    WHEN 'agent_relacionamento' THEN 'agent_interaction'
    WHEN 'agent_financeiro' THEN 'agent_interaction'
    WHEN 'agent_cobranca' THEN 'agent_interaction'
    WHEN 'briefing_generator' THEN 'crm_ai_assist'
    WHEN 'content_generator' THEN 'content_generation'
    WHEN 'image_generator' THEN 'image_generation'
    WHEN 'proposal_generator' THEN 'proposal_generation'
    WHEN 'auto_quote' THEN 'proposal_generation'
    WHEN 'intelligence_analysis' THEN 'intelligence_analysis'
    WHEN 'churn_retention' THEN 'intelligence_analysis'
    WHEN 'document_extraction' THEN 'document_processing'
    WHEN 'media_interpretation' THEN 'media_interpretation'
    ELSE NULL
  END;

  IF mapped_feature IS NULL THEN
    RETURN NEW;
  END IF;

  mapped_product := CASE mapped_feature
    WHEN 'agent_interaction' THEN 'ai_team'
    WHEN 'content_generation' THEN 'content_studio'
    WHEN 'image_generation' THEN 'creative_studio'
    WHEN 'proposal_generation' THEN 'propostas_catalogo'
    WHEN 'intelligence_analysis' THEN NULL
    ELSE NULL
  END;

  SELECT vendor_credits_per_unit
  INTO credit_weight
  FROM vendor_usage_features
  WHERE feature_key=mapped_feature;

  -- BYOK calls still create a cost/audit record but do not consume the
  -- platform-funded customer quota. Failed calls never consume customer quota.
  customer_billable := COALESCE(NEW.success, false) AND NOT COALESCE(NEW.used_byok, false);

  INSERT INTO vendor_usage_ledger (
    tenant_id, product_key, feature_key, quantity, vendor_credits,
    provider, model, input_tokens, output_tokens,
    external_cost_usd, total_cost_usd, fx_rate_brl, total_cost_brl,
    successful, billable, quota_consumed, request_id,
    source_table, source_id, metadata, created_at
  ) VALUES (
    NEW.tenant_id, mapped_product, mapped_feature, 1,
    CASE WHEN customer_billable THEN COALESCE(credit_weight,0) ELSE 0 END,
    NEW.provider::text, NEW.model, COALESCE(NEW.input_tokens,0), COALESCE(NEW.output_tokens,0),
    0, COALESCE(NEW.cost_estimate_usd,0), fx,
    COALESCE(NEW.cost_estimate_usd,0) * fx,
    COALESCE(NEW.success,false), customer_billable,
    CASE WHEN customer_billable THEN 1 ELSE 0 END,
    NEW.request_id, 'ai_usage_logs', NEW.id,
    jsonb_build_object('usedByok', COALESCE(NEW.used_byok,false), 'technicalFeature', NEW.feature::text),
    NEW.created_at
  )
  ON CONFLICT (source_table, source_id, feature_key) WHERE source_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_mirror_ai_usage_log ON ai_usage_logs;
CREATE TRIGGER trg_vendor_mirror_ai_usage_log
AFTER INSERT ON ai_usage_logs
FOR EACH ROW EXECUTE FUNCTION vendor_mirror_ai_usage_log();

-- arqdor.ai: one commercial unit only when a render actually reaches concluido.
CREATE OR REPLACE FUNCTION vendor_mirror_arch_render()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  weight numeric := 0;
  fx numeric := vendor_usage_fx_rate_brl();
BEGIN
  IF NEW.status = 'concluido' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'concluido') THEN
    SELECT vendor_credits_per_unit INTO weight FROM vendor_usage_features WHERE feature_key='render_generation';
    INSERT INTO vendor_usage_ledger (
      tenant_id, product_key, feature_key, quantity, vendor_credits,
      provider, total_cost_usd, fx_rate_brl, total_cost_brl,
      successful, billable, quota_consumed, source_table, source_id, metadata, created_at
    ) VALUES (
      NEW.tenant_id, 'arqdor_ai', 'render_generation', 1, COALESCE(weight,0),
      NEW.motor, COALESCE(NEW.cost_estimate_usd,0), fx, COALESCE(NEW.cost_estimate_usd,0)*fx,
      true, true, 1, 'arch_ai_renders', NEW.id,
      jsonb_build_object('operationType', NEW.operation_type, 'mode', NEW.mode), COALESCE(NEW.concluido_em, NEW.created_at)
    ) ON CONFLICT (source_table, source_id, feature_key) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_mirror_arch_render ON arch_ai_renders;
CREATE TRIGGER trg_vendor_mirror_arch_render
AFTER INSERT OR UPDATE OF status ON arch_ai_renders
FOR EACH ROW EXECUTE FUNCTION vendor_mirror_arch_render();

-- Prospector: an enrichment record represents one delivered enriched prospect.
CREATE OR REPLACE FUNCTION vendor_mirror_prospect_enrichment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE weight numeric := 0;
BEGIN
  SELECT vendor_credits_per_unit INTO weight FROM vendor_usage_features WHERE feature_key='prospect_enrichment';
  INSERT INTO vendor_usage_ledger (
    tenant_id, product_key, feature_key, quantity, vendor_credits,
    successful, billable, quota_consumed, source_table, source_id, metadata, created_at
  ) VALUES (
    NEW.tenant_id, 'prospector', 'prospect_enrichment', 1, COALESCE(weight,0),
    true, true, 1, 'prospect_enrichments', NEW.id,
    jsonb_build_object('hasContact', NEW.tem_contato, 'score', NEW.score_prospector), NEW.created_at
  ) ON CONFLICT (source_table, source_id, feature_key) WHERE source_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_mirror_prospect_enrichment ON prospect_enrichments;
CREATE TRIGGER trg_vendor_mirror_prospect_enrichment
AFTER INSERT ON prospect_enrichments
FOR EACH ROW EXECUTE FUNCTION vendor_mirror_prospect_enrichment();

-- Video: media_jobs is the business-result source. We count completed video
-- projects, not provider attempts. Batch output with N completed results counts N.
CREATE OR REPLACE FUNCTION vendor_mirror_media_video()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  project_kind text;
  delivered_count numeric := 1;
  weight numeric := 0;
BEGIN
  IF NEW.status <> 'done' OR (TG_OP='UPDATE' AND OLD.status = 'done') THEN
    RETURN NEW;
  END IF;

  SELECT kind INTO project_kind FROM media_projects WHERE id=NEW.project_id;
  IF COALESCE(project_kind,'video') <> 'video' THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.output->'results')='array' THEN
    SELECT GREATEST(1, count(*))::numeric INTO delivered_count
    FROM jsonb_array_elements(NEW.output->'results') item
    WHERE COALESCE(item->>'status','done')='done';
  END IF;

  SELECT vendor_credits_per_unit INTO weight FROM vendor_usage_features WHERE feature_key='video_generation';
  INSERT INTO vendor_usage_ledger (
    tenant_id, product_key, feature_key, quantity, vendor_credits,
    provider, successful, billable, quota_consumed,
    source_table, source_id, metadata, created_at
  ) VALUES (
    NEW.tenant_id, 'creative_studio', 'video_generation', delivered_count, COALESCE(weight,0)*delivered_count,
    NEW.provider, true, true, delivered_count,
    'media_jobs', NEW.id,
    jsonb_build_object('operation', NEW.operation, 'projectId', NEW.project_id), COALESCE(NEW.completed_at, NEW.created_at)
  ) ON CONFLICT (source_table, source_id, feature_key) WHERE source_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_mirror_media_video ON media_jobs;
CREATE TRIGGER trg_vendor_mirror_media_video
AFTER INSERT OR UPDATE OF status ON media_jobs
FOR EACH ROW EXECUTE FUNCTION vendor_mirror_media_video();

-- Site generator: count only final site delivery. Technical AI calls underneath
-- remain in ai_usage_logs for cost but site_generator itself is intentionally
-- not mirrored as a customer unit, preventing double consumption.
CREATE OR REPLACE FUNCTION vendor_mirror_site_generation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE weight numeric := 0;
BEGIN
  IF NEW.status='done' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'done') THEN
    SELECT vendor_credits_per_unit INTO weight FROM vendor_usage_features WHERE feature_key='site_generation';
    INSERT INTO vendor_usage_ledger (
      tenant_id, product_key, feature_key, quantity, vendor_credits,
      successful, billable, quota_consumed, source_table, source_id, metadata, created_at
    ) VALUES (
      NEW.tenant_id, 'sites_autopilot', 'site_generation', 1, COALESCE(weight,0),
      true, true, 1, 'site_generation_jobs', NEW.id,
      jsonb_build_object('baseOrigin', NEW.base_origin), NEW.updated_at
    ) ON CONFLICT (source_table, source_id, feature_key) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_mirror_site_generation ON site_generation_jobs;
CREATE TRIGGER trg_vendor_mirror_site_generation
AFTER INSERT OR UPDATE OF status ON site_generation_jobs
FOR EACH ROW EXECUTE FUNCTION vendor_mirror_site_generation();

-- Content Autopilot article: count the first moment a usable article reaches
-- review-ready/published state. Further edits/publication changes do not consume again.
CREATE OR REPLACE FUNCTION vendor_mirror_autopilot_article()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  weight numeric := 0;
  fx numeric := vendor_usage_fx_rate_brl();
BEGIN
  IF NEW.status IN ('pronto_revisao','publicado')
     AND (TG_OP='INSERT' OR OLD.status NOT IN ('pronto_revisao','publicado')) THEN
    SELECT vendor_credits_per_unit INTO weight FROM vendor_usage_features WHERE feature_key='autopilot_article';
    INSERT INTO vendor_usage_ledger (
      tenant_id, product_key, feature_key, quantity, vendor_credits,
      total_cost_usd, fx_rate_brl, total_cost_brl,
      successful, billable, quota_consumed,
      source_table, source_id, metadata, created_at
    ) VALUES (
      NEW.tenant_id, 'sites_autopilot', 'autopilot_article', 1, COALESCE(weight,0),
      COALESCE(NEW.custo_gerado,0), fx, COALESCE(NEW.custo_gerado,0)*fx,
      true, true, 1, 'content_autopilot_articles', NEW.id,
      jsonb_build_object('status', NEW.status, 'keywordId', NEW.keyword_id), NEW.created_at
    ) ON CONFLICT (source_table, source_id, feature_key) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_mirror_autopilot_article ON content_autopilot_articles;
CREATE TRIGGER trg_vendor_mirror_autopilot_article
AFTER INSERT OR UPDATE OF status ON content_autopilot_articles
FOR EACH ROW EXECUTE FUNCTION vendor_mirror_autopilot_article();

-- Quota view: only active entitlements, tenant-wide. It is intentionally a
-- measurement view while enforcement_mode remains observe.
CREATE OR REPLACE VIEW vendor_tenant_monthly_quota_status AS
WITH active_products AS (
  SELECT DISTINCT tenant_id, product_key
  FROM vendor_tenant_entitlements
  WHERE status='active'
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
), usage_month AS (
  SELECT tenant_id, product_key, feature_key,
         sum(quota_consumed) AS used_quantity,
         sum(vendor_credits) AS used_vendor_credits,
         sum(total_cost_usd) AS cost_usd,
         sum(COALESCE(total_cost_brl,0)) AS cost_brl
  FROM vendor_usage_ledger
  WHERE created_at >= date_trunc('month', now())
    AND billable=true
  GROUP BY tenant_id, product_key, feature_key
)
SELECT
  ap.tenant_id,
  ap.product_key,
  q.feature_key,
  f.label,
  f.unit_label,
  q.included_quantity,
  COALESCE(u.used_quantity,0) AS used_quantity,
  GREATEST(q.included_quantity - COALESCE(u.used_quantity,0), 0) AS remaining_quantity,
  CASE WHEN q.included_quantity > 0 THEN LEAST(100, round(COALESCE(u.used_quantity,0) / q.included_quantity * 100, 2)) ELSE 0 END AS percent_used,
  COALESCE(u.used_vendor_credits,0) AS used_vendor_credits,
  COALESCE(u.cost_usd,0) AS cost_usd,
  COALESCE(u.cost_brl,0) AS cost_brl,
  q.hard_limit,
  q.overage_allowed
FROM active_products ap
JOIN vendor_product_usage_quotas q ON q.product_key=ap.product_key
JOIN vendor_usage_features f ON f.feature_key=q.feature_key
LEFT JOIN usage_month u
  ON u.tenant_id=ap.tenant_id AND u.product_key=ap.product_key AND u.feature_key=q.feature_key;

COMMENT ON VIEW vendor_tenant_monthly_quota_status IS 'Observe-mode monthly commercial quota status per active tenant entitlement.';
