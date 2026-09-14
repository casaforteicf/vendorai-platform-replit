import { Router, type IRouter } from "express";
import launchCommandCenterCoreRouter from "./launch_command_center_core.js";
import visitorIntelligenceRouter from "./visitor_intelligence.js";
import growthLabRouter from "./growth_lab.js";
import editorialAttributionRouter from "./editorial_attribution.js";

const router: IRouter = Router();

router.use(visitorIntelligenceRouter);
router.use(growthLabRouter);
router.use(editorialAttributionRouter);
router.use(launchCommandCenterCoreRouter);

export default router;