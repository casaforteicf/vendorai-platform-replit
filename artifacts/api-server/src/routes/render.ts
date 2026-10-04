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
import { captureGeneratedMedia } from "../services/media-library.js";
import {
  authorizeVendorCredits,
  debitVendorCredits,
  refundVendorCredits,
  recordCommercialUsage,
} from "../services/commercial-usage.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});
const uploadFields = upload.fields([
  { name: "image",          maxCount: 1 },
  { name: "materialImages", maxCount: 8 },
]);

router.post("/render/quick", uploadFields, async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(403).json({ error: "Tenant não identificado" });
    return;
  }

  const files         = req.files as Record<string, Express.Multer.File[]> | undefined;
  const file          = files?.["image"]?.[0];
  const materialFiles = files?.["materialImages"] ?? [];

  if (!file) {
    res.status(400).json({ error: "Envie uma imagem para renderizar" });
    return;
  }

  const style    = String(req.body?.style    ?? "nenhum");
  const angle    = String(req.body?.angle    ?? "frontal");
  const lighting = String(req.body?.lighting ?? "auto");
  const roomType = String(req.body?.roomType ?? "sala de estar");
  const notes    = String(req.body?.notes    ?? "");

  type MaterialPin = { materialIndex: number; percentX: number; percentY: number };
  let materialPins: MaterialPin[] = [];
  try {
    const raw = req.body?.materialPins;
    if (raw) materialPins = JSON.parse(String(raw));
  } catch { /* ignore parse errors */ }

  const isExterior  = roomType === "fachada externa";
  const applyStyle  = style !== "nenhum";
  const applyLighting = lighting !== "auto";

  // ── Lighting time-of-day map ────────────────────────────────────────────
  const lightingMap: Record<string, string> = {
    manha:     "Early morning daylight (7–9 am): soft warm sunlight entering from a low angle, long gentle shadows, clear sky, golden-warm color temperature; activate any visible ceiling/wall lamps in the scene as if just switched off after sunrise.",
    tarde:     "Bright midday/afternoon light (1–4 pm): strong overhead daylight, crisp shadows, neutral-white color temperature, high brightness.",
    golden:    "Golden hour (5–6 pm): warm amber-orange sunlight raking across surfaces, very long soft shadows, romantic golden glow, sky transitions to peach-pink.",
    pordosol:  "Sunset (6–7 pm): dramatic orange-red sky visible through windows/exterior, warm directional light, rich reflections on glass and polished surfaces.",
    noturno:   "Night scene (8 pm+): TURN ON all lamps, pendant lights, floor lamps, wall sconces, and exterior fixtures that are physically present in the image; dark sky outside; warm pool of artificial light; no daylight through windows.",
    nublado:   "Overcast cloudy day: soft diffuse light with no direct sun, cool neutral tones, no hard shadows, even illumination.",
  };

  const lightingInstruction = applyLighting && lightingMap[lighting]
    ? `LIGHTING CONDITION — apply this to the entire scene: ${lightingMap[lighting]}`
    : null;

  // ── Base: preserve EVERYTHING, only enhance quality ─────────────────────
  const baseInstruction = isExterior
    ? [
        "You are a professional architectural visualization engine.",
        "Transform this photo into a photorealistic architectural render.",
        "ABSOLUTE PRESERVATION RULES — NEVER BREAK:",
        "• DO NOT add any new element (trees, cars, people, plants, decorations, furniture) not already visible in the reference.",
        "• DO NOT remove, move, or alter any existing architectural element.",
        "• DO NOT change viewpoint, perspective, or camera position.",
        "• Preserve PIXEL-EXACTLY: building shape, footprint, number of floors, all window positions, all door positions, roof geometry, every structural volume.",
        "PERMITTED ENHANCEMENTS ONLY:",
        "• Material quality: make existing surfaces (concrete, brick, glass, steel, wood) look photorealistic — accurate texture, specularity, and surface detail.",
        "• Image clarity: ultra-sharp 4K detail, high dynamic range, depth of field.",
        applyLighting
          ? "• Lighting: apply the specified lighting condition below while keeping all architectural elements unchanged."
          : "• Lighting: simulate realistic natural sunlight with proper shadows, ambient occlusion, and soft highlights on existing surfaces.",
      ].join(" ")
    : [
        "You are a professional architectural visualization engine.",
        "Transform this photo into a photorealistic interior render.",
        "ABSOLUTE PRESERVATION RULES — NEVER BREAK:",
        "• DO NOT add any object, furniture, plant, decoration, or element not already present in the reference image.",
        "• DO NOT remove, move, reposition, or replace any existing furniture or object.",
        "• DO NOT change viewpoint, perspective, or camera angle.",
        "• Preserve PIXEL-EXACTLY: room geometry, all wall positions, all window/door locations, ceiling height, every piece of furniture in its exact place.",
        "PERMITTED ENHANCEMENTS ONLY:",
        "• Material quality: make existing surfaces (walls, floors, upholstery, wood, glass, fabric) look photorealistic — accurate texture, sheen, and surface detail.",
        "• Image clarity: ultra-sharp 4K detail, high dynamic range.",
        applyLighting
          ? "• Lighting: apply the specified lighting condition below — activate only lamps/fixtures that are physically present in the image."
          : "• Lighting: simulate realistic interior lighting from existing windows and fixtures — soft shadows, ambient occlusion, warm/cool highlights.",
      ].join(" ");

  // ── Optional style layer — surface finishes only ────────────────────────
  const styleInstruction = applyStyle
    ? (isExterior
        ? `Style application (surface finishes ONLY — do NOT add or remove any element): reinterpret the existing facade materials and colors with a ${style} architectural aesthetic — cladding texture, facade color palette, window frame finish only.`
        : `Style application (surface finishes ONLY — do NOT add, remove, or move any object): reinterpret the existing wall finish, floor material, and ceiling treatment with a ${style} interior design aesthetic; keep all furniture and objects exactly as they are.`)
    : null;

  const angleMap: Record<string, string> = {
    frontal:   "straight-on frontal camera angle",
    angular45: "45-degree diagonal perspective angle",
    lateral:   "side view lateral camera angle",
    ampla:     "wide-angle lens expansive view",
    closeup:   "close-up detail shot, shallow depth of field",
    aerea:     "aerial top-down bird's-eye view angle",
  };
  const angleInstruction = angleMap[angle]
    ? `Camera angle: render from a ${angleMap[angle]}.`
    : null;

  const contextInstruction = isExterior
    ? "Brazilian residential architecture context."
    : `Context: ${roomType}, Brazilian home interior.`;

  // ── Optional material/texture pins ────────────────────────────────────
  function describePosition(px: number, py: number): string {
    const hLabel = px < 33 ? "left side" : px > 66 ? "right side" : "center";
    const vLabel = py < 25 ? "ceiling/top area" : py > 75 ? "floor/bottom area" : py < 50 ? "upper-middle" : "lower-middle (walls)";
    return `${hLabel}, ${vLabel} (${px}% from left, ${py}% from top)`;
  }

  const hasMaterialPins = materialFiles.length > 0 && materialPins.length > 0;
  const materialInstruction = hasMaterialPins
    ? [
        `MATERIAL APPLICATIONS — The following images (images 2 through ${1 + materialFiles.length}) are material/texture samples, NOT scenes to edit.`,
        "For each sample below, extract its color tone, texture pattern, grain direction, surface finish (matte/satin/gloss/polished), and any veining or pattern repeat.",
        "Apply each material ONLY to the pinned area indicated — leave every other surface, object, and element completely unchanged.",
        ...materialPins.map((pin) => {
          const imgIdx = pin.materialIndex + 2; // image 1 = scene, images 2+ = materials
          return `• Image ${imgIdx}: apply to the scene area at ${describePosition(pin.percentX, pin.percentY)}.`;
        }),
        "Scale and tile each texture realistically as it would appear on an architectural surface at the correct viewing distance.",
      ].join(" ")
    : null;

  const prompt = [
    baseInstruction,
    styleInstruction,
    lightingInstruction,
    materialInstruction,
    angleInstruction,
    contextInstruction,
    notes ? `Additional user request: ${notes}` : null,
  ].filter(Boolean).join(" ");

  const commercialRequestId = crypto.randomUUID();
  const authorization = await authorizeVendorCredits(tenantId, "render", 1);
  if (!authorization.ok) {
    return res.status(402).json({
      error: "Saldo de Vendor Credits insuficiente para gerar o render.",
      requiredVendorCredits: authorization.required,
      includedVendorCreditsRemaining: authorization.includedRemaining,
      purchasedVendorCreditsAvailable: authorization.available,
    });
  }

  const reservation = await debitVendorCredits({
    tenantId,
    credits: authorization.walletRequired,
    commercialKey: "vendor.arqdor",
    referenceId: `usage-reservation:${commercialRequestId}`,
    reason: "usage_reservation",
    metadata: { metricKey: "render", operation: "render_quick" },
  });
  const reservedVendorCredits = Number(reservation.debited ?? 0);

  try {
    const openai = await getOpenAIForTenant(tenantId);

    const imageFile = await toFile(file.buffer, file.originalname || "input.png", {
      type: file.mimetype,
    });

    const materialOAIFiles = await Promise.all(
      materialFiles.map((mf, i) =>
        toFile(mf.buffer, mf.originalname || `material-${i}.png`, { type: mf.mimetype })
      )
    );

    const imageInput = materialOAIFiles.length > 0
      ? [imageFile, ...materialOAIFiles]
      : imageFile;

    const result = await (openai.images.edit as Function)({
      model:   "gpt-image-1",
      image:   imageInput,
      prompt,
      n:       1,
      size:    "1536x1024",
      quality: "high",
    });

    const b64 = (result.data?.[0] as Record<string, unknown>)?.["b64_json"] as string | undefined;
    if (!b64) throw new Error("gpt-image-1 não retornou b64_json");

    const ts = Date.now();
    const buf = Buffer.from(b64, "base64");
    const captured = await captureGeneratedMedia({
      tenantId,
      userId: req.user?.sub ?? null,
      title: `Render rápido — ${roomType || style || "imagem"}`,
      operation: "render_quick",
      buffer: buf,
      mimeType: "image/png",
      type: "image",
      originalFilename: `render-${tenantId}-${ts}.png`,
      kind: "mixed",
      metadata: {
        module: "render",
        style,
        roomType,
        prompt,
        generatedByAi: true,
      },
    });
    const servePath = captured.storageUrl.replace(/^\/objects\//, "");
    const imageUrl = `/api/storage/objects/${servePath}`;

    await recordCommercialUsage({
      tenantId,
      userId: req.user?.sub ?? null,
      commercialKey: "vendor.arqdor",
      metricKey: "render",
      quantity: 1,
      success: true,
      billable: true,
      billingStatus: "overage",
      provider: "openai",
      model: "gpt-image-1",
      source: "render_quick",
      sourceEventId: `commercial:${commercialRequestId}`,
      requestId: commercialRequestId,
      metadata: { style, roomType, mediaAssetId: captured.assetId, vendorCreditsReserved: reservedVendorCredits },
    });

    req.log.info({ tenantId, style, roomType, assetId: captured.assetId }, "render/quick: concluído");
    return res.json({ imageUrl, prompt, mediaAssetId: captured.assetId });
  } catch (err: any) {
    await recordCommercialUsage({
      tenantId,
      userId: req.user?.sub ?? null,
      commercialKey: "vendor.arqdor",
      metricKey: "render",
      quantity: 1,
      success: false,
      billable: true,
      billingStatus: "non_billable",
      provider: "openai",
      model: "gpt-image-1",
      source: "render_quick",
      sourceEventId: `commercial:${commercialRequestId}`,
      requestId: commercialRequestId,
      metadata: { style, roomType, error: err?.message ?? "render_failed" },
    }).catch(() => null);

    if (reservedVendorCredits > 0) {
      await refundVendorCredits({
        tenantId,
        credits: reservedVendorCredits,
        commercialKey: "vendor.arqdor",
        referenceId: `usage-reservation:${commercialRequestId}`,
        metadata: { metricKey: "render", operation: "render_quick", providerFailure: true },
      }).catch(() => null);
    }

    req.log.error({ err }, "render/quick: erro");
    return res.status(500).json({ error: err?.message ?? "Erro ao renderizar imagem" });
  }
});

export default router;
