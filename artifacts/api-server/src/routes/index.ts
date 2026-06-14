import { Router, type IRouter } from "express";
import healthRouter from "./health";
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
import agendamentosRouter from "./agendamentos";
import subscriptionsRouter from "./subscriptions";
import invoicesRouter from "./invoices";
import dashboardRouter from "./dashboard";
import knowledgeBaseRouter from "./knowledge_base";
import rulesRouter from "./rules";
import webhooksRouter from "./webhooks";
import agentsRouter from "./agents";
import inventoryRouter from "./inventory";
import siteConfigRouter, { publicSiteRouter } from "./site_config";
import { authenticate, requireRole, requireSameTenanOrSuperAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// Public
router.use(healthRouter);
router.use(authRouter);
router.use(webhooksRouter);
router.use(publicSiteRouter);

// Protected — all routes below require a valid JWT
router.use(authenticate);

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
router.use(agendamentosRouter);

// Billing Hub
router.use(subscriptionsRouter);
router.use(invoicesRouter);

// Executive Intelligence Hub
router.use(dashboardRouter);

// Knowledge Hub
router.use(knowledgeBaseRouter);

// Rules Engine
router.use(rulesRouter);

// Inventory Hub
router.use(inventoryRouter);

// Website Hub
router.use(siteConfigRouter);

export { requireRole, requireSameTenanOrSuperAdmin };
export default router;
