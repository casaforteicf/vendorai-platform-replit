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
import agendasRouter, { googleCallbackRouter } from "./agendas";
import { instagramCallbackRouter } from "./instagram-auth";
import { whatsappCallbackRouter } from "./whatsapp-auth";
import agendamentosRouter from "./agendamentos";
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
import partnerRouter from "./partner";
import partnersRouter from "./partners";
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
import financeiroObraRouter from "./financeiro_obra";
import portalRouter from "./portal";
import varejoRouter from "./varejo";
import supermercadoRouter from "./supermercado";
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
import beautyRouter from "./beauty";
import clinicRouter from "./clinic";
import scoutRouter from "./scout";
import sdrTemplatesRouter from "./sdr_templates";
import renderRouter from "./render";
import siteRouter from "./site";
import spinRouter from "./spin";
import { authenticate, blockPartnerFromCRM, blockSuspendedTenants, blockExpiredDemo, requireRole, requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";

const router: IRouter = Router();

// Public
router.use(healthRouter);
router.use(storageRouter);
router.use(authRouter);
router.use(invitesRouter);
router.use(webhooksRouter);
router.use(siteRouter);
router.use(publicSiteRouter);
router.use(publicSiteGeneratorRouter);
router.use(publicSegmentTemplatesRouter);
router.use(inventorySyncRouter);
router.use(intakeRouter);
router.use(portalRouter);
router.use(archPublicRouter);
router.use(googleCallbackRouter);
router.use(instagramCallbackRouter);
router.use(whatsappCallbackRouter);
router.use(publicProposalsRouter);

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

// Schedule Hub
router.use(agendasRouter);
router.use(agendamentosRouter);

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
router.use(contentStudioRouter);

// Partner Hub (revendedor dashboard — legacy)
router.use(partnerRouter);

// Partners Hub (módulo parceiros Etapa 2)
router.use(partnersRouter);

// Admin Partners Hub (super_admin management)
router.use(adminPartnersRouter);
router.use(adminPlansRouter);
router.use(adminAgentDefaultsRouter);

// Construção Civil Hub
router.use(construcaoRouter);
router.use(financeiroObraRouter);

// Varejo de Roupas & Acessórios Hub
router.use(varejoRouter);

// Supermercado Hub
router.use(supermercadoRouter);

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

// Beauty (Salão de Beleza) Hub
router.use(sdrTemplatesRouter);
router.use(beautyRouter);

// Clínica Hub
router.use(clinicRouter);

// Revenue Scout Hub
router.use(scoutRouter);

// Render Hub
router.use(renderRouter);

// SPIN Selling Briefing Hub
router.use(spinRouter);

export { requireRole, requireSameTenanOrSuperAdmin };
export default router;
