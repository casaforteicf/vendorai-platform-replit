-- Parent-owned RLS batch 1: children with a single mandatory FK to a tenant-scoped parent.
-- The child inherits visibility from the already-protected parent table.

BEGIN;

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."ad_performance_snapshots";
CREATE POLICY vendorai_parent_tenant_access ON public."ad_performance_snapshots" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."ad_campaigns" AS parent_row WHERE parent_row."id" = "ad_performance_snapshots"."campaign_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."ad_campaigns" AS parent_row WHERE parent_row."id" = "ad_performance_snapshots"."campaign_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."ad_performance_snapshots";
CREATE POLICY vendorai_parent_tenant_guard ON public."ad_performance_snapshots" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."ad_campaigns" AS parent_row WHERE parent_row."id" = "ad_performance_snapshots"."campaign_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."ad_campaigns" AS parent_row WHERE parent_row."id" = "ad_performance_snapshots"."campaign_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_ambientes";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_ambientes" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arch_ambientes"."projeto_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arch_ambientes"."projeto_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_ambientes";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_ambientes" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arch_ambientes"."projeto_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arch_ambientes"."projeto_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_cenas";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_cenas" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arch_cenas"."projeto_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arch_cenas"."projeto_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_cenas";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_cenas" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arch_cenas"."projeto_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arch_cenas"."projeto_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_delivery_checklist";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_delivery_checklist" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_delivery_checklist"."delivery_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_delivery_checklist"."delivery_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_delivery_checklist";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_delivery_checklist" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_delivery_checklist"."delivery_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_delivery_checklist"."delivery_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_delivery_terms";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_delivery_terms" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_delivery_terms"."delivery_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_delivery_terms"."delivery_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_delivery_terms";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_delivery_terms" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_delivery_terms"."delivery_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_delivery_terms"."delivery_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_final_documents";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_final_documents" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_final_documents"."delivery_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_final_documents"."delivery_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_final_documents";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_final_documents" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_final_documents"."delivery_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_final_documents"."delivery_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_orcamento_itens";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_orcamento_itens" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arch_orcamento_itens"."projeto_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arch_orcamento_itens"."projeto_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_orcamento_itens";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_orcamento_itens" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arch_orcamento_itens"."projeto_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arch_orcamento_itens"."projeto_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_proposal_deliveries";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_proposal_deliveries" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_proposals" AS parent_row WHERE parent_row."id" = "arch_proposal_deliveries"."proposal_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_proposals" AS parent_row WHERE parent_row."id" = "arch_proposal_deliveries"."proposal_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_proposal_deliveries";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_proposal_deliveries" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_proposals" AS parent_row WHERE parent_row."id" = "arch_proposal_deliveries"."proposal_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_proposals" AS parent_row WHERE parent_row."id" = "arch_proposal_deliveries"."proposal_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_proposal_events";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_proposal_events" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_proposals" AS parent_row WHERE parent_row."id" = "arch_proposal_events"."proposal_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_proposals" AS parent_row WHERE parent_row."id" = "arch_proposal_events"."proposal_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_proposal_events";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_proposal_events" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_proposals" AS parent_row WHERE parent_row."id" = "arch_proposal_events"."proposal_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_proposals" AS parent_row WHERE parent_row."id" = "arch_proposal_events"."proposal_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_proposal_items";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_proposal_items" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_proposals" AS parent_row WHERE parent_row."id" = "arch_proposal_items"."proposal_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_proposals" AS parent_row WHERE parent_row."id" = "arch_proposal_items"."proposal_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_proposal_items";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_proposal_items" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_proposals" AS parent_row WHERE parent_row."id" = "arch_proposal_items"."proposal_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_proposals" AS parent_row WHERE parent_row."id" = "arch_proposal_items"."proposal_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_satisfaction_surveys";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_satisfaction_surveys" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_satisfaction_surveys"."delivery_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_satisfaction_surveys"."delivery_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_satisfaction_surveys";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_satisfaction_surveys" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_satisfaction_surveys"."delivery_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_satisfaction_surveys"."delivery_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_spec_items";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_spec_items" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_specifications" AS parent_row WHERE parent_row."id" = "arch_spec_items"."specification_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_specifications" AS parent_row WHERE parent_row."id" = "arch_spec_items"."specification_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_spec_items";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_spec_items" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_specifications" AS parent_row WHERE parent_row."id" = "arch_spec_items"."specification_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_specifications" AS parent_row WHERE parent_row."id" = "arch_spec_items"."specification_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_testimonial_requests";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_testimonial_requests" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_testimonial_requests"."delivery_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_testimonial_requests"."delivery_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_testimonial_requests";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_testimonial_requests" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_testimonial_requests"."delivery_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_deliveries" AS parent_row WHERE parent_row."id" = "arch_testimonial_requests"."delivery_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arq_aie_snapshots";
CREATE POLICY vendorai_parent_tenant_access ON public."arq_aie_snapshots" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arq_aie_snapshots"."projeto_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arq_aie_snapshots"."projeto_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arq_aie_snapshots";
CREATE POLICY vendorai_parent_tenant_guard ON public."arq_aie_snapshots" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arq_aie_snapshots"."projeto_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arq_aie_snapshots"."projeto_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arq_materials";
CREATE POLICY vendorai_parent_tenant_access ON public."arq_materials" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arq_materials"."projeto_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arq_materials"."projeto_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arq_materials";
CREATE POLICY vendorai_parent_tenant_guard ON public."arq_materials" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arq_materials"."projeto_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arq_materials"."projeto_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arq_objects";
CREATE POLICY vendorai_parent_tenant_access ON public."arq_objects" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arq_objects"."projeto_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arq_objects"."projeto_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arq_objects";
CREATE POLICY vendorai_parent_tenant_guard ON public."arq_objects" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arq_objects"."projeto_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "arq_objects"."projeto_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."commerce_checkout_sessions";
CREATE POLICY vendorai_parent_tenant_access ON public."commerce_checkout_sessions" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."generated_sites" AS parent_row WHERE parent_row."id" = "commerce_checkout_sessions"."site_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."generated_sites" AS parent_row WHERE parent_row."id" = "commerce_checkout_sessions"."site_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."commerce_checkout_sessions";
CREATE POLICY vendorai_parent_tenant_guard ON public."commerce_checkout_sessions" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."generated_sites" AS parent_row WHERE parent_row."id" = "commerce_checkout_sessions"."site_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."generated_sites" AS parent_row WHERE parent_row."id" = "commerce_checkout_sessions"."site_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."farmacia_pedido_itens";
CREATE POLICY vendorai_parent_tenant_access ON public."farmacia_pedido_itens" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."farmacia_pedidos" AS parent_row WHERE parent_row."id" = "farmacia_pedido_itens"."pedido_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."farmacia_pedidos" AS parent_row WHERE parent_row."id" = "farmacia_pedido_itens"."pedido_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."farmacia_pedido_itens";
CREATE POLICY vendorai_parent_tenant_guard ON public."farmacia_pedido_itens" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."farmacia_pedidos" AS parent_row WHERE parent_row."id" = "farmacia_pedido_itens"."pedido_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."farmacia_pedidos" AS parent_row WHERE parent_row."id" = "farmacia_pedido_itens"."pedido_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."lead_events";
CREATE POLICY vendorai_parent_tenant_access ON public."lead_events" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."leads" AS parent_row WHERE parent_row."id" = "lead_events"."lead_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."leads" AS parent_row WHERE parent_row."id" = "lead_events"."lead_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."lead_events";
CREATE POLICY vendorai_parent_tenant_guard ON public."lead_events" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."leads" AS parent_row WHERE parent_row."id" = "lead_events"."lead_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."leads" AS parent_row WHERE parent_row."id" = "lead_events"."lead_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."lead_optimal_hours";
CREATE POLICY vendorai_parent_tenant_access ON public."lead_optimal_hours" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."leads" AS parent_row WHERE parent_row."id" = "lead_optimal_hours"."lead_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."leads" AS parent_row WHERE parent_row."id" = "lead_optimal_hours"."lead_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."lead_optimal_hours";
CREATE POLICY vendorai_parent_tenant_guard ON public."lead_optimal_hours" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."leads" AS parent_row WHERE parent_row."id" = "lead_optimal_hours"."lead_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."leads" AS parent_row WHERE parent_row."id" = "lead_optimal_hours"."lead_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."obra_etapas";
CREATE POLICY vendorai_parent_tenant_access ON public."obra_etapas" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."obras" AS parent_row WHERE parent_row."id" = "obra_etapas"."obra_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."obras" AS parent_row WHERE parent_row."id" = "obra_etapas"."obra_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."obra_etapas";
CREATE POLICY vendorai_parent_tenant_guard ON public."obra_etapas" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."obras" AS parent_row WHERE parent_row."id" = "obra_etapas"."obra_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."obras" AS parent_row WHERE parent_row."id" = "obra_etapas"."obra_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."obra_orcamento_etapas";
CREATE POLICY vendorai_parent_tenant_access ON public."obra_orcamento_etapas" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."obra_orcamentos" AS parent_row WHERE parent_row."id" = "obra_orcamento_etapas"."orcamento_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."obra_orcamentos" AS parent_row WHERE parent_row."id" = "obra_orcamento_etapas"."orcamento_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."obra_orcamento_etapas";
CREATE POLICY vendorai_parent_tenant_guard ON public."obra_orcamento_etapas" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."obra_orcamentos" AS parent_row WHERE parent_row."id" = "obra_orcamento_etapas"."orcamento_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."obra_orcamentos" AS parent_row WHERE parent_row."id" = "obra_orcamento_etapas"."orcamento_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."obra_portal_sessions";
CREATE POLICY vendorai_parent_tenant_access ON public."obra_portal_sessions" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."obra_portal_users" AS parent_row WHERE parent_row."id" = "obra_portal_sessions"."user_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."obra_portal_users" AS parent_row WHERE parent_row."id" = "obra_portal_sessions"."user_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."obra_portal_sessions";
CREATE POLICY vendorai_parent_tenant_guard ON public."obra_portal_sessions" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."obra_portal_users" AS parent_row WHERE parent_row."id" = "obra_portal_sessions"."user_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."obra_portal_users" AS parent_row WHERE parent_row."id" = "obra_portal_sessions"."user_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."partner_indicators";
CREATE POLICY vendorai_parent_tenant_access ON public."partner_indicators" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."partners" AS parent_row WHERE parent_row."id" = "partner_indicators"."partner_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."partners" AS parent_row WHERE parent_row."id" = "partner_indicators"."partner_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."partner_indicators";
CREATE POLICY vendorai_parent_tenant_guard ON public."partner_indicators" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."partners" AS parent_row WHERE parent_row."id" = "partner_indicators"."partner_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."partners" AS parent_row WHERE parent_row."id" = "partner_indicators"."partner_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."partner_referral_events";
CREATE POLICY vendorai_parent_tenant_access ON public."partner_referral_events" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."partners" AS parent_row WHERE parent_row."id" = "partner_referral_events"."partner_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."partners" AS parent_row WHERE parent_row."id" = "partner_referral_events"."partner_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."partner_referral_events";
CREATE POLICY vendorai_parent_tenant_guard ON public."partner_referral_events" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."partners" AS parent_row WHERE parent_row."id" = "partner_referral_events"."partner_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."partners" AS parent_row WHERE parent_row."id" = "partner_referral_events"."partner_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."payment_compositions";
CREATE POLICY vendorai_parent_tenant_access ON public."payment_compositions" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."deals" AS parent_row WHERE parent_row."id" = "payment_compositions"."deal_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."deals" AS parent_row WHERE parent_row."id" = "payment_compositions"."deal_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."payment_compositions";
CREATE POLICY vendorai_parent_tenant_guard ON public."payment_compositions" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."deals" AS parent_row WHERE parent_row."id" = "payment_compositions"."deal_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."deals" AS parent_row WHERE parent_row."id" = "payment_compositions"."deal_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."prospector_flow_steps";
CREATE POLICY vendorai_parent_tenant_access ON public."prospector_flow_steps" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."prospector_flows" AS parent_row WHERE parent_row."id" = "prospector_flow_steps"."flow_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."prospector_flows" AS parent_row WHERE parent_row."id" = "prospector_flow_steps"."flow_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."prospector_flow_steps";
CREATE POLICY vendorai_parent_tenant_guard ON public."prospector_flow_steps" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."prospector_flows" AS parent_row WHERE parent_row."id" = "prospector_flow_steps"."flow_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."prospector_flows" AS parent_row WHERE parent_row."id" = "prospector_flow_steps"."flow_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."render_surfaces";
CREATE POLICY vendorai_parent_tenant_access ON public."render_surfaces" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "render_surfaces"."project_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "render_surfaces"."project_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."render_surfaces";
CREATE POLICY vendorai_parent_tenant_guard ON public."render_surfaces" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "render_surfaces"."project_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."arch_projetos" AS parent_row WHERE parent_row."id" = "render_surfaces"."project_id"));

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."restaurante_pedido_itens";
CREATE POLICY vendorai_parent_tenant_access ON public."restaurante_pedido_itens" AS PERMISSIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."restaurante_pedidos" AS parent_row WHERE parent_row."id" = "restaurante_pedido_itens"."pedido_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."restaurante_pedidos" AS parent_row WHERE parent_row."id" = "restaurante_pedido_itens"."pedido_id"));
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."restaurante_pedido_itens";
CREATE POLICY vendorai_parent_tenant_guard ON public."restaurante_pedido_itens" AS RESTRICTIVE FOR ALL TO vendorai_app USING (EXISTS (SELECT 1 FROM public."restaurante_pedidos" AS parent_row WHERE parent_row."id" = "restaurante_pedido_itens"."pedido_id")) WITH CHECK (EXISTS (SELECT 1 FROM public."restaurante_pedidos" AS parent_row WHERE parent_row."id" = "restaurante_pedido_itens"."pedido_id"));

COMMIT;
