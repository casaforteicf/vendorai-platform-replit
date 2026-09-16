import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import authRouter, { authProtectedRouter } from "./auth";
import googleLoginRouter from "./google-login";
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
import pipelineStagesRouter from "./pipeline_stages.js";
import orcamentoRevisoesRouter from "./orcamento_revisoes.js";
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
import { searchConsoleCallbackRouter } from "./search-console-auth";
import { metaAdsCallbackRouter } from "./meta-ads-auth";
import socialIntegrationsRouter, { socialIntegrationsCallbackRouter } from "./social-integrations";
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
import inventoryRouter, { inventorySyncRouter } from "./inventory";
import siteConfigRouter, { publicSiteRouter } from "./site_config";
import segmentTemplatesRouter, { publicSegmentTemplatesRouter } from "./segment_templates";
import invitesRouter, { invitesProtectedRouter } from "./invites";
import onboardingRouter from "./onboarding";
import onboardingImplementationRouter from "./onboarding_implementation";
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
import { archAiRenderRouter } from "./arch_ai_render";
import archSpecObjectsRouter from "./arch_spec_objects";
import archBudgetEngineRouter from "./arch_budget_engine";
import archClientPortalApprovalRouter from "./arch_client_portal_approval";
import archProductionProcurementRouter from "./arch_production_procurement";
import archConstructionDiaryRouter from "./arch_construction_diary";
import archProcurementRealRouter from "./arch_procurement_real";
import archPostSaleRouter from "./arch_post_sale";
import { createSystemConsolidationRouter } from "./arch_system_consolidation";
import archThemePreferencesRouter from "./arch_theme_preferences";
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
import jarvisActionPlansRouter from "./jarvis_action_plans";
import jarvisMissionsRouter from "./jarvis_missions";
import supportRouter from "./support";
import devAgentAutonomyRouter from "./dev_agent_autonomy";
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
import financeIntegrationsRouter from "./finance_integrations";
import changelogRouter from "./changelog";
import pacotesRouter from "./pacotes";
import mlStatusRouter from "./ml_status";
import internalScoutSignalRouter from "./internal_scout_signal";
import leadOportunidadesPrevistasRouter from "./lead_oportunidades_previstas";
import contentAutopilotRouter from "./content_autopilot";
import { siteBlogPublicRouter, siteBlogAdminRouter } from "./site_blog";
import { authenticate, blockPartnerFromCRM, blockSuspendedTenants, enforceModulePermission, requireRole, requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import { enforceAccessLicense } from "../middlewares/accessLicense";
import { configurationBusinessProfileAudit } from "../middlewares/configurationBusinessProfileAudit";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";

const router: IRouter = Router();

// Public
router.use(healthRouter);
router.use(storageRouter);
router.use(authRouter);
router.use(googleLoginRouter);
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
router.use(searchConsoleCallbackRouter);
router.use(metaAdsCallbackRouter);
router.use(socialIntegrationsCallbackRouter);
router.use(publicProposalsRouter);
router.use(supermercadoPublicRouter);
router.use(fretesPublicRouter);
router.use(adsPublicRouter);
router.use(internalScoutSignalRouter);
router.use(pracaPerguntasPublicRouter);
router.use(pracaAvaliacoesPublicRouter);
router.use(pracaPaymentsPublicRouter);
router.use(pracaDeliveryPublicRouter);
router.use(accessLicensePublicRouter);
router.use(publicAgentSimulatorRouter);

// Protected — all routes below require a valid JWT
router.use(authenticate);

// Session endpoints must be mounted immediately after JWT validation. The
// frontend needs /auth/me before tenant, onboarding or license checks.
router.use(authProtectedRouter);

// Trial status/continuity must remain reachable even after trial suspension or
// before onboarding is complete; all other CRM routes keep the normal gates.
router.use(trialJourneyRouter);

router.use(blockPartnerFromCRM);
router.use(blockSuspendedTenants);

// Onboarding gate — keep only the wizard and the exact business-profile calls
// required by step 1 reachable before onboarding is complete.
router.use(async (req, res, next) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return next(); // super_admin or partner — skip

  const onboardingBusinessProfilePath =
    (req.method === "GET" && /^\/tenants\/[A-Za-z0-9-]+\/business-profile$/.test(req.path)) ||
    (req.method === "POST" && req.path === "/business-profiles") ||
    (req.method === "PATCH" && /^\/business-profiles\/[A-Za-z0-9-]+$/.test(req.path));

  if (
    req.path.startsWith("/onboarding") ||
    req.path.startsWith("/auth") ||
    onboardingBusinessProfilePath
  ) {
    return next();
  }

  const [tenant] = await db
    .select({
      onboardingConcluido: tenantsTable.onboardingConcluido,
      setupCompletedAt: tenantsTable.setupCompletedAt,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  if (!tenant?.onboardingConcluido && !tenant?.setupCompletedAt) {
    res.status(403).json({ error: "ONBOARDING_REQUIRED", redirectTo: "/onboarding" });
    return;
  }

  next();
});

// License endpoints must remain reachable in read-only mode.
router.use(accessLicenseRouter);
router.use(enforceAccessLicense);

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

router.use(tenantsRouter);
router.use(usersRouter);
router.use(leadsRouter);
router.use(conversationsRouter);
router.use(agentActionsLogRouter);
router.use(consentsRouter);
router.use(businessProfilesRouter);
router.use(agentConfigsRouter);
router.use(funisRouter);
router.use(dealsRouter);
router.use(pipelineStagesRouter);
router.use(orcamentoRevisoesRouter);
router.use(activitiesRouter);
router.use(propostasRouter);
router.use(leadProposalsRouter);
router.use(productPresentationsRouter);
router.use(messagesRouter);
router.use(customerIntelligenceRouter);
router.use(jarvisEmailActionsRouter);
router.use(jarvisExternalActionsRouter);
router.use(agentTasksRouter);
router.use(agentsRouter);
router.use(campaignsRouter);
router.use(produtosCatalogoRouter);
router.use(solicitacoesCompraRouter);
router.use(categoriasProdutoRouter);
router.use(agendasRouter);
router.use(agendamentosRouter);
router.use(entregasRouter);
router.use(bloqueiosAgendaRouter);
router.use(subscriptionsRouter);
router.use(invoicesRouter);
router.use(billingEventsRouter);
router.use(tokenPurchasesRouter);
router.use(dashboardRouter);
router.use(officialMetricsRouter);
router.use(analyticsRouter);
router.use(knowledgeBaseRouter);
router.use(rulesRouter);
router.use(inventoryRouter);
router.use(erpRouter);
router.use(financeIntegrationsRouter);
router.use(changelogRouter);
router.use(pacotesRouter);
router.use(mlStatusRouter);
router.use(leadOportunidadesPrevistasRouter);
router.use(contentAutopilotRouter);
router.use(siteBlogAdminRouter);
router.use(siteConfigRouter);
router.use(segmentTemplatesRouter);
router.use(invitesProtectedRouter);
router.use(onboardingRouter);
router.use(onboardingImplementationRouter);
router.use(contentRouter);
router.use(socialIntegrationsRouter);
router.use(contentReferenceCreatorsRouter);
router.use(contentPerformanceRouter);
router.use(evolutionWhatsappAuthRouter);
router.use(contentStudioRouter);
router.use(contextLibraryRouter);
router.use(videoProcessingRouter);
router.use(mediaLibraryRouter);
router.use(mediaEngineRouter);
router.use(mediaLipSyncRouter);
router.use(partnerRouter);
router.use(partnersRouter);
router.use(adminBugReportsRouter);
router.use(adminRelatosTecnicosRouter);
router.use(adminPartnersRouter);
router.use(adminPlansRouter);
router.use(mediaPlanRouter);
router.use(contentCalendarRouter);
router.use(adminProdutosInternosRouter);
router.use(adminAgentDefaultsRouter);
router.use(adminAppBuilderRouter);
router.use(adminAppBuilderStandaloneRouter);
router.use(adminAppUsersRouter);
router.use(construcaoRouter);
router.use(financeiroObraRouter);
router.use(archAiRenderRouter);
router.use(varejoRouter);
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
router.use(siteGeneratorSectionRefinementRouter);
router.use(siteGeneratorRouter);
router.use(tenantDomainsRouter);
router.use(notificationsRouter);
router.use(tenantCalendarSettingsRouter);
router.use(tenantDistribuicaoConfigRouter);
router.use(leadSpouseConsentRouter);
router.use(aiGatewayRouter);
router.use(prospectorRouter);
router.use(prospectorMultiRouter);
router.use(prospectorFlowsRouter);
router.use(partnerProspectorRouter);

// Arch Hub
router.use(archRouter);
router.use(archSpecObjectsRouter);
router.use(archBudgetEngineRouter);
router.use(archClientPortalApprovalRouter);
router.use(archProductionProcurementRouter);
router.use(archConstructionDiaryRouter);
router.use(archProcurementRealRouter);
router.use(archPostSaleRouter);
router.use(createSystemConsolidationRouter());
router.use(archThemePreferencesRouter);

router.use(sdrTemplatesRouter);
router.use(beautyRouter);
router.use(servicosRouter);
router.use(clinicRouter);
router.use(scoutRouter);
router.use(intentWebhooksRouter);
router.use(partnerHubRouter);
router.use(ecosystemHubRouter);
router.use(vcnRouter);
router.use(poeRouter);
router.use(knowledgeGraphRouter);
router.use(renderRouter);
router.use(spinRouter);
router.use(jarvisNaturalActionsRouter);
router.use(jarvisActionPlansRouter);
router.use(jarvisMissionsRouter);
router.use(supportRouter);
router.use(devAgentAutonomyRouter);
router.use(contractTemplatesRouter);
router.use(confirmClosureRouter);
router.use(organizacoesRouter);
router.use(tenantSwitchRouter);
router.use(adminFinancialRouter);
router.use(sellerCommissionsRouter);
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
router.use(contentTrackingRouter);

export { requireRole, requireSameTenanOrSuperAdmin };
export default router;
