import { Router, type IRouter } from "express";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import {
  createVendorAiMediaGenerationJob,
  vendorAiMediaEngineCapabilities,
  type VendorAiMediaCapability,
} from "../services/vendorai-media-engine.js";

const router: IRouter = Router();

const KNOWN_OPERATIONS = new Set<VendorAiMediaCapability>([
  "video_edit",
  "video_clips",
  "video_caption",
  "video_batch",
  "video_compose",
  "voice_profile",
  "persona_profile",
  "avatar_lipsync",
  "video_generate",
]);

router.use("/tenants/:tenantId/media-engine", requireSameTenanOrSuperAdmin());

router.get("/tenants/:tenantId/media-engine/capabilities", (_req, res) => {
  res.json(vendorAiMediaEngineCapabilities);
});

router.post("/tenants/:tenantId/media-engine/jobs", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const operation = String(req.body?.operation ?? "") as VendorAiMediaCapability;
  const title = String(req.body?.title ?? "").trim();
  const context = req.body?.context && typeof req.body.context === "object" && !Array.isArray(req.body.context)
    ? req.body.context as Record<string, unknown>
    : {};

  if (!KNOWN_OPERATIONS.has(operation)) {
    res.status(422).json({ error: "Operação de mídia inválida" });
    return;
  }
  if (!title) {
    res.status(422).json({ error: "title é obrigatório" });
    return;
  }

  if (vendorAiMediaEngineCapabilities.capabilities[operation] !== "ready") {
    res.status(409).json({
      error: "Capacidade ainda em construção no VendorAI Media Engine",
      operation,
      provider: "vendorai",
    });
    return;
  }

  const result = await createVendorAiMediaGenerationJob({
    tenantId,
    userId: req.user?.sub ?? null,
    title,
    operation,
    context,
  });

  res.status(202).json({ ...result, provider: "vendorai", operation });
});

export default router;
