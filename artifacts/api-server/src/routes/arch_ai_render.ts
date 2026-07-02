/**
 * Arch AI Render — pipeline async de inpainting com máscara
 *
 * POST /api/arch/ai-render               → 202, render_id
 * GET  /api/arch/ai-render/:id           → status + resultado
 * POST /api/arch/ai-render/:id/adjust    → ajuste herdando mode do pai
 * POST /api/arch/project-config          → salvar configuração reutilizável
 * GET  /api/arch/project-config          → listar configs por lead_id
 */
import { Router, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  archAiRendersTable,
  archProjectConfigsTable,
  automationLogsTable,
} from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  createZoneMask,
  callReplicateFluxFill,
  compositeWithOriginal,
  validateEdgeIntegrity,
  dataUrlToBuffer,
  bufferToDataUrl,
} from "../lib/arch-render-pipeline.js";
import sharp from "sharp";

export const archAiRenderRouter = Router();

// ── Zonas que são mobiliário solto — nunca editáveis no modo Preservar ────────
const FURNITURE_ZONES = new Set([
  "sofa", "sofá", "mesa", "cadeira", "cadeiras", "cama", "poltrona",
  "luminaria", "luminária", "tapete", "planta", "plantas", "eletrodomestico",
  "eletrodoméstico", "decoracao", "decoração",
]);

function filterFurnitureZones(zones: string[]): string[] {
  return zones.filter(z => !FURNITURE_ZONES.has(z.toLowerCase().trim()));
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function tenantId(req: Request): string | null {
  return (req as any).user?.tenantId ?? null;
}

// ── Esquemas de validação ──────────────────────────────────────────────────────

const renderBodySchema = z.object({
  project_id:        z.string().optional(),
  lead_id:           z.string().optional(),
  original_image_url: z.string().min(10, "original_image_url obrigatório"),
  mode:              z.enum(["preservar", "criar"]),
  ambiente:          z.string().min(1),
  estilo:            z.string().optional(),
  iluminacao:        z.string().optional(),
  angulo:            z.string().optional(),
  mask_zones:        z.array(z.string()).optional().default([]),
  user_notes:        z.string().optional(),
  // materiais para modo criar (compatibilidade com o fluxo existente)
  materials: z.array(z.object({
    zone: z.string(), materialName: z.string().optional(), promptFragment: z.string(),
  })).optional().default([]),
});

const adjustBodySchema = z.object({
  mask_zones:    z.array(z.string()).optional().default([]),
  ajuste_prompt: z.string().optional(),
});

const projectConfigBodySchema = z.object({
  lead_id:         z.string().optional(),
  nome_config:     z.string().min(1),
  mode:            z.enum(["preservar", "criar"]),
  estilo:          z.string().optional(),
  iluminacao:      z.string().optional(),
  angulo_padrao:   z.string().optional(),
  paleta_materiais: z.record(z.string(), z.string()).optional(),
});

// ── POST /api/arch/ai-render — Inicia job assíncrono ─────────────────────────

archAiRenderRouter.post("/arch/ai-render", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const parsed = renderBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error:   "Parâmetros inválidos",
      details: parsed.error.issues.map(i => i.message).join("; "),
    });
  }

  const {
    project_id, lead_id, original_image_url, mode,
    ambiente, estilo, iluminacao, angulo,
    mask_zones, user_notes, materials,
  } = parsed.data;

  // Sanitiza: no modo Preservar, remove mobiliário solto das zonas
  const safeMaskZones = mode === "preservar"
    ? filterFurnitureZones(mask_zones)
    : mask_zones;

  // Cria registro inicial
  const [render] = await db.insert(archAiRendersTable).values({
    tenantId:         tid,
    leadId:           lead_id,
    projectId:        project_id,
    mode,
    ambiente,
    estilo,
    iluminacao:       iluminacao,
    angulo:           mode === "preservar" ? undefined : angulo,
    maskZones:        safeMaskZones,
    originalImageUrl: original_image_url,
    status:           "processando",
    versionTag:       mode === "preservar" ? "fiel_ao_original" : "conceito",
  }).returning();

  if (!render) {
    return res.status(500).json({ success: false, error: "Falha ao criar registro" });
  }

  // Responde 202 imediatamente
  res.status(202).json({
    success:   true,
    render_id: render.id,
    status:    "processando",
  });

  // ── Job assíncrono em background ────────────────────────────────────────────
  processRenderJob({
    renderId:     render.id,
    tenantId:     tid,
    mode,
    originalUrl:  original_image_url,
    maskZones:    safeMaskZones,
    ambiente,
    estilo,
    iluminacao,
    angulo,
    materials,
    userNotes:    user_notes,
    logger:       req.log,
    retentativas: 0,
  }).catch(err => {
    req.log.error({ err, renderId: render.id }, "arch/ai-render: job falhou");
  });

  return;
});

// ── GET /api/arch/ai-render/:id — Status e resultado ─────────────────────────

archAiRenderRouter.get("/arch/ai-render/:id", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const [render] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id,       req.params["id"]!),
      eq(archAiRendersTable.tenantId, tid),
    ))
    .limit(1);

  if (!render) return res.status(404).json({ success: false, error: "Render não encontrado" });

  return res.json({
    success:                render.status === "concluido",
    render_id:              render.id,
    status:                 render.status,
    result_image_url:       render.resultImageUrl,
    mode:                   render.mode,
    version_tag:            render.versionTag,
    mask_zones:             render.maskZones,
    composited:             render.composited,
    segmentation_confidence: render.segmentationConfidence,
    erro_msg:               render.erroMsg,
    motor:                  render.motor,
    created_at:             render.createdAt,
    concluido_em:           render.concluidoEm,
  });
});

// ── POST /api/arch/ai-render/:id/adjust — Ajuste pós-geração ─────────────────

archAiRenderRouter.post("/arch/ai-render/:id/adjust", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const [parent] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id,       req.params["id"]!),
      eq(archAiRendersTable.tenantId, tid),
    ))
    .limit(1);

  if (!parent) return res.status(404).json({ success: false, error: "Render pai não encontrado" });
  if (parent.status !== "concluido") {
    return res.status(400).json({ success: false, error: "O render pai ainda não foi concluído" });
  }

  const parsed = adjustBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error:   "Parâmetros inválidos",
      details: parsed.error.issues.map(i => i.message).join("; "),
    });
  }

  const { mask_zones, ajuste_prompt } = parsed.data;

  // Herda mode do pai — e sanitiza zonas se mode=preservar
  const safeZones = parent.mode === "preservar"
    ? filterFurnitureZones(mask_zones)
    : mask_zones;

  const baseImageUrl = parent.resultImageUrl ?? parent.originalImageUrl;
  if (!baseImageUrl) {
    return res.status(400).json({ success: false, error: "Render pai não possui imagem de resultado" });
  }

  const [adjust] = await db.insert(archAiRendersTable).values({
    tenantId:         tid,
    leadId:           parent.leadId,
    projectId:        parent.projectId,
    parentRenderId:   parent.id,
    mode:             parent.mode,
    ambiente:         parent.ambiente,
    estilo:           parent.estilo,
    iluminacao:       parent.iluminacao,
    angulo:           parent.angulo,
    maskZones:        safeZones,
    originalImageUrl: baseImageUrl,
    status:           "processando",
    versionTag:       parent.versionTag,
  }).returning();

  if (!adjust) {
    return res.status(500).json({ success: false, error: "Falha ao criar ajuste" });
  }

  res.status(202).json({ success: true, render_id: adjust.id, status: "processando" });

  processRenderJob({
    renderId:     adjust.id,
    tenantId:     tid,
    mode:         parent.mode as "preservar" | "criar",
    originalUrl:  baseImageUrl,
    maskZones:    safeZones,
    ambiente:     parent.ambiente,
    estilo:       parent.estilo,
    iluminacao:   parent.iluminacao,
    angulo:       parent.angulo,
    materials:    [],
    userNotes:    ajuste_prompt,
    logger:       req.log,
    retentativas: 0,
  }).catch(err => {
    req.log.error({ err, renderId: adjust.id }, "arch/ai-render/adjust: job falhou");
  });

  return;
});

// ── POST /api/arch/project-config ─────────────────────────────────────────────

archAiRenderRouter.post("/arch/project-config", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const parsed = projectConfigBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error:   "Parâmetros inválidos",
      details: parsed.error.issues.map(i => i.message).join("; "),
    });
  }

  const [config] = await db.insert(archProjectConfigsTable).values({
    tenantId:       tid,
    leadId:         parsed.data.lead_id,
    nomeConfig:     parsed.data.nome_config,
    mode:           parsed.data.mode,
    estilo:         parsed.data.estilo,
    iluminacao:     parsed.data.iluminacao,
    anguloPadrao:   parsed.data.angulo_padrao,
    paletaMateriais: parsed.data.paleta_materiais,
  }).returning();

  return res.status(201).json({ success: true, config });
});

// ── GET /api/arch/project-config?lead_id=uuid ────────────────────────────────

archAiRenderRouter.get("/arch/project-config", authenticate, async (req: Request, res: Response) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const leadId = req.query["lead_id"] as string | undefined;

  const conditions = leadId
    ? and(
        eq(archProjectConfigsTable.tenantId, tid),
        eq(archProjectConfigsTable.leadId, leadId),
      )
    : eq(archProjectConfigsTable.tenantId, tid);

  const configs = await db
    .select()
    .from(archProjectConfigsTable)
    .where(conditions);

  return res.json({ success: true, configs });
});

// ── Job de processamento assíncrono ───────────────────────────────────────────

interface RenderJobParams {
  renderId:     string;
  tenantId:     string;
  mode:         "preservar" | "criar";
  originalUrl:  string;
  maskZones:    string[];
  ambiente:     string | null | undefined;
  estilo:       string | null | undefined;
  iluminacao:   string | null | undefined;
  angulo:       string | null | undefined;
  materials:    { zone: string; promptFragment: string }[];
  userNotes:    string | undefined;
  logger:       any;
  retentativas: number;
}

const MAX_RETENTATIVAS = 2;

async function processRenderJob(params: RenderJobParams): Promise<void> {
  const {
    renderId, tenantId: tid, mode, originalUrl, maskZones,
    ambiente, estilo, iluminacao, angulo, materials, userNotes,
    logger, retentativas,
  } = params;

  const storage = new ObjectStorageService();

  try {
    // ── 1. Baixar imagem original ──────────────────────────────────────────
    const { buf: originalBuf, mime: originalMime } = await fetchImageAsBuffer(originalUrl, storage);

    const meta = await sharp(originalBuf).metadata();
    const width  = meta.width  ?? 1024;
    const height = meta.height ?? 768;

    logger?.info({ renderId, mode, width, height }, "arch/ai-render: iniciando job");

    // ── 2. Montar prompt ───────────────────────────────────────────────────
    const prompt = buildPrompt({ mode, ambiente, estilo, iluminacao, angulo, maskZones, materials, userNotes });

    // ── 3. Execução por mode ───────────────────────────────────────────────
    let resultB64: string;
    let motor     = "replicate-flux-fill";
    let compositedFlag = false;
    let segConf: Record<string, number> | undefined;
    let maskFileUrl: string | undefined;

    if (mode === "preservar") {
      // ── 3a. Gerar máscara heurística ────────────────────────────────────
      const maskBuf = await createZoneMask(maskZones, width, height);

      // Salva máscara no storage para auditoria
      const maskPath = await storage.savePrivateBuffer(
        maskBuf, "image/png",
        `arch-mask-${tid}-${renderId}.png`,
      );
      maskFileUrl = `/api/storage/objects/${maskPath.replace(/^\/objects\//, "")}`;

      // Confiança heurística (fixa: baseada em zonas conhecidas)
      segConf = {};
      for (const z of maskZones) {
        const known = ["piso","teto","parede","armario","bancada","porta","janela",
                       "parede_fundo","parede_lateral","armários sup.","armários inf."] as const;
        segConf[z] = known.includes(z as any) ? 0.85 : 0.45;
      }

      await db.update(archAiRendersTable)
        .set({ maskFileUrl, segmentationConfidence: segConf })
        .where(eq(archAiRendersTable.id, renderId));

      // ── 3b. Inpainting via Flux Fill Pro ────────────────────────────────
      const originalDataUrl = bufferToDataUrl(originalBuf, originalMime);
      const maskDataUrl     = bufferToDataUrl(maskBuf, "image/png");

      resultB64 = await callReplicateFluxFill({
        imageDataUrl: originalDataUrl,
        maskDataUrl,
        prompt,
        steps:    50,
        guidance: 30,
        logger,
      });

      // ── 3c. Compositing pós-geração (garantia determinística) ──────────
      const generatedBuf  = Buffer.from(resultB64, "base64");
      const compositedBuf = await compositeWithOriginal(generatedBuf, originalBuf, maskBuf);
      resultB64 = compositedBuf.toString("base64");
      compositedFlag = true;

      // ── 3d. Validação de integridade de bordas ─────────────────────────
      const validation = await validateEdgeIntegrity(originalBuf, compositedBuf, maskBuf);
      logger?.info({ renderId, ...validation }, "arch/ai-render: validação de bordas");

      if (!validation.valid && retentativas < MAX_RETENTATIVAS) {
        // Rejeição automática — tenta novamente sem cobrar crédito extra
        logger?.warn({ renderId, retentativas }, "arch/ai-render: rejeitado_auto, tentando novamente");
        await db.update(archAiRendersTable)
          .set({ retentativas: String(retentativas + 1) })
          .where(eq(archAiRendersTable.id, renderId));

        return processRenderJob({ ...params, retentativas: retentativas + 1 });
      }

      if (!validation.valid) {
        throw new Error(`Geração rejeitada após ${MAX_RETENTATIVAS} tentativas: ${validation.details}`);
      }
    } else {
      // ── mode=criar: manter fluxo original (flux-canny-pro / gpt-image-1) ─
      const { callReplicateFlux } = await import("../lib/ai-gateway.js");
      if (process.env["REPLICATE_API_TOKEN"]) {
        const originalDataUrl = bufferToDataUrl(originalBuf, originalMime);
        resultB64 = await callReplicateFlux({
          controlImageDataUrl: originalDataUrl,
          prompt,
          logger,
        });
        motor = "replicate-flux-canny";
      } else {
        throw new Error("REPLICATE_API_TOKEN não configurado");
      }
    }

    // ── 4. Salvar resultado no storage ─────────────────────────────────────
    const resultBuf  = Buffer.from(resultB64, "base64");
    const objPath    = await storage.savePrivateBuffer(
      resultBuf, "image/png",
      `arch-ai-render-${tid}-${renderId}.png`,
    );
    const resultUrl  = `/api/storage/objects/${objPath.replace(/^\/objects\//, "")}`;

    // ── 5. Atualizar registro ──────────────────────────────────────────────
    await db.update(archAiRendersTable)
      .set({
        status:          "concluido",
        resultImageUrl:  resultUrl,
        composited:      compositedFlag,
        motor,
        prompt,
        erroMsg:         null,
        concluidoEm:     new Date(),
      })
      .where(eq(archAiRendersTable.id, renderId));

    logger?.info({ renderId, motor }, "arch/ai-render: concluído com sucesso");

  } catch (err: any) {
    logger?.error({ err, renderId }, "arch/ai-render: erro no job");

    await db.update(archAiRendersTable)
      .set({ status: "erro", erroMsg: String(err?.message ?? err) })
      .where(eq(archAiRendersTable.id, renderId));

    db.insert(automationLogsTable).values({
      flow: "arch_ai_render", step: "processRenderJob",
      status: "error", errorMessage: String(err?.message ?? err),
    }).catch(() => undefined);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchImageAsBuffer(
  url: string,
  storage: ObjectStorageService,
): Promise<{ buf: Buffer; mime: string }> {
  // Data URL inline
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error("Data URL inválida");
    return { buf: Buffer.from(match[2]!, "base64"), mime: match[1]! };
  }

  // URL de storage interno (/api/storage/objects/...)
  if (url.startsWith("/api/storage/")) {
    const objKey  = url.replace(/^\/api\/storage\/objects\//, "objects/");
    const rawPath = `/${objKey}`;
    const fetched = await (storage as any).getPrivateBuffer?.(rawPath).catch(() => null);
    if (fetched?.buf) return { buf: fetched.buf, mime: fetched.mime ?? "image/png" };
  }

  // URL externa
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Falha ao baixar imagem (${res.status}): ${url}`);
  const contentType = res.headers.get("content-type") ?? "image/png";
  return { buf: Buffer.from(await res.arrayBuffer()), mime: contentType };
}

const LIGHTING_MAP: Record<string, string> = {
  manha:   "soft warm morning light",
  tarde:   "bright afternoon sunlight",
  golden:  "warm golden hour light",
  noturno: "night mood lighting",
  nublado: "overcast diffused light",
};

const STYLE_MAP: Record<string, string> = {
  minimalista:   "minimalist style with clean lines, neutral palette",
  contemporaneo: "contemporary modern style with bold geometric forms",
  classico:      "timeless classic style with warm tones",
  industrial:    "industrial style with raw concrete and exposed steel",
  escandinavo:   "Scandinavian style with natural light and pale wood",
  tropical:      "tropical Brazilian style with warm earthy tones",
};

const ANGLE_MAP: Record<string, string> = {
  frontal:     "straight-on frontal view",
  "45":        "45-degree diagonal view",
  lateral_esq: "side view from the left",
  lateral_dir: "side view from the right",
  ampla:       "wide-angle expansive view",
  aerea:       "aerial top-down view",
};

function buildPrompt(p: {
  mode:       "preservar" | "criar";
  ambiente:   string | null | undefined;
  estilo:     string | null | undefined;
  iluminacao: string | null | undefined;
  angulo:     string | null | undefined;
  maskZones:  string[];
  materials:  { zone: string; promptFragment: string }[];
  userNotes:  string | undefined;
}): string {
  const parts: string[] = [];

  if (p.mode === "preservar") {
    parts.push(
      "You are a professional architectural visualization engine performing inpainting.",
      "PRESERVE ABSOLUTELY: all furniture, objects, room geometry, camera angle, and everything outside the mask.",
      "EDIT ONLY the masked areas — replace only materials, textures, and finishes in those zones.",
    );
    if (p.maskZones.length > 0) {
      parts.push(`ZONES TO EDIT: ${p.maskZones.join(", ")}.`);
    }
    if (p.materials.length > 0) {
      parts.push(
        "MATERIAL APPLICATIONS:",
        ...p.materials.map(m => `• ${m.zone}: ${m.promptFragment} — photorealistic texture`),
      );
    }
  } else {
    parts.push(
      "You are a professional architectural visualization engine.",
      `Transform this ${p.ambiente ?? "interior"} photo into a photorealistic render.`,
    );
    if (p.estilo) {
      const s = STYLE_MAP[p.estilo] ?? p.estilo;
      parts.push(`VISUAL STYLE: ${s}.`);
    }
    if (p.materials.length > 0) {
      parts.push(
        "MATERIAL APPLICATIONS (apply only to each specified zone):",
        ...p.materials.map(m => `• ${m.zone}: ${m.promptFragment}`),
      );
    }
    if (p.angulo) {
      const a = ANGLE_MAP[p.angulo] ?? p.angulo;
      parts.push(`CAMERA ANGLE: ${a}.`);
    }
    parts.push(
      "This mode allows furniture and layout changes.",
      `Banner: This render may alter furniture, measurements, and room layout.`,
    );
  }

  if (p.iluminacao && p.iluminacao !== "auto") {
    const l = LIGHTING_MAP[p.iluminacao] ?? p.iluminacao;
    parts.push(`LIGHTING: ${l}.`);
  }
  if (p.userNotes) parts.push(`Additional notes: ${p.userNotes}`);
  parts.push("Output: ultra-sharp 4K photorealistic detail, Brazilian architecture context.");

  return parts.join(" ");
}
