/**
 * render.ts — Renderização rápida de imagens via IA (gpt-image-1 images.edit)
 *
 * POST /api/render/quick
 *   Recebe uma imagem de referência + configurações (estilo, ambiente, notas),
 *   transforma com gpt-image-1, salva no object storage e retorna a URL.
 */

import { Router } from "express";
import multer from "multer";
import { toFile } from "openai";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post("/render/quick", upload.single("image"), async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(403).json({ error: "Tenant não identificado" });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Envie uma imagem para renderizar" });
    return;
  }

  const style    = String(req.body?.style    ?? "moderno");
  const roomType = String(req.body?.roomType ?? "sala de estar");
  const notes    = String(req.body?.notes    ?? "");

  const isExterior = roomType === "fachada externa";
  const prompt = [
    isExterior
      ? "Photorealistic exterior architectural render, building facade"
      : "Photorealistic interior design architectural render",
    `${style} style`,
    roomType,
    "professional lighting, wide angle lens, ray tracing, 4K quality",
    isExterior ? "Brazilian residential architecture" : "Brazilian home interior",
    "keep exactly the same spatial layout and objects as the reference image — do NOT add, remove or replace any furniture, objects, or decorative elements not present in the original",
    notes || null,
  ].filter(Boolean).join(". ");

  try {
    const openai = await getOpenAIForTenant(tenantId);

    const imageFile = await toFile(file.buffer, file.originalname || "input.png", {
      type: file.mimetype,
    });

    const result = await (openai.images.edit as Function)({
      model:   "gpt-image-1",
      image:   imageFile,
      prompt,
      n:       1,
      size:    "1536x1024",
      quality: "high",
    });

    const b64 = (result.data?.[0] as Record<string, unknown>)?.["b64_json"] as string | undefined;
    if (!b64) throw new Error("gpt-image-1 não retornou b64_json");

    const ts      = Date.now();
    const buf     = Buffer.from(b64, "base64");
    const storage = new ObjectStorageService();
    const objPath = await storage.savePrivateBuffer(buf, "image/png", `render-${tenantId}-${ts}.png`);
    const servePath = objPath.replace(/^\/objects\//, "");
    const imageUrl  = `/api/storage/objects/${servePath}`;

    req.log.info({ tenantId, style, roomType }, "render/quick: concluído");
    return res.json({ imageUrl, prompt });
  } catch (err: any) {
    req.log.error({ err }, "render/quick: erro");
    return res.status(500).json({ error: err?.message ?? "Erro ao renderizar imagem" });
  }
});

export default router;
