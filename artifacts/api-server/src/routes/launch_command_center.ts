import { Router, type IRouter } from "express";
import launchCommandCenterCoreRouter from "./launch_command_center_core.js";
import visitorIntelligenceRouter from "./visitor_intelligence.js";

const router: IRouter = Router();

router.use(visitorIntelligenceRouter);
router.use(launchCommandCenterCoreRouter);

export default router;
