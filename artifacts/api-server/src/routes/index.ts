import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tenantsRouter from "./tenants";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tenantsRouter);

export default router;
