import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import tenantsRouter from "./tenants";
import usersRouter from "./users";
import leadsRouter from "./leads";
import conversationsRouter from "./conversations";
import agentActionsLogRouter from "./agent_actions_log";
import consentsRouter from "./consents";
import businessProfilesRouter from "./business_profiles";
import agentConfigsRouter from "./agent_configs";
import { authenticate, requireRole, requireSameTenanOrSuperAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// Public
router.use(healthRouter);
router.use(authRouter);

// Protected — all routes below require a valid JWT
router.use(authenticate);

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

export { requireRole, requireSameTenanOrSuperAdmin };
export default router;
