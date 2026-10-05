-- Current Vendor.ai commercial offer catalog (2026-10)
-- Presentation/billing metadata only. Does not grant/revoke tenant entitlements,
-- does not change module visibility, and does not enable enforcement.

INSERT INTO commercial_product_profiles
  (commercial_key, offer_kind, included_in_growth, max_users, module_keys, segment_keys, benefits, display_order, active, metadata)
VALUES
('vendor.prepaid', 'prepaid', false, NULL, '[]'::jsonb, '[]'::jsonb,
 '["Sem mensalidade","Usuários ilimitados","Compre Vendor Credits quando precisar"]'::jsonb, 1, true,
 '{"customerFacing":true,"displayName":"Vendor Pré-Pago","monthlyPriceBrl":0,"includedVendorCreditsMonthly":0,"unlimitedUsers":true,"commercialCatalogVersion":"2026-10"}'::jsonb),

('vendor.start', 'subscription', false, NULL, '["dashboard","leads","deals","scheduler","settings"]'::jsonb, '[]'::jsonb,
 '["CRM básico","Agenda","Propostas simples","IA básica","Usuários ilimitados"]'::jsonb, 10, true,
 '{"customerFacing":true,"displayName":"Vendor Start","monthlyPriceBrl":49,"includedVendorCreditsMonthly":500,"unlimitedUsers":true,"commercialCatalogVersion":"2026-10"}'::jsonb),

('vendor.sales', 'subscription', false, NULL, '["dashboard","leads","deals","proposals","scheduler","settings"]'::jsonb, '[]'::jsonb,
 '["CRM completo","Pipeline","Propostas e versões","Next Best Action","Closer assistido","Usuários ilimitados"]'::jsonb, 20, true,
 '{"customerFacing":true,"displayName":"Vendor Sales","monthlyPriceBrl":149,"includedVendorCreditsMonthly":1500,"unlimitedUsers":true,"commercialCatalogVersion":"2026-10"}'::jsonb),

('vendor.prospector', 'subscription', false, NULL, '["prospector"]'::jsonb, '[]'::jsonb,
 '["Prospecção","Enriquecimento","Sinais de oportunidade","Decisores","Usuários ilimitados"]'::jsonb, 30, true,
 '{"customerFacing":true,"displayName":"Vendor Prospector","monthlyPriceBrl":197,"includedVendorCreditsMonthly":2500,"unlimitedUsers":true,"commercialCatalogVersion":"2026-10"}'::jsonb),

('vendor.marketing', 'subscription', false, NULL, '["content","campaigns"]'::jsonb, '[]'::jsonb,
 '["Planejamento","Conteúdo","Campanhas","Mídia","Biblioteca","Usuários ilimitados"]'::jsonb, 40, true,
 '{"customerFacing":true,"displayName":"Vendor Marketing","monthlyPriceBrl":197,"includedVendorCreditsMonthly":2500,"unlimitedUsers":true,"commercialCatalogVersion":"2026-10"}'::jsonb),

('vendor.service', 'subscription', false, NULL, '["conversations"]'::jsonb, '[]'::jsonb,
 '["Omnichannel","Atendimento","Suporte","Pós-venda","Usuários ilimitados"]'::jsonb, 50, true,
 '{"customerFacing":true,"displayName":"Vendor Service","monthlyPriceBrl":197,"includedVendorCreditsMonthly":2000,"unlimitedUsers":true,"commercialCatalogVersion":"2026-10"}'::jsonb),

('vendor.agents', 'subscription', false, NULL, '["sdr","agents"]'::jsonb, '[]'::jsonb,
 '["Agentes especializados","SDR","Closer","Cobrança","Suporte","Usuários ilimitados"]'::jsonb, 60, true,
 '{"customerFacing":true,"displayName":"Vendor Agents","monthlyPriceBrl":197,"includedVendorCreditsMonthly":2500,"unlimitedUsers":true,"commercialCatalogVersion":"2026-10"}'::jsonb),

('vendor.intelligence', 'subscription', false, NULL, '["revenue","churn","intelligence","analytics"]'::jsonb, '[]'::jsonb,
 '["BI","Customer Intelligence","Revenue Intelligence","Forecast","Usuários ilimitados"]'::jsonb, 70, true,
 '{"customerFacing":true,"displayName":"Vendor Intelligence","monthlyPriceBrl":197,"includedVendorCreditsMonthly":1500,"unlimitedUsers":true,"commercialCatalogVersion":"2026-10"}'::jsonb),

('vendor.finance', 'subscription', false, NULL, '["financeiro"]'::jsonb, '[]'::jsonb,
 '["Contas a receber","Cobrança","Previsão","Relacionamento financeiro","Usuários ilimitados"]'::jsonb, 80, true,
 '{"customerFacing":true,"displayName":"Vendor Finance","monthlyPriceBrl":149,"includedVendorCreditsMonthly":1000,"unlimitedUsers":true,"commercialCatalogVersion":"2026-10"}'::jsonb),

('vendor.build', 'subscription', false, NULL, '[]'::jsonb, '["Construção","Arquitetura & Design"]'::jsonb,
 '["Obras","Cronograma físico-financeiro","Custos","Compras","Portal do Cliente","Usuários ilimitados"]'::jsonb, 90, true,
 '{"customerFacing":true,"displayName":"Vendor Build","monthlyPriceBrl":297,"includedVendorCreditsMonthly":2000,"unlimitedUsers":true,"commercialCatalogVersion":"2026-10"}'::jsonb),

('arqdor.ai', 'subscription', false, NULL, '[]'::jsonb, '["Arquitetura & Design","Construção"]'::jsonb,
 '["Concept","2D/3D","Imagem para planta","Renders","IFC","Usuários ilimitados"]'::jsonb, 100, true,
 '{"customerFacing":true,"displayName":"Arqdor","monthlyPriceBrl":197,"includedVendorCreditsMonthly":2500,"unlimitedUsers":true,"commercialCatalogVersion":"2026-10"}'::jsonb),

('vendor.commerce', 'subscription', false, NULL, '[]'::jsonb, '[]'::jsonb,
 '["Catálogo","Pedidos","Checkout","Pagamentos","Ofertas","Usuários ilimitados"]'::jsonb, 110, true,
 '{"customerFacing":true,"displayName":"Vendor Commerce","monthlyPriceBrl":149,"includedVendorCreditsMonthly":1000,"unlimitedUsers":true,"transactionFeeApplies":true,"commercialCatalogVersion":"2026-10"}'::jsonb),

('vendor.complete', 'subscription', false, NULL, '[]'::jsonb, '[]'::jsonb,
 '["Todos os produtos especializados aplicáveis","Usuários ilimitados","Carteira única de Vendor Credits"]'::jsonb, 120, true,
 '{"customerFacing":true,"displayName":"Vendor.ai Complete","monthlyPriceBrl":697,"includedVendorCreditsMonthly":7500,"unlimitedUsers":true,"bundle":true,"commercialCatalogVersion":"2026-10"}'::jsonb)
ON CONFLICT (commercial_key) DO UPDATE SET
  offer_kind = EXCLUDED.offer_kind,
  max_users = EXCLUDED.max_users,
  module_keys = EXCLUDED.module_keys,
  segment_keys = EXCLUDED.segment_keys,
  benefits = EXCLUDED.benefits,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active,
  metadata = commercial_product_profiles.metadata || EXCLUDED.metadata,
  updated_at = now();

-- Legacy profiles remain available for existing entitlements, but no longer
-- participate in the customer-facing current-plan catalog unless explicitly
-- marked customerFacing=true above.
UPDATE commercial_product_profiles
SET metadata = metadata || '{"customerFacing":false}'::jsonb,
    updated_at = now()
WHERE commercial_key IN (
  'vendor.crm.free','vendor.crm','vendor.agenda','vendor.omnichannel',
  'vendor.ai_team','vendor.revenue_scout','vendor.proposals_catalog',
  'vendor.management','vendor.jarvis','vendor.knowledge','vendor.bi',
  'vendor.automations','vendor.content_planner','vendor.content_studio',
  'vendor.creative_studio','vendor.ads','vendor.sites_autopilot',
  'vendor.praca','vendor.app_builder','vendor.reputation','vendor.growth',
  'vendor.growth.5d'
)
AND commercial_key NOT IN ('vendor.prospector');
