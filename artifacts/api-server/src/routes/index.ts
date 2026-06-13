import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tenantsRouter from "./tenants";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tenantsRouter);
router.use(usersRouter);

export default router;
