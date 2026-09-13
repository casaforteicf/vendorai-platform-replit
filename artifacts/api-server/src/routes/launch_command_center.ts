import { Router, type IRouter } from "express";
import launchCommandCenterCoreRouter from "./launch_command_center_core.js";
import visitorIntelligenceRouter from "./visitor_intelligence.js";
import growthLabRouter from "./growth_lab.js";
import followerGrowthApprovalsRouter from "./follower_growth_approvals.js";
import followerGrowthExecutionEvidenceRouter from "./follower_growth_execution_evidence.js";

const router: IRouter = Router();

router.use(visitorIntelligenceRouter);
router.use(growthLabRouter);
router.use(followerGrowthApprovalsRouter);
router.use(followerGrowthExecutionEvidenceRouter);
router.use(launchCommandCenterCoreRouter);

export default router;
