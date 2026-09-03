import { Router, type IRouter } from "express";
import {
  createVendorAiVideoBatch,
  getVendorAiVideoBatch,
  VideoBatchNotReadyError,
  VideoBatchValidationError,
} from "../services/media-video-batch.js";

const router: IRouter = Router();

router.post("/tenants/:tenantId/media-engine/batches", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  try {
    const result = await createVendorAiVideoBatch({
      tenantId,
      userId: req.user?.sub ?? null,
      identityId: req.body?.identityId,
      voiceProfileId: req.body?.voiceProfileId,
      template: req.body?.template,
      rows: req.body?.rows,
      language: req.body?.language,
      bboxShift: req.body?.bboxShift,
      title: req.body?.title,
    });
    res.status(202).json({
      ...result,
      provider: "vendorai",
      operation: "video_batch",
    });
  } catch (error) {
    if (error instanceof VideoBatchNotReadyError) {
      res.status(409).json({ error: error.message, code: "VIDEO_BATCH_NOT_READY" });
      return;
    }
    if (error instanceof VideoBatchValidationError) {
      res.status(422).json({ error: error.message, code: "VIDEO_BATCH_INVALID" });
      return;
    }
    throw error;
  }
});

router.get("/tenants/:tenantId/media-engine/batches/:jobId", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const jobId = String(req.params["jobId"]);
  const job = await getVendorAiVideoBatch(jobId, tenantId);
  if (!job) {
    res.status(404).json({ error: "Lote de vídeo não encontrado" });
    return;
  }
  res.json({
    jobId,
    provider: "vendorai",
    operation: "video_batch",
    ...job,
  });
});

export default router;
