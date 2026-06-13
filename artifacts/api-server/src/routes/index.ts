import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tenantsRouter from "./tenants";
import usersRouter from "./users";
import leadsRouter from "./leads";
import conversationsRouter from "./conversations";
import agentActionsLogRouter from "./agent_actions_log";
import consentsRouter from "./consents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tenantsRouter);
router.use(usersRouter);
router.use(leadsRouter);
router.use(conversationsRouter);
router.use(agentActionsLogRouter);
router.use(consentsRouter);

export default router;
