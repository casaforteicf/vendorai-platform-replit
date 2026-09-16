import { Router, type IRouter } from "express";
import diaryCoreRouter from "./arch_construction_diary_core";
import qualityRouter from "./arch_construction_quality";

const router: IRouter = Router();

router.use(diaryCoreRouter);
router.use(qualityRouter);

export default router;
