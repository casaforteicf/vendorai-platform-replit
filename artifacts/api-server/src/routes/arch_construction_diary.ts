import { Router, type IRouter } from "express";
import diaryCoreRouter from "./arch_construction_diary_core";
import qualityRouter from "./arch_construction_quality";
import decisionsRouter from "./arch_construction_decisions";

const router: IRouter = Router();

router.use(diaryCoreRouter);
router.use(qualityRouter);
router.use(decisionsRouter);

export default router;
