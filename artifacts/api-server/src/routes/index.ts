import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tenantsRouter from "./tenants";
import usersRouter from "./users";
import leadsRouter from "./leads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tenantsRouter);
router.use(usersRouter);
router.use(leadsRouter);

export default router;
