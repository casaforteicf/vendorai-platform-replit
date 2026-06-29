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

  const style    = String(req.body?.style    ?? "nenhum");
  const roomType = String(req.body?.roomType ?? "sala de estar");
  const notes    = String(req.body?.notes    ?? "");

  const isExterior  = roomType === "fachada externa";
  const applyStyle  = style !== "nenhum";

  // ── Base: preserve everything, only enhance quality & lighting ──────────
  const baseInstruction = isExterior
    ? [
        "You are a professional architectural visualization engine.",
        "Transform this photo into a photorealistic architectural render.",
        "STRICT RULES — NEVER BREAK THESE:",
        "• Do NOT add any new elements (trees, cars, people, plants, decorations) not visible in the reference.",
        "• Do NOT remove or alter any existing architectural element.",
        "• Preserve EXACTLY: building shape, footprint, number of floors, window/door positions, roof geometry, all structural volumes.",
        "ONLY ENHANCE:",
        "• Lighting: simulate realistic sunlight/sky with proper shadows, ambient occlusion, and soft highlights on surfaces.",
        "• Material quality: make existing surfaces (concrete, brick, glass, wood) look photorealistic with accurate texture detail.",
        "• Image clarity: ultra-sharp details, high dynamic range, depth of field, 4K photorealistic quality.",
      ].join(" ")
    : [
        "You are a professional architectural visualization engine.",
        "Transform this photo into a photorealistic interior render.",
        "STRICT RULES — NEVER BREAK THESE:",
        "• Do NOT add any object, furniture, plant, decoration, or element not already present in the reference image.",
        "• Do NOT remove, move, or replace any existing furniture or object.",
        "• Preserve EXACTLY: room geometry, wall positions, window/door locations, ceiling height, and all furniture placement.",
        "ONLY ENHANCE:",
        "• Lighting: simulate realistic interior lighting from existing windows and light fixtures — add soft shadows, ambient occlusion, and warm/cool highlights that respect the room's existing light sources.",
        "• Material quality: make existing surfaces (walls, floors, upholstery, wood, glass) look photorealistic with accurate texture and sheen.",
        "• Image clarity: ultra-sharp details, high dynamic range, 4K photorealistic quality.",
      ].join(" ");

  // ── Optional style layer — surface finishes only ────────────────────────
  const styleInstruction = applyStyle
    ? (isExterior
        ? `Style application (surface finishes ONLY, do not add or remove elements): reinterpret the existing facade materials and colors with a ${style} architectural aesthetic — cladding texture, facade color palette, window frame finish.`
        : `Style application (surface finishes ONLY, do not add or remove objects): reinterpret the existing wall finish, floor material, and ceiling treatment with a ${style} interior design aesthetic — keep all furniture and objects exactly as they are.`)
    : null;

  const contextInstruction = isExterior
    ? "Brazilian residential architecture context."
    : `Context: ${roomType}, Brazilian home interior.`;

  const prompt = [
    baseInstruction,
    styleInstruction,
    contextInstruction,
    notes ? `Additional user request: ${notes}` : null,
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
