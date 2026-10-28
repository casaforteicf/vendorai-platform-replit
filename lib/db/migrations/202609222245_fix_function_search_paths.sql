-- Fix mutable search_path advisories on application-owned functions.
-- No function bodies, signatures, trigger bindings, or privileges are changed.

BEGIN;

DO $function_hardening$
DECLARE
  statement text;
BEGIN
  FOREACH statement IN ARRAY ARRAY[
    'ALTER FUNCTION "public"."bind_native_meta_event_after_instagram_message"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."cleanup_lead_relations_on_soft_delete"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."commercial_key_for_ai_feature"(p_feature text) SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."enforce_arch_projeto_vendor_links"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."enforce_tenant_user_limit"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."ensure_demo_product_category"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."finance_refresh_purchase_match"(p_match_id text) SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."keep_soft_deleted_lead_out_of_prospector"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."media_identity_has_active_consent"(p_tenant_id text, p_identity_id text, p_scope text) SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."mirror_ai_usage_to_usage_ledger"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."preserve_campaign_briefing_on_segment_update"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."prevent_praca_delivery_audit_mutation"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."prevent_praca_devolucao_event_mutation"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."prevent_praca_event_mutation"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."prevent_praca_exception_event_mutation"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."prevent_praca_interaction_delete"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."prevent_praca_payment_event_mutation"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."prevent_praca_reconciliation_event_mutation"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."prevent_tenant_code_change"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."prevent_unscoped_app_publish"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."prevent_vendor_shield_audit_mutation"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."prevent_vendor_shield_validation_event_mutation"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."record_ai_business_unit_usage"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."record_delivered_content_usage"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."record_prospect_usage"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."record_render_usage"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."record_site_usage"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."record_video_usage"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."recycle_stale_native_meta_event"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."set_deal_etapa_alterada_em"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."sync_access_license_growth_entitlement"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."sync_consumption_pack_activation"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."sync_content_autopilot_automation_mode"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."sync_deleted_lead_commercial_exclusion"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."sync_tenant_plan_entitlement"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."tenant_effective_user_limit"(p_tenant_id text) SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."usage_vendor_credits"(p_metric_key text, p_quantity numeric) SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."validar_hierarquia_categoria_produto"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."validate_and_sync_consumption_pack_activation"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."validate_media_brand_video_kit_assets"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."validate_runtime_commercial_entitlement"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."vendorai_consume_extra_ai_credits"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."vendorai_normalize_ai_usage_cost"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "public"."vendorai_sync_ai_credits_from_token_purchase"() SET search_path = pg_catalog, public;',
    'ALTER FUNCTION "system"."current_tenant_id"() SET search_path = pg_catalog, system, public, auth, core;',
    'ALTER FUNCTION "system"."update_updated_at_column"() SET search_path = pg_catalog, system, public, auth, core;'
  ]
  LOOP
    BEGIN
      EXECUTE statement;
    EXCEPTION
      WHEN undefined_function OR invalid_schema_name THEN NULL;
    END;
  END LOOP;
END
$function_hardening$;

COMMIT;
