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

  const preserveInstruction = isExterior
    ? "PRESERVE EXACTLY from the reference image: the building shape, footprint, number of floors, window and door positions, roof geometry, structural proportions, and all architectural volumes. Do NOT alter the building's form or add new structural elements."
    : "PRESERVE EXACTLY from the reference image: the room geometry, wall positions, window and door locations, ceiling height, furniture arrangement and placement, and all existing objects. Do NOT add, remove, or relocate any furniture or objects.";

  const changeInstruction = isExterior
    ? `ONLY CHANGE the surface finishes and materials: wall cladding texture and color, roof material, window frame style, facade details, and exterior lighting — to match the ${style} architectural style.`
    : `ONLY CHANGE the surface materials and finishes: wall paint color and texture, floor material, ceiling treatment, upholstery colors, lighting fixtures, and decorative surface details — to match the ${style} interior design style.`;

  const qualityInstruction = "Professional architectural photography quality. Natural, well-balanced lighting. Ultra-sharp details, high dynamic range, photorealistic rendering. 4K resolution.";

  const contextInstruction = isExterior
    ? "Brazilian residential architecture."
    : `${roomType}, Brazilian home interior.`;

  const prompt = [
    preserveInstruction,
    changeInstruction,
    contextInstruction,
    qualityInstruction,
    notes ? `Additional requests: ${notes}` : null,
  ].filter(Boolean).join(" ");

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
