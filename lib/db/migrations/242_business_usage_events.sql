-- Customer-visible usage units are emitted only when a useful result exists.
-- This migration still runs in measure-only mode: it records usage but does not
-- block any tenant or debit payment instruments.

-- Add arqdor.ai as a commercial capability even before its public catalog SKU is finalized.
INSERT INTO commercial_product_profiles
(commercial_key, catalog_product_id, offer_kind, included_in_growth, max_users, module_keys, benefits, display_order, metadata)
VALUES
('arqdor.ai', NULL, 'module', true, NULL,
 '["arch","obras"]',
 '["Projetos de arquitetura e interiores","Renderização por IA","Orçamento técnico","Biblioteca e portal do cliente"]',
 195,
 '{"catalogStatus":"pending_public_sku"}')
ON CONFLICT (commercial_key) DO UPDATE SET
  included_in_growth = EXCLUDED.included_in_growth,
  module_keys = EXCLUDED.module_keys,
  benefits = EXCLUDED.benefits,
  metadata = EXCLUDED.metadata,
  updated_at = now();

CREATE OR REPLACE FUNCTION record_delivered_content_usage()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO usage_ledger (
    tenant_id, commercial_key, metric_key, quantity, vendor_credits,
    billing_status, billable, success, source, source_event_id, metadata, created_at
  ) VALUES (
    NEW.tenant_id, 'vendor.content_studio', 'content', 1, 5,
    'measured', true, true, 'content_generations', NEW.id,
    jsonb_build_object('type', NEW.type, 'format', NEW.content_format), NEW.created_at
  ) ON CONFLICT (source, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_record_delivered_content_usage ON content_generations;
CREATE TRIGGER trg_record_delivered_content_usage
AFTER INSERT ON content_generations
FOR EACH ROW EXECUTE FUNCTION record_delivered_content_usage();

CREATE OR REPLACE FUNCTION record_prospect_usage()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO usage_ledger (
    tenant_id, commercial_key, metric_key, quantity, vendor_credits,
    billing_status, billable, success, source, source_event_id, metadata, created_at
  ) VALUES (
    NEW.tenant_id, 'vendor.prospector', 'prospect', 1, 2,
    'measured', true, true, 'prospect_enrichments', NEW.id,
    jsonb_build_object('leadId', NEW.lead_id, 'hasContact', NEW.tem_contato), NEW.created_at
  ) ON CONFLICT (source, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_record_prospect_usage ON prospect_enrichments;
CREATE TRIGGER trg_record_prospect_usage
AFTER INSERT ON prospect_enrichments
FOR EACH ROW EXECUTE FUNCTION record_prospect_usage();

CREATE OR REPLACE FUNCTION record_site_usage()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'done' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'done') THEN
    INSERT INTO usage_ledger (
      tenant_id, commercial_key, metric_key, quantity, vendor_credits,
      billing_status, billable, success, source, source_event_id, metadata, created_at
    ) VALUES (
      NEW.tenant_id, 'vendor.sites_autopilot', 'site', 1, 100,
      'measured', true, true, 'site_generation_jobs', NEW.id,
      jsonb_build_object('baseOrigin', NEW.base_origin), COALESCE(NEW.updated_at, NEW.created_at)
    ) ON CONFLICT (source, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_record_site_usage ON site_generation_jobs;
CREATE TRIGGER trg_record_site_usage
AFTER INSERT OR UPDATE OF status ON site_generation_jobs
FOR EACH ROW EXECUTE FUNCTION record_site_usage();

CREATE OR REPLACE FUNCTION record_render_usage()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'concluido' AND NEW.result_image_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluido') THEN
    INSERT INTO usage_ledger (
      tenant_id, commercial_key, metric_key, quantity, vendor_credits,
      billing_status, billable, success, provider,
      source, source_event_id, metadata, created_at
    ) VALUES (
      NEW.tenant_id, 'arqdor.ai', 'render', 1, 25,
      'measured', true, true, NEW.motor,
      'arch_ai_renders', NEW.id,
      jsonb_build_object('mode', NEW.mode, 'projectId', NEW.project_id),
      COALESCE(NEW.concluido_em, NEW.created_at)
    ) ON CONFLICT (source, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_record_render_usage ON arch_ai_renders;
CREATE TRIGGER trg_record_render_usage
AFTER INSERT OR UPDATE OF status ON arch_ai_renders
FOR EACH ROW EXECUTE FUNCTION record_render_usage();

CREATE OR REPLACE FUNCTION record_video_usage()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'done'
     AND NEW.operation ILIKE '%video%'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'done') THEN
    INSERT INTO usage_ledger (
      tenant_id, commercial_key, metric_key, quantity, vendor_credits,
      billing_status, billable, success, provider,
      source, source_event_id, metadata, created_at
    ) VALUES (
      NEW.tenant_id, 'vendor.creative_studio', 'video', 1, 200,
      'measured', true, true, NEW.provider,
      'media_jobs', NEW.id,
      jsonb_build_object('operation', NEW.operation, 'projectId', NEW.project_id),
      COALESCE(NEW.completed_at, NEW.updated_at, NEW.created_at)
    ) ON CONFLICT (source, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_record_video_usage ON media_jobs;
CREATE TRIGGER trg_record_video_usage
AFTER INSERT OR UPDATE OF status ON media_jobs
FOR EACH ROW EXECUTE FUNCTION record_video_usage();

-- Business metrics that map reliably 1:1 from the centralized AI gateway.
CREATE OR REPLACE FUNCTION record_ai_business_unit_usage()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_metric text;
  v_commercial_key text;
  v_credits integer;
BEGIN
  IF NOT NEW.success THEN
    RETURN NEW;
  END IF;

  CASE NEW.feature::text
    WHEN 'image_generator' THEN v_metric := 'image'; v_commercial_key := 'vendor.creative_studio'; v_credits := 10;
    WHEN 'proposal_generator' THEN v_metric := 'proposal'; v_commercial_key := 'vendor.proposals_catalog'; v_credits := 5;
    WHEN 'auto_quote' THEN v_metric := 'proposal'; v_commercial_key := 'vendor.proposals_catalog'; v_credits := 5;
    WHEN 'document_extraction' THEN v_metric := 'document'; v_commercial_key := 'vendor.management'; v_credits := 2;
    WHEN 'media_interpretation' THEN v_metric := 'media_interpretation'; v_commercial_key := 'vendor.knowledge'; v_credits := 3;
    WHEN 'intelligence_analysis' THEN v_metric := 'intelligence_analysis'; v_commercial_key := 'vendor.revenue_scout'; v_credits := 2;
    WHEN 'churn_retention' THEN v_metric := 'intelligence_analysis'; v_commercial_key := 'vendor.revenue_scout'; v_credits := 2;
    WHEN 'agent_sdr' THEN v_metric := 'agent_interaction'; v_commercial_key := 'vendor.ai_team'; v_credits := 1;
    WHEN 'agent_closer' THEN v_metric := 'agent_interaction'; v_commercial_key := 'vendor.ai_team'; v_credits := 1;
    WHEN 'agent_followup' THEN v_metric := 'agent_interaction'; v_commercial_key := 'vendor.ai_team'; v_credits := 1;
    WHEN 'agent_reactivation' THEN v_metric := 'agent_interaction'; v_commercial_key := 'vendor.ai_team'; v_credits := 1;
    WHEN 'agent_scheduler' THEN v_metric := 'agent_interaction'; v_commercial_key := 'vendor.ai_team'; v_credits := 1;
    WHEN 'agent_service' THEN v_metric := 'agent_interaction'; v_commercial_key := 'vendor.ai_team'; v_credits := 1;
    WHEN 'agent_onboarding' THEN v_metric := 'agent_interaction'; v_commercial_key := 'vendor.ai_team'; v_credits := 1;
    WHEN 'agent_relacionamento' THEN v_metric := 'agent_interaction'; v_commercial_key := 'vendor.ai_team'; v_credits := 1;
    ELSE RETURN NEW;
  END CASE;

  INSERT INTO usage_ledger (
    tenant_id, commercial_key, metric_key, quantity, vendor_credits,
    billing_status, billable, success, provider, model,
    input_tokens, output_tokens, total_cost_usd,
    source, source_event_id, request_id, metadata, created_at
  ) VALUES (
    NEW.tenant_id, v_commercial_key, v_metric, 1, v_credits,
    'measured', true, true, NEW.provider::text, NEW.model,
    NEW.input_tokens, NEW.output_tokens, 0,
    'ai_business_unit', NEW.id, NEW.request_id,
    jsonb_build_object('feature', NEW.feature::text), NEW.created_at
  ) ON CONFLICT (source, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_record_ai_business_unit_usage ON ai_usage_logs;
CREATE TRIGGER trg_record_ai_business_unit_usage
AFTER INSERT ON ai_usage_logs
FOR EACH ROW EXECUTE FUNCTION record_ai_business_unit_usage();

-- Backfill business units only for reliable event tables.
INSERT INTO usage_ledger
(tenant_id, commercial_key, metric_key, quantity, vendor_credits, billing_status, billable, success, source, source_event_id, metadata, created_at)
SELECT tenant_id, 'vendor.content_studio', 'content', 1, 5, 'measured', true, true,
       'content_generations', id, jsonb_build_object('type', type, 'format', content_format), created_at
FROM content_generations
ON CONFLICT (source, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING;

INSERT INTO usage_ledger
(tenant_id, commercial_key, metric_key, quantity, vendor_credits, billing_status, billable, success, source, source_event_id, metadata, created_at)
SELECT tenant_id, 'vendor.prospector', 'prospect', 1, 2, 'measured', true, true,
       'prospect_enrichments', id, jsonb_build_object('leadId', lead_id, 'hasContact', tem_contato), created_at
FROM prospect_enrichments
ON CONFLICT (source, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING;
