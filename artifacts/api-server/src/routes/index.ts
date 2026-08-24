import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import authRouter, { authProtectedRouter } from "./auth";
import tenantsRouter from "./tenants";
import usersRouter from "./users";
import leadsRouter from "./leads";
import conversationsRouter from "./conversations";
import agentActionsLogRouter from "./agent_actions_log";
import consentsRouter from "./consents";
import businessProfilesRouter from "./business_profiles";
import agentConfigsRouter from "./agent_configs";
import funisRouter from "./funis";
import dealsRouter from "./deals";
import activitiesRouter from "./activities";
import propostasRouter from "./propostas";
import messagesRouter from "./messages";
import customerIntelligenceRouter from "./customer_intelligence";
import agentTasksRouter from "./agent_tasks";
import campaignsRouter from "./campaigns";
import produtosCatalogoRouter from "./produtos_catalogo";
import solicitacoesCompraRouter from "./solicitacoes_compra";
import categoriasProdutoRouter from "./categorias_produto";
import agendasRouter, { googleCallbackRouter } from "./agendas";
import { instagramCallbackRouter } from "./instagram-auth";
import { whatsappCallbackRouter } from "./whatsapp-auth";
import { googleAdsCallbackRouter } from "./google-ads-auth";
import { metaAdsCallbackRouter } from "./meta-ads-auth";
import agendamentosRouter from "./agendamentos";
import entregasRouter from "./entregas";
import bloqueiosAgendaRouter from "./bloqueios_agenda";
import subscriptionsRouter from "./subscriptions";
import invoicesRouter from "./invoices";
import dashboardRouter from "./dashboard";
import analyticsRouter from "./analytics";
import knowledgeBaseRouter from "./knowledge_base";
import rulesRouter from "./rules";
import webhooksRouter from "./webhooks";
import agentsRouter from "./agents";
import inventoryRouter, { inventorySyncRouter } from "./inventory";
import siteConfigRouter, { publicSiteRouter } from "./site_config";
import segmentTemplatesRouter, { publicSegmentTemplatesRouter } from "./segment_templates";
import invitesRouter, { invitesProtectedRouter } from "./invites";
import onboardingRouter from "./onboarding";
import contentRouter from "./content";
import contentReferenceCreatorsRouter from "./content_reference_creators.js";
import contentPerformanceRouter from "./content_performance.js";
import evolutionWhatsappAuthRouter from "./evolution_whatsapp_auth.js";
import partnerRouter from "./partner";
import partnersRouter from "./partners";
import partnerHubRouter from "./partner_hub";
import ecosystemHubRouter from "./ecosystem_hub";
import vcnRouter from "./vcn";
import poeRouter from "./poe";
import knowledgeGraphRouter from "./knowledge_graph";
import adminPartnersRouter from "./admin_partners";
import adminPlansRouter from "./admin_plans";
import adminAgentDefaultsRouter from "./admin_agent_defaults";
import billingEventsRouter from "./billing_events";
import tokenPurchasesRouter from "./token_purchases";
import tenantDomainsRouter from "./tenant_domains";
import notificationsRouter from "./notifications";
import { intakeRouter } from "./intake";
import publicProposalsRouter from "./public_proposals";
import construcaoRouter from "./construcao";
import archRouter, { archPublicRouter } from "./arch";
import { archAiRenderRouter } from "./arch_ai_render";
import archSpecObjectsRouter from "./arch_spec_objects";
import archBudgetEngineRouter from "./arch_budget_engine";
import archClientPortalApprovalRouter from "./arch_client_portal_approval";
import archProductionProcurementRouter from "./arch_production_procurement";
import archPostSaleRouter from "./arch_post_sale";
import { createSystemConsolidationRouter } from "./arch_system_consolidation";
import archThemePreferencesRouter from "./arch_theme_preferences";
import financeiroObraRouter from "./financeiro_obra";
import portalRouter from "./portal";
import varejoRouter from "./varejo";
import supermercadoRouter, { supermercadoPublicRouter } from "./supermercado";
import farmaciaRouter from "./farmacia";
import adsRouter, { adsPublicRouter } from "./ads";
import imoveisRouter from "./imoveis";
import fretesRouter, { fretesPublicRouter } from "./fretes";
import storiesRouter from "./stories";
import manifestRouter from "./manifest";
import variedadesDiaRouter from "./variedades_dia";
import veiculosRouter from "./veiculos";
import pracaPerguntasRouter from "./praca_perguntas";
import restauranteRouter from "./restaurante";
import siteGeneratorRouter, { publicSiteGeneratorRouter } from "./site_generator";
import leadProposalsRouter from "./lead_proposals";
import productPresentationsRouter from "./product_presentations";
import tenantCalendarSettingsRouter from "./tenant_calendar_settings";
import leadSpouseConsentRouter from "./lead_spouse_consent";
import aiGatewayRouter from "./ai_gateway";
import prospectorRouter from "./prospector";
import partnerProspectorRouter from "./partner-prospector";
import prospectorFlowsRouter from "./prospector-flows";
import contentStudioRouter from "./content_studio";
import videoProcessingRouter from "./video_processing";
import beautyRouter from "./beauty";
import servicosRouter from "./servicos";
import clinicRouter from "./clinic";
import scoutRouter from "./scout";
import intentWebhooksRouter from "./intentWebhooks";
import sdrTemplatesRouter from "./sdr_templates";
import renderRouter from "./render";
import siteRouter from "./site";
import spinRouter from "./spin";
import supportRouter from "./support";
import adminBugReportsRouter from "./admin_bug_reports";
import adminRelatosTecnicosRouter from "./admin_relatos_tecnicos";
import contractTemplatesRouter from "./contract_templates";
import confirmClosureRouter from "./confirm_closure";
import organizacoesRouter from "./organizacoes";
import tenantSwitchRouter from "./tenant_switch.js";
import adminFinancialRouter from "./admin_financial";
import sellerCommissionsRouter from "./sellerCommissions";
import contentTrackingRouter from "./content_tracking";
import tenantNavModulesRouter from "./tenantNavModules";
import vendasPracaRouter from "./vendas_praca";
import erpRouter from "./erp";
import changelogRouter from "./changelog";
import pacotesRouter from "./pacotes";
import mlStatusRouter from "./ml_status";
import internalScoutSignalRouter from "./internal_scout_signal";
import leadOportunidadesPrevistasRouter from "./lead_oportunidades_previstas";
import contentAutopilotRouter from "./content_autopilot";
import { siteBlogPublicRouter, siteBlogAdminRouter } from "./site_blog";
import { authenticate, blockPartnerFromCRM, blockSuspendedTenants, blockExpiredDemo, enforceModulePermission, requireRole, requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";

const router: IRouter = Router();

// Public
router.use(healthRouter);
router.use(storageRouter);
router.use(authRouter);
router.use(manifestRouter);
router.use(invitesRouter);
router.use(webhooksRouter);
router.use(siteRouter);
router.use(publicSiteRouter);
router.use(publicSiteGeneratorRouter);
router.use(siteBlogPublicRouter);
router.use(publicSegmentTemplatesRouter);
router.use(inventorySyncRouter);
router.use(intakeRouter);
router.use(portalRouter);
router.use(archPublicRouter);
router.use(googleCallbackRouter);
router.use(instagramCallbackRouter);
router.use(whatsappCallbackRouter);
router.use(googleAdsCallbackRouter);
router.use(metaAdsCallbackRouter);
router.use(publicProposalsRouter);
router.use(supermercadoPublicRouter);
router.use(fretesPublicRouter);
router.use(adsPublicRouter);
router.use(internalScoutSignalRouter);

// Protected — all routes below require a valid JWT
router.use(authenticate);
router.use(blockPartnerFromCRM);
router.use(blockExpiredDemo);
router.use(blockSuspendedTenants);

// Onboarding gate — skip /onboarding/* and /auth/* paths; block unfinished tenants
router.use(async (req, res, next) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return next(); // super_admin or partner — skip
  if (req.path.startsWith("/onboarding") || req.path.startsWith("/auth")) return next();

  const [tenant] = await db
    .select({ onboardingConcluido: tenantsTable.onboardingConcluido })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  if (!tenant?.onboardingConcluido) {
    res.status(403).json({ error: "ONBOARDING_REQUIRED", redirectTo: "/onboarding" });
    return;
  }

  next();
});

// Auth — protected endpoints (me, refresh)
router.use(authProtectedRouter);

// Explicit module allowlist configured in Equipe. This protects the API too,
// so typing a hidden URL directly does not bypass the permission.
router.use(enforceModulePermission);

// Tenants — super_admin only for write, tenant scope for reads
router.use(tenantsRouter);

// Users — super_admin can do anything; tenant_admin manages own tenant
router.use(usersRouter);

// Leads, conversations, consents, agent logs — any authenticated user
router.use(leadsRouter);
router.use(conversationsRouter);
router.use(agentActionsLogRouter);
router.use(consentsRouter);

// Business Hub
router.use(businessProfilesRouter);

// Agent Config
router.use(agentConfigsRouter);

// CRM Hub
router.use(funisRouter);
router.use(dealsRouter);
router.use(activitiesRouter);
router.use(propostasRouter);
router.use(leadProposalsRouter);
router.use(productPresentationsRouter);
router.use(messagesRouter);

// Customer Intelligence Hub
router.use(customerIntelligenceRouter);

// AI Hub
router.use(agentTasksRouter);
router.use(agentsRouter);

// Marketing Hub
router.use(campaignsRouter);

// Sales / CPQ Hub
router.use(produtosCatalogoRouter);
router.use(solicitacoesCompraRouter);
router.use(categoriasProdutoRouter);

// Schedule Hub
router.use(agendasRouter);
router.use(agendamentosRouter);
router.use(entregasRouter);
router.use(bloqueiosAgendaRouter);

// Billing Hub
router.use(subscriptionsRouter);
router.use(invoicesRouter);
router.use(billingEventsRouter);
router.use(tokenPurchasesRouter);

// Executive Intelligence Hub
router.use(dashboardRouter);
router.use(analyticsRouter);

// Knowledge Hub
router.use(knowledgeBaseRouter);

// Rules Engine
router.use(rulesRouter);

// Inventory Hub
router.use(inventoryRouter);
router.use(erpRouter);
router.use(changelogRouter);
router.use(pacotesRouter);
router.use(mlStatusRouter);
router.use(leadOportunidadesPrevistasRouter);
router.use(contentAutopilotRouter);
router.use(siteBlogAdminRouter);

// Website Hub
router.use(siteConfigRouter);

// Marketplace Hub
router.use(segmentTemplatesRouter);

// Invites Hub (protected: create + list)
router.use(invitesProtectedRouter);

// Onboarding Hub
router.use(onboardingRouter);

// Content Generation Hub
router.use(contentRouter);
router.use(contentReferenceCreatorsRouter);
router.use(contentPerformanceRouter);
router.use(evolutionWhatsappAuthRouter);
router.use(contentStudioRouter);
router.use(videoProcessingRouter);

// Partner Hub (revendedor dashboard — legacy)
router.use(partnerRouter);

// Partners Hub (módulo parceiros Etapa 2)
router.use(partnersRouter);

// Admin Partners Hub (super_admin management)
router.use(adminBugReportsRouter);
router.use(adminRelatosTecnicosRouter);
router.use(adminPartnersRouter);
router.use(adminPlansRouter);
router.use(adminAgentDefaultsRouter);

// Construção Civil Hub
router.use(construcaoRouter);
router.use(financeiroObraRouter);
router.use(archAiRenderRouter);

// Varejo de Roupas & Acessórios Hub
router.use(varejoRouter);

// Supermercado Hub
router.use(supermercadoRouter);
router.use(farmaciaRouter);
router.use(adsRouter);
router.use(imoveisRouter);
router.use(fretesRouter);
router.use(storiesRouter);
router.use(variedadesDiaRouter);
router.use(veiculosRouter);
router.use(pracaPerguntasRouter);
router.use(restauranteRouter);

// Site Generator Hub
router.use(siteGeneratorRouter);

// Tenant Domains Hub
router.use(tenantDomainsRouter);

// Notifications Hub
router.use(notificationsRouter);

// Relationship Hub
router.use(tenantCalendarSettingsRouter);
router.use(leadSpouseConsentRouter);

// AI Gateway Hub
router.use(aiGatewayRouter);

// Prospector Hub
router.use(prospectorRouter);
router.use(prospectorFlowsRouter);

// Partner Prospector Hub (admin)
router.use(partnerProspectorRouter);

// Arch Hub
router.use(archRouter);
router.use(archSpecObjectsRouter);
router.use(archBudgetEngineRouter);
router.use(archClientPortalApprovalRouter);
router.use(archProductionProcurementRouter);
router.use(archPostSaleRouter);
router.use(createSystemConsolidationRouter());
router.use(archThemePreferencesRouter);

// Beauty (Salão de Beleza) Hub
router.use(sdrTemplatesRouter);
router.use(beautyRouter);
router.use(servicosRouter);

// Clínica Hub
router.use(clinicRouter);

// Revenue Scout Hub
router.use(scoutRouter);
router.use(intentWebhooksRouter);

// Partner Hub (VPN — Vendor Partner Network — FASE 20)
router.use(partnerHubRouter);

// Ecosystem Hub (VEP — Vendor Ecosystem Platform — FASE 21)
router.use(ecosystemHubRouter);

// Vendor Certified Network (VCN — FASE 22)
router.use(vcnRouter);

// Project Opportunity Engine (POE — FASE 23)
router.use(poeRouter);
router.use(knowledgeGraphRouter);

// Render Hub
router.use(renderRouter);

// SPIN Selling Briefing Hub
router.use(spinRouter);

// Support chat
router.use(supportRouter);

// Contract Templates Hub
router.use(contractTemplatesRouter);

// Confirm Closure (contract + ZapSign + Asaas + WhatsApp)
router.use(confirmClosureRouter);

// BLOCO 14 — Organizações / painel consolidado multi-loja
router.use(organizacoesRouter);

// BLOCO 14 Fase B — Troca de tenant (switch-tenant + switchable-tenants)
router.use(tenantSwitchRouter);

// BLOCO 18 — Painel financeiro da plataforma (super_admin)
router.use(adminFinancialRouter);

// Comissões de vendedores
router.use(sellerCommissionsRouter);

// Módulos de navegação por tenant
router.use(tenantNavModulesRouter);
router.use(vendasPracaRouter);

// Rastreamento de clique em materiais de fluxo de nutrição (sem auth)
router.use(contentTrackingRouter);

export { requireRole, requireSameTenanOrSuperAdmin };
export default router;
