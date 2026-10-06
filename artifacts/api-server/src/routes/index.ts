import businessPlanRouter from "./business_plan.js";
import { diagnosticPlanningPublicRouter, diagnosticPlanningProtectedRouter } from "./diagnostic_planning.js";
import { Router, type IRouter } from "express";
// Deploy marker: Arqdor Concept production validation 2026-09-19
import healthRouter from "./health";
import storageRouter from "./storage";
import authRouter, { authProtectedRouter } from "./auth";
import googleLoginRouter from "./google-login";
import tenantsRouter from "./tenants";
import usersRouter from "./users";
import leadsRouter from "./leads";
import crmCompanyMasterRouter from "./crm_company_master";
import crmDealParticipantsRouter from "./crm_deal_participants";
import conversationsRouter from "./conversations";
import agentActionsLogRouter from "./agent_actions_log";
import browserAgentRouter from "./browser_agent";
import browserAgentMcpRouter from "./browser_agent_mcp";
import vendiRouter from "./vendi";
import consentsRouter from "./consents";
import businessProfilesRouter from "./business_profiles";
import agentConfigsRouter from "./agent_configs";
import funisRouter from "./funis";
import dealsRouter from "./deals";
import pipelineStagesRouter from "./pipeline_stages.js";
import operationalChecklistsRouter from "./operational_checklists.js";
import orcamentoRevisoesRouter from "./orcamento_revisoes.js";
import activitiesRouter from "./activities";
import propostasRouter from "./propostas";
import messagesRouter from "./messages";
import customerIntelligenceRouter from "./customer_intelligence";
import agentTasksRouter from "./agent_tasks";
import campaignsRouter from "./campaigns";
import smartDeliveryPublicRouter from "./smart_delivery_public";
import publicDeliveryRuntimeRouter from "./public_delivery_runtime";
import facebookMarketplaceRouter from "./facebook_marketplace";
import produtosCatalogoRouter from "./produtos_catalogo";
import solicitacoesCompraRouter from "./solicitacoes_compra";
import categoriasProdutoRouter from "./categorias_produto";
import agendasRouter, { googleCallbackRouter } from "./agendas";
import { instagramCallbackRouter } from "./instagram-auth";
import { whatsappCallbackRouter } from "./whatsapp-auth";
import { googleAdsCallbackRouter } from "./google-ads-auth";
import { searchConsoleCallbackRouter } from "./search-console-auth";
import { metaAdsCallbackRouter } from "./meta-ads-auth";
import socialIntegrationsRouter, { socialIntegrationsCallbackRouter } from "./social-integrations";
import emailIntegrationsRouter, { emailIntegrationsCallbackRouter } from "./email-integrations";
import sketchfabAuthRouter, { sketchfabCallbackRouter } from "./sketchfab-auth";
import agendamentosRouter from "./agendamentos";
import entregasRouter from "./entregas";
import bloqueiosAgendaRouter from "./bloqueios_agenda";
import subscriptionsRouter from "./subscriptions";
import invoicesRouter from "./invoices";
import dashboardRouter from "./dashboard";
import officialMetricsRouter from "./official_metrics.js";
import analyticsRouter from "./analytics";
import knowledgeBaseRouter from "./knowledge_base";
import rulesRouter from "./rules";
import webhooksRouter from "./webhooks";
import agentsRouter from "./agents";
import voiceAgentRouter from "./voice_agent";
import inventoryRouter, { inventorySyncRouter } from "./inventory";
import siteConfigRouter, { publicSiteRouter } from "./site_config";
import segmentTemplatesRouter, { publicSegmentTemplatesRouter } from "./segment_templates";
import invitesRouter, { invitesProtectedRouter } from "./invites";
import onboardingRouter from "./onboarding";
import onboardingImplementationRouter from "./onboarding_implementation";
import contentRouter from "./content";
import leadCaptureRouter from "./lead_capture";
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
import mediaPlanRouter from "./media_plan";
import contentCalendarRouter from "./content_calendar";
import adminProdutosInternosRouter from "./admin_produtos_internos";
import adminAgentDefaultsRouter from "./admin_agent_defaults";
import adminAppBuilderRouter from "./admin_app_builder";
import adminAppBuilderStandaloneRouter from "./admin_app_builder_standalone";
import adminAppUsersRouter from "./admin_app_users";
import appRuntimeRouter from "./app_runtime";
import billingEventsRouter from "./billing_events";
import tokenPurchasesRouter from "./token_purchases";
import accessLicenseRouter, { accessLicensePublicRouter } from "./access_license";
import publicAgentSimulatorRouter from "./public_agent_simulator";
import tenantDomainsRouter from "./tenant_domains";
import notificationsRouter from "./notifications";
import { intakeRouter } from "./intake";
import publicProposalsRouter from "./public_proposals";
import construcaoRouter from "./construcao";
import archRouter, { archPublicRouter } from "./arch";
import { arqdorPublicLinkRouter, arqdorPublicLinkAdminRouter } from "./arqdor_public_link";
import { archAiRenderRouter } from "./arch_ai_render";
import archSpecObjectsRouter from "./arch_spec_objects";
import archBudgetEngineRouter from "./arch_budget_engine";
import archClientPortalApprovalRouter from "./arch_client_portal_approval";
import archProductionProcurementRouter from "./arch_production_procurement";
import archConstructionDiaryRouter from "./arch_construction_diary";
import obraFieldRouter, { obraFieldPublicRouter } from "./obra_field_access";
import archProcurementRealRouter from "./arch_procurement_real";
import { archProcurementRfqRouter, archProcurementRfqPublicRouter } from "./arch_procurement_rfq";
import archPostSaleRouter from "./arch_post_sale";
import { createSystemConsolidationRouter } from "./arch_system_consolidation";
import archThemePreferencesRouter from "./arch_theme_preferences";
import arqdorSketchupImportRouter from "./arqdor_sketchup_import";
import financeiroObraRouter from "./financeiro_obra";
import portalRouter from "./portal";
import varejoRouter from "./varejo";
import supermercadoRouter, { supermercadoPublicRouter } from "./supermercado";
import farmaciaRouter from "./farmacia";
import adsRouter, { adsPublicRouter } from "./ads";
import launchCommandCenterRouter from "./launch_command_center";
import trialJourneyRouter from "./trial_journey";
import imoveisRouter from "./imoveis";
import fretesRouter, { fretesPublicRouter } from "./fretes";
import storiesRouter from "./stories";
import manifestRouter from "./manifest";
import variedadesDiaRouter from "./variedades_dia";
import veiculosRouter from "./veiculos";
import pracaPerguntasRouter, { pracaPerguntasPublicRouter } from "./praca_perguntas";
import pracaAvaliacoesRouter, { pracaAvaliacoesPublicRouter } from "./praca_avaliacoes";
import pracaOrdersRouter from "./praca_orders";
import pracaPaymentsRouter, { pracaPaymentsPublicRouter } from "./praca_payments";
import pracaLogisticsRouter from "./praca_logistics";
import pracaCourierRouter from "./praca_courier";
import pracaRelayRouter from "./praca_relay";
import pracaDeliveryOpsRouter, { pracaDeliveryPublicRouter } from "./praca_delivery_ops";
import pracaExceptionsRouter from "./praca_exceptions";
import pracaExecutiveRouter from "./praca_executive";
import pracaReconciliationRouter from "./praca_reconciliation";
import restauranteRouter from "./restaurante";
import siteGeneratorRouter, { publicSiteGeneratorRouter } from "./site_generator";
import siteGeneratorSectionRefinementRouter from "./site_generator_section_refinement";
import leadProposalsRouter from "./lead_proposals";
import productPresentationsRouter from "./product_presentations";
import tenantCalendarSettingsRouter from "./tenant_calendar_settings";
import tenantDistribuicaoConfigRouter from "./tenant_distribuicao_config";
import leadSpouseConsentRouter from "./lead_spouse_consent";
import aiGatewayRouter from "./ai_gateway";
import prospectorRouter from "./prospector";
import prospectorMultiRouter from "./prospector-multi";
import partnerProspectorRouter from "./partner-prospector";
import prospectorFlowsRouter from "./prospector-flows";
import contentStudioRouter from "./content_studio";
import contextLibraryRouter from "./context_library";
import videoProcessingRouter from "./video_processing";
import mediaLibraryRouter from "./media_library";
import mediaEngineRouter from "./media_engine";
import mediaLipSyncRouter from "./media_lipsync";
import beautyRouter from "./beauty";
import servicosRouter from "./servicos";
import foodRouter from "./food";
import clinicRouter from "./clinic";
import scoutRouter from "./scout";
import intentWebhooksRouter from "./intentWebhooks";
import sdrTemplatesRouter from "./sdr_templates";
import renderRouter from "./render";
import siteRouter from "./site";
import spinRouter from "./spin";
import jarvisEmailActionsRouter from "./jarvis_email_actions";
import jarvisExternalActionsRouter from "./jarvis_external_actions";
import jarvisNaturalActionsRouter from "./jarvis_natural_actions";
import jarvisToolBuilderRouter from "./jarvis_tool_builder";
import jarvisActionPlansRouter from "./jarvis_action_plans";
import jarvisMissionsRouter from "./jarvis_missions";
import supportRouter from "./support";
import devAgentAutonomyRouter from "./dev_agent_autonomy";
import adminBugReportsRouter from "./admin_bug_reports";
import adminRelatosTecnicosRouter from "./admin_relatos_tecnicos";
import adminImprovementsRouter from "./admin_improvements";
import adminReleaseCenterRouter from "./admin_release_center";
import contractTemplatesRouter from "./contract_templates";
import confirmClosureRouter from "./confirm_closure";
import organizacoesRouter from "./organizacoes";
import tenantSwitchRouter from "./tenant_switch.js";
import adminFinancialRouter from "./admin_financial";
import sellerCommissionsRouter from "./sellerCommissions";
import commercialPartnershipsRouter from "./commercial_partnerships";
import contentTrackingRouter from "./content_tracking";
import tenantNavModulesRouter from "./tenantNavModules";
import vendasPracaRouter from "./vendas_praca";
import erpRouter from "./erp";
import financeIntegrationsRouter from "./finance_integrations";
import customIntegrationsRouter, { customIntegrationsPublicRouter } from "./custom-integrations";
import changelogRouter from "./changelog";
import adminInternalKnowledgeRouter from "./admin_internal_knowledge";
import pacotesRouter from "./pacotes";
import mlStatusRouter from "./ml_status";
import internalScoutSignalRouter from "./internal_scout_signal";
import internalRemoteControlRouter from "./internal_remote_control.js";
import leadOportunidadesPrevistasRouter from "./lead_oportunidades_previstas";
import contentAutopilotRouter from "./content_autopilot";
import { siteBlogPublicRouter, siteBlogAdminRouter } from "./site_blog";
import { authenticate, enforceAccessScope, blockPartnerFromCRM, blockSuspendedTenants, enforceModulePermission, requireRole, requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import { enforceAccessLicense } from "../middlewares/accessLicense";
import { enforceCommercialProductAccess } from "../middlewares/commercialProductAccess";
import { configurationBusinessProfileAudit } from "../middlewares/configurationBusinessProfileAudit";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";

const router: IRouter = Router();

function mountJarvisAuxiliaryRouter(stage: IRouter) {
  return (req: any, res: any, next: any) => {
    // /support/chat has a single effective entry in jarvisEmailActionsRouter,
    // which invokes these stage routers explicitly in deterministic order.
    // Their auxiliary endpoints remain mounted normally here.
    if (req.method === "POST" && req.path === "/support/chat") return next();
    stage.handle(req, res, next);
  };
}

// Public
router.use(healthRouter);
router.use(storageRouter);
router.use(authRouter);
router.use(obraFieldPublicRouter);
router.use(archProcurementRfqPublicRouter);
router.use(googleLoginRouter);
router.use(manifestRouter);
router.use(invitesRouter);
router.use(webhooksRouter);
router.use(customIntegrationsPublicRouter);
router.use(siteRouter);
router.use(publicSiteRouter);
router.use(publicSiteGeneratorRouter);
router.use(siteBlogPublicRouter);
router.use(publicSegmentTemplatesRouter);
router.use(inventorySyncRouter);
router.use(intakeRouter);
router.use(diagnosticPlanningPublicRouter);
router.use(portalRouter);
router.use(archPublicRouter);
router.use(googleCallbackRouter);
router.use(instagramCallbackRouter);
router.use(whatsappCallbackRouter);
router.use(googleAdsCallbackRouter);
router.use(searchConsoleCallbackRouter);
router.use(metaAdsCallbackRouter);
router.use(socialIntegrationsCallbackRouter);
router.use(emailIntegrationsCallbackRouter);
router.use(sketchfabCallbackRouter);
router.use(publicProposalsRouter);
router.use(supermercadoPublicRouter);
router.use(fretesPublicRouter);
router.use(adsPublicRouter);
router.use(internalScoutSignalRouter);
router.use(internalRemoteControlRouter);
router.use(browserAgentMcpRouter);
router.use(pracaPerguntasPublicRouter);
router.use(pracaAvaliacoesPublicRouter);
router.use(pracaPaymentsPublicRouter);
router.use(pracaDeliveryPublicRouter);
router.use(accessLicensePublicRouter);
router.use(publicAgentSimulatorRouter);
router.use(smartDeliveryPublicRouter);
router.use(publicDeliveryRuntimeRouter);

router.use(arqdorPublicLinkRouter);

// Protected — all routes below require a valid JWT
router.use(authenticate);

// Scoped worksite tokens must be fenced before any general tenant endpoint is reachable.
router.use(enforceAccessScope);

// Session endpoints must be mounted immediately after JWT validation. The
// frontend needs /auth/me before tenant, onboarding or license checks.
router.use(authProtectedRouter);
router.use(sketchfabAuthRouter);

// Trial status/continuity must remain reachable even after trial suspension or
// before onboarding is complete; all other CRM routes keep the normal gates.
router.use(trialJourneyRouter);

router.use(blockPartnerFromCRM);
router.use(blockSuspendedTenants);

// License endpoints must remain reachable in read-only mode.
router.use(accessLicenseRouter);
router.use(enforceAccessLicense);

// Commercial entitlement gate: purchased products define which paid capabilities are reachable.
router.use(enforceCommercialProductAccess);

// Explicit module allowlist configured in Equipe. This protects the API too,
// so typing a hidden URL directly does not bypass the permission.
router.use(enforceModulePermission);

// Visitor Intelligence e Launch Command Center precisam ser registrados antes
// dos routers de domínio. Isso evita que guards wildcard de routers posteriores
// convertam uma rota válida em 403 antes de ela alcançar o handler correto.
router.use(launchCommandCenterRouter);

// Universal App Builder runtime — tenant scoped, published snapshots only.
router.use(appRuntimeRouter);

// Trilha de Configurações precisa observar mutações do tenant e dos hubs abaixo.
router.use(configurationBusinessProfileAudit);

// Leitura da coleção inteira de tenants é exclusiva do Super Admin. Para a
// leitura do próprio tenant, escondemos campos estritamente internos de
// negociação/gestão da plataforma sem interferir em cobrança/licença do cliente.
const tenantInternalResponseFields = [
  "mensalidadeTabelaValor",
  "taxaImplantacaoValor",
  "descontoPercentual",
  "motivoDesconto",
  "observacoesComerciais",
  "origemCliente",
  "responsavelComercial",
  "internalNotes",
  "createdByAdminId",
  "cancelamentoSolicitadoEm",
  "canceladoEm",
  "motivoCancelamento",
  "demoConvertedAt",
] as const;

router.use("/tenants", (req, res, next) => {
  const isSuperAdmin = req.user?.platformRole === "super_admin";
  const isCollectionRead = req.method === "GET" && (req.path === "/" || req.path === "");

  if (isCollectionRead && !isSuperAdmin) {
    res.status(403).json({ error: "Só o Super Admin pode listar todos os tenants" });
    return;
  }

  const isSingleTenantRead = req.method === "GET" && /^\/[A-Za-z0-9-]+$/.test(req.path);
  if (!isSuperAdmin && isSingleTenantRead) {
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const sanitized = { ...(body as Record<string, unknown>) };
        for (const field of tenantInternalResponseFields) delete sanitized[field];
        return originalJson(sanitized);
      }
      return originalJson(body);
    }) as typeof res.json;
  }

  next();
});

// Tenants — super_admin only for write, tenant scope for reads
router.use(tenantsRouter);

// Users — super_admin can do anything; tenant_admin manages own tenant
router.use(usersRouter);

// Leads, conversations, consents, agent logs — any authenticated user
router.use(leadsRouter);
router.use(crmCompanyMasterRouter);
router.use(crmDealParticipantsRouter);
router.use(conversationsRouter);
router.use(agentActionsLogRouter);
router.use(browserAgentRouter);
router.use(vendiRouter);
router.use(consentsRouter);

// Business Hub
router.use(businessPlanRouter);
router.use(diagnosticPlanningProtectedRouter);
router.use(businessProfilesRouter);
router.use(leadCaptureRouter);

// Agent Config
router.use(agentConfigsRouter);

// CRM Hub
router.use(funisRouter);
router.use(dealsRouter);
router.use(pipelineStagesRouter);
router.use(operationalChecklistsRouter);
router.use(orcamentoRevisoesRouter);
router.use(activitiesRouter);
router.use(propostasRouter);
router.use(leadProposalsRouter);
router.use(productPresentationsRouter);
router.use(messagesRouter);

// Customer Intelligence Hub
router.use(customerIntelligenceRouter);

// AI Hub — ações externas do JARVIS interceptam somente os tipos próprios
// e reutilizam a mesma fila/endpoints antes do executor padrão.
router.use(jarvisEmailActionsRouter);
router.use(mountJarvisAuxiliaryRouter(jarvisExternalActionsRouter));
router.use(agentTasksRouter);
router.use(agentsRouter);
router.use(voiceAgentRouter);

// Marketing Hub
router.use(campaignsRouter);
router.use(facebookMarketplaceRouter);

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
router.use(officialMetricsRouter);
router.use(analyticsRouter);

// Knowledge Hub
router.use(knowledgeBaseRouter);

// Rules Engine
router.use(rulesRouter);

// Inventory Hub
router.use(inventoryRouter);
router.use(erpRouter);
router.use(financeIntegrationsRouter);
router.use(customIntegrationsRouter);
router.use(changelogRouter);
router.use(adminInternalKnowledgeRouter);
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
router.use(onboardingImplementationRouter);

// Content Generation Hub
router.use(contentRouter);
router.use(socialIntegrationsRouter);
router.use(emailIntegrationsRouter);
router.use(contentReferenceCreatorsRouter);
router.use(contentPerformanceRouter);
router.use(evolutionWhatsappAuthRouter);
router.use(contentStudioRouter);
router.use(contextLibraryRouter);
router.use(videoProcessingRouter);
router.use(mediaLibraryRouter);
router.use(mediaEngineRouter);
router.use(mediaLipSyncRouter);

// Partner Hub (revendedor dashboard — legacy)
router.use(partnerRouter);

// Partners Hub (módulo parceiros Etapa 2)
router.use(partnersRouter);

// Admin Partners Hub (super_admin management)
router.use(adminBugReportsRouter);
router.use(adminRelatosTecnicosRouter);
router.use(adminImprovementsRouter);
router.use(adminReleaseCenterRouter);
router.use(adminPartnersRouter);
router.use(adminPlansRouter);
router.use(mediaPlanRouter);
router.use(contentCalendarRouter);
router.use(adminProdutosInternosRouter);
router.use(adminAgentDefaultsRouter);
router.use(adminAppBuilderRouter);
router.use(adminAppBuilderStandaloneRouter);
router.use(adminAppUsersRouter);

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
router.use(pracaAvaliacoesRouter);
router.use(restauranteRouter);

// Site Generator Hub
router.use(siteGeneratorSectionRefinementRouter);
router.use(siteGeneratorRouter);

// Tenant Domains Hub
router.use(tenantDomainsRouter);

// Notifications Hub
router.use(notificationsRouter);

// Relationship Hub
router.use(tenantCalendarSettingsRouter);
router.use(tenantDistribuicaoConfigRouter);
router.use(leadSpouseConsentRouter);

// AI Gateway Hub
router.use(aiGatewayRouter);

// Prospector Hub
router.use(prospectorRouter);
router.use(prospectorMultiRouter);
router.use(prospectorFlowsRouter);

// Partner Prospector Hub (admin)
router.use(partnerProspectorRouter);

// Arch Hub
router.use(arqdorPublicLinkAdminRouter);
router.use(archRouter);
router.use(archSpecObjectsRouter);
router.use(archBudgetEngineRouter);
router.use(archClientPortalApprovalRouter);
router.use(archProductionProcurementRouter);
router.use(obraFieldRouter);
router.use(archConstructionDiaryRouter);
router.use(archProcurementRealRouter);
router.use(archProcurementRfqRouter);
router.use(archPostSaleRouter);
router.use(createSystemConsolidationRouter());
router.use(archThemePreferencesRouter);
router.use(arqdorSketchupImportRouter);

// Beauty (Salão de Beleza) Hub
router.use(sdrTemplatesRouter);
router.use(beautyRouter);
router.use(servicosRouter);
router.use(foodRouter);

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

// JARVIS: comandos naturais controlados precisam interceptar o chat antes do LLM.
router.use(mountJarvisAuxiliaryRouter(jarvisNaturalActionsRouter));
router.use(jarvisToolBuilderRouter);
router.use(mountJarvisAuxiliaryRouter(jarvisActionPlansRouter));
router.use(mountJarvisAuxiliaryRouter(jarvisMissionsRouter));

// Support chat + Dev IA
router.use(mountJarvisAuxiliaryRouter(supportRouter));
router.use(devAgentAutonomyRouter);

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
router.use(commercialPartnershipsRouter);

// Módulos de navegação por tenant
router.use(tenantNavModulesRouter);
router.use(vendasPracaRouter);
router.use(pracaOrdersRouter);
router.use(pracaPaymentsRouter);
router.use(pracaLogisticsRouter);
router.use(pracaCourierRouter);
router.use(pracaRelayRouter);
router.use(pracaDeliveryOpsRouter);
router.use(pracaExceptionsRouter);
router.use(pracaExecutiveRouter);
router.use(pracaReconciliationRouter);

// Rastreamento de clique em materiais de fluxo de nutrição (sem auth)
router.use(contentTrackingRouter);

export { requireRole, requireSameTenanOrSuperAdmin };
export default router;
