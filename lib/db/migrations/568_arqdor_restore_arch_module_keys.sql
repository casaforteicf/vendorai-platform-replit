-- 568_arqdor_restore_arch_module_keys.sql
--
-- Restaura a capability "arch" (e "obras") no perfil arqdor.ai.
-- A reescrita do catalogo comercial de 2026-10
-- (528_current_commercial_plan_catalog.sql) substituiu module_keys por um
-- array vazio, removendo o Arqdor de enforceCommercialProductAccess (/arch)
-- e de tenantNavModules.
--
-- 242_business_usage_events.sql declarava ["arch","obras"] para este perfil.
-- Esta migration restaura a declaracao sem alterar a 528.
--
-- Idempotente: pode ser reaplicada; no-op se o perfil nao existir.

UPDATE commercial_product_profiles
SET module_keys = '["arch","obras"]'::jsonb,
    updated_at  = now()
WHERE commercial_key = 'arqdor.ai';